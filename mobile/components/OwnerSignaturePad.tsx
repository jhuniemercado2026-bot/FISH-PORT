import { forwardRef, useImperativeHandle, useRef } from "react";
import RawWebView, { WebViewMessageEvent } from "react-native-webview";

const WebView = RawWebView as any;

type OwnerSignaturePadProps = {
  backgroundColor?: string;
  maxWidth?: number;
  minWidth?: number;
  onBegin?: () => void;
  onEmpty?: () => void;
  onOK?: (signature: string) => void;
  penColor?: string;
};

export type OwnerSignaturePadRef = {
  clearSignature: () => void;
  readSignature: () => void;
};

const buildSignatureHtml = ({
  backgroundColor = "#FFFFFF",
  maxWidth = 3,
  minWidth = 1,
  penColor = "#1A1F36",
}: Required<Pick<OwnerSignaturePadProps, "backgroundColor" | "maxWidth" | "minWidth" | "penColor">>) => `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body {
        background: ${backgroundColor};
        height: 100%;
        margin: 0;
        overflow: hidden;
        touch-action: none;
        width: 100%;
      }
      canvas {
        display: block;
        height: 100%;
        touch-action: none;
        width: 100%;
      }
    </style>
  </head>
  <body>
    <canvas id="signature"></canvas>
    <script>
      const canvas = document.getElementById("signature");
      const context = canvas.getContext("2d");
      let drawing = false;
      let hasDrawn = false;
      let lastPoint = null;

      function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const image = hasDrawn ? canvas.toDataURL("image/png") : null;
        canvas.width = Math.floor(canvas.offsetWidth * ratio);
        canvas.height = Math.floor(canvas.offsetHeight * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.fillStyle = "${backgroundColor}";
        context.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
        if (image) {
          const savedImage = new Image();
          savedImage.onload = () => context.drawImage(savedImage, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
          savedImage.src = image;
        }
      }

      function getPoint(event) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }

      function drawLine(from, to) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = Math.max(${minWidth}, Math.min(${maxWidth}, ${maxWidth}));
        context.strokeStyle = "${penColor}";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }

      canvas.addEventListener("pointerdown", (event) => {
        drawing = true;
        hasDrawn = true;
        lastPoint = getPoint(event);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "begin" }));
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!drawing || !lastPoint) return;
        const nextPoint = getPoint(event);
        drawLine(lastPoint, nextPoint);
        lastPoint = nextPoint;
      });

      function endDrawing() {
        drawing = false;
        lastPoint = null;
      }

      canvas.addEventListener("pointerup", endDrawing);
      canvas.addEventListener("pointercancel", endDrawing);
      canvas.addEventListener("pointerleave", endDrawing);

      function clearSignature() {
        hasDrawn = false;
        context.fillStyle = "${backgroundColor}";
        context.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      }

      document.addEventListener("message", (event) => {
        handleMessage(event.data);
      });
      window.addEventListener("message", (event) => {
        handleMessage(event.data);
      });

      function handleMessage(message) {
        if (message === "clear") {
          clearSignature();
        }
        if (message === "read") {
          if (!hasDrawn) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: "empty" }));
            return;
          }
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "ok",
            data: canvas.toDataURL("image/png"),
          }));
        }
      }

      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();
    </script>
  </body>
</html>
`;

const OwnerSignaturePad = forwardRef<OwnerSignaturePadRef, OwnerSignaturePadProps>(
  (
    {
      backgroundColor = "#FFFFFF",
      maxWidth = 3,
      minWidth = 1,
      onBegin,
      onEmpty,
      onOK,
      penColor = "#1A1F36",
    },
    ref
  ) => {
    const webViewRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      clearSignature: () => webViewRef.current?.postMessage("clear"),
      readSignature: () => webViewRef.current?.postMessage("read"),
    }));

    const handleMessage = (event: WebViewMessageEvent) => {
      const payload = JSON.parse(event.nativeEvent.data || "{}");

      if (payload.type === "begin") {
        onBegin?.();
      }

      if (payload.type === "empty") {
        onEmpty?.();
      }

      if (payload.type === "ok") {
        onOK?.(payload.data);
      }
    };

    return (
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{
          html: buildSignatureHtml({
            backgroundColor,
            maxWidth,
            minWidth,
            penColor,
          }),
        }}
        onMessage={handleMessage}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    );
  }
);

OwnerSignaturePad.displayName = "OwnerSignaturePad";

export default OwnerSignaturePad;
