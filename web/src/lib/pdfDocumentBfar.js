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
  mediumGray: hexToRgb("#ECECEC"),
  white: hexToRgb("#FFFFFF"),
};

const sanitizeText = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatPdfDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatPdfNumber = (value, options = {}) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });

const loadPngBytes = async (path) => {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
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
    const {
      fontSize = 10,
      bold = false,
      color = COLORS.black,
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
      borderColor = COLORS.black,
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
    drawText,
    drawRect,
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

const drawTableHeader = (composer, columns) => {
  const headerHeight = 22;
  const headerBottom = composer.cursorY - headerHeight;

  composer.drawRect(MARGIN_X, headerBottom, CONTENT_WIDTH, headerHeight, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BORDER_WIDTH,
  });

  let x = MARGIN_X;
  columns.forEach((column, index) => {
    if (index > 0) {
      composer.drawRect(x, headerBottom, 1, headerHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.black,
        borderWidth: 0,
      });
    }

    const lines = Array.isArray(column.label) ? column.label : [column.label];
    const centerX = x + column.width / 2;

    lines.forEach((line, lineIndex) => {
      composer.drawCenteredText(line, centerX, composer.cursorY - 14 - (lineIndex * 8), {
        fontSize: 8,
        bold: true,
        color: COLORS.black,
      });
    });

    x += column.width;
  });

  composer.cursorY -= headerHeight;
};

const drawRightAlignedText = (composer, value, x, columnWidth, y, options = {}) => {
  const fontSize = options.fontSize ?? 8;
  const bold = options.bold ?? false;
  const font = bold ? composer.boldFont : composer.regularFont;
  const text = sanitizeText(value) || "-";
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const safeX = Math.max(x + 6, x + columnWidth - textWidth - 6);

  composer.drawText(text, safeX, y, {
    fontSize,
    bold,
    color: options.color ?? COLORS.black,
  });
};

