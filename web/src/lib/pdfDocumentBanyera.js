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

const formatDateLabel = (value) => {
  const normalized = String(value || "").slice(0, 10);
  if (!normalized) return "-";

  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return normalized;

  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatTimeLabel = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/[T\s](\d{2}):(\d{2})/);
  if (!match) return "-";

  const date = new Date(`2000-01-01T${match[1]}:${match[2]}:00`);
  if (Number.isNaN(date.getTime())) return `${match[1]}:${match[2]}`;

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatMoneyValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatMoney = (value) => `PHP ${formatMoneyValue(value)}`;

const splitTimeParts = (value) => {
  const label = String(value ?? "").trim();
  if (!label || label === "-") return { main: "-", suffix: "" };

  const tokens = label.split(" ");
  if (tokens.length === 1) return { main: label, suffix: "" };

  const suffix = tokens.pop();
  const main = tokens.join(" ");
  return { main: main || label, suffix };
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

    const label = Array.isArray(column.label) ? column.label.join(" ") : column.label;
    composer.drawText(label, x + 6, composer.cursorY - 14, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
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
      reportTypeLabel: "Monthly Banyera",
      coverageKey: `${monthlyYear}-${monthlyMonth}`,
      reportDateLabel: reportDate.toLocaleDateString("en-PH", {
        month: "long",
        year: "numeric",
      }),
      reportDayLabel: "Monthly Coverage",
    };
  }

  if (filterType === "yearly") {
    return {
      reportTypeLabel: "Yearly Banyera",
      coverageKey: String(yearlyDate || year || ""),
      reportDateLabel: String(yearlyDate || year || "-"),
      reportDayLabel: "Yearly Coverage",
    };
  }

  const parsedMonthIndex = new Date(`${month} 1, ${year}`).getMonth();
  const reportDate = new Date(Number(year), parsedMonthIndex, Number(day));

  return {
    reportTypeLabel: "Daily Banyera",
    coverageKey: `${year}-${String(parsedMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
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

const drawRightAlignedText = (composer, value, x, columnWidth, y, options = {}) => {
  const fontSize = options.fontSize ?? 8;
  const bold = options.bold ?? false;
  const font = bold ? composer.boldFont : composer.regularFont;
  const text = sanitizeText(value) || "-";
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const safeX = Math.max(x + 8, x + columnWidth - textWidth - 8);

  composer.drawText(text, safeX, y, {
    fontSize,
    bold,
    color: options.color ?? COLORS.black,
  });
};

const wrapFishItems = (composer, value, columnWidth, fontSize = 8) => {
  const font = composer.regularFont;
  const maxWidth = Math.max(columnWidth - 12, 20);
  const parts = String(value || "-")
    .split(",")
    .map((item) => sanitizeText(item).trim())
    .filter(Boolean);

  if (parts.length === 0) return ["-"];

  const lines = [];
  let currentLine = "";

  parts.forEach((part) => {
    const candidate = currentLine ? `${currentLine}, ${part}` : part;
    const candidateWidth = font.widthOfTextAtSize(candidate, fontSize);

    if (!currentLine || candidateWidth <= maxWidth) {
      currentLine = candidate;
      return;
    }

    lines.push(currentLine);
    currentLine = part;
  });

  if (currentLine) lines.push(currentLine);

  return lines;
};

const getBanyeraTotalFee = (transaction) => {
  const items = Array.isArray(transaction?.items) ? transaction.items : [];
  if (items.length === 0) return Number(transaction?.total_fee ?? 0);

  return items.reduce((sum, item) => {
    const subtotal = Number(item?.subtotal ?? 0);
    if (subtotal > 0) return sum + subtotal;

    const quantity = Number(item?.quantity ?? 0);
    const unitPrice = Number(item?.price ?? item?.unit_price ?? item?.fee?.amount ?? item?.fee_amount ?? 0);
    return sum + (quantity * unitPrice);
  }, 0);
};

const getBanyeraFeePerUnit = (transaction) => {
  const firstItem = transaction?.items?.[0];
  const explicitFeeAmount = Number(firstItem?.fee?.amount ?? firstItem?.fee_amount ?? 0);
  if (explicitFeeAmount > 0) return explicitFeeAmount;

  const totalQuantity = (transaction?.items ?? []).reduce(
    (sum, item) => sum + Number(item?.quantity ?? 0),
    0,
  );
  const totalFee = getBanyeraTotalFee(transaction);
  return totalQuantity > 0 ? totalFee / totalQuantity : 0;
};

const getBanyeraRows = (reportData, filterType, coverageKey) => {
  const transactions = Array.isArray(reportData?.transactions)
    ? reportData.transactions
    : Array.isArray(reportData?.banyeraTransactions)
      ? reportData.banyeraTransactions
      : Array.isArray(reportData)
        ? reportData
        : [];

  return transactions
    .filter((transaction) => !transaction?.is_voided && !transaction?.voided_at)
    .filter((transaction) => {
      const dateValue = String(transaction?.transaction_date || transaction?.created_at || "");
      if (filterType === "monthly") return dateValue.slice(0, 7) === coverageKey;
      if (filterType === "yearly") return dateValue.slice(0, 4) === coverageKey;
      return dateValue.slice(0, 10) === coverageKey;
    })
    .sort((left, right) => String(left?.transaction_date || left?.created_at || "").localeCompare(String(right?.transaction_date || right?.created_at || "")))
    .map((transaction, index) => {
      const transactionDateValue = transaction?.transaction_date || transaction?.created_at || "";
      const transactionDate = String(transactionDateValue).slice(0, 10);

      const items = Array.isArray(transaction?.items) ? transaction.items : [];
      const fishItems = [...new Set(
        items
          .map((item) => item?.classification?.classification_name || item?.classification_name || "")
          .map((value) => String(value).trim())
          .filter(Boolean),
      )].join(", ") || "-";
      const totalQuantity = items.reduce((sum, item) => sum + Number(item?.quantity ?? 0), 0);
      const fee = getBanyeraFeePerUnit(transaction);
      const total = getBanyeraTotalFee(transaction);

      return {
        rowKey: String(transaction?.banyera_id ?? index),
        transactionDate: formatDateLabel(transactionDate),
        transactionTime: formatTimeLabel(transactionDateValue),
        boatName: transaction?.boat?.boat_name || transaction?.boat_name || "-",
        boatType:
          transaction?.boat?.boat_type?.type_name ||
          transaction?.boat?.boatType?.type_name ||
          transaction?.boat_type?.type_name ||
          transaction?.boat_type_name ||
          "-",
        fishItems,
        totalQuantity,
        fee,
        total,
      };
    });
};

export const buildBanyeraPdf = async ({
  filterType = "daily",
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
  const { reportTypeLabel, coverageKey, reportDateLabel, reportDayLabel } = normalizeDateInput({
    filterType,
    month,
    day,
    year,
    monthlyMonth,
    monthlyYear,
    yearlyDate,
  });
  const rows = getBanyeraRows(reportData, filterType, coverageKey);
  const totalBanyera = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.totalQuantity || 0), 0);

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
  composer.drawCenteredText("Banyera Report", textCenterX, rightLowerSectionCenterY - 3, {
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
    ["Day", reportDayLabel],
    ["Prepared By", preparedBy],
  ];
  const secondRowItems = [
    ["Municipality", "Opol"],
    ["Region", "X"],
    ["Total Records", String(rows.length)],
    ["Total Banyera", formatMoney(totalBanyera)],
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

  const columns =
    filterType === "daily"
      ? [
          { key: "transactionTime", label: "Time", width: 56 },
          { key: "boatName", label: "Boat Name", width: 88 },
          { key: "boatType", label: "Boat Type", width: 75 },
          { key: "fishItems", label: "Fish Items", width: 110 },
          { key: "totalQuantity", label: "Total Qty", width: 52 },
          { key: "fee", label: "Fee (PHP)", width: 58 },
          { key: "total", label: "Total (PHP)", width: 68 },
        ]
      : [
          { key: "transactionDate", label: "Banyera Date", width: 90 },
          { key: "transactionTime", label: "Time", width: 36 },
          { key: "boatName", label: "Boat Name", width: 70 },
          { key: "boatType", label: "Boat Type", width: 62 },
          { key: "fishItems", label: "Fish Items", width: 90 },
          { key: "totalQuantity", label: "Total Qty", width: 42 },
          { key: "fee", label: "Fee (PHP)", width: 48 },
          { key: "total", label: "Total (PHP)", width: 58 },
        ];

  drawTableHeader(composer, columns);

  const displayRows =
    rows.length > 0
      ? rows
      : [
          {
            rowKey: "empty",
            transactionDate: "",
            transactionTime: "",
            boatName: "",
            boatType: "",
            fishItems: "",
            totalQuantity: "",
            fee: "",
            total: "",
          },
        ];

  displayRows.forEach((row) => {
    const fishItemLines = wrapFishItems(
      composer,
      row.fishItems,
      columns.find((column) => column.key === "fishItems")?.width ?? 96,
    );
    const detailRowHeight = Math.max(38, 16 + (fishItemLines.length * 10));

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

      if (["fee", "total", "totalQuantity"].includes(column.key)) {
        drawRightAlignedText(
          composer,
          column.key === "totalQuantity"
            ? String(Number(row[column.key] || 0))
            : formatMoneyValue(row[column.key]),
          x,
          column.width,
          composer.cursorY - 19,
        );
      } else if (column.key === "transactionTime") {
        const { main, suffix } = splitTimeParts(row.transactionTime);
        composer.drawText(main, x + 8, composer.cursorY - 16, {
          fontSize: 8,
          color: COLORS.black,
        });
        if (suffix) {
          composer.drawText(suffix, x + 8, composer.cursorY - 26, {
            fontSize: 8,
            color: COLORS.black,
          });
        }
      } else if (column.key === "boatName" || column.key === "boatType") {
        composer.drawText(String(row[column.key] ?? "-"), x + 8, composer.cursorY - 19, {
          fontSize: 8,
          color: COLORS.black,
        });
      } else if (column.key === "fishItems") {
        fishItemLines.forEach((line, lineIndex) => {
          composer.drawText(line, x + 8, composer.cursorY - 19 - (lineIndex * 10), {
            fontSize: 8,
            color: COLORS.black,
          });
        });
      } else {
        composer.drawText(String(row[column.key] ?? "-"), x + 8, composer.cursorY - 19, {
          fontSize: 8,
          color: COLORS.black,
        });
      }

      x += column.width;
    });

    composer.cursorY -= detailRowHeight;
  });

  const summaryRowHeight = 30;
  if (composer.cursorY - summaryRowHeight < MARGIN_Y + 36) {
    composer.addPage();
    drawTableHeader(composer, columns);
  }

  const mergedSummaryWidth = columns
    .filter((column) => ["transactionDate", "transactionTime", "boatName", "boatType", "fishItems"].includes(column.key))
    .reduce((sum, column) => sum + column.width, 0);
  const quantityColumn = columns.find((column) => column.key === "totalQuantity");
  const feeColumn = columns.find((column) => column.key === "fee");
  const totalColumn = columns.find((column) => column.key === "total");

  const summaryRowBottom = composer.cursorY - summaryRowHeight;
  composer.drawRect(MARGIN_X, summaryRowBottom, CONTENT_WIDTH, summaryRowHeight, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BORDER_WIDTH,
  });
  composer.drawText("Total (PHP)", MARGIN_X + 8, composer.cursorY - 19, {
    fontSize: 8,
    bold: true,
    color: COLORS.black,
  });

  let totalsX = MARGIN_X + mergedSummaryWidth;

  composer.drawRect(totalsX, summaryRowBottom, 1, summaryRowHeight, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });

  if (quantityColumn) {
    drawRightAlignedText(composer, String(totalQuantity), totalsX, quantityColumn.width, composer.cursorY - 19, { bold: true });
    totalsX += quantityColumn.width;
  }

  if (feeColumn) {
    composer.drawRect(totalsX, summaryRowBottom, 1, summaryRowHeight, {
      borderColor: COLORS.black,
      fillColor: COLORS.black,
      borderWidth: 0,
    });
    drawRightAlignedText(composer, "-", totalsX, feeColumn.width, composer.cursorY - 19, { bold: true });
    totalsX += feeColumn.width;
  }

  if (totalColumn) {
    composer.drawRect(totalsX, summaryRowBottom, 1, summaryRowHeight, {
      borderColor: COLORS.black,
      fillColor: COLORS.black,
      borderWidth: 0,
    });
    drawRightAlignedText(composer, formatMoneyValue(totalBanyera), totalsX, totalColumn.width, composer.cursorY - 19, { bold: true });
  }

  composer.cursorY -= summaryRowHeight;
  composer.cursorY -= 12;

  composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BORDER_WIDTH,
  });
  drawRightAlignedText(
    composer,
    `Total Banyera: ${formatMoney(totalBanyera)}`,
    MARGIN_X,
    CONTENT_WIDTH,
    composer.cursorY - 15,
    { fontSize: 10, bold: true },
  );

  return composer.pdfDoc.save();
};
