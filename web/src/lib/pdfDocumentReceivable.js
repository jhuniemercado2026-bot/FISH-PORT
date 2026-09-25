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

const formatStatus = (value) =>
  sanitizeText(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-";

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
    get page() {
      return page;
    },
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
  if (filterType === "monthly") return "Monthly Receivables";
  if (filterType === "yearly") return "Yearly Receivables";
  return "Daily Receivables";
};

const normalizeRows = (reportData) =>
  (Array.isArray(reportData?.boatRecords) ? reportData.boatRecords : [])
    .map((boat) => ({
      boatName: boat?.boat_name || boat?.boatName || "-",
      ownerName: boat?.owner_name || boat?.ownerName || "-",
      totalBilled: Number(boat?.billed_total ?? boat?.billedTotal ?? 0),
      unbilled: Number(boat?.unbilled_total ?? boat?.unbilledTotal ?? 0),
      totalCollected: Number(boat?.total_paid ?? boat?.paid_total ?? boat?.totalPaid ?? 0),
      receivable: Number(boat?.balance_due ?? boat?.balanceDue ?? 0),
      status: boat?.statement_status_label || formatStatus(boat?.statement_status ?? boat?.statementStatus),
    }));

export const buildReceivablePdf = async ({
  filterType = "yearly",
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
      billed: acc.billed + row.totalBilled,
      unbilled: acc.unbilled + row.unbilled,
      collected: acc.collected + row.totalCollected,
      receivable: acc.receivable + row.receivable,
    }),
    { billed: 0, unbilled: 0, collected: 0, receivable: 0 },
  );
  const stats = reportData?.stats ?? reportData?.overviewStats ?? {};
  const totals = {
    billed: Number(stats.total_billed ?? stats.totalBilled ?? rowTotals.billed),
    unbilled: Number(stats.total_unbilled ?? stats.totalUnbilled ?? rowTotals.unbilled),
    collected: Number(stats.total_collected ?? stats.totalCollected ?? rowTotals.collected),
    receivable: Number(stats.total_receivables ?? stats.totalReceivables ?? rowTotals.receivable),
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
  composer.drawCenteredText("Receivables Report", textCenterX, rightLowerSectionCenterY - 3, {
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
    ["Prepared By", preparedBy || "Admin"],
  ];
  const secondRowItems = [
    ["Total Billed", formatPdfMoney(totals.billed)],
    ["Total Unbilled", formatPdfMoney(totals.unbilled)],
    ["Total Collected", formatPdfMoney(totals.collected)],
    ["Total Receivables", formatPdfMoney(totals.receivable)],
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

  const columns = [
    { key: "boatName", label: "Boat Name", width: 104, align: "left" },
    { key: "ownerName", label: "Boat Owner", width: 116, align: "left" },
    { key: "totalBilled", label: "Billed (PHP)", width: 72, align: "right" },
    { key: "unbilled", label: "Unbilled (PHP)", width: 75, align: "right" },
    { key: "totalCollected", label: "Collected (PHP)", width: 70, align: "right" },
    { key: "receivable", label: "Receivable (PHP)", width: 74, align: "right" },
  ];

  drawTableHeader(composer, columns);

  if (!rows.length) {
    composer.drawRect(MARGIN_X, composer.cursorY - 26, CONTENT_WIDTH, 26);
    composer.drawCenteredText("No receivables found for the selected coverage.", MARGIN_X + CONTENT_WIDTH / 2, composer.cursorY - 17, {
      fontSize: 9,
    });
    composer.cursorY -= 34;
  } else {
    rows.forEach((row) => {
      const textColumns = columns.slice(0, 2);
      const textLineCounts = textColumns.map((column) =>
        wrapText(row[column.key], composer.regularFont, 8, column.width - 12).length,
      );
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
          composer.drawWrappedText(row[column.key], x + 6, composer.cursorY - 6, column.width - 12, {
            fontSize: 8,
            lineHeight: 10,
          });
        }

        x += column.width;
      });

      composer.cursorY -= rowHeight;
    });

    const totalRowHeight = 24;
    const labelWidth = columns.slice(0, 2).reduce((sum, column) => sum + column.width, 0);
    composer.drawRect(MARGIN_X, composer.cursorY - totalRowHeight, labelWidth, totalRowHeight, {
      fillColor: COLORS.mediumGray,
    });
    composer.drawText("Total(PHP)", MARGIN_X + 8, composer.cursorY - 15, {
      fontSize: 8,
      bold: true,
    });

    let x = MARGIN_X + labelWidth;
    [
      { value: totals.billed, width: columns[2].width },
      { value: totals.unbilled, width: columns[3].width },
      { value: totals.collected, width: columns[4].width },
      { value: totals.receivable, width: columns[5].width },
    ].forEach((cell) => {
      composer.drawRect(x, composer.cursorY - totalRowHeight, cell.width, totalRowHeight, {
        fillColor: COLORS.mediumGray,
      });
      drawRightAlignedText(composer, formatPdfMoneyValue(cell.value), x, cell.width, composer.cursorY - 15, {
        fontSize: 8,
        bold: true,
      });
      x += cell.width;
    });
    composer.cursorY -= 36;
  }

  return composer.pdfDoc.save();
};