const resolveCoverage = ({
  filterType = "daily",
  month,
  day,
  year,
  monthlyMonth,
  monthlyYear,
  yearlyDate,
}) => {
  if (filterType === "monthly") {
    const reportDate = new Date(Number(monthlyYear), Number(monthlyMonth) - 1, 1);

    return {
      reportTypeLabel: "BFAR Monthly",
      coverageKey: `${monthlyYear}-${monthlyMonth}`,
      coverageLabel: reportDate.toLocaleDateString("en-PH", {
        month: "long",
        year: "numeric",
      }),
    };
  }

  if (filterType === "yearly") {
    return {
      reportTypeLabel: "Fisheries (BFAR) Yearly",
      coverageKey: String(yearlyDate || year || ""),
      coverageLabel: String(yearlyDate || year || "-"),
    };
  }

  const parsedMonthIndex = new Date(`${month} 1, ${year}`).getMonth();
  const reportDate = new Date(Number(year), parsedMonthIndex, Number(day));

  return {
    reportTypeLabel: "Fisheries (BFAR) Daily",
    coverageKey: `${year}-${String(parsedMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    coverageLabel: reportDate.toLocaleDateString("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };
};

const getTransactionDateValue = (row) =>
  row?.date ||
  row?.transaction_date ||
  row?.created_at ||
  row?.banyera_date ||
  "";

const getBoatName = (row, fallback = "-") =>
  row?.boat_name ||
  row?.boatName ||
  row?.boat?.boat_name ||
  fallback;

const getClassificationName = (item) =>
  item?.fishClassification ||
  item?.fish_classification ||
  item?.classification_name ||
  item?.classification?.classification_name ||
  item?.classification ||
  "-";

const getQuantity = (item) =>
  Number(
    item?.qty ??
    item?.quantity ??
    0,
  );

const getDaug = (item) =>
  Number(
    item?.daug ??
    item?.daug_php ??
    0,
  );

const matchesCoverage = (dateValue, filterType, coverageKey) => {
  const normalized = String(dateValue || "");
  if (filterType === "monthly") return normalized.slice(0, 7) === coverageKey;
  if (filterType === "yearly") return normalized.slice(0, 4) === coverageKey;
  return normalized.slice(0, 10) === coverageKey;
};

const getBfarRows = (reportData, filterType, coverageKey) => {
  const explicitRows = Array.isArray(reportData?.rows)
    ? reportData.rows
    : Array.isArray(reportData?.bfarRows)
      ? reportData.bfarRows
      : null;

  if (explicitRows) {
    return explicitRows
      .filter((row) => matchesCoverage(getTransactionDateValue(row), filterType, coverageKey))
      .sort((left, right) => String(getTransactionDateValue(left)).localeCompare(String(getTransactionDateValue(right))))
      .map((row, index) => ({
        rowKey: String(row?.rowKey ?? row?.id ?? index),
        date: getTransactionDateValue(row),
        boatName: getBoatName(row),
        fishClassification: getClassificationName(row),
        qty: getQuantity(row),
        daug: getDaug(row),
      }));
  }

  const transactions = Array.isArray(reportData?.transactions)
    ? reportData.transactions
    : Array.isArray(reportData?.banyeraTransactions)
      ? reportData.banyeraTransactions
      : Array.isArray(reportData)
        ? reportData
        : [];

  return transactions
    .filter((transaction) => !transaction?.is_voided && !transaction?.voided_at)
    .filter((transaction) => matchesCoverage(getTransactionDateValue(transaction), filterType, coverageKey))
    .sort((left, right) => String(getTransactionDateValue(left)).localeCompare(String(getTransactionDateValue(right))))
    .flatMap((transaction, transactionIndex) => {
      const items = Array.isArray(transaction?.items) ? transaction.items : [];
      const fallbackItems = items.length > 0 ? items : [transaction];

      return fallbackItems.map((item, itemIndex) => ({
        rowKey: `${transaction?.banyera_id ?? transaction?.id ?? transactionIndex}-${item?.item_id ?? itemIndex}`,
        date: getTransactionDateValue(item) || getTransactionDateValue(transaction),
        boatName: getBoatName(item, getBoatName(transaction)),
        fishClassification: getClassificationName(item),
        qty: getQuantity(item),
        daug: getDaug(item),
      }));
    });
};

export const buildBfarPdf = async ({
  filterType = "monthly",
  month,
  day,
  year,
  monthlyMonth,
  monthlyYear,
  yearlyDate,
  preparedBy = "Admin",
  reportData = {},
}) => {
  const composer = await createPdfComposer();
  const headerImageBytes = await getHeaderPngBytes();
  const headerImage = headerImageBytes
    ? await composer.pdfDoc.embedPng(headerImageBytes)
    : null;
  const { reportTypeLabel, coverageKey, coverageLabel } = resolveCoverage({
    filterType,
    month,
    day,
    year,
    monthlyMonth,
    monthlyYear,
    yearlyDate,
  });
  const rows = getBfarRows(reportData, filterType, coverageKey);
  const totalQty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);

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
    borderWidth: BORDER_WIDTH,
  });
  composer.drawRect(headerSplitX, headerCardBottom, 1, headerCardHeight, {
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
  composer.drawRect(headerSplitX, rightDividerY, headerRightWidth, 1, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });
  composer.drawCenteredText("BFAR Report", textCenterX, rightLowerSectionCenterY - 3, {
    fontSize: 12,
    bold: true,
    color: COLORS.black,
  });

  composer.cursorY = headerCardBottom - 18;

  const boxTop = composer.cursorY;
  const detailsRowHeight = 28;
  const detailsContainerHeight = detailsRowHeight * 2;
  const firstRowItems = [
    ["Report Type", reportTypeLabel],
    ["Coverage", coverageLabel],
    ["Prepared By", preparedBy],
  ];
  const secondRowItems = [
    ["Municipality", "Opol"],
    ["Region", "X"],
    ["Total Qty", formatPdfNumber(totalQty)],
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
    composer.drawCenteredText(value, cellCenterX, boxTop - 21, {
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
    composer.drawCenteredText(value, cellCenterX, firstRowBottom - 21, {
      fontSize: 8,
      color: COLORS.black,
    });
  });

  composer.cursorY = boxTop - detailsContainerHeight - 18;

  const columns = [
    { key: "date", label: "Date", width: 110 },
    { key: "boatName", label: "Boat Name", width: 120 },
    { key: "fishClassification", label: "Fish Classification", width: 150 },
    { key: "qty", label: "Qty", width: 60 },
    { key: "daug", label: "Daug (PHP)", width: 76 },
  ];

  // For daily BFAR reports we omit the Date column and start with Boat Name
  const adjustedColumns = filterType === "daily"
    ? [
        { key: "boatName", label: "Boat Name", width: 180 },
        { key: "fishClassification", label: "Fish Classification", width: 190 },
        { key: "qty", label: "Qty", width: 60 },
        { key: "daug", label: "Daug (PHP)", width: 76 },
      ]
    : columns;

  drawTableHeader(composer, adjustedColumns);

  const tableRows = rows.length > 0 ? rows : [
    {
      rowKey: "empty",
      date: "-",
      boatName: "-",
      fishClassification: "-",
      qty: 0,
      daug: 0,
    },
  ];

  const detailRowHeight = 24;

  tableRows.forEach((row) => {
    if (composer.cursorY - detailRowHeight < MARGIN_Y + 36) {
      composer.addPage();
      drawTableHeader(composer, adjustedColumns);
    }

    const rowBottom = composer.cursorY - detailRowHeight;
    composer.drawRect(MARGIN_X, rowBottom, CONTENT_WIDTH, detailRowHeight, {
      borderColor: COLORS.black,
      borderWidth: BORDER_WIDTH,
    });

    let x = MARGIN_X;
    adjustedColumns.forEach((column, index) => {
      if (index > 0) {
        composer.drawRect(x, rowBottom, 1, detailRowHeight, {
          borderColor: COLORS.black,
          fillColor: COLORS.black,
          borderWidth: 0,
        });
      }

      if (column.key === "date") {
        composer.drawText(formatPdfDate(row.date), x + 6, composer.cursorY - 15, {
          fontSize: 8,
          color: COLORS.black,
        });
      }

      if (column.key === "boatName") {
        composer.drawText(row.boatName, x + 6, composer.cursorY - 15, {
          fontSize: 8,
          color: COLORS.black,
        });
      }

      if (column.key === "fishClassification") {
        composer.drawText(row.fishClassification, x + 6, composer.cursorY - 15, {
          fontSize: 8,
          color: COLORS.black,
        });
      }

      if (column.key === "qty") {
        drawRightAlignedText(composer, formatPdfNumber(row.qty), x, column.width, composer.cursorY - 15);
      }

      if (column.key === "daug") {
        drawRightAlignedText(
          composer,
          formatPdfNumber(row.daug, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          x,
          column.width,
          composer.cursorY - 15,
        );
      }

      x += column.width;
    });

    composer.cursorY -= detailRowHeight;
  });

  composer.cursorY -= 12;

  composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BORDER_WIDTH,
  });
  drawRightAlignedText(
    composer,
    `Total Qty: ${formatPdfNumber(totalQty)}`,
    MARGIN_X,
    CONTENT_WIDTH,
    composer.cursorY - 15,
    { fontSize: 10, bold: true },
  );

  return composer.pdfDoc.save();
};
