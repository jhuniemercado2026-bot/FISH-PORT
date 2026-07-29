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
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatMoneyValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatMoney = (value) => `PHP ${formatMoneyValue(value)}`;

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

    page.drawImage(image, {
      x,
      y,
      width,
      height,
    });
  };

  const drawKeyValueTable = (rows, x, topY, width, options = {}) => {
    const leftWidth = options.leftWidth ?? width * 0.38;
    const rowHeight = options.rowHeight ?? 20;
    const header = options.header ?? null;
    let currentTopY = topY;

    if (header) {
      drawRect(x, currentTopY - rowHeight, width, rowHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.mediumGray,
        borderWidth: BORDER_WIDTH,
      });
      drawText(header, x + 8, currentTopY - 14, { fontSize: 10, bold: true, color: COLORS.black });
      currentTopY -= rowHeight;
    }

    rows.forEach(([label, value]) => {
      drawRect(x, currentTopY - rowHeight, leftWidth, rowHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.white,
        borderWidth: BORDER_WIDTH,
      });
      drawRect(x + leftWidth, currentTopY - rowHeight, width - leftWidth, rowHeight, {
        borderColor: COLORS.black,
        borderWidth: BORDER_WIDTH,
      });
      drawText(label, x + 8, currentTopY - 13, { fontSize: 9, bold: true, color: COLORS.black });
      drawText(value, x + leftWidth + 8, currentTopY - 13, { fontSize: 9, color: COLORS.black });
      currentTopY -= rowHeight;
    });

    return topY - currentTopY;
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
    drawKeyValueTable,
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

const drawFittedText = (composer, value, x, y, columnWidth, options = {}) => {
  const fontSize = options.fontSize ?? 8;
  const bold = options.bold ?? false;
  const font = bold ? composer.boldFont : composer.regularFont;
  const maxWidth = Math.max(columnWidth - 12, 12);
  const sourceText = sanitizeText(value) || "-";
  let text = sourceText;

  if (font.widthOfTextAtSize(text, fontSize) > maxWidth) {
    const ellipsis = "...";
    const ellipsisWidth = font.widthOfTextAtSize(ellipsis, fontSize);

    if (ellipsisWidth >= maxWidth) {
      text = ".";
    } else {
      let end = sourceText.length;

      while (end > 0 && font.widthOfTextAtSize(`${sourceText.slice(0, end)}${ellipsis}`, fontSize) > maxWidth) {
        end -= 1;
      }

      text = end > 0 ? `${sourceText.slice(0, end)}${ellipsis}` : ellipsis;
    }
  }

  composer.drawText(text, x + 6, y, {
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
      composer.drawCenteredText(line, centerX, composer.cursorY - 13 - (lineIndex * 9), {
        fontSize: 8,
        bold: true,
        color: COLORS.black,
      });
    });
    x += column.width;
  });
  composer.cursorY -= headerHeight;
};

const normalizeDateInput = ({
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
      reportTypeLabel: "Remittance Monthly",
      reportDateLabel: reportDate.toLocaleDateString("en-PH", {
        month: "long",
        year: "numeric",
      }),
      reportDayLabel: "Monthly Coverage",
    };
  }

  if (filterType === "yearly") {
    return {
      reportTypeLabel: "Remittance Yearly",
      reportDateLabel: String(yearlyDate || year || "-"),
      reportDayLabel: "Yearly Coverage",
    };
  }

  const parsedMonthIndex = new Date(`${month} 1, ${year}`).getMonth();
  const reportDate = new Date(Number(year), parsedMonthIndex, Number(day));

  return {
    reportTypeLabel: "Remittance Daily",
    reportDateLabel: reportDate.toLocaleDateString("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    reportDayLabel: reportDate.toLocaleDateString("en-PH", {
      weekday: "long",
    }),
  };
};

