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

  return rgb(
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  );
};

const COLORS = {
  black: rgb(0, 0, 0),
  mediumGray: hexToRgb("#ECECEC"),
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
  return lines.length ? lines : ["-"];
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

  const drawText = (text, x, y, options = {}) => {
    page.drawText(sanitizeText(text) || "-", {
      x,
      y,
      size: options.fontSize ?? 9,
      font: options.bold ? boldFont : regularFont,
      color: options.color ?? COLORS.black,
    });
  };

  const drawCenteredText = (text, centerX, y, options = {}) => {
    const value = sanitizeText(text) || "-";
    const font = options.bold ? boldFont : regularFont;
    const fontSize = options.fontSize ?? 9;
    const width = font.widthOfTextAtSize(value, fontSize);
    drawText(value, centerX - width / 2, y, options);
  };

  const drawRect = (x, y, width, height, options = {}) => {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: options.borderColor ?? COLORS.black,
      borderWidth: options.borderWidth ?? BORDER_WIDTH,
      color: options.fillColor,
    });
  };

  const drawImage = (image, x, y, width, height) => {
    if (!image) return;
    page.drawImage(image, { x, y, width, height });
  };

  const drawWrappedText = (text, x, yTop, maxWidth, options = {}) => {
    const font = options.bold ? boldFont : regularFont;
    const fontSize = options.fontSize ?? 8;
    const lineHeight = options.lineHeight ?? 10;
    const lines = wrapText(text, font, fontSize, maxWidth);
    lines.forEach((line, index) => {
      drawText(line, x, yTop - fontSize - index * lineHeight, options);
    });
    return lines.length * lineHeight;
  };

  return {
    pdfDoc,
    regularFont,
    boldFont,
    get cursorY() {
      return cursorY;
    },
    set cursorY(value) {
      cursorY = value;
    },
    addPage,
    drawText,
    drawCenteredText,
    drawRect,
    drawImage,
    drawWrappedText,
  };
};

const drawRightAlignedText = (composer, text, x, width, y, options = {}) => {
  const font = options.bold ? composer.boldFont : composer.regularFont;
  const fontSize = options.fontSize ?? 8;
  const value = sanitizeText(text) || "-";
  const textWidth = font.widthOfTextAtSize(value, fontSize);
  composer.drawText(value, x + width - textWidth - 6, y, options);
};

const drawTableHeader = (composer, columns) => {
  let x = MARGIN_X;
  columns.forEach((column) => {
    composer.drawRect(x, composer.cursorY - 24, column.width, 24, {
      fillColor: COLORS.mediumGray,
      borderColor: COLORS.black,
      borderWidth: BORDER_WIDTH,
    });
    composer.drawCenteredText(column.label, x + column.width / 2, composer.cursorY - 15, {
      fontSize: 7,
      bold: true,
      color: COLORS.black,
    });
    x += column.width;
  });
  composer.cursorY -= 24;
};

const getCoverageLabel = ({ filterType, month, day, year, monthlyMonth, monthlyYear, yearlyDate }) => {
  if (filterType === "daily") {
    const dateValue = year && month && day ? `${year}-${month}-${day}` : "";
    return formatPdfDate(dateValue);
  }

  if (filterType === "monthly") {
    const monthDate = monthlyYear && monthlyMonth ? `${monthlyYear}-${monthlyMonth}-01` : "";
    const date = new Date(monthDate);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    }
  }

  return yearlyDate || year || "-";
};

const getReportTypeLabel = (filterType) => {
  if (filterType === "monthly") return "Monthly Collections";
  if (filterType === "yearly") return "Yearly Collections";
  return "Daily Collections";
};

const normalizeRows = (reportData) =>
  (Array.isArray(reportData?.rows) ? reportData.rows : []).map((row) => ({
    date: row?.date || row?.collection_date || "-",
    transaction: row?.transaction || "-",
    typeName: row?.type_name || row?.typeName || "-",
    officialReceiptNo: row?.official_receipt_no || row?.officialReceiptNo || "-",
    cashReceived: Number(row?.cash_received ?? row?.cashReceived ?? 0),
  }));

