import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { getHeaderPngBytes } from "./pdfHeader";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 42;
const MARGIN_Y = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BORDER_WIDTH = 1.5;

const hexToRgb = (hex) => {
  const normalized = String(hex || "").replace("#", "");
  if (normalized.length !== 6) return rgb(0, 0, 0);

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  return rgb(r, g, b);
};

const COLORS = {
  black: hexToRgb("#000000"),
  text: hexToRgb("#1a1f36"),
  muted: hexToRgb("#545e6b"),
  border: hexToRgb("#c7d1de"),
  mediumGray: hexToRgb("#ECECEC"),
  white: hexToRgb("#FFFFFF"),
};

const sanitizeText = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatPdfDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sanitizeText(String(value).slice(0, 20));

  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const wrapText = (text, font, fontSize, maxWidth) => {
  const safe = sanitizeText(text) || "-";
  const words = safe.split(" ");
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) lines.push(current);

    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      current = word;
      return;
    }

    let remaining = word;
    current = "";
    while (remaining.length) {
      let sliceLength = remaining.length;
      while (
        sliceLength > 1 &&
        font.widthOfTextAtSize(remaining.slice(0, sliceLength), fontSize) >
          maxWidth
      ) {
        sliceLength -= 1;
      }
      lines.push(remaining.slice(0, sliceLength));
      remaining = remaining.slice(sliceLength);
    }
  });

  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
};

const embedDataUrlImage = async (pdfDoc, dataUrl) => {
  const value = String(dataUrl || "").trim();
  if (!value) return null;

  const match = value.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;

  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return match[1].toLowerCase().startsWith("jp")
    ? pdfDoc.embedJpg(bytes)
    : pdfDoc.embedPng(bytes);
};