export const buildRemittanceReportPdf = async ({
  filterType = "daily",
  month,
  day,
  year,
  monthlyMonth,
  monthlyYear,
  yearlyDate,
  preparedBy = "Admin",
  reportData = {},
  includeCollectionSources = true,
}) => {
  const composer = await createPdfComposer();
  const reportRows = Array.isArray(reportData.rows) ? reportData.rows : [];
  const collectionSources = Array.isArray(reportData.collectionSources) ? reportData.collectionSources : [];
  const remittanceReference = String(reportRows[0]?.remittanceReferenceNo ?? "").trim();
  const totalRemittances = Number(reportData.totalRemittances || 0);
  const totalTodaysCashReceived = Number(reportData.totalTodaysCashReceived || 0);
  const totalSurplus = Number(reportData.totalSurplus || 0);
  const totalDeficit = Number(reportData.totalDeficit || 0);
  const headerImageBytes = await getHeaderPngBytes();
  const headerImage = headerImageBytes
    ? await composer.pdfDoc.embedPng(headerImageBytes)
    : null;
  const { reportTypeLabel, reportDateLabel, reportDayLabel } = normalizeDateInput({
    filterType,
    month,
    day,
    year,
    monthlyMonth,
    monthlyYear,
    yearlyDate,
  });

  if (remittanceReference && remittanceReference !== "-") {
    composer.pdfDoc.setTitle(remittanceReference);
    composer.pdfDoc.setSubject(`Remittance Report ${remittanceReference}`);
  }

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
  composer.drawCenteredText("Remittance Report", textCenterX, rightLowerSectionCenterY - 3, {
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
    ["Coverage", reportDateLabel],
    ...(filterType === "daily" ? [["Day", reportDayLabel]] : []),
    ["Prepared By", preparedBy],
  ];
  const secondRowItems = [
    ["Municipality", "Opol"],
    ["Region", "X"],
    ...(["monthly", "yearly"].includes(String(filterType || "").toLowerCase())
      ? [
          ["Total Surplus", formatMoney(totalSurplus)],
          ["Total Deficit", formatMoney(totalDeficit)],
        ]
      : []),
    ["Cash Received", formatMoney(totalTodaysCashReceived)],
    ["Total Remittances", formatMoney(totalRemittances)],
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

  const isMonthly = String(filterType || "").toLowerCase() === "monthly";
  const isYearly = String(filterType || "").toLowerCase() === "yearly";
  const includeDateColumn = isMonthly || isYearly;

  // Adjusted widths for monthly/yearly view: smaller Ref. No., more room for Date and Status
  const columns = includeDateColumn
    ? [
        { key: "date", label: "Date", width: 72 },
        { key: "remittanceReferenceNo", label: "Ref. No.", width: 40 },
        { key: "todaysCashReceived", label: ["Today's Cash", "(PHP)"], width: 76 },
        { key: "amountToRemit", label: ["Amount to", "Remit (PHP)"], width: 76 },
        { key: "surplus", label: ["Surplus", "(PHP)"], width: 56 },
        { key: "deficit", label: ["Deficit", "(PHP)"], width: 56 },
        { key: "status", label: "Status", width: 48 },
        { key: "remarks", label: "Remarks", width: 80 },
      ]
    : [
        { key: "remittanceReferenceNo", label: "Ref. No.", width: 92 },
        { key: "todaysCashReceived", label: ["Today's Cash", "(PHP)"], width: 76 },
        { key: "amountToRemit", label: ["Amount to", "Remit (PHP)"], width: 76 },
        { key: "surplus", label: ["Surplus", "(PHP)"], width: 60 },
        { key: "deficit", label: ["Deficit", "(PHP)"], width: 60 },
        { key: "status", label: "Status", width: 50 },
        { key: "remarks", label: "Remarks", width: 80 },
      ];

  drawTableHeader(composer, columns);

  const rows =
    reportRows.length > 0
      ? reportRows
      : [
          {
            rowKey: "empty",
            date: "-",
            remittanceReferenceNo: "-",
            todaysCashReceived: 0,
            amountToRemit: 0,
            surplus: 0,
            deficit: 0,
            remarks: "",
            status: "-",
          },
        ];

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

      if (["todaysCashReceived", "amountToRemit", "surplus", "deficit"].includes(column.key)) {
        const amountValue = column.key === "amountToRemit" ? row.amountToRemit ?? row.confirmedCash : row[column.key];
        drawRightAlignedText(composer, formatMoneyValue(amountValue), x, column.width, composer.cursorY - 15);
      } else if (column.key === "date") {
        const dateVal = formatPdfDate(row.date);
        composer.drawText(dateVal, x + 6, composer.cursorY - 15, {
          fontSize: 8,
          color: COLORS.black,
        });
      } else {
        composer.drawText(String(row[column.key] ?? "-"), x + 6, composer.cursorY - 15, {
          fontSize: 8,
          color: COLORS.black,
        });
      }

      x += column.width;
    });

    composer.cursorY -= detailRowHeight;
  });

  if (includeCollectionSources) {
    const collectionSourcesHeadingGap = 18;
    composer.cursorY -= collectionSourcesHeadingGap + 8;

    const sourceRows =
      collectionSources.length > 0
        ? collectionSources
        : [
            {
              rowKey: "empty-source",
              date: "-",
              transaction: "-",
              typeName: "-",
              officialReceiptNo: "-",
              cashReceived: 0,
            },
          ];

    const sourceColumns = [
      { key: "transaction", label: "Transaction", width: 150 },
      { key: "typeName", label: ["Boat/Vehicle", "Type"], width: 128 },
      { key: "officialReceiptNo", label: ["Official", "Receipt No."], width: 126 },
      { key: "cashReceived", label: ["Cash Received", "(PHP)"], width: CONTENT_WIDTH - 150 - 128 - 126 },
    ];

    if (composer.cursorY < MARGIN_Y + 110) {
      composer.addPage();
    }

    composer.drawText("Collection Sources", MARGIN_X, composer.cursorY, {
      fontSize: 11,
      bold: true,
      color: COLORS.black,
    });
    composer.cursorY -= collectionSourcesHeadingGap;

    drawTableHeader(composer, sourceColumns);

    sourceRows.forEach((row) => {
      if (composer.cursorY - detailRowHeight < MARGIN_Y + 36) {
        composer.addPage();
        drawTableHeader(composer, sourceColumns);
      }

      const rowBottom = composer.cursorY - detailRowHeight;
      composer.drawRect(MARGIN_X, rowBottom, CONTENT_WIDTH, detailRowHeight, {
        borderColor: COLORS.black,
        borderWidth: BORDER_WIDTH,
      });

      let x = MARGIN_X;
      sourceColumns.forEach((column, index) => {
        if (index > 0) {
          composer.drawRect(x, rowBottom, 1, detailRowHeight, {
            borderColor: COLORS.black,
            fillColor: COLORS.black,
            borderWidth: 0,
          });
        }

        if (column.key === "cashReceived") {
          drawRightAlignedText(composer, formatMoneyValue(row.cashReceived), x, column.width, composer.cursorY - 15);
        } else if (column.key === "date") {
          drawFittedText(composer, formatPdfDate(row.date), x, composer.cursorY - 15, column.width);
        } else if (column.key === "typeName") {
          drawFittedText(composer, row.typeName, x, composer.cursorY - 15, column.width);
        } else if (column.key === "officialReceiptNo") {
          drawFittedText(composer, row.officialReceiptNo, x, composer.cursorY - 15, column.width);
        } else {
          drawFittedText(composer, row[column.key], x, composer.cursorY - 15, column.width);
        }

        x += column.width;
      });

      composer.cursorY -= detailRowHeight;
    });
  }

  composer.cursorY -= 12;

  if (composer.cursorY - 24 < MARGIN_Y) {
    composer.addPage();
  }

  composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BORDER_WIDTH,
  });
  drawRightAlignedText(
    composer,
    `Total Remittances: ${formatMoney(totalRemittances)}`,
    MARGIN_X,
    CONTENT_WIDTH,
    composer.cursorY - 15,
    { fontSize: 10, bold: true },
  );

  return composer.pdfDoc.save();
};
