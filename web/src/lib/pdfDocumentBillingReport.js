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
      reportTypeLabel: "Billing Monthly",
      reportDateLabel: reportDate.toLocaleDateString("en-PH", {
        month: "long",
        year: "numeric",
      }),
      reportDayLabel: "Monthly Coverage",
    };
  }

  if (filterType === "yearly") {
    return {
      reportTypeLabel: "Billing Yearly",
      reportDateLabel: String(yearlyDate || year || "-"),
      reportDayLabel: "Yearly Coverage",
    };
  }

  const parsedMonthIndex = new Date(`${month} 1, ${year}`).getMonth();
  const reportDate = new Date(Number(year), parsedMonthIndex, Number(day));

  return {
    reportTypeLabel: "Billing Daily",
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

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

const getBillDate = (row) => firstValue(row.date, row.billing_date, row.bill_date, row.date_billed, row.created_at);
const getBillReference = (row) => firstValue(row.billReferenceNo, row.bill_reference_no, row.bill_reference, row.reference_no, row.referenceNo, row.id, "-");
const getBoatName = (row) => firstValue(row.boatName, row.boat_name, row.boat?.boat_name, row.boat?.name, row.name, "-");
const getOwnerName = (row) =>
  firstValue(
    row.ownerName,
    row.owner_name,
    row.owner?.full_name,
    [row.owner?.first_name, row.owner?.last_name].filter(Boolean).join(" "),
    "-",
  );
const getTotalAmount = (row) => Number(firstValue(row.totalAmount, row.total_amount, row.amount, row.total, row.grand_total, row.balance_due, 0) || 0);
const getPaidAmount = (row) => Number(firstValue(row.paidAmount, row.paid_amount, row.amount_paid, row.total_paid, row.payments_total, 0) || 0);
const getBalanceDue = (row) => Number(firstValue(row.balanceDue, row.balance_due, row.remaining_balance, getTotalAmount(row) - getPaidAmount(row), 0) || 0);
const getStatus = (row) => firstValue(row.status, row.payment_status, getBalanceDue(row) <= 0 ? "Paid" : "Unpaid");

const sumRows = (rows, getter) =>
  (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(getter(row) || 0), 0);

export const buildBillingReportPdf = async ({
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
  const reportRows = Array.isArray(reportData.rows)
    ? reportData.rows
    : Array.isArray(reportData.bills)
      ? reportData.bills
      : Array.isArray(reportData.billing)
        ? reportData.billing
        : Array.isArray(reportData.records)
          ? reportData.records
          : [];
  const totalBillings = Number(firstValue(reportData.totalBillings, reportData.totalBilling, reportData.totalAmount, reportData.total_amount, sumRows(reportRows, getTotalAmount), 0) || 0);
  const totalPaid = Number(firstValue(reportData.totalPaid, reportData.totalPayments, reportData.total_paid, sumRows(reportRows, getPaidAmount), 0) || 0);
  const totalBalance = Number(firstValue(reportData.totalBalance, reportData.totalBalanceDue, reportData.balanceDue, reportData.balance_due, sumRows(reportRows, getBalanceDue), 0) || 0);
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

  composer.pdfDoc.setTitle("Billing Report");
  composer.pdfDoc.setSubject(`${reportTypeLabel} ${reportDateLabel}`);

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
  composer.drawCenteredText("Billing Report", textCenterX, rightLowerSectionCenterY - 3, {
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
    { key: "billReferenceNo", label: ["Billing Ref.", "No."], width: 105 },
    { key: "boatName", label: "Boat Name", width: 120 },
    { key: "date", label: "Date Issued", width: 96 },
    { key: "status", label: "Status", width: 70 },
    { key: "totalAmount", label: ["Total Charges", "(PHP)"], width: CONTENT_WIDTH - 105 - 120 - 96 - 70 },
  ];

  drawTableHeader(composer, columns);

  const rows =
    reportRows.length > 0
      ? reportRows
      : [
          {
            rowKey: "empty",
            date: "-",
            billReferenceNo: "-",
            boatName: "-",
            ownerName: "-",
            totalAmount: 0,
            paidAmount: 0,
            balanceDue: 0,
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

      if (column.key === "billReferenceNo") {
        drawFittedText(composer, getBillReference(row), x, composer.cursorY - 15, column.width);
      } else if (column.key === "boatName") {
        drawFittedText(composer, getBoatName(row), x, composer.cursorY - 15, column.width);
      } else if (column.key === "date") {
        drawFittedText(composer, formatPdfDate(getBillDate(row)), x, composer.cursorY - 15, column.width);
      } else if (column.key === "status") {
        drawFittedText(composer, getStatus(row), x, composer.cursorY - 15, column.width);
      } else if (column.key === "totalAmount") {
        drawRightAlignedText(composer, formatMoneyValue(getTotalAmount(row)), x, column.width, composer.cursorY - 15);
      } else {
        drawFittedText(composer, row[column.key], x, composer.cursorY - 15, column.width);
      }

      x += column.width;
    });

    composer.cursorY -= detailRowHeight;
  });

  return composer.pdfDoc.save();
};
