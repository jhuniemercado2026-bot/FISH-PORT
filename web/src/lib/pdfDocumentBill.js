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
const BILLING_BORDER_WIDTH = 1.5;

const hexToRgb = (hex) => {
  const normalized = String(hex || "").replace("#", "");
  if (normalized.length !== 6) return rgb(0, 0, 0);

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  return rgb(r, g, b);
};

const COLORS = {
  brand: hexToRgb("#104a78"),
  text: hexToRgb("#1a1f36"),
  muted: hexToRgb("#545e6b"),
  border: hexToRgb("#c7d1de"),
  surface: hexToRgb("#f2f7fc"),
  white: hexToRgb("#ffffff"),
  black: hexToRgb("#000000"),
  lightGray: hexToRgb("#ECECEC"),
  nearWhite: hexToRgb("#fbfbfb"),
  mediumGray: hexToRgb("#ECECEC"),
};

const sanitizeText = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatPdfMoney = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatPdfMoneyValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatBillingReference = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-6).padStart(6, "0");
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

  const drawWrappedText = (text, x, yTop, maxWidth, options = {}) => {
    const {
      fontSize = 10,
      lineHeight = fontSize + 3,
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

  const drawCenteredText = (text, centerX, y, options = {}) => {
    const {
      fontSize = 10,
      bold = false,
    } = options;
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
    const headerBorderColor = options.headerBorderColor ?? COLORS.brand;
    const headerFillColor =
      options.headerFillColor === undefined
        ? COLORS.brand
        : options.headerFillColor;
    const headerTextColor = options.headerTextColor ?? COLORS.white;
    const labelFillColor =
      options.labelFillColor === undefined
        ? COLORS.surface
        : options.labelFillColor;
    const labelTextColor = options.labelTextColor ?? COLORS.text;
    const valueTextColor = options.valueTextColor ?? COLORS.text;
    const borderColor = options.borderColor ?? COLORS.border;
    let currentTopY = topY;

    if (header) {
      drawRect(x, currentTopY - rowHeight, width, rowHeight, {
        borderColor: headerBorderColor,
        fillColor: headerFillColor,
        borderWidth: options.borderWidth ?? 1,
      });
      drawText(header, x + 8, currentTopY - 14, {
        fontSize: 10,
        bold: true,
        color: headerTextColor,
      });
      currentTopY -= rowHeight;
    }

    rows.forEach(([label, value]) => {
      drawRect(x, currentTopY - rowHeight, width, rowHeight, {
        borderColor,
        borderWidth: options.borderWidth ?? 1,
      });
      drawRect(x, currentTopY - rowHeight, leftWidth, rowHeight, {
        fillColor: labelFillColor,
        borderWidth: 0,
      });
      drawRect(x + leftWidth, currentTopY - rowHeight, 1, rowHeight, {
        borderColor,
        fillColor: borderColor,
        borderWidth: 0,
      });
      drawText(label, x + 8, currentTopY - 13, {
        fontSize: 9,
        bold: true,
        color: labelTextColor,
      });
      drawText(value, x + leftWidth + 8, currentTopY - 13, {
        fontSize: 9,
        color: valueTextColor,
      });
      currentTopY -= rowHeight;
    });

    return topY - currentTopY;
  };

  return {
    pdfDoc,
    regularFont,
    boldFont,
    addPage,
    ensureSpace,
    drawText,
    drawRect,
    drawWrappedText,
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

const drawStatementFooter = (composer, balanceText) => {
  composer.ensureSpace(70);
  composer.drawRect(
    MARGIN_X,
    composer.cursorY - 24,
    CONTENT_WIDTH,
    24,
    {
      borderColor: COLORS.brand,
      fillColor: COLORS.brand,
    },
  );
  composer.drawText(
    `Account Current Balance: ${balanceText}`,
    MARGIN_X + 10,
    composer.cursorY - 15,
    {
      fontSize: 10,
      bold: true,
      color: COLORS.white,
    },
  );
  composer.cursorY -= 36;
  composer.drawText(
    "If you have questions about this document, please contact the port office.",
    MARGIN_X,
    composer.cursorY - 9,
    {
      fontSize: 9,
      color: COLORS.muted,
    },
  );
  composer.cursorY -= 16;
  composer.drawText(
    "Thank you for your business!",
    MARGIN_X,
    composer.cursorY - 11,
    {
      fontSize: 11,
      bold: true,
    },
  );
  composer.cursorY -= 18;
};

const drawBillingStatementFooter = (composer, balanceText) => {
  composer.ensureSpace(98);
  composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    borderWidth: BILLING_BORDER_WIDTH,
  });
  drawRightAlignedCellText(
    composer,
    `Total Charges: ${balanceText}`,
    MARGIN_X,
    CONTENT_WIDTH,
    composer.cursorY - 15,
    { fontSize: 10, bold: true, color: COLORS.black },
  );
  composer.cursorY -= 35;
  composer.drawRect(MARGIN_X, composer.cursorY - 38, CONTENT_WIDTH, 38, {
    borderColor: COLORS.black,
    borderWidth: BILLING_BORDER_WIDTH,
  });
  composer.drawCenteredText(
    "If you have questions about this document, please contact the port office.",
    MARGIN_X + CONTENT_WIDTH / 2,
    composer.cursorY - 14,
    {
      fontSize: 9,
      color: COLORS.black,
    },
  );
  composer.drawCenteredText(
    "Thank you for your business!",
    MARGIN_X + CONTENT_WIDTH / 2,
    composer.cursorY - 28,
    {
      fontSize: 11,
      bold: true,
      color: COLORS.black,
    },
  );
  composer.cursorY -= 38;
};

const drawTableHeader = (composer, columns, fontSize = 9, options = {}) => {
  const borderColor = options.borderColor ?? COLORS.brand;
  const fillColor =
    options.fillColor === undefined ? COLORS.brand : options.fillColor;
  const textColor = options.textColor ?? COLORS.white;
  const headerHeight = 22;
  let x = MARGIN_X;

  composer.drawRect(MARGIN_X, composer.cursorY - headerHeight, CONTENT_WIDTH, headerHeight, {
    borderColor,
    fillColor,
    borderWidth: options.borderWidth ?? BILLING_BORDER_WIDTH,
  });

  columns.forEach((column, index) => {
    if (index > 0) {
      composer.drawRect(x, composer.cursorY - headerHeight, 1, headerHeight, {
        borderColor,
        fillColor: borderColor,
        borderWidth: 0,
      });
    }

    if (column.align === "right") {
      drawRightAlignedCellText(
        composer,
        column.label,
        x,
        column.width,
        composer.cursorY - 14,
        { fontSize, bold: true, color: textColor },
      );
    } else {
      composer.drawText(column.label, x + 6, composer.cursorY - 14, {
        fontSize,
        bold: true,
        color: textColor,
      });
    }
    x += column.width;
  });
  composer.cursorY -= headerHeight;
};

const drawRightAlignedCellText = (
  composer,
  value,
  x,
  columnWidth,
  y,
  options = {},
) => {
  const fontSize = options.fontSize ?? 9;
  const bold = options.bold ?? false;
  const font = bold ? composer.boldFont : composer.regularFont;
  const text = sanitizeText(value) || "-";
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const safeX = Math.max(x + 6, x + columnWidth - textWidth - 6);
  composer.drawText(text, safeX, y, {
    ...options,
    fontSize,
    bold,
  });
};

export const buildBillingStatementPdf = async ({
  bill,
  chargeItems,
  billPeriod,
  statusLabel,
}) => {
  const composer = await createPdfComposer();
  const centerX = MARGIN_X + CONTENT_WIDTH / 2;
  const headerImageBytes = await getHeaderPngBytes();
  const headerImage = headerImageBytes
    ? await composer.pdfDoc.embedPng(headerImageBytes)
    : null;
  const billingReference = formatBillingReference(bill?.bill_reference_no) || "-";

  if (billingReference !== "-") {
    composer.pdfDoc.setTitle(billingReference);
    composer.pdfDoc.setSubject(`Billing Statement ${billingReference}`);
  }

  const totalCharges = Number(bill?.total_amount || 0);
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
    borderWidth: BILLING_BORDER_WIDTH,
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
  composer.drawCenteredText("Billing Statement", textCenterX, rightLowerSectionCenterY - 3, {
    fontSize: 12,
    bold: true,
    color: COLORS.black,
  });

  composer.cursorY = headerCardBottom - 18;

  const boxTop = composer.cursorY;
  const detailsRowHeight = 28;
  const detailsContainerHeight = detailsRowHeight * 2;
  const firstRowItems = [
    ["Billing Ref. No.", billingReference],
    ["Date Issued", formatPdfDate(bill?.created_at)],
    ["Status", statusLabel || "-"],
  ];
  const secondRowItems = [
    ["Bill To", bill?.boat?.owner?.full_name || bill?.payer_name || "-"],
    ["Boat", bill?.boat_name || bill?.boat?.boat_name || "-"],
    ["Boat Type", bill?.boat?.boat_type?.type_name || bill?.boat?.boatType?.type_name || "-"],
    ["Total Charges", formatPdfMoney(totalCharges)],
  ];
  const firstRowWidth = CONTENT_WIDTH / firstRowItems.length;
  const secondRowWidth = CONTENT_WIDTH / secondRowItems.length;
  const firstRowBottom = boxTop - detailsRowHeight;
  const secondRowBottom = firstRowBottom - detailsRowHeight;

  composer.drawRect(MARGIN_X, boxTop - detailsContainerHeight, CONTENT_WIDTH, detailsContainerHeight, {
    borderColor: COLORS.black,
    borderWidth: BILLING_BORDER_WIDTH,
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
    { key: "date", label: "Date", width: 82, align: "left" },
    { key: "type", label: "Type", width: 70, align: "left" },
    { key: "description", label: "Description", width: 247, align: "left" },
    { key: "amount", label: "Amount (PHP)", width: 95, align: "right" },
  ];
  columns[3].label = "Charges (PHP)";
  columns[3].width = 112;

  drawTableHeader(composer, columns, 9, {
    borderWidth: BILLING_BORDER_WIDTH,
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    textColor: COLORS.black,
  });

  if (!chargeItems.length) {
    composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
      borderColor: COLORS.black,
      borderWidth: 1,
    });
    composer.drawText(
      "No charges found for this billing record.",
      MARGIN_X + 8,
      composer.cursorY - 15,
      {
        fontSize: 9,
        color: COLORS.black,
      },
    );
    composer.cursorY -= 32;
  } else {
    chargeItems.forEach((charge) => {
      const descriptionLines = wrapText(
        charge.description,
        composer.regularFont,
        9,
        248,
      );
      const rowHeightDynamic = Math.max(24, descriptionLines.length * 11 + 10);

      if (composer.cursorY - rowHeightDynamic < MARGIN_Y + 40) {
        composer.addPage();
        drawTableHeader(composer, columns, 9, {
          borderWidth: BILLING_BORDER_WIDTH,
          borderColor: COLORS.black,
          fillColor: COLORS.mediumGray,
          textColor: COLORS.black,
        });
      }

      let x = MARGIN_X;
      composer.drawRect(MARGIN_X, composer.cursorY - rowHeightDynamic, CONTENT_WIDTH, rowHeightDynamic, {
        borderColor: COLORS.black,
        borderWidth: BILLING_BORDER_WIDTH,
      });

      columns.forEach((column) => {
        if (x > MARGIN_X) {
          composer.drawRect(x, composer.cursorY - rowHeightDynamic, 1, rowHeightDynamic, {
            borderColor: COLORS.black,
            fillColor: COLORS.black,
            borderWidth: 0,
          });
        }

        if (column.key === "description") {
          const descriptionHeight = descriptionLines.length * 11;
          const descriptionTop =
            composer.cursorY - (rowHeightDynamic - descriptionHeight) / 2 + 2;
          composer.drawWrappedText(
            charge.description,
            x + 6,
            descriptionTop,
            column.width - 12,
            {
              fontSize: 9,
              lineHeight: 11,
              color: COLORS.black,
            },
          );
        } else {
          const textValue =
            column.key === "date"
              ? formatPdfDate(charge.date)
              : column.key === "type"
                ? charge.type
                : formatPdfMoneyValue(charge.amount);

          if (column.align === "right") {
            drawRightAlignedCellText(
              composer,
              textValue,
              x,
              column.width,
              composer.cursorY - rowHeightDynamic / 2 - 1,
              { color: COLORS.black },
            );
          } else {
            composer.drawText(textValue, x + 6, composer.cursorY - rowHeightDynamic / 2 - 1, {
              fontSize: 9,
              color: COLORS.black,
            });
          }
        }

        x += column.width;
      });

      composer.cursorY -= rowHeightDynamic;
    });

    composer.ensureSpace(34);
    composer.drawRect(MARGIN_X, composer.cursorY - 22, CONTENT_WIDTH, 22, {
      borderColor: COLORS.black,
      borderWidth: BILLING_BORDER_WIDTH,
      fillColor: COLORS.mediumGray,
    });
    composer.drawRect(MARGIN_X + CONTENT_WIDTH - 112, composer.cursorY - 22, 1, 22, {
      borderColor: COLORS.black,
      fillColor: COLORS.black,
      borderWidth: 0,
    });
    composer.drawText("Total", MARGIN_X + 8, composer.cursorY - 14, {
      fontSize: 9,
      bold: true,
      color: COLORS.black,
    });
    drawRightAlignedCellText(
      composer,
      formatPdfMoney(bill?.total_amount || 0),
      MARGIN_X + CONTENT_WIDTH - 112,
      112,
      composer.cursorY - 14,
      { fontSize: 9, bold: true, color: COLORS.black },
    );
    composer.cursorY -= 34;
  }

  drawBillingStatementFooter(composer, formatPdfMoney(bill?.total_amount || 0));
  return composer.pdfDoc.save();
};