const embedRemoteImage = async (pdfDoc, imageUrl) => {
  const value = String(imageUrl || "").trim();
  if (!/^https?:\/\//i.test(value)) return null;

  try {
    const response = await fetch(value);
    if (!response.ok) return null;

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const isJpeg =
      contentType.includes("jpeg") ||
      contentType.includes("jpg") ||
      /\.jpe?g(?:[?#]|$)/i.test(value);

    return isJpeg ? pdfDoc.embedJpg(bytes) : pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
};

const embedSignatureImage = async (pdfDoc, source) => {
  const value = String(source || "").trim();
  if (!value) return null;
  const dataUrlImage = await embedDataUrlImage(pdfDoc, value);
  if (dataUrlImage) return dataUrlImage;
  return embedRemoteImage(pdfDoc, value);
};

const createPdfComposer = async () => {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN_Y;

  const addPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = PAGE_HEIGHT - MARGIN_Y;
  };

  const ensureSpace = (height) => {
    if (cursorY - height < MARGIN_Y) addPage();
  };

  const drawText = (text, x, y, options = {}) => {
    const {
      fontSize = 10,
      bold = false,
      color = COLORS.text,
    } = options;

    page.drawText(sanitizeText(text) || "-", {
      x,
      y,
      size: fontSize,
      font: bold ? boldFont : regularFont,
      color,
    });
  };

  const drawRect = (x, y, width, height, options = {}) => {
    const {
      borderColor = COLORS.border,
      fillColor,
      borderWidth = 1,
    } = options;

    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor,
      borderWidth,
      color: fillColor,
    });
  };

  const drawLine = (start, end, options = {}) => {
    page.drawLine({
      start,
      end,
      thickness: options.thickness ?? 1,
      color: options.color ?? COLORS.black,
    });
  };

  const drawWrappedText = (text, x, yTop, maxWidth, options = {}) => {
    const {
      fontSize = 10,
      lineHeight = fontSize + 4,
      bold = false,
      color = COLORS.text,
    } = options;
    const font = bold ? boldFont : regularFont;
    const lines = wrapText(text, font, fontSize, maxWidth);

    lines.forEach((line, index) => {
      drawText(line, x, yTop - fontSize - index * lineHeight, {
        fontSize,
        bold,
        color,
      });
    });

    return lines.length * lineHeight;
  };

  const drawRichWrappedText = (segments, x, yTop, maxWidth, options = {}) => {
    const fontSize = options.fontSize ?? 10;
    const lineHeight = options.lineHeight ?? fontSize + 4;
    const color = options.color ?? COLORS.text;
    const tokens = [];

    segments.forEach((segment) => {
      const safeText = String(segment?.text ?? "")
        .replace(/[^\x20-\x7E]/g, " ")
        .replace(/\s+/g, " ");
      const fieldWidth = Number(segment?.fieldWidth ?? 0);

      if (fieldWidth > 0) {
        tokens.push({
          text: safeText.trim(),
          bold: Boolean(segment?.bold),
          underline: Boolean(segment?.underline),
          fieldWidth,
        });
        return;
      }

      if (!safeText) return;

      safeText.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        tokens.push({
          text: part,
          bold: Boolean(segment?.bold),
          underline: Boolean(segment?.underline),
        });
      });
    });

    let cursorX = x;
    let cursorLineY = yTop - fontSize;
    let lines = 1;

    const moveToNextLine = () => {
      cursorX = x;
      cursorLineY -= lineHeight;
      lines += 1;
    };

    const drawUnderlinedField = (token) => {
      const font = token.bold ? boldFont : regularFont;
      const minFieldWidth = token.fieldWidth ?? 0;
      const text = token.text || "";
      const words = text ? text.split(/\s+/).filter(Boolean) : [""];
      let wordIndex = 0;

      if (cursorX > x && x + maxWidth - cursorX < minFieldWidth) {
        moveToNextLine();
      }

      while (wordIndex < words.length) {
        const availableWidth = x + maxWidth - cursorX;
        let lineText = words[wordIndex];
        let lineTextWidth = font.widthOfTextAtSize(lineText, fontSize);
        wordIndex += 1;

        while (wordIndex < words.length) {
          const candidate = `${lineText} ${words[wordIndex]}`;
          const candidateWidth = font.widthOfTextAtSize(candidate, fontSize);
          if (candidateWidth > availableWidth) break;
          lineText = candidate;
          lineTextWidth = candidateWidth;
          wordIndex += 1;
        }

        if (lineTextWidth > availableWidth) {
          let sliceLength = lineText.length;
          while (
            sliceLength > 1 &&
            font.widthOfTextAtSize(lineText.slice(0, sliceLength), fontSize) > availableWidth
          ) {
            sliceLength -= 1;
          }

          const overflow = lineText.slice(sliceLength);
          lineText = lineText.slice(0, sliceLength);
          lineTextWidth = font.widthOfTextAtSize(lineText, fontSize);
          if (overflow) {
            words.splice(wordIndex, 0, overflow);
          }
        }

        const hasMoreText = wordIndex < words.length;
        const fieldWidth = hasMoreText
          ? availableWidth
          : Math.min(availableWidth, Math.max(minFieldWidth, lineTextWidth));
        const tokenStartX = cursorX;
        const textX = tokenStartX + Math.max(0, (fieldWidth - lineTextWidth) / 2);

        if (lineText) {
          page.drawText(lineText, {
            x: textX,
            y: cursorLineY,
            size: fontSize,
            font,
            color,
          });
        }

        page.drawLine({
          start: { x: tokenStartX, y: cursorLineY - 2 },
          end: { x: tokenStartX + fieldWidth, y: cursorLineY - 2 },
          thickness: 0.6,
          color,
        });

        cursorX += fieldWidth;
        if (hasMoreText) {
          moveToNextLine();
        }
      }
    };

    tokens.forEach((token) => {
      if (token.fieldWidth) {
        drawUnderlinedField(token);
        return;
      }

      const font = token.bold ? boldFont : regularFont;
      const width = font.widthOfTextAtSize(token.text, fontSize);
      const isWhitespace = /^\s+$/.test(token.text);

      if (!isWhitespace && cursorX > x && cursorX + width > x + maxWidth) {
        moveToNextLine();
      }

      if (!isWhitespace || cursorX > x) {
        const tokenStartX = cursorX;
        page.drawText(token.text, {
          x: cursorX,
          y: cursorLineY,
          size: fontSize,
          font,
          color,
        });
        cursorX += width;
        if (token.underline) {
          page.drawLine({
            start: { x: tokenStartX, y: cursorLineY - 2 },
            end: { x: cursorX, y: cursorLineY - 2 },
            thickness: 0.6,
            color,
          });
        }
      }
    });

    return lines * lineHeight;
  };

  const drawCenteredText = (text, centerX, y, options = {}) => {
    const fontSize = options.fontSize ?? 10;
    const bold = options.bold ?? false;
    const font = bold ? boldFont : regularFont;
    const safeText = sanitizeText(text) || "-";
    const textWidth = font.widthOfTextAtSize(safeText, fontSize);

    drawText(safeText, centerX - textWidth / 2, y, options);
  };

  const drawImage = (image, x, y, width, height) => {
    if (!image) return;

    page.drawImage(image, {
      x,
      y,
      width,
      height,
    });
  };

  return {
    pdfDoc,
    regularFont,
    boldFont,
    addPage,
    ensureSpace,
    drawText,
    drawRect,
    drawLine,
    drawWrappedText,
    drawRichWrappedText,
    drawCenteredText,
    drawImage,
    get cursorY() {
      return cursorY;
    },
    set cursorY(value) {
      cursorY = value;
    },
  };
};

