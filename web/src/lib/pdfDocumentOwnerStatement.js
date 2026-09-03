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

const hexToRgb = (hex) => {
  const normalized = String(hex || "").replace("#", "");
  if (normalized.length !== 6) return rgb(0, 0, 0);

  return rgb(
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  );
};

const COLORS = {
  black: rgb(0, 0, 0),
  mediumGray: hexToRgb("#ECECEC"),
  white: rgb(1, 1, 1),
};

const sanitizeText = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatPdfMoneyValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatPdfMoney = (value) => `PHP ${formatPdfMoneyValue(value)}`;

const formatPdfAccountingValue = (value) => {
  const amount = Number(value || 0);
  const formatted = formatPdfMoneyValue(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
};

const formatPdfDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const wrapText = (text, font, fontSize, maxWidth) => {
  const words = (sanitizeText(text) || "-").split(" ");
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines;
};

class PdfComposer {
  constructor(pdfDoc, page, regularFont, boldFont) {
    this.pdfDoc = pdfDoc;
    this.page = page;
    this.regularFont = regularFont;
    this.boldFont = boldFont;
    this.cursorY = PAGE_HEIGHT - MARGIN_Y;
  }

  addPage() {
    this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.cursorY = PAGE_HEIGHT - MARGIN_Y;
  }

  drawText(text, x, y, options = {}) {
    this.page.drawText(sanitizeText(text) || "-", {
      x,
      y,
      size: options.fontSize ?? 9,
      font: options.bold ? this.boldFont : this.regularFont,
      color: options.color ?? COLORS.black,
    });
  }

  drawCenteredText(text, centerX, y, options = {}) {
    const value = sanitizeText(text) || "-";
    const font = options.bold ? this.boldFont : this.regularFont;
    const fontSize = options.fontSize ?? 9;
    const width = font.widthOfTextAtSize(value, fontSize);
    this.drawText(value, centerX - width / 2, y, options);
  }

  drawWrappedText(text, x, y, maxWidth, options = {}) {
    const font = options.bold ? this.boldFont : this.regularFont;
    const fontSize = options.fontSize ?? 8;
    const lineHeight = options.lineHeight ?? 10;
    wrapText(text, font, fontSize, maxWidth).forEach((line, index) => {
      this.drawText(line, x, y - index * lineHeight, options);
    });
  }

  drawRect(x, y, width, height, options = {}) {
    this.page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: options.borderColor ?? COLORS.black,
      borderWidth: options.borderWidth ?? 0.5,
      color: options.fillColor,
    });
  }

  drawImage(image, x, y, width, height) {
    this.page.drawImage(image, { x, y, width, height });
  }
}

const createPdfComposer = async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  return new PdfComposer(pdfDoc, page, regularFont, boldFont);
};

const drawRightAlignedText = (composer, text, x, width, y, options = {}) => {
  const value = sanitizeText(text) || "-";
  const font = options.bold ? composer.boldFont : composer.regularFont;
  const fontSize = options.fontSize ?? 8;
  const textWidth = font.widthOfTextAtSize(value, fontSize);
  composer.drawText(value, x + width - textWidth - 6, y, options);
};

const drawTableHeader = (composer, columns, borderWidth) => {
  let x = MARGIN_X;
  columns.forEach((column) => {
    composer.drawRect(x, composer.cursorY - 22, column.width, 22, {
      borderColor: COLORS.black,
      borderWidth,
      fillColor: COLORS.mediumGray,
    });
    composer.drawCenteredText(column.label, x + column.width / 2, composer.cursorY - 14, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
    });
    x += column.width;
  });
  composer.cursorY -= 22;
};

const drawSummaryCells = (composer, items, top, rowHeight, borderWidth) => {
  const colWidth = CONTENT_WIDTH / items.length;
  const bottom = top - rowHeight;

  composer.drawRect(MARGIN_X, bottom, CONTENT_WIDTH, rowHeight, {
    borderColor: COLORS.black,
    borderWidth,
  });

  items.forEach(([label, value], index) => {
    const cellX = MARGIN_X + colWidth * index;
    const centerX = cellX + colWidth / 2;

    if (index > 0) {
      composer.drawRect(cellX, bottom, borderWidth, rowHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.black,
        borderWidth: 0,
      });
    }

    composer.drawText(`${label}:`, cellX + 8, top - 10, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
    });
    composer.drawCenteredText(value, centerX, top - 21, {
      fontSize: 8,
      color: COLORS.black,
    });
  });
};

