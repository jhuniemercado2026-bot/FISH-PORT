import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  black: hexToRgb("#000000"),
  mediumGray: hexToRgb("#ECECEC"),
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const sanitizeText = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatMoneyValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatMoney = (value) => `PHP ${formatMoneyValue(value)}`;

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

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
    const { fontSize = 10, bold = false, color = COLORS.black } = options;
    page.drawText(sanitizeText(text) || "-", {
      x,
      y,
      size: fontSize,
      font: bold ? boldFont : regularFont,
      color,
    });
  };

  const drawRect = (x, y, width, height, options = {}) => {
    const { borderColor = COLORS.black, fillColor, borderWidth = 1 } = options;
    page.drawRectangle({ x, y, width, height, borderColor, borderWidth, color: fillColor });
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
    page.drawImage(image, { x, y, width, height });
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

const drawTableHeader = (composer, columns) => {
  const headerHeight = 30;
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
      composer.drawCenteredText(line, centerX, composer.cursorY - 13 - lineIndex * 9, {
        fontSize: 8,
        bold: true,
        color: COLORS.black,
      });
    });
    x += column.width;
  });

  composer.cursorY -= headerHeight;
};

const getRevenueReportConfig = ({ filterType, month, day, year, monthlyMonth, monthlyYear, yearlyDate }) => {
  if (filterType === "monthly") {
    const monthLabel = MONTH_NAMES[Number(monthlyMonth) - 1] || month || "January";

    return {
      title: "Revenue Report",
      reportTypeLabel: "Monthly Revenue",
      coverageLabel: "Coverage",
      coverageValue: `${monthLabel} ${monthlyYear || year || ""}`.trim(),
      dayLabel: null,
      columns: [
        { key: "date", label: "Date", width: 60 },
        { key: "payorName", label: "Name of Payor", width: 72 },
        { key: "orNumber", label: "OR No.", width: 55 },
        { key: "description", label: "Transaction", width: 72 },
        { key: "receivable", label: ["Receivable", "(PHP)"], width: 70 },
        { key: "fee", label: ["Amount", "(PHP)"], width: 55 },
        { key: "quantity", label: "Quantity", width: 70 },
        { key: "total", label: ["Total", "(PHP)"], width: 58 },
      ],
      emptyRow: {
        rowKey: "empty",
        date: "-",
        payorName: "-",
        orNumber: "-",
        description: "",
        receivable: 0,
        fee: 0,
        quantity: 0,
        total: 0,
      },
    };
  }

  if (filterType === "yearly") {
    return {
      title: "Revenue Report",
      reportTypeLabel: "Yearly Revenue",
      coverageLabel: "Coverage",
      coverageValue: String(yearlyDate || year || "-"),
      dayLabel: null,
      columns: [
        { key: "date", label: "Date", width: 58 },
        { key: "payorName", label: "Name of Payor", width: 90 },
        { key: "orNumber", label: "OR No.", width: 45 },
        { key: "description", label: "Transaction", width: 82 },
        { key: "receivable", label: ["Receivable", "(PHP)"], width: 68 },
        { key: "fee", label: ["Amount", "(PHP)"], width: 58 },
        { key: "quantity", label: "Quantity", width: 50 },
        { key: "total", label: ["Total", "(PHP)"], width: 60 },
      ],
      emptyRow: {
        rowKey: "empty",
        date: "-",
        payorName: "-",
        orNumber: "-",
        description: "",
        receivable: 0,
        fee: 0,
        quantity: 0,
        total: 0,
      },
    };
  }

  const normalizedMonthValue = String(month || "").trim();
  const monthNameIndex = MONTH_NAMES.indexOf(normalizedMonthValue);
  const parsedMonthIndex =
    monthNameIndex >= 0
      ? monthNameIndex
      : /^\d{1,2}$/.test(normalizedMonthValue)
        ? Number(normalizedMonthValue) - 1
        : -1;
  const resolvedMonthLabel = parsedMonthIndex >= 0 ? MONTH_NAMES[parsedMonthIndex] : MONTH_NAMES[0];
  const reportDate = new Date(
    Number(year),
    parsedMonthIndex >= 0 ? parsedMonthIndex : 0,
    Number(day || 1),
  );

  return {
    title: "Revenue Report",
    reportTypeLabel: "Daily Revenue",
    coverageLabel: "Coverage",
    coverageValue: `${resolvedMonthLabel} ${day || "1"}, ${year || ""}`.trim(),
    dayLabel: Number.isNaN(reportDate.getTime())
      ? "-"
      : reportDate.toLocaleDateString("en-US", { weekday: "long" }),
    columns: [
      { key: "payorName", label: "Name of Payor", width: 95 },
      { key: "orNumber", label: "OR No.", width: 58 },
      { key: "description", label: "Transaction", width: 90 },
      { key: "receivable", label: ["Receivable", "(PHP)"], width: 75 },
      { key: "fee", label: ["Amount", "(PHP)"], width: 65 },
      { key: "quantity", label: "Quantity", width: 63 },
      { key: "total", label: ["Total", "(PHP)"], width: 66 },
    ],
    emptyRow: {
      rowKey: "empty",
      payorName: "-",
      orNumber: "-",
      description: "",
      receivable: 0,
      fee: 0,
      quantity: 0,
      total: 0,
    },
  };
};

const drawHeader = async (composer, title) => {
  const headerImageBytes = await getHeaderPngBytes();
  const headerImage = headerImageBytes ? await composer.pdfDoc.embedPng(headerImageBytes) : null;
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
  composer.drawRect(headerSplitX, rightDividerY, headerRightWidth, 1, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });
  composer.drawCenteredText(title, textCenterX, rightLowerSectionCenterY - 3, {
    fontSize: 12,
    bold: true,
    color: COLORS.black,
  });

  composer.cursorY = headerCardBottom - 18;
};

