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
const BILLING_BORDER_WIDTH = 0.5;

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
      drawRect(x, currentTopY - rowHeight, leftWidth, rowHeight, {
        borderColor,
        fillColor: labelFillColor,
        borderWidth: options.borderWidth ?? 1,
      });
      drawRect(x + leftWidth, currentTopY - rowHeight, width - leftWidth, rowHeight, {
        borderColor,
        borderWidth: options.borderWidth ?? 1,
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
  const footerHeight = 72;
  const balanceRowHeight = 24;
  const footerGap = 10;
  const textBlockHeight = footerHeight - balanceRowHeight - footerGap;
  const balanceRowBottom = composer.cursorY - balanceRowHeight;
  const textBlockTop = balanceRowBottom - footerGap;
  const textBlockBottom = textBlockTop - textBlockHeight;
  const textBlockCenterY = textBlockTop - textBlockHeight / 2;
  const footerTextTopY = textBlockCenterY + 4;
  const footerTextBottomY = textBlockCenterY - 10;

  composer.ensureSpace(footerHeight);
  composer.drawRect(MARGIN_X, balanceRowBottom, CONTENT_WIDTH, balanceRowHeight, {
    borderColor: COLORS.black,
    borderWidth: 1.5,
    fillColor: COLORS.mediumGray,
  });
  composer.drawRect(MARGIN_X, textBlockBottom, CONTENT_WIDTH, textBlockHeight, {
    borderColor: COLORS.black,
    borderWidth: 1.5,
  });
  drawRightAlignedCellText(
    composer,
    `Account Current Balance: ${balanceText}`,
    MARGIN_X,
    CONTENT_WIDTH,
    composer.cursorY - 15,
    { fontSize: 10, bold: true, color: COLORS.black },
  );
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

const drawTableHeader = (composer, columns, fontSize = 9, options = {}) => {
  const borderColor = options.borderColor ?? COLORS.brand;
  const fillColor =
    options.fillColor === undefined ? COLORS.brand : options.fillColor;
  const textColor = options.textColor ?? COLORS.white;
  const borderWidth = options.borderWidth ?? 1;
  let x = MARGIN_X;
  columns.forEach((column) => {
    composer.drawRect(x, composer.cursorY - 22, column.width, 22, {
      borderColor,
      fillColor,
      borderWidth,
    });
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
  composer.cursorY -= 22;
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
  composer.drawCenteredText("Billing Statement", centerX, composer.cursorY - 24, {
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
      ["Name", bill?.boat?.owner?.full_name || bill?.payer_name || "-"],
      ["Boat", bill?.boat_name || bill?.boat?.boat_name || "-"],
      [
        "Boat Type",
        bill?.boat?.boat_type?.type_name ||
          bill?.boat?.boatType?.type_name ||
          "-",
      ],
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
      ["Date", formatPdfDate(bill?.created_at)],
      [
        "Billing Ref #",
        String(bill?.bill_reference_no ?? "").slice(-6) || "-",
      ],
      ["Boat", bill?.boat_name || bill?.boat?.boat_name || "-"],
      ["Period", billPeriod || "-"],
      ["Status", statusLabel || "-"],
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

  const columns = [
    { key: "date", label: "Date", width: 72, align: "left" },
    { key: "type", label: "Type", width: 60, align: "left" },
    { key: "description", label: "Description", width: 169, align: "left" },
    { key: "amount", label: "Amount (PHP)", width: 95, align: "right" },
    { key: "running_balance", label: "Line Total (PHP)", width: 103, align: "right" },
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  drawTableHeader(composer, columns, 8, {
    borderWidth: BILLING_BORDER_WIDTH,
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    textColor: COLORS.black,
  });

  if (!chargeItems.length) {
    composer.drawRect(MARGIN_X, composer.cursorY - 24, tableWidth, 24, {
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
      columns.forEach((column) => {
        composer.drawRect(x, composer.cursorY - rowHeightDynamic, column.width, rowHeightDynamic, {
          borderColor: COLORS.black,
          borderWidth: BILLING_BORDER_WIDTH,
        });

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

    const amountColumnWidth = columns[columns.length - 1].width;
    composer.drawRect(MARGIN_X, composer.cursorY - 22, CONTENT_WIDTH - amountColumnWidth, 22, {
      borderColor: COLORS.black,
      borderWidth: BILLING_BORDER_WIDTH,
    });
    composer.drawRect(
      MARGIN_X + CONTENT_WIDTH - amountColumnWidth,
      composer.cursorY - 22,
      amountColumnWidth,
      22,
      { borderColor: COLORS.black, borderWidth: BILLING_BORDER_WIDTH },
    );
    composer.drawText(
      "Total Charges",
      MARGIN_X + CONTENT_WIDTH - amountColumnWidth - 84,
      composer.cursorY - 14,
      {
        fontSize: 9,
        bold: true,
        color: COLORS.black,
      },
    );
    drawRightAlignedCellText(
      composer,
      formatPdfMoney(bill?.total_amount || 0),
      MARGIN_X + CONTENT_WIDTH - amountColumnWidth,
      amountColumnWidth,
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
  const headerImageBytes = await getHeaderPngBytes();
  const headerImage = headerImageBytes
    ? await composer.pdfDoc.embedPng(headerImageBytes)
    : null;
  const soaBorderWidth = 1.5;
  const statementReference = String(record?.boat_key ?? record?.boat_name ?? "").slice(-6) || "-";
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
    borderWidth: soaBorderWidth,
  });
  composer.drawRect(headerSplitX, headerCardBottom, soaBorderWidth, headerCardHeight, {
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
  composer.drawRect(headerSplitX, rightDividerY, headerRightWidth, soaBorderWidth, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });
  composer.drawCenteredText("Statement of Account", textCenterX, rightLowerSectionCenterY - 3, {
    fontSize: 12,
    bold: true,
    color: COLORS.black,
  });

  composer.cursorY = headerCardBottom - 18;

  const boxTop = composer.cursorY;
  const leftRowHeight = 28;
  const leftColWidth = CONTENT_WIDTH / 3;
  const leftBottom = boxTop - leftRowHeight;

  const leftItems = [
    ["Name", record?.owner_name || "-"],
    ["Boat", record?.boat_name || "-"],
    ["Boat Type", record?.boat_type || "-"],
  ];

  composer.drawRect(MARGIN_X, leftBottom, CONTENT_WIDTH, leftRowHeight, {
    borderColor: COLORS.black,
    borderWidth: soaBorderWidth,
  });

  leftItems.forEach(([label, value], index) => {
    const cellX = MARGIN_X + leftColWidth * index;
    const cellCenterX = cellX + leftColWidth / 2;

    if (index > 0) {
      composer.drawRect(cellX, leftBottom, soaBorderWidth, leftRowHeight, {
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

  const accountTop = leftBottom - 18;
  const accountHeaderHeight = 0;
  const accountRowHeight = 28;
  const accountTotalHeight = accountHeaderHeight + accountRowHeight * 2;
  const accountHeaderBottom = accountTop - accountHeaderHeight;
  const accountFirstRowBottom = accountHeaderBottom - accountRowHeight;
  const accountSecondRowBottom = accountFirstRowBottom - accountRowHeight;
  const accountFirstRowItems = [
    ["Date Issued", formatPdfDate(new Date().toISOString())],
    ["Period", periodLabel || "-"],
    ["Status", record?.statement_status_label || "-"],
  ];
  const accountSecondRowItems = [
    ["Previous Balance", formatPdfMoney(0)],
    ["Credits", formatPdfMoney(record?.total_paid || 0)],
    ["New Charges", formatPdfMoney(record?.total_billed || 0)],
    ["Total Balance Due", formatPdfMoney(record?.balance_due || 0)],
  ];
  const accountFirstColWidth = CONTENT_WIDTH / accountFirstRowItems.length;
  const accountSecondColWidth = CONTENT_WIDTH / accountSecondRowItems.length;

  composer.drawRect(MARGIN_X, accountTop - accountTotalHeight, CONTENT_WIDTH, accountTotalHeight, {
    borderColor: COLORS.black,
    borderWidth: soaBorderWidth,
  });
  composer.drawRect(MARGIN_X, accountFirstRowBottom, CONTENT_WIDTH, soaBorderWidth, {
    borderColor: COLORS.black,
    fillColor: COLORS.black,
    borderWidth: 0,
  });

  accountFirstRowItems.forEach(([label, value], index) => {
    const cellX = MARGIN_X + accountFirstColWidth * index;
    const cellCenterX = cellX + accountFirstColWidth / 2;

    if (index > 0) {
      composer.drawRect(cellX, accountFirstRowBottom, soaBorderWidth, accountRowHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.black,
        borderWidth: 0,
      });
    }

    composer.drawText(`${label}:`, cellX + 6, accountHeaderBottom - 10, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
    });
    composer.drawCenteredText(String(value || "-"), cellCenterX, accountHeaderBottom - 21, {
      fontSize: 8,
      color: COLORS.black,
    });
  });

  accountSecondRowItems.forEach(([label, value], index) => {
    const cellX = MARGIN_X + accountSecondColWidth * index;
    const cellCenterX = cellX + accountSecondColWidth / 2;

    if (index > 0) {
      composer.drawRect(cellX, accountSecondRowBottom, soaBorderWidth, accountRowHeight, {
        borderColor: COLORS.black,
        fillColor: COLORS.black,
        borderWidth: 0,
      });
    }

    composer.drawText(`${label}:`, cellX + 6, accountFirstRowBottom - 10, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
    });
    composer.drawCenteredText(String(value || "-"), cellCenterX, accountFirstRowBottom - 21, {
      fontSize: 8,
      color: COLORS.black,
    });
  });

  composer.cursorY = accountTop - accountTotalHeight - 18;

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

  drawTableHeader(composer, columns, 8, {
    borderWidth: soaBorderWidth,
    borderColor: COLORS.black,
    fillColor: COLORS.mediumGray,
    textColor: COLORS.black,
  });

  if (!transactions.length) {
    composer.drawRect(MARGIN_X, composer.cursorY - 24, tableWidth, 24, {
      borderColor: COLORS.black,
      borderWidth: soaBorderWidth,
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
          borderWidth: soaBorderWidth,
          borderColor: COLORS.black,
          fillColor: COLORS.mediumGray,
          textColor: COLORS.black,
        });
      }

      let x = MARGIN_X;
      columns.forEach((column) => {
        composer.drawRect(x, composer.cursorY - rowHeightDynamic, column.width, rowHeightDynamic, {
          borderColor: COLORS.black,
          borderWidth: soaBorderWidth,
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
    composer.drawRect(MARGIN_X, composer.cursorY - 22, tableWidth - amountColumnWidth - totalColumnWidth, 22, {
      borderColor: COLORS.black,
      borderWidth: soaBorderWidth,
      fillColor: COLORS.mediumGray,
    });
    composer.drawRect(
      MARGIN_X + tableWidth - amountColumnWidth - totalColumnWidth,
      composer.cursorY - 22,
      amountColumnWidth,
      22,
      { borderColor: COLORS.black, borderWidth: soaBorderWidth, fillColor: COLORS.mediumGray },
    );
    composer.drawRect(
      MARGIN_X + tableWidth - totalColumnWidth,
      composer.cursorY - 22,
      totalColumnWidth,
      22,
      { borderColor: COLORS.black, borderWidth: soaBorderWidth, fillColor: COLORS.mediumGray },
    );
    composer.drawText("Total(PHP)", MARGIN_X + 8, composer.cursorY - 14, {
      fontSize: 8,
      bold: true,
      color: COLORS.black,
    });
    drawRightAlignedCellText(
      composer,
      formatPdfMoneyValue(
        Number(record?.total_billed || 0) - Number(record?.total_paid || 0),
      ),
      MARGIN_X + tableWidth - amountColumnWidth - totalColumnWidth,
      amountColumnWidth,
      composer.cursorY - 14,
      { fontSize: 8, bold: true, color: COLORS.black },
    );
    drawRightAlignedCellText(
      composer,
      formatPdfMoneyValue(record?.balance_due || 0),
      MARGIN_X + tableWidth - totalColumnWidth,
      totalColumnWidth,
      composer.cursorY - 14,
      { fontSize: 8, bold: true, color: COLORS.black },
    );
    composer.cursorY -= 34;
  }

  drawBillingStatementFooter(composer, formatPdfMoney(record?.balance_due || 0));
  return composer.pdfDoc.save();
};