export const buildCollectionsPdf = async ({
  filterType = "daily",
  month,
  day,
  year,
  monthlyMonth,
  monthlyYear,
  yearlyDate,
  preparedBy = "Admin",
  reportData,
} = {}) => {
  const composer = await createPdfComposer();
  const headerImageBytes = await getHeaderPngBytes();
  const headerImage = headerImageBytes ? await composer.pdfDoc.embedPng(headerImageBytes) : null;
  const rows = normalizeRows(reportData);
  const rowTotals = rows.reduce(
    (acc, row) => ({
      cashReceived: acc.cashReceived + row.cashReceived,
    }),
    { cashReceived: 0 },
  );
  const totals = {
    cashReceived: Number(reportData?.totalCollections ?? reportData?.total_collections ?? rowTotals.cashReceived),
    records: Number(reportData?.collectionRecords ?? reportData?.collection_records ?? rows.length),
  };

  const headerCardTop = composer.cursorY;
  const headerCardHeight = 82;
  const headerCardBottom = headerCardTop - headerCardHeight;
  const headerSplitX = MARGIN_X + CONTENT_WIDTH / 2;
  const headerLeftWidth = headerSplitX - MARGIN_X;
  const headerRightWidth = MARGIN_X + CONTENT_WIDTH - headerSplitX;
  const textCenterX = headerSplitX + headerRightWidth / 2;
  const rightDividerY = headerCardTop - 53;
  const rightLowerSectionCenterY = headerCardBottom + (rightDividerY - headerCardBottom) / 2;

  composer.drawRect(MARGIN_X, headerCardBottom, CONTENT_WIDTH, headerCardHeight);
  composer.drawRect(headerSplitX, headerCardBottom, BORDER_WIDTH, headerCardHeight, {
    fillColor: COLORS.black,
    borderWidth: 0,
  });

  if (headerImage) {
    const scaledHeaderImage = headerImage.scaleToFit(headerLeftWidth - 15, headerCardHeight - 15);
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
  });
  composer.drawCenteredText("MUNICIPAL ECONOMIC ENTERPRISE OFFICE", textCenterX, headerCardTop - 33, {
    fontSize: 10,
  });
  composer.drawCenteredText("OPOL FISH PORT", textCenterX, headerCardTop - 44, {
    fontSize: 10,
    bold: true,
  });
  composer.drawRect(headerSplitX, rightDividerY, headerRightWidth, BORDER_WIDTH, {
    fillColor: COLORS.black,
    borderWidth: 0,
  });
  composer.drawCenteredText("Collections Report", textCenterX, rightLowerSectionCenterY - 3, {
    fontSize: 12,
    bold: true,
  });

  composer.cursorY = headerCardBottom - 18;

  const boxTop = composer.cursorY;
  const detailsRowHeight = 28;
  const detailsContainerHeight = detailsRowHeight * 2;
  const firstRowItems = [
    ["Report Type", getReportTypeLabel(filterType)],
    ["Coverage", getCoverageLabel({ filterType, month, day, year, monthlyMonth, monthlyYear, yearlyDate })],
    ["Municipality", "Opol"],
    ["Region", "X"],
  ];
  const secondRowItems = [
    ["Prepared By", preparedBy || "Admin"],
    ["Total Collections", formatPdfMoney(totals.cashReceived)],
  ];
  const firstRowWidth = CONTENT_WIDTH / firstRowItems.length;
  const secondRowWidth = CONTENT_WIDTH / secondRowItems.length;
  const firstRowBottom = boxTop - detailsRowHeight;
  const secondRowBottom = firstRowBottom - detailsRowHeight;

  composer.drawRect(MARGIN_X, boxTop - detailsContainerHeight, CONTENT_WIDTH, detailsContainerHeight, {
    borderColor: COLORS.black,
    borderWidth: BORDER_WIDTH,
  });
  composer.drawRect(MARGIN_X, firstRowBottom, CONTENT_WIDTH, 1, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });

  firstRowItems.forEach(([label, value], index) => {
    const cellX = MARGIN_X + firstRowWidth * index;
    const cellCenterX = cellX + firstRowWidth / 2;

    if (index > 0) {
      composer.drawRect(cellX, firstRowBottom, 1, detailsRowHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.black,
        borderWidth: 0,
      });
    }

    composer.drawText(`${label}:`, cellX + 8, boxTop - 10, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
    });
    composer.drawCenteredText(String(value || "-"), cellCenterX, boxTop - 21, {
      fontSize: 8,
      color: COLORS.black,
    });
  });

  secondRowItems.forEach(([label, value], index) => {
    const cellX = MARGIN_X + secondRowWidth * index;
    const cellCenterX = cellX + secondRowWidth / 2;

    if (index > 0) {
      composer.drawRect(cellX, secondRowBottom, 1, detailsRowHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.black,
        borderWidth: 0,
      });
    }

    composer.drawText(`${label}:`, cellX + 8, firstRowBottom - 10, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
    });
    composer.drawCenteredText(String(value || "-"), cellCenterX, firstRowBottom - 21, {
      fontSize: 8,
      color: COLORS.black,
    });
  });

  composer.cursorY = boxTop - detailsContainerHeight - 18;

  const columns = filterType === "daily"
    ? [
        { key: "transaction", label: "Transaction", width: 124, align: "left" },
        { key: "typeName", label: "Name / Type", width: 136, align: "left" },
        { key: "officialReceiptNo", label: "OR No.", width: 92, align: "left" },
        { key: "cashReceived", label: "Cash Received", width: 159, align: "right" },
      ]
    : [
        { key: "date", label: "Date", width: 62, align: "left" },
        { key: "transaction", label: "Transaction", width: 112, align: "left" },
        { key: "typeName", label: "Name / Type", width: 122, align: "left" },
        { key: "officialReceiptNo", label: "OR No.", width: 82, align: "left" },
        { key: "cashReceived", label: "Cash Received", width: 133, align: "right" },
      ];

  drawTableHeader(composer, columns);

  if (!rows.length) {
    composer.drawRect(MARGIN_X, composer.cursorY - 26, CONTENT_WIDTH, 26);
    composer.drawCenteredText("No collection records found for the selected coverage.", MARGIN_X + CONTENT_WIDTH / 2, composer.cursorY - 17, {
      fontSize: 9,
    });
    composer.cursorY -= 34;
  } else {
    rows.forEach((row) => {
      const textColumns = columns.filter((column) => column.align !== "right");
      const textLineCounts = textColumns.map((column) => {
        const value = column.key === "date" ? formatPdfDate(row[column.key]) : row[column.key];
        return wrapText(value, composer.regularFont, 8, column.width - 12).length;
      });
      const rowHeight = Math.max(24, Math.max(...textLineCounts) * 10 + 10);

      if (composer.cursorY - rowHeight < MARGIN_Y + 40) {
        composer.addPage();
        drawTableHeader(composer, columns);
      }

      let x = MARGIN_X;
      columns.forEach((column) => {
        composer.drawRect(x, composer.cursorY - rowHeight, column.width, rowHeight);

        if (column.align === "right") {
          drawRightAlignedText(
            composer,
            formatPdfMoneyValue(row[column.key]),
            x,
            column.width,
            composer.cursorY - rowHeight / 2 - 1,
            { fontSize: 8 },
          );
        } else {
          const value = column.key === "date" ? formatPdfDate(row[column.key]) : row[column.key];
          composer.drawWrappedText(value, x + 6, composer.cursorY - 6, column.width - 12, {
            fontSize: 8,
            lineHeight: 10,
          });
        }

        x += column.width;
      });

      composer.cursorY -= rowHeight;
    });

    const totalRowHeight = 24;
    const labelWidth = columns.slice(0, -1).reduce((sum, column) => sum + column.width, 0);
    const amountColumn = columns[columns.length - 1];
    composer.drawRect(MARGIN_X, composer.cursorY - totalRowHeight, labelWidth, totalRowHeight, {
      fillColor: COLORS.mediumGray,
    });
    composer.drawText("Total(PHP)", MARGIN_X + 8, composer.cursorY - 15, {
      fontSize: 8,
      bold: true,
    });
    composer.drawRect(MARGIN_X + labelWidth, composer.cursorY - totalRowHeight, amountColumn.width, totalRowHeight, {
      fillColor: COLORS.mediumGray,
    });
    drawRightAlignedText(composer, formatPdfMoneyValue(totals.cashReceived), MARGIN_X + labelWidth, amountColumn.width, composer.cursorY - 15, {
      fontSize: 8,
      bold: true,
    });
    composer.cursorY -= 36;
  }

  return composer.pdfDoc.save();
};