const getOwnerName = (owner, ownerName) =>
  sanitizeText(
    ownerName ||
      owner?.full_name ||
      `${owner?.owner_firstname ?? ""} ${owner?.owner_lastname ?? ""}`.trim(),
  );

const getBoatName = (boat, boatName) =>
  sanitizeText(boatName || boat?.boat_name || boat?.name || "");

const getInspectorName = (inspector) => {
  if (!inspector) return "";

  const fullName = sanitizeText(inspector.full_name);
  if (fullName) return fullName;

  const firstLast = sanitizeText(
    [inspector.first_name, inspector.last_name].filter(Boolean).join(" "),
  );
  if (firstLast) return firstLast;

  return sanitizeText(inspector.email);
};

const drawHeader = async (composer) => {
  const headerImageBytes = await getHeaderPngBytes();
  const headerImage = headerImageBytes
    ? await composer.pdfDoc.embedPng(headerImageBytes)
    : null;
  const headerCardTop = composer.cursorY;
  const headerCardHeight = 82;
  const headerCardBottom = headerCardTop - headerCardHeight;
  const headerSplitX = MARGIN_X + CONTENT_WIDTH / 2;
  const headerLeftWidth = headerSplitX - MARGIN_X;
  const headerRightWidth = MARGIN_X + CONTENT_WIDTH - headerSplitX;
  const textCenterX = headerSplitX + headerRightWidth / 2;
  const rightDividerY = headerCardTop - 53;
  const rightLowerSectionCenterY =
    headerCardBottom + (rightDividerY - headerCardBottom) / 2;

  composer.drawRect(MARGIN_X, headerCardBottom, CONTENT_WIDTH, headerCardHeight, {
    borderColor: COLORS.black,
    borderWidth: BORDER_WIDTH,
  });
  composer.drawRect(headerSplitX, headerCardBottom, BORDER_WIDTH, headerCardHeight, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });

  if (headerImage) {
    const scaledHeaderImage = headerImage.scaleToFit(
      headerLeftWidth - 15,
      headerCardHeight - 15,
    );

    composer.drawImage(
      headerImage,
      MARGIN_X + (headerLeftWidth - scaledHeaderImage.width) / 2,
      headerCardBottom + (headerCardHeight - scaledHeaderImage.height) / 2,
      scaledHeaderImage.width,
      scaledHeaderImage.height,
    );
  }

  composer.drawCenteredText("MUNICIPALITY OF OPOL", textCenterX, headerCardTop - 22, {
    fontSize: 12,
    bold: true,
    color: COLORS.black,
  });
  composer.drawCenteredText(
    "MUNICIPAL ECONOMIC ENTERPRISE OFFICE",
    textCenterX,
    headerCardTop - 33,
    {
      fontSize: 10,
      color: COLORS.black,
    },
  );
  composer.drawCenteredText("OPOL FISH PORT", textCenterX, headerCardTop - 44, {
    fontSize: 10,
    bold: true,
    color: COLORS.black,
  });
  composer.drawRect(headerSplitX, rightDividerY, headerRightWidth, BORDER_WIDTH, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });
  composer.drawCenteredText("Boat Owner Agreement", textCenterX, rightLowerSectionCenterY - 3, {
    fontSize: 12,
    bold: true,
    color: COLORS.black,
  });

  composer.cursorY = headerCardBottom - 26;
};

