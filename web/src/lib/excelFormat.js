import ExcelJS from "exceljs";

const getExportValue = (value) => {
  if (value === undefined || value === null) return "";
  return value;
};

const isNumericColumn = (column) => {
  const label = Array.isArray(column.label) ? column.label.join(" ") : column.label;
  return /amount|fee|total|receivable|quantity|qty|daug|balance|php|price|tickets?/i.test(
    `${column.key} ${label}`,
  );
};

const formatColumnHeader = (column) =>
  Array.isArray(column.label) ? column.label.join(" ") : column.label;

const A4_MARGIN_INCHES = 1 / 2.54;
const MAX_A4_LANDSCAPE_WIDTH = 132;

const getHeaderLogoBuffer = async () => {
  try {
    const response = await fetch("/images/header.png");
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
};

const excelColumnWidthToPixels = (width = 8.43) => Math.floor(width * 7 + 5);

const getColumnRangePixelWidth = (worksheet, startColumn, endColumn) =>
  Array.from({ length: endColumn - startColumn + 1 }, (_, index) =>
    excelColumnWidthToPixels(worksheet.getColumn(startColumn + index).width),
  ).reduce((sum, width) => sum + width, 0);

const getCenteredImageTopLeftColumn = (worksheet, startColumn, endColumn, imageWidth) => {
  const columnWidths = Array.from({ length: endColumn - startColumn + 1 }, (_, index) =>
    excelColumnWidthToPixels(worksheet.getColumn(startColumn + index).width),
  );
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  let offset = Math.max(0, (totalWidth - imageWidth) / 2);

  for (let index = 0; index < columnWidths.length; index += 1) {
    const columnWidth = columnWidths[index] || 1;
    if (offset <= columnWidth) {
      return startColumn - 1 + index + offset / columnWidth;
    }
    offset -= columnWidth;
  }

  return startColumn - 1;
};

const getCenteredImageTopLeftRow = (rowHeight, imageHeight) => {
  const rowHeightPx = rowHeight * (96 / 72);
  return Math.max(0, (rowHeightPx - imageHeight) / 2 / rowHeightPx);
};

const getContainedImageSize = ({ maxWidth, maxHeight, width, height, padding = 12 }) => {
  const availableWidth = Math.max(1, maxWidth - padding * 2);
  const availableHeight = Math.max(1, maxHeight - padding * 2);
  const scale = Math.min(1, availableWidth / width, availableHeight / height);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

const getValueLength = (value) => {
  if (value === undefined || value === null) return 0;
  return String(value)
    .split(/\r?\n/)
    .reduce((longest, part) => Math.max(longest, part.trim().length), 0);
};

const getColumnWidth = (column, rows) => {
  if (typeof column.width === "number") return column.width;

  const headerLength = getValueLength(formatColumnHeader(column));
  const contentLength = Array.isArray(rows)
    ? rows.reduce(
        (longest, row) => Math.max(longest, getValueLength(getExportValue(row?.[column.key]))),
        0,
      )
    : 0;
  const baseWidth = Math.max(headerLength, contentLength) + 4;

  if (isNumericColumn(column)) {
    return Math.min(18, Math.max(11, baseWidth));
  }

  return Math.min(28, Math.max(12, baseWidth));
};

const fitColumnWidthsForA4 = (columns, rows) => {
  const widths = columns.map((column) => getColumnWidth(column, rows));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  if (!totalWidth) return widths;

  const scale = MAX_A4_LANDSCAPE_WIDTH / totalWidth;
  const fittedWidths = widths.map((width) => Math.max(8, Math.floor(width * scale)));
  const fittedTotal = fittedWidths.reduce((sum, width) => sum + width, 0);
  const remainingWidth = MAX_A4_LANDSCAPE_WIDTH - fittedTotal;

  if (remainingWidth > 0 && fittedWidths.length > 0) {
    const widestColumnIndex = fittedWidths.reduce(
      (widestIndex, width, index) => (width > fittedWidths[widestIndex] ? index : widestIndex),
      0,
    );
    fittedWidths[widestColumnIndex] += remainingWidth;
  }

  return fittedWidths;
};

export const createExcelExportBlob = async ({
  rows,
  columns,
  sheetName,
  reportHeader,
  reportSummary,
}) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName || "Report", {
    views: [{ state: "frozen", ySplit: 8 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: A4_MARGIN_INCHES,
        right: A4_MARGIN_INCHES,
        top: A4_MARGIN_INCHES,
        bottom: A4_MARGIN_INCHES,
        header: 0,
        footer: 0,
      },
    },
  });

  const defaultFont = { name: "Calibri", size: 11, color: { argb: "FF444444" } };
  const bodyFont = { name: "Calibri", size: 10, color: { argb: "FF444444" } };
  const borderStyle = {
    top: { style: "thin", color: { argb: "FF080616" } },
    bottom: { style: "thin", color: { argb: "FF080616" } },
    left: { style: "thin", color: { argb: "FF080616" } },
    right: { style: "thin", color: { argb: "FF080616" } },
  };

  const fittedColumnWidths = fitColumnWidthsForA4(columns, rows);

  worksheet.columns = columns.map((column, index) => ({
    header: formatColumnHeader(column),
    key: column.key,
    width: fittedColumnWidths[index],
  }));

  const formatCurrency = (value) =>
    `PHP ${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formattedTotalValue = reportSummary?.totalValue ?? "";
  const totalLabel = reportSummary?.totalLabel ?? "";
  const spacerRow = Array(columns.length).fill("");

  const topHeaderRichText = [
    {
      text: "MUNICIPALITY OF OPOL\n",
      font: { ...defaultFont, size: 14, bold: true },
    },
    {
      text: "MUNICIPAL ECONOMIC ENTERPRISE OFFICE\n",
      font: { ...defaultFont, size: 12, bold: false },
    },
    {
      text: "OPOL FISH PORT",
      font: { ...defaultFont, size: 14, bold: true },
    },
  ];
  const baseLogoSize = { width: 190, height: 73 };
  const logoEndColumn = Math.max(1, Math.floor(columns.length / 2));
  const hasSeparateHeaderTextCell = columns.length > logoEndColumn;
  const textStartColumn = hasSeparateHeaderTextCell ? logoEndColumn + 1 : 1;

  worksheet.spliceRows(1, 0, spacerRow);
  const topHeaderRow = worksheet.getRow(1);
  topHeaderRow.height = 76;

  const headerLogoBuffer = await getHeaderLogoBuffer();
  worksheet.mergeCells(1, 1, 1, logoEndColumn);

  if (hasSeparateHeaderTextCell) {
    worksheet.mergeCells(1, textStartColumn, 1, columns.length);
  }

  for (let columnIndex = 1; columnIndex <= columns.length; columnIndex += 1) {
    const cell = topHeaderRow.getCell(columnIndex);
    cell.border = borderStyle;
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  }

  const headerTextCell = topHeaderRow.getCell(textStartColumn);
  headerTextCell.value = { richText: topHeaderRichText };
  headerTextCell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  if (headerLogoBuffer) {
    const logoHeaderWidth = getColumnRangePixelWidth(worksheet, 1, logoEndColumn);
    const logoHeaderHeight = topHeaderRow.height * (96 / 72);
    const logoSize = getContainedImageSize({
      ...baseLogoSize,
      maxWidth: logoHeaderWidth,
      maxHeight: logoHeaderHeight,
    });
    const logoImageId = workbook.addImage({
      buffer: headerLogoBuffer,
      extension: "png",
    });

    worksheet.addImage(logoImageId, {
      tl: {
        col: getCenteredImageTopLeftColumn(worksheet, 1, logoEndColumn, logoSize.width),
        row: getCenteredImageTopLeftRow(topHeaderRow.height, logoSize.height),
      },
      ext: logoSize,
    });
  }

  worksheet.spliceRows(2, 0, spacerRow);

  const metadataStart = 3;
  const metadataEnd = 4;
  const firstThird = Math.floor(columns.length / 3);
  const secondThird = Math.floor((columns.length * 2) / 3);

  const metadataLabels = [
    "Report:",
    reportHeader?.useGeneratedOn ? "Generated On:" : reportHeader?.coverageLabel || "Coverage:",
    totalLabel,
  ];
  const metadataValues = [
    reportHeader?.reportTitle || reportHeader?.reportTypeLabel || "",
    reportHeader?.useGeneratedOn
      ? new Date().toLocaleDateString("en-PH", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : reportHeader?.coverageValue || "",
    formattedTotalValue,
  ];

  [metadataLabels, metadataValues].forEach((values, rowOffset) => {
    const rowIndex = metadataStart + rowOffset;
    const row = worksheet.getRow(rowIndex);
    row.height = 18;

    worksheet.mergeCells(rowIndex, 1, rowIndex, firstThird);
    worksheet.mergeCells(rowIndex, firstThird + 1, rowIndex, secondThird);
    worksheet.mergeCells(rowIndex, secondThird + 1, rowIndex, columns.length);

    const leftCell = row.getCell(1);
    leftCell.value = values[0];
    leftCell.font = { ...defaultFont, size: 11, bold: rowOffset === 0 };
    leftCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    leftCell.fill = rowOffset === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } } : undefined;
    leftCell.border = borderStyle;

    const centerCell = row.getCell(firstThird + 1);
    centerCell.value = values[1];
    centerCell.font = { ...defaultFont, size: 11, bold: rowOffset === 0 };
    centerCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    centerCell.fill = rowOffset === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } } : undefined;
    centerCell.border = borderStyle;

    const rightCell = row.getCell(secondThird + 1);
    rightCell.value = values[2];
    rightCell.font = { ...defaultFont, size: 11, bold: rowOffset === 0 };
    rightCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    rightCell.fill = rowOffset === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } } : undefined;
    rightCell.border = borderStyle;
  });

  worksheet.spliceRows(metadataEnd + 1, 0, spacerRow);
  const headerRowIndex = metadataEnd + 2;
  worksheet.insertRow(headerRowIndex, columns.map(formatColumnHeader));
  const headerRow = worksheet.getRow(headerRowIndex);
  headerRow.eachCell((cell) => {
    cell.font = { ...defaultFont, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    cell.border = borderStyle;
  });

  rows.forEach((rowData) => {
    const row = worksheet.addRow(columns.map((column) => getExportValue(rowData[column.key])));
    row.eachCell((cell, colNumber) => {
      const column = columns[colNumber - 1];
      cell.font = defaultFont;
      cell.alignment = {
        horizontal: isNumericColumn(column) ? "right" : "left",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = borderStyle;
    });
  });

  const totals = {};
  let totalFound = false;
  rows.forEach((rowData) => {
    columns.forEach((column) => {
      if (!isNumericColumn(column)) return;
      const raw = rowData[column.key];
      const numeric = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(numeric)) {
        totals[column.key] = (totals[column.key] || 0) + numeric;
        totalFound = true;
      }
    });
  });

  if (totalFound) {
    const totalRow = worksheet.addRow(
      columns.map((column, index) => {
        if (index === 0) return "Total";
        const value = totals[column.key];
        return value !== undefined ? value : "";
      }),
    );
    totalRow.eachCell((cell, colNumber) => {
      const column = columns[colNumber - 1];
      cell.font = { ...defaultFont, bold: true };
      cell.alignment = {
        horizontal: isNumericColumn(column) ? "right" : "left",
        vertical: "middle",
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
      cell.border = borderStyle;
    });
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > headerRowIndex) {
      row.height = 18;
    }
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};