const drawOwnerStatementFooter = (composer, balance) => {
  const footerHeight = 38;
  const textBlockHeight = footerHeight;

  if (composer.cursorY - footerHeight < MARGIN_Y) {
    composer.addPage();
  }

  const textBlockTop = composer.cursorY;
  const textBlockBottom = textBlockTop - textBlockHeight;
  const textBlockCenterY = textBlockTop - textBlockHeight / 2;
  const footerTextTopY = textBlockCenterY + 4;
  const footerTextBottomY = textBlockCenterY - 10;

  composer.drawRect(MARGIN_X, textBlockBottom, CONTENT_WIDTH, textBlockHeight, {
    borderColor: COLORS.black,
    borderWidth: 1.5,
  });
  composer.drawCenteredText(
    "If you have questions about this document, please contact the port office.",
    MARGIN_X + CONTENT_WIDTH / 2,
    footerTextTopY,
    {
      fontSize: 9,
      color: COLORS.black,
    },
  );
  composer.drawCenteredText(
    "Thank you for your business!",
    MARGIN_X + CONTENT_WIDTH / 2,
    footerTextBottomY,
    {
      fontSize: 11,
      bold: true,
      color: COLORS.black,
    },
  );
  composer.cursorY = textBlockBottom - 18;
};

const drawOwnerBalanceSummary = (composer, boatStatements, totalBalance, borderWidth) => {
  const rowHeight = 24;
  const labelWidth = CONTENT_WIDTH - 150;
  const balanceWidth = 150;

  if (composer.cursorY < MARGIN_Y + 120) {
    composer.addPage();
  }

  composer.drawRect(MARGIN_X, composer.cursorY - rowHeight, CONTENT_WIDTH, rowHeight, {
    borderColor: COLORS.black,
    borderWidth,
    fillColor: COLORS.mediumGray,
  });
  composer.drawCenteredText("SUMMARY", MARGIN_X + CONTENT_WIDTH / 2, composer.cursorY - 15, {
    fontSize: 8,
    bold: true,
    color: COLORS.black,
  });
  composer.cursorY -= rowHeight;

  composer.drawRect(MARGIN_X, composer.cursorY - rowHeight, CONTENT_WIDTH, rowHeight, {
    borderColor: COLORS.black,
    borderWidth,
    fillColor: COLORS.mediumGray,
  });
  composer.drawText("Boat Name", MARGIN_X + 8, composer.cursorY - 15, {
    fontSize: 8,
    bold: true,
    color: COLORS.black,
  });
  composer.drawRect(MARGIN_X + labelWidth, composer.cursorY - rowHeight, borderWidth, rowHeight, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });
  composer.drawCenteredText("Total Balance Due(PHP)", MARGIN_X + labelWidth + balanceWidth / 2, composer.cursorY - 15, {
    fontSize: 8,
    bold: true,
    color: COLORS.black,
  });
  composer.cursorY -= rowHeight;

  const summaryRows = boatStatements.length ? boatStatements : [{ boat: null }];

  summaryRows.forEach(({ boat }) => {
    if (composer.cursorY - rowHeight < MARGIN_Y + 40) {
      composer.addPage();
    }

    composer.drawRect(MARGIN_X, composer.cursorY - rowHeight, CONTENT_WIDTH, rowHeight, {
      borderColor: COLORS.black,
      borderWidth,
    });
    composer.drawRect(MARGIN_X + labelWidth, composer.cursorY - rowHeight, borderWidth, rowHeight, {
      borderColor: COLORS.black,
      fillColor: COLORS.black,
      borderWidth: 0,
    });
    composer.drawText(boat?.boat_name || " ", MARGIN_X + 8, composer.cursorY - 15, {
      fontSize: 8,
      color: COLORS.black,
    });
    drawRightAlignedText(
      composer,
      boat ? formatPdfMoneyValue(boat?.balance_due || 0) : " ",
      MARGIN_X + labelWidth,
      balanceWidth,
      composer.cursorY - 15,
      { fontSize: 8, color: COLORS.black },
    );
    composer.cursorY -= rowHeight;
  });

  composer.drawRect(MARGIN_X, composer.cursorY - rowHeight, CONTENT_WIDTH, rowHeight, {
    borderColor: COLORS.black,
    borderWidth,
    fillColor: COLORS.mediumGray,
  });
  composer.drawRect(MARGIN_X + labelWidth, composer.cursorY - rowHeight, borderWidth, rowHeight, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });
  composer.drawText("Total Balance Due(PHP):", MARGIN_X + 8, composer.cursorY - 15, {
    fontSize: 8,
    bold: true,
    color: COLORS.black,
  });
  drawRightAlignedText(
    composer,
    formatPdfMoneyValue(totalBalance || 0),
    MARGIN_X + labelWidth,
    balanceWidth,
    composer.cursorY - 15,
    { fontSize: 8, bold: true, color: COLORS.black },
  );
  composer.cursorY -= rowHeight + 12;
};