const drawInlineField = (composer, label, value, x, y, width) => {
  const labelText = `${label}:`;
  composer.drawText(labelText, x, y, {
    fontSize: 10,
    bold: true,
    color: COLORS.black,
  });

  const labelWidth = composer.boldFont.widthOfTextAtSize(labelText, 10);
  const lineStartX = x + labelWidth + 8;
  composer.drawLine(
    { x: lineStartX, y: y - 2 },
    { x: x + width, y: y - 2 },
    { thickness: 0.8, color: COLORS.black },
  );

  if (value) {
    composer.drawCenteredText(value, lineStartX + (x + width - lineStartX) / 2, y + 2, {
      fontSize: 10,
      color: COLORS.black,
    });
  }
};

const drawParagraph = (composer, text, options = {}) => {
  const indent = options.indent ?? 0;
  const height = composer.drawWrappedText(
    text,
    MARGIN_X + indent,
    composer.cursorY,
    CONTENT_WIDTH - indent,
    {
      fontSize: options.fontSize ?? 10.5,
      lineHeight: options.lineHeight ?? 15,
      color: options.color ?? COLORS.black,
      bold: options.bold ?? false,
    },
  );
  composer.cursorY -= height + (options.after ?? 9);
};

const drawRichParagraph = (composer, segments, options = {}) => {
  const indent = options.indent ?? 0;
  const height = composer.drawRichWrappedText(
    segments,
    MARGIN_X + indent,
    composer.cursorY,
    CONTENT_WIDTH - indent,
    {
      fontSize: options.fontSize ?? 10.5,
      lineHeight: options.lineHeight ?? 15,
      color: options.color ?? COLORS.black,
    },
  );
  composer.cursorY -= height + (options.after ?? 9);
};

const drawSignatureBlock = (composer, { signedDate, signatureImage, inspectorName }) => {
  const rowGap = 58;
  const fieldWidth = 310;
  const startY = composer.cursorY - 4;

  drawInlineField(composer, "Signature", "", MARGIN_X, startY, fieldWidth);
  composer.cursorY = startY;
  if (signatureImage) {
    const scaledSignature = signatureImage.scaleToFit(170, 42);
    composer.drawImage(
      signatureImage,
      MARGIN_X + 126,
      startY + 2,
      scaledSignature.width,
      scaledSignature.height,
    );
  }
  composer.cursorY -= rowGap;

  drawInlineField(composer, "Date", signedDate, MARGIN_X, composer.cursorY, fieldWidth);
  composer.cursorY -= rowGap;

  drawInlineField(composer, "Inspector", inspectorName || "Not recorded", MARGIN_X, composer.cursorY, fieldWidth);
  composer.cursorY -= 22;
};

const normalizeSignatureAudits = ({
  signatureAudits = [],
  signatureDataUrl = "",
  signedDate = "",
  inspectorName = "",
  boatName = "",
}) => {
  const audits = Array.isArray(signatureAudits) ? signatureAudits : [];
  const normalized = audits
    .filter((audit) => String(audit?.signature_data_url || audit?.signatureDataUrl || "").trim())
    .map((audit) => ({
      signatureDataUrl: audit.signature_data_url || audit.signatureDataUrl || "",
      signedDate: formatPdfDate(audit.signed_at || audit.signedAt || audit.date || ""),
      inspectorName: getInspectorName(audit.inspector || audit.inspector_user || audit.inspectorUser),
      boatName: getBoatName(audit.boat || audit.boat_record, audit.boat_name || audit.boatName),
    }));

  if (!normalized.length && signatureDataUrl) {
    normalized.push({
      signatureDataUrl,
      signedDate,
      inspectorName,
      boatName,
    });
  }

  return normalized;
};