export const buildStatementOfAccountPdf = async ({
  record,
  transactions,
  periodLabel,
}) => {
  const composer = await createPdfComposer();
  const centerX = MARGIN_X + CONTENT_WIDTH / 2;

  composer.drawCenteredText("MUNICIPALITY OF OPOL", centerX, composer.cursorY - 18, {
    fontSize: 18,
    bold: true,
    color: COLORS.black,
  });
  composer.cursorY -= 18;
  composer.drawCenteredText(
    "MUNICIPAL ECONOMIC ENTERPRISE OFFICE",
    centerX,
    composer.cursorY - 11,
    {
      fontSize: 11,
      color: COLORS.black,
    },
  );
  composer.cursorY -= 11;
  composer.drawCenteredText("OPOL FISH PORT", centerX, composer.cursorY - 11, {
    fontSize: 11,
    color: COLORS.black,
  });
  composer.cursorY -= 25;
  composer.drawCenteredText("Statement of Account", centerX, composer.cursorY - 24, {
    fontSize: 22,
    bold: true,
    color: COLORS.black,
  });
  composer.cursorY -= 47;

  const boxTop = composer.cursorY;
  const leftWidth = CONTENT_WIDTH * 0.48;
  const rightWidth = CONTENT_WIDTH - leftWidth - 16;
  const rowHeight = 20;

  const leftHeight = composer.drawKeyValueTable(
    [
      ["Name", record?.owner_name || "-"],
      ["Boat", record?.boat_name || "-"],
      ["Boat Type", record?.boat_type || "-"],
    ],
    MARGIN_X,
    boxTop,
    leftWidth,
    {
      header: "Bill To",
      rowHeight,
      borderWidth: BILLING_BORDER_WIDTH,
      borderColor: COLORS.black,
      headerBorderColor: COLORS.black,
      headerFillColor: COLORS.mediumGray,
      headerTextColor: COLORS.black,
      labelFillColor: COLORS.white,
      labelTextColor: COLORS.black,
      valueTextColor: COLORS.black,
    },
  );

  const rightHeight = composer.drawKeyValueTable(
    [
      ["Date", formatPdfDate(new Date().toISOString())],
      ["Statement Ref #", String(record?.boat_key ?? record?.boat_name ?? "-").slice(-6) || "-"],
      ["Boat", record?.boat_name || "-"],
      ["Period", periodLabel || "-"],
      ["Status", record?.statement_status_label || "-"],
    ],
    MARGIN_X + leftWidth + 16,
    boxTop,
    rightWidth,
    {
      rowHeight,
      borderWidth: BILLING_BORDER_WIDTH,
      borderColor: COLORS.black,
      labelFillColor: COLORS.white,
      labelTextColor: COLORS.black,
      valueTextColor: COLORS.black,
    },
  );

  composer.cursorY = boxTop - Math.max(leftHeight, rightHeight) - 18;

  const summaryTop = composer.cursorY;
  const summaryHeight = composer.drawKeyValueTable(
    [
      ["Previous Balance", formatPdfMoney(0)],
      ["Credits", formatPdfMoney(record?.total_paid || 0)],
      ["New Charges", formatPdfMoney(record?.total_billed || 0)],
      ["Total Balance Due", formatPdfMoney(record?.balance_due || 0)],
    ],
    MARGIN_X + leftWidth + 16,
    summaryTop,
    rightWidth,
    {
      header: "Account Summary",
      rowHeight,
      borderWidth: BILLING_BORDER_WIDTH,
      borderColor: COLORS.black,
      headerBorderColor: COLORS.black,
      headerFillColor: COLORS.mediumGray,
      headerTextColor: COLORS.black,
      labelFillColor: COLORS.white,
      labelTextColor: COLORS.black,
      valueTextColor: COLORS.black,
    },
  );

  composer.cursorY = summaryTop - summaryHeight - 18;

  const columns = [
    { key: "date", label: "Date", width: 72, align: "left" },
    { key: "type", label: "Type", width: 60, align: "left" },
    { key: "description", label: "Description", width: 165, align: "left" },
    { key: "amount", label: "Charges (PHP)", width: 95, align: "right" },
    { key: "running_balance", label: "Line Total", width: 103, align: "right" },
  ];

  drawTableHeader(composer, columns, 8, {
    borderWidth: BILLING_BORDER_WIDTH,
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    textColor: COLORS.black,
  });

  if (!transactions.length) {
    composer.drawRect(MARGIN_X, composer.cursorY - 24, CONTENT_WIDTH, 24, {
      borderColor: COLORS.black,
      borderWidth: BILLING_BORDER_WIDTH,
    });
    composer.drawText(
      "No billing or payment transactions found for this boat.",
      MARGIN_X + 8,
      composer.cursorY - 15,
      {
        fontSize: 9,
        color: COLORS.black,
      },
    );
    composer.cursorY -= 32;
  } else {
    transactions.forEach((transaction) => {
      const descriptionColumn = columns.find((column) => column.key === "description");
      const descriptionWidth = Math.max(
        40,
        (descriptionColumn?.width ?? 169) - 12,
      );
      const descriptionLines = wrapText(
        transaction.description,
        composer.regularFont,
        8,
        descriptionWidth,
      );
      const rowHeightDynamic = Math.max(24, descriptionLines.length * 10 + 10);

      if (composer.cursorY - rowHeightDynamic < MARGIN_Y + 40) {
        composer.addPage();
        drawTableHeader(composer, columns, 8, {
          borderWidth: BILLING_BORDER_WIDTH,
          borderColor: COLORS.black,
          fillColor: COLORS.mediumGray,
          textColor: COLORS.black,
        });
      }

      let x = MARGIN_X;
      columns.forEach((column) => {
        composer.drawRect(x, composer.cursorY - rowHeightDynamic, column.width, rowHeightDynamic, {
          borderColor: COLORS.black,
          borderWidth: BILLING_BORDER_WIDTH,
        });

        if (column.key === "description") {
          const descriptionHeight = descriptionLines.length * 10;
          const descriptionTop =
            composer.cursorY - (rowHeightDynamic - descriptionHeight) / 2 + 2;
          composer.drawWrappedText(
            transaction.description,
            x + 6,
            descriptionTop,
            column.width - 12,
            {
              fontSize: 8,
              lineHeight: 10,
              color: COLORS.black,
            },
          );
        } else {
          let textValue = "-";
          if (column.key === "date") textValue = formatPdfDate(transaction.date);
          if (column.key === "type") textValue = transaction.type;
          if (column.key === "amount") {
            textValue =
              transaction.charge > 0
                ? formatPdfMoneyValue(transaction.charge)
                : transaction.payment > 0
                  ? formatPdfAccountingValue(-transaction.payment)
                  : "-";
          }
          if (column.key === "running_balance") {
            textValue = formatPdfAccountingValue(transaction.running_balance);
          }

          if (column.align === "right") {
            drawRightAlignedCellText(
              composer,
              textValue,
              x,
              column.width,
              composer.cursorY - rowHeightDynamic / 2 - 1,
              { fontSize: 8, color: COLORS.black },
            );
          } else {
            composer.drawText(textValue, x + 6, composer.cursorY - rowHeightDynamic / 2 - 1, {
              fontSize: 8,
              color: COLORS.black,
            });
          }
        }

        x += column.width;
      });

      composer.cursorY -= rowHeightDynamic;
    });

    const amountColumnWidth = columns[columns.length - 2].width;
    const totalColumnWidth = columns[columns.length - 1].width;
    composer.drawRect(MARGIN_X, composer.cursorY - 22, CONTENT_WIDTH - amountColumnWidth - totalColumnWidth, 22, {
      borderColor: COLORS.black,
      borderWidth: BILLING_BORDER_WIDTH,
    });
    composer.drawRect(
      MARGIN_X + CONTENT_WIDTH - amountColumnWidth - totalColumnWidth,
      composer.cursorY - 22,
      amountColumnWidth,
      22,
      { borderColor: COLORS.black, borderWidth: BILLING_BORDER_WIDTH },
    );
    composer.drawRect(
      MARGIN_X + CONTENT_WIDTH - totalColumnWidth,
      composer.cursorY - 22,
      totalColumnWidth,
      22,
      { borderColor: COLORS.black, borderWidth: BILLING_BORDER_WIDTH },
    );
    composer.drawText("Total", MARGIN_X + 8, composer.cursorY - 14, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
    });
    drawRightAlignedCellText(
      composer,
      formatPdfAccountingValue(
        Number(record?.total_billed || 0) - Number(record?.total_paid || 0),
      ),
      MARGIN_X + CONTENT_WIDTH - amountColumnWidth - totalColumnWidth,
      amountColumnWidth,
      composer.cursorY - 14,
      { fontSize: 8, bold: true, color: COLORS.black },
    );
    drawRightAlignedCellText(
      composer,
      formatPdfMoney(record?.balance_due || 0),
      MARGIN_X + CONTENT_WIDTH - totalColumnWidth,
      totalColumnWidth,
      composer.cursorY - 14,
      { fontSize: 8, bold: true, color: COLORS.black },
    );
    composer.cursorY -= 34;
  }

  drawBillingStatementFooter(composer, formatPdfMoney(record?.balance_due || 0));
  return composer.pdfDoc.save();
};
