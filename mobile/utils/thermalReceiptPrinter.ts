import { toByteArray } from "base64-js";
import { PNG } from "pngjs/browser";
import type { BluetoothPrinter } from "@netinove/thermal-printer";

const PRINTER_WIDTH_DOTS = 384;
const MAX_SIGNATURE_HEIGHT_DOTS = 96;

function centerPrinterText(text: string, width = 32) {
  const trimmed = text.trim();
  const padding = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return `${" ".repeat(padding)}${trimmed}`;
}

function findPreferredThermalPrinter(printers: BluetoothPrinter[]) {
  const bondedPrinters = printers.filter((printer) => printer.bonded);
  const pt210Printer = bondedPrinters.find((printer) => {
    const name = printer.name.trim().toLowerCase();
    return name.includes("pt-210") || name.includes("pt210");
  });

  if (pt210Printer) {
    return pt210Printer;
  }

  return (
    bondedPrinters.find((printer) => {
      const name = printer.name.trim().toLowerCase();
      return name.includes("printer") || name.includes("thermal");
    }) ??
    bondedPrinters[0] ??
    null
  );
}

function decodeSignatureDataUrl(signatureDataUrl?: string | null) {
  const match = String(signatureDataUrl ?? "").match(/^data:image\/png;base64,(.+)$/);

  if (!match) {
    return null;
  }

  try {
    return PNG.sync.read(toByteArray(match[1]));
  } catch {
    return null;
  }
}

function buildSignatureRasterBytes(signatureDataUrl?: string | null) {
  const png = decodeSignatureDataUrl(signatureDataUrl);

  if (!png || png.width <= 0 || png.height <= 0) {
    return [];
  }

  const scale = Math.min(
    PRINTER_WIDTH_DOTS / png.width,
    MAX_SIGNATURE_HEIGHT_DOTS / png.height,
    1
  );
  const targetWidth = Math.max(1, Math.floor(png.width * scale));
  const targetHeight = Math.max(1, Math.floor(png.height * scale));
  const widthBytes = Math.ceil(targetWidth / 8);
  const raster = new Array(widthBytes * targetHeight).fill(0);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(png.height - 1, Math.floor(y / scale));

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(png.width - 1, Math.floor(x / scale));
      const sourceIndex = (sourceY * png.width + sourceX) * 4;
      const red = png.data[sourceIndex] ?? 255;
      const green = png.data[sourceIndex + 1] ?? 255;
      const blue = png.data[sourceIndex + 2] ?? 255;
      const alpha = png.data[sourceIndex + 3] ?? 255;
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const isInk = alpha > 64 && luminance < 210;

      if (isInk) {
        const byteIndex = y * widthBytes + Math.floor(x / 8);
        raster[byteIndex] |= 0x80 >> (x % 8);
      }
    }
  }

  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = targetHeight & 0xff;
  const yH = (targetHeight >> 8) & 0xff;

  return [
    0x1b, 0x61, 0x01,
    0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH,
    ...raster,
    0x1b, 0x61, 0x00,
    0x0a,
  ];
}

function buildSignatureFooterText() {
  return [
    "____________________________",
    centerPrinterText("Signature"),
    "",
    "",
    "",
  ].join("\n");
}

export async function printThermalReceiptWithSignature(
  text: string,
  signatureDataUrl?: string | null
) {
  const {
    connect: connectThermalPrinter,
    getBondedPrinters,
    getConnectionState,
    requestBluetoothPermissions,
    write: writeThermalBytes,
    writeText: writeThermalText,
  } = await import("@netinove/thermal-printer");

  const granted = await requestBluetoothPermissions();

  if (!granted) {
    throw new Error("Bluetooth permission was not granted.");
  }

  const printers = await getBondedPrinters();
  const printer = findPreferredThermalPrinter(printers);

  if (!printer) {
    throw new Error("No paired Bluetooth thermal printer found.");
  }

  const connection = getConnectionState();

  if (!connection.connected || connection.address !== printer.address) {
    await connectThermalPrinter(printer.address);
  }

  await writeThermalText(`${text.trimEnd()}\n\n`);

  const signatureBytes = buildSignatureRasterBytes(signatureDataUrl);
  if (signatureBytes.length > 0) {
    await writeThermalBytes(signatureBytes);
  }

  await writeThermalText(buildSignatureFooterText(), { trailingLines: 3 });
}