const drawReportDetails = (composer, config, totalRevenue, preparedBy) => {
  const boxTop = composer.cursorY;
  const detailsRowHeight = 28;
  const detailsContainerHeight = detailsRowHeight * 2;
  const firstRowItems = [
    ["Report Type", config.reportTypeLabel],
    [config.coverageLabel, config.coverageValue],
    ...(config.dayLabel ? [["Day", config.dayLabel]] : []),
    ["Prepared By", preparedBy],
  ];
  const secondRowItems = [
    ["Municipality", "Opol"],
    ["Region", "X"],
    ["Total Revenue", formatMoney(totalRevenue)],
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
};

const getCellValue = (row, key) => {
  if (key === "date") return formatDate(row.date);
  return row[key] ?? "-";
};

const drawDataRows = (composer, columns, rows) => {
  const detailRowHeight = 24;

  rows.forEach((row) => {
    if (composer.cursorY - detailRowHeight < MARGIN_Y + 36) {
      composer.addPage();
      drawTableHeader(composer, columns);
    }

    const rowBottom = composer.cursorY - detailRowHeight;
    composer.drawRect(MARGIN_X, rowBottom, CONTENT_WIDTH, detailRowHeight, {
      borderColor: COLORS.black,
      borderWidth: BORDER_WIDTH,
    });

    let x = MARGIN_X;
    columns.forEach((column, index) => {
      if (index > 0) {
        composer.drawRect(x, rowBottom, 1, detailRowHeight, {
          borderColor: COLORS.black,
          fillColor: COLORS.black,
          borderWidth: 0,
        });
      }

      if (["receivable", "fee", "total"].includes(column.key)) {
        drawRightAlignedText(
          composer,
          formatMoneyValue(row[column.key]),
          x,
          column.width,
          composer.cursorY - 15,
        );
      } else if (column.key === "quantity") {
        drawRightAlignedText(composer, String(row.quantity ?? 0), x, column.width, composer.cursorY - 15);
      } else {
        composer.drawText(String(getCellValue(row, column.key)), x + 6, composer.cursorY - 15, {
          fontSize: 8,
          color: COLORS.black,
        });
      }

      x += column.width;
    });

    composer.cursorY -= detailRowHeight;
  });
};

const drawTotalsRow = (composer, columns, rows, totalRevenue) => {
  const detailRowHeight = 24;

  if (composer.cursorY - detailRowHeight < MARGIN_Y + 36) {
    composer.addPage();
    drawTableHeader(composer, columns);
  }

  const summaryKeys = ["receivable", "fee", "quantity", "total"];
  const mergedSummaryWidth = columns
    .filter((column) => !summaryKeys.includes(column.key))
    .reduce((sum, column) => sum + column.width, 0);
  const receivableTotal = rows.reduce((sum, row) => sum + Number(row.receivable || 0), 0);
  const feeTotal = rows.reduce((sum, row) => sum + Number(row.fee || 0), 0);
  const quantityTotal = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalsByKey = {
    receivable: formatMoneyValue(receivableTotal),
    fee: formatMoneyValue(feeTotal),
    quantity: String(quantityTotal),
    total: formatMoneyValue(totalRevenue),
  };
  const summaryRowBottom = composer.cursorY - detailRowHeight;

  composer.drawRect(MARGIN_X, summaryRowBottom, CONTENT_WIDTH, detailRowHeight, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BORDER_WIDTH,
  });
  composer.drawText("Total (PHP)", MARGIN_X + 6, composer.cursorY - 15, {
    fontSize: 8,
    bold: true,
    color: COLORS.black,
  });

  let totalsX = MARGIN_X + mergedSummaryWidth;
  columns
    .filter((column) => summaryKeys.includes(column.key))
    .forEach((column) => {
      composer.drawRect(totalsX, summaryRowBottom, 1, detailRowHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.black,
        borderWidth: 0,
      });
      drawRightAlignedText(
        composer,
        totalsByKey[column.key],
        totalsX,
        column.width,
        composer.cursorY - 15,
        { bold: true },
      );
      totalsX += column.width;
    });

  composer.cursorY -= detailRowHeight;
};

export const buildRevenuePdf = async ({
  filterType = "daily",
  month,
  day,
  year,
  monthlyMonth,
  monthlyYear,
  yearlyDate,
  preparedBy = "Admin",
  reportData = {},
  fileName = "",
}) => {
  const composer = await createPdfComposer();
  const config = getRevenueReportConfig({
    filterType,
    month,
    day,
    year,
    monthlyMonth,
    monthlyYear,
    yearlyDate,
  });
  const totalRevenue = Number(reportData.totalRevenue || 0);
  const reportRows = Array.isArray(reportData.rows) ? reportData.rows : [];
  const rows = reportRows.length > 0 ? reportRows : [config.emptyRow];
  const documentTitle = String(fileName || "").replace(/\.pdf$/i, "");
  if (documentTitle) {
    composer.pdfDoc.setTitle(documentTitle);
    composer.pdfDoc.setSubject(documentTitle);
  }

  await drawHeader(composer, config.title);
  drawReportDetails(composer, config, totalRevenue, preparedBy);
  drawTableHeader(composer, config.columns);
  drawDataRows(composer, config.columns, rows);
  drawTotalsRow(composer, config.columns, rows, totalRevenue);

  composer.cursorY -= 12;
  composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BORDER_WIDTH,
  });
  drawRightAlignedText(
    composer,
    `Total Revenue: ${formatMoney(totalRevenue)}`,
    MARGIN_X,
    CONTENT_WIDTH,
    composer.cursorY - 15,
    { fontSize: 10, bold: true },
  );

  return composer.pdfDoc.save();
};
