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

    composer.drawText(column.label, x + 6, composer.cursorY - 14, {
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
      reportTypeLabel: "Monthly",
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
      reportTypeLabel: "Yearly",
      coverageKey: String(yearlyDate || year || ""),
      reportDateLabel: String(yearlyDate || year || "-"),
      reportDayLabel: "Yearly Coverage",
    };
  }

  const parsedMonthIndex = new Date(`${month} 1, ${year}`).getMonth();
  const reportDate = new Date(Number(year), parsedMonthIndex, Number(day));

  return {
    reportTypeLabel: "Daily",
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
  const safeX = Math.max(x + 6, x + columnWidth - textWidth - 6);

  composer.drawText(text, safeX, y, {
    fontSize,
    bold,
    color: options.color ?? COLORS.black,
  });
};

const getFeeTypeName = (fee) =>
  String(
    fee?.fee_type_name ||
      fee?.fee_type?.fee_name ||
      fee?.feeType?.fee_name ||
      fee?.fee_name ||
      "",
  ).toLowerCase();

const getVehicleSpecificFees = (fees, vehicleTypeId) =>
  fees.filter(
    (fee) => String(fee?.vehicle_type_id ?? "") === String(vehicleTypeId ?? ""),
  );

const getFeeByType = (fees, feeTypeName) =>
  fees.find((fee) => getFeeTypeName(fee) === feeTypeName) ?? null;

const toMoneyCents = (value) => Math.round(Number(value || 0) * 100);

const fromMoneyCents = (value) => value / 100;

const getDailyTicketBreakdown = (ticket, fees) => {
  const savedDailyFee = Number(ticket?.daily_fee || 0);
  const savedBanyeraFee = Number(ticket?.banyera_fee || 0);
  if (savedDailyFee > 0 || savedBanyeraFee > 0) {
    const ticketFee = savedDailyFee + savedBanyeraFee;

    return {
      dailyFee: savedDailyFee,
      banyeraFee: savedBanyeraFee,
      ticketFee: ticketFee || Number(ticket?.ticket_fee || 0),
    };
  }

  const vehicleFees = getVehicleSpecificFees(fees, ticket?.vehicle_type_id);
  const savedFee = fees.find(
    (fee) => String(fee?.fee_id ?? "") === String(ticket?.fee_id ?? ""),
  );
  const configuredDailyFee = getFeeByType(vehicleFees, "vehicle ticket daily");
  const configuredBanyeraFee = getFeeByType(vehicleFees, "banyera");
  const savedTotal = Number(ticket?.ticket_fee || 0);

  if (savedFee) {
    const savedFeeAmount = Number(savedFee?.amount || 0);
    const savedFeeType = getFeeTypeName(savedFee);
    const savedIsBanyera = savedFeeType === "banyera";
    const normalizedTotal = savedTotal > 0 ? savedTotal : savedFeeAmount;
    const totalCents = toMoneyCents(normalizedTotal);
    const savedFeeCents = toMoneyCents(savedFeeAmount);
    const dailyFeeCents = toMoneyCents(configuredDailyFee?.amount || 0);
    const banyeraFeeCents = toMoneyCents(configuredBanyeraFee?.amount || 0);

    if (!savedIsBanyera && savedFeeCents > 0) {
      if (totalCents % savedFeeCents === 0) {
        return {
          dailyFee: normalizedTotal,
          banyeraFee: 0,
          ticketFee: normalizedTotal,
        };
      }

      const possibleDailyCents = totalCents - banyeraFeeCents;
      if (banyeraFeeCents > 0 && possibleDailyCents > 0 && possibleDailyCents % savedFeeCents === 0) {
        return {
          dailyFee: fromMoneyCents(possibleDailyCents),
          banyeraFee: fromMoneyCents(banyeraFeeCents),
          ticketFee: normalizedTotal,
        };
      }
    }

    if (savedIsBanyera && savedFeeCents > 0) {
      if (totalCents % savedFeeCents === 0) {
        return {
          dailyFee: 0,
          banyeraFee: normalizedTotal,
          ticketFee: normalizedTotal,
        };
      }

      const possibleBanyeraCents = savedFeeCents;
      const possibleDailyCents = totalCents - possibleBanyeraCents;
      if (dailyFeeCents > 0 && possibleDailyCents > 0 && possibleDailyCents % dailyFeeCents === 0) {
        return {
          dailyFee: fromMoneyCents(possibleDailyCents),
          banyeraFee: fromMoneyCents(possibleBanyeraCents),
          ticketFee: normalizedTotal,
        };
      }
    }

    const dailyFee = savedIsBanyera ? 0 : normalizedTotal;
    const banyeraFee = savedIsBanyera ? normalizedTotal : 0;

    return {
      dailyFee,
      banyeraFee,
      ticketFee: normalizedTotal,
    };
  }

  const dailyFee = Number(configuredDailyFee?.amount || 0);
  const banyeraFee = Number(configuredBanyeraFee?.amount || 0);

  return {
    dailyFee,
    banyeraFee,
    ticketFee: dailyFee + banyeraFee,
  };
};

const getTicketQuantityFromFeeTotal = (totalFee, unitFee) => {
  const totalCents = toMoneyCents(totalFee);
  const unitCents = toMoneyCents(unitFee);

  if (totalCents <= 0) return 0;
  if (unitCents <= 0) return 1;

  return Math.max(1, Math.round(totalCents / unitCents));
};