const drawAgreementContent = (composer, centerX, { ownerName = "", boatName = "" } = {}) => {
  composer.cursorY -= 18;
  composer.drawCenteredText("AGREEMENT AND CONSENT TO USE SIGNATURE", centerX, composer.cursorY, {
    fontSize: 13,
    bold: true,
    color: COLORS.black,
  });
  composer.cursorY -= 36;

  drawRichParagraph(
    composer,
    [
      { text: "I, " },
      {
        text: ownerName,
        bold: true,
        underline: true,
        fieldWidth: 230,
      },
      { text: ", the legitimate owner or authorized representative of the boat named " },
      {
        text: boatName,
        bold: true,
        underline: true,
        fieldWidth: 230,
      },
      { text: ", agree to the following terms regarding the use of my signature for Banyera transactions:" },
    ],
    { after: 12 },
  );

  const agreementItems = [
    "I consent to the recording, storage, and use of my signature in the Fish Port Management System for official Banyera transactions, in accordance with the Data Privacy Act of 2012 (R.A. No. 10173).",
    "If I do not choose to save my signature permanently, it will be treated as temporary and used only for the current Banyera transaction.",
    "I confirm that I have read and understood these terms, and I voluntarily consent to the processing of my signature and related information for this purpose.",
  ];

  agreementItems.forEach((item, index) => {
    drawParagraph(composer, `${index + 1}. ${item}`, {
      indent: 16,
      after: 7,
      lineHeight: 14,
    });
  });

  composer.cursorY -= 24;
  composer.drawText("Statement of Consent", MARGIN_X, composer.cursorY, {
    fontSize: 11,
    bold: true,
    color: COLORS.black,
  });
  composer.cursorY -= 22;

  drawParagraph(
    composer,
    "I certify that the signature saved in the system may serve as my official signature for future transactions, unless I submit a new signature or formally request that it be replaced.",
    { after: 36 },
  );
};

const drawPrintableAgreementPage = async (composer, {
  audit,
  ownerName,
  boatName = "",
  includeNewPage = false,
}) => {
  if (includeNewPage) {
    composer.addPage();
  }
  await drawHeader(composer);
  const centerX = MARGIN_X + CONTENT_WIDTH / 2;
  const signatureImage = await embedSignatureImage(composer.pdfDoc, audit.signatureDataUrl);

  drawAgreementContent(composer, centerX, { ownerName, boatName });

  drawSignatureBlock(composer, {
    ownerName,
    signedDate: audit.signedDate,
    signatureImage,
    inspectorName: audit.inspectorName,
  });
};

export const buildTermsAndAgreementPdf = async ({
  owner = null,
  boat = null,
  ownerName = "",
  boatName = "",
  date = "",
  signatureDataUrl = "",
  inspector = null,
  signatureAudits = [],
} = {}) => {
  const composer = await createPdfComposer();
  const resolvedOwnerName = getOwnerName(owner, ownerName);
  const resolvedBoatName = getBoatName(boat, boatName);
  const inspectorName = getInspectorName(
    inspector ||
      owner?.owner_signature_updated_by_user ||
      owner?.ownerSignatureUpdatedByUser ||
      owner?.ownerSignatureUpdatedBy ||
      owner?.owner_signature_updated_by ||
      owner?.signature_updated_by ||
      owner?.signatureUpdatedBy,
  );
  const signedDate = formatPdfDate(date);
  const auditEntries = normalizeSignatureAudits({
    signatureAudits,
    signatureDataUrl,
    signedDate,
    inspectorName,
    boatName: resolvedBoatName,
  });
  const centerX = MARGIN_X + CONTENT_WIDTH / 2;

  composer.pdfDoc.setTitle("Terms and Agreement");
  composer.pdfDoc.setSubject("Agreement and consent to use signature");

  if (auditEntries.length) {
    for (let index = 0; index < auditEntries.length; index += 1) {
      await drawPrintableAgreementPage(composer, {
        audit: auditEntries[index],
        ownerName: resolvedOwnerName,
        boatName: auditEntries[index].boatName || resolvedBoatName,
        includeNewPage: index > 0,
      });
    }
  } else {
    await drawHeader(composer);
    drawAgreementContent(composer, centerX, {
      ownerName: resolvedOwnerName,
      boatName: resolvedBoatName,
    });
    drawSignatureBlock(composer, {
      ownerName: resolvedOwnerName,
      signedDate,
      signatureImage: null,
      inspectorName,
    });
  }

  return composer.pdfDoc.save();
};