const drawTransactionTable = (composer, boat, transactions, borderWidth) => {
  const columns = [
    { key: "date", label: "Date", width: 62, align: "left" },
    { key: "bill_reference", label: "Bill Ref.", width: 58, align: "left" },
    { key: "reference", label: "Payment Ref.", width: 72, align: "left" },
    { key: "type", label: "Type", width: 52, align: "left" },
    { key: "description", label: "Description", width: 104, align: "left" },
    { key: "amount", label: "Amount (PHP)", width: 79, align: "right" },
    { key: "running_balance", label: "Line Total (PHP)", width: 84, align: "right" },
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  drawTableHeader(composer, columns, borderWidth);

  if (!transactions.length) {
    composer.drawRect(MARGIN_X, composer.cursorY - 24, tableWidth, 24, {
      borderColor: COLORS.black,
      borderWidth,
    });
    composer.drawCenteredText("No billing or payment transactions found for this boat.", MARGIN_X + tableWidth / 2, composer.cursorY - 15, {
      fontSize: 9,
      color: COLORS.black,
    });
    composer.cursorY -= 32;
    return;
  }

  transactions.forEach((transaction) => {
    const descriptionColumn = columns.find((column) => column.key === "description");
    const descriptionLines = wrapText(
      transaction.description,
      composer.regularFont,
      8,
      Math.max(40, (descriptionColumn?.width ?? 104) - 12),
    );
    const rowHeight = Math.max(24, descriptionLines.length * 10 + 10);

    if (composer.cursorY - rowHeight < MARGIN_Y + 40) {
      composer.addPage();
      drawTableHeader(composer, columns, borderWidth);
    }

    let x = MARGIN_X;
    columns.forEach((column) => {
      composer.drawRect(x, composer.cursorY - rowHeight, column.width, rowHeight, {
        borderColor: COLORS.black,
        borderWidth,
      });

      if (column.key === "description") {
        composer.drawWrappedText(transaction.description, x + 6, composer.cursorY - 9, column.width - 12, {
          fontSize: 8,
          lineHeight: 10,
          color: COLORS.black,
        });
      } else {
        let textValue = "-";
        if (column.key === "date") textValue = formatPdfDate(transaction.date);
        if (column.key === "bill_reference") textValue = transaction.bill_reference || "-";
        if (column.key === "reference") textValue = transaction.reference || "-";
        if (column.key === "type") textValue = transaction.type || "-";
        if (column.key === "amount") {
          textValue =
            transaction.type === "Unbilled"
              ? formatPdfMoneyValue(transaction.charge)
              : transaction.charge > 0
                ? formatPdfMoneyValue(transaction.charge)
                : transaction.payment > 0
                  ? formatPdfAccountingValue(-transaction.payment)
                  : "-";
        }
        if (column.key === "running_balance") {
          textValue =
            transaction.type === "Unbilled"
              ? formatPdfMoneyValue(transaction.charge)
              : formatPdfAccountingValue(transaction.running_balance);
        }

        if (column.align === "right") {
          drawRightAlignedText(composer, textValue, x, column.width, composer.cursorY - rowHeight / 2 - 1, {
            fontSize: 8,
            color: COLORS.black,
          });
        } else {
          composer.drawText(textValue, x + 6, composer.cursorY - rowHeight / 2 - 1, {
            fontSize: 8,
            color: COLORS.black,
          });
        }
      }

      x += column.width;
    });

    composer.cursorY -= rowHeight;
  });

  const amountColumnWidth = columns[columns.length - 2].width;
  const totalColumnWidth = columns[columns.length - 1].width;
  composer.drawRect(MARGIN_X, composer.cursorY - 22, tableWidth - amountColumnWidth - totalColumnWidth, 22, {
    borderColor: COLORS.black,
    borderWidth,
    fillColor: COLORS.mediumGray,
  });
  composer.drawRect(MARGIN_X + tableWidth - amountColumnWidth - totalColumnWidth, composer.cursorY - 22, amountColumnWidth, 22, {
    borderColor: COLORS.black,
    borderWidth,
    fillColor: COLORS.mediumGray,
  });
  composer.drawRect(MARGIN_X + tableWidth - totalColumnWidth, composer.cursorY - 22, totalColumnWidth, 22, {
    borderColor: COLORS.black,
    borderWidth,
    fillColor: COLORS.mediumGray,
  });
  composer.drawText("Total(PHP)", MARGIN_X + 8, composer.cursorY - 14, {
    fontSize: 8,
    bold: true,
    color: COLORS.black,
  });
  drawRightAlignedText(
    composer,
    formatPdfMoneyValue(Number(boat?.total_billed || 0) - Number(boat?.total_paid || 0)),
    MARGIN_X + tableWidth - amountColumnWidth - totalColumnWidth,
    amountColumnWidth,
    composer.cursorY - 14,
    { fontSize: 8, bold: true, color: COLORS.black },
  );
  drawRightAlignedText(
    composer,
    formatPdfMoneyValue(boat?.balance_due || 0),
    MARGIN_X + tableWidth - totalColumnWidth,
    totalColumnWidth,
    composer.cursorY - 14,
    { fontSize: 8, bold: true, color: COLORS.black },
  );
  composer.cursorY -= 34;
};

export const buildOwnerStatementPdf = async ({
  record,
  boatStatements = [],
}) => {
  const composer = await createPdfComposer();
  const headerImageBytes = await getHeaderPngBytes();
  const headerImage = headerImageBytes
    ? await composer.pdfDoc.embedPng(headerImageBytes)
    : null;
  const borderWidth = 1.5;
  const headerCardTop = composer.cursorY;
  const headerCardHeight = 82;
  const headerCardBottom = headerCardTop - headerCardHeight;
  const headerSplitX = MARGIN_X + CONTENT_WIDTH / 2;
  const headerLeftWidth = headerSplitX - MARGIN_X;
  const headerRightWidth = MARGIN_X + CONTENT_WIDTH - headerSplitX;
  const textCenterX = headerSplitX + headerRightWidth / 2;
  const rightDividerY = headerCardTop - 53;
  const rightLowerSectionCenterY = headerCardBottom + (rightDividerY - headerCardBottom) / 2;

  composer.drawRect(MARGIN_X, headerCardBottom, CONTENT_WIDTH, headerCardHeight, {
    borderColor: COLORS.black,
    borderWidth,
  });
  composer.drawRect(headerSplitX, headerCardBottom, borderWidth, headerCardHeight, {
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
  composer.drawCenteredText("MUNICIPAL ECONOMIC ENTERPRISE OFFICE", textCenterX, headerCardTop - 33, {
    fontSize: 10,
    color: COLORS.black,
  });
  composer.drawCenteredText("OPOL FISH PORT", textCenterX, headerCardTop - 44, {
    fontSize: 10,
    bold: true,
    color: COLORS.black,
  });
  composer.drawRect(headerSplitX, rightDividerY, headerRightWidth, borderWidth, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });
  composer.drawCenteredText("Owner Statement", textCenterX, rightLowerSectionCenterY - 3, {
    fontSize: 12,
    bold: true,
    color: COLORS.black,
  });

  composer.cursorY = headerCardBottom - 18;

  drawSummaryCells(
    composer,
    [
      ["Boat Owner", record?.owner_name || "-"],
      ["No. of Boats", String(record?.boat_count || 0)],
      ["Date Issued", formatPdfDate(new Date().toISOString())],
    ],
    composer.cursorY,
    28,
    borderWidth,
  );

  composer.cursorY -= 46;

  drawSummaryCells(
    composer,
    [
      ["Credits", formatPdfMoney(record?.total_paid || 0)],
      ["New Charges", formatPdfMoney(record?.total_billed || 0)],
      ["Total Balance Due", formatPdfMoney(record?.balance_due || 0)],
    ],
    composer.cursorY,
    28,
    borderWidth,
  );

  composer.cursorY -= 46;

  if (boatStatements.length) {
    boatStatements.forEach(({ boat, transactions = [], periodLabel }) => {
      if (composer.cursorY < MARGIN_Y + 150) {
        composer.addPage();
      }

      composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
        borderColor: COLORS.black,
        borderWidth,
        fillColor: COLORS.mediumGray,
      });
      composer.drawText(boat?.boat_name || "-", MARGIN_X + 8, composer.cursorY - 15, {
        fontSize: 9,
        bold: true,
        color: COLORS.black,
      });
      composer.cursorY -= 24;

      drawSummaryCells(
        composer,
        [
          ["Boat Type", boat?.boat_type || "-"],
          ["Period", periodLabel || "-"],
        ],
        composer.cursorY,
        28,
        borderWidth,
      );
      composer.cursorY -= 28;

      drawSummaryCells(
        composer,
        [
          ["Status", boat?.statement_status_label || "-"],
          ["Total Balance Due", formatPdfMoney(boat?.balance_due || 0)],
        ],
        composer.cursorY,
        28,
        borderWidth,
      );
      composer.cursorY -= 38;

      drawTransactionTable(composer, boat, transactions, borderWidth);
      composer.cursorY -= 10;
    });
  }

  drawOwnerBalanceSummary(composer, boatStatements, record?.balance_due || 0, borderWidth);
  drawOwnerStatementFooter(composer, record?.balance_due || 0);
  return composer.pdfDoc.save();
};