const getDailyTicketCount = (ticket, fees) => {
  const vehicleFees = getVehicleSpecificFees(fees, ticket?.vehicle_type_id);
  const dailyFee = getFeeByType(vehicleFees, "vehicle ticket daily");
  const banyeraFee = getFeeByType(vehicleFees, "banyera");
  const feeBreakdown = getDailyTicketBreakdown(ticket, fees);

  return (
    getTicketQuantityFromFeeTotal(feeBreakdown.dailyFee, dailyFee?.amount) +
    getTicketQuantityFromFeeTotal(feeBreakdown.banyeraFee, banyeraFee?.amount)
  );
};

const getVehicleDailyRows = (reportData, filterType, coverageKey) => {
  const tickets = Array.isArray(reportData?.tickets)
    ? reportData.tickets
    : Array.isArray(reportData)
      ? reportData
      : [];
  const fees = Array.isArray(reportData?.fees) ? reportData.fees : [];
  return tickets
    .filter((ticket) => {
      const ticketType = String(ticket?.ticket_type || "").toLowerCase();
      const ticketDate = String(
        ticket?.ticket_date || ticket?.issued_at || ticket?.created_at || "",
      );
      const isVoided =
        Boolean(ticket?.is_voided || ticket?.voided_at) ||
        String(ticket?.status || "").toLowerCase() === "voided";

      if (ticketType !== "daily" || isVoided) return false;
      if (filterType === "monthly") return ticketDate.slice(0, 7) === coverageKey;
      if (filterType === "yearly") return ticketDate.slice(0, 4) === coverageKey;
      return ticketDate.slice(0, 10) === coverageKey;
    })
    .sort((left, right) =>
      String(left?.ticket_date || left?.created_at || "").localeCompare(
        String(right?.ticket_date || right?.created_at || ""),
      ),
    )
    .map((ticket, index) => {
      const { dailyFee, banyeraFee, ticketFee } = getDailyTicketBreakdown(ticket, fees);

      return {
        rowKey: String(ticket?.ticket_id ?? index),
        date: formatDateLabel(ticket?.ticket_date || ticket?.issued_at || ticket?.created_at || ""),
        vehicleType:
          ticket?.vehicle_type?.type_name ||
          ticket?.vehicleType?.type_name ||
          "-",
        dailyFee,
        banyeraFee,
        ticketFee,
        ticketCount: getDailyTicketCount(ticket, fees),
      };
    });
};

export const buildVehicleDailyPdf = async ({
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
  const rows = getVehicleDailyRows(reportData, filterType, coverageKey);
  const totalVehicleEntries = rows.reduce((sum, row) => sum + Number(row.ticketCount || 0), 0);
  const totalTicketFee = rows.reduce((sum, row) => sum + Number(row.ticketFee || 0), 0);

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
  composer.drawCenteredText("Vehicle Ticket Report", textCenterX, rightLowerSectionCenterY - 3, {
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
    ["Todays Total Ticket", String(totalVehicleEntries)],
    ["Total Ticket Fee", formatMoney(totalTicketFee)],
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

  let columns = [
    { key: "date", label: "Date", width: 72 },
    { key: "vehicleType", label: "Vehicle Type", width: 154 },
    { key: "dailyFee", label: "Daily Fee (PHP)", width: 95 },
    { key: "banyeraFee", label: "Banyera Fee (PHP)", width: 95 },
    { key: "ticketFee", label: "Ticket Fee (PHP)", width: 95 },
  ];

  // For Daily report type, omit the Date column and start with Vehicle Type
  if (String(reportTypeLabel).toLowerCase() === "daily") {
    const vehicleTypeWidth = 154 + 72; // absorb date column width
    columns = [
      { key: "vehicleType", label: "Vehicle Type", width: vehicleTypeWidth },
      { key: "dailyFee", label: "Daily Fee (PHP)", width: 95 },
      { key: "banyeraFee", label: "Banyera Fee (PHP)", width: 95 },
      { key: "ticketFee", label: "Ticket Fee (PHP)", width: 95 },
    ];
  }

  drawTableHeader(composer, columns);

  const displayRows =
    rows.length > 0
      ? rows
      : (String(reportTypeLabel).toLowerCase() === "daily"
          ? [
              {
                rowKey: "empty",
                vehicleType: "-",
                dailyFee: 0,
                banyeraFee: 0,
                ticketFee: 0,
              },
            ]
          : [
              {
                rowKey: "empty",
                date: "-",
                vehicleType: "-",
                dailyFee: 0,
                banyeraFee: 0,
                ticketFee: 0,
              },
            ]);

  const detailRowHeight = 24;
  displayRows.forEach((row) => {
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

      if (["dailyFee", "banyeraFee", "ticketFee"].includes(column.key)) {
        drawRightAlignedText(
          composer,
          formatMoneyValue(row[column.key]),
          x,
          column.width,
          composer.cursorY - 15,
        );
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

  composer.cursorY -= 12;

  composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BORDER_WIDTH,
  });
  drawRightAlignedText(
    composer,
    `Total Ticket Fee: ${formatMoney(totalTicketFee)}`,
    MARGIN_X,
    CONTENT_WIDTH,
    composer.cursorY - 15,
    { fontSize: 10, bold: true },
  );

  return composer.pdfDoc.save();
};
