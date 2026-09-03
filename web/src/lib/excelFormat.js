import ExcelJS from "exceljs";

const getExportValue = (value) => {
  if (value === undefined || value === null) return "";
  return value;
};

const isNumericColumn = (column) => {
  const label = Array.isArray(column.label) ? column.label.join(" ") : column.label;
  return /amount|fee|total|receivable|quantity|qty|count|daug|balance|php|price|tickets?/i.test(
    `${column.key} ${label}`,
  );
};

const formatColumnHeader = (column) =>
  Array.isArray(column.label) ? column.label.join(" ") : column.label;

const A4_MARGIN_INCHES = 1 / 2.54;
const MAX_A4_LANDSCAPE_WIDTH = 132;
const HEADER_LOGO_PADDING = 12;

const getImageDimensionsFromBlob = async (blob) => {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dimensions;
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to load Excel header image."));
    };
    image.src = objectUrl;
  });
};

const getHeaderLogoAsset = async () => {
  try {
    const response = await fetch("/images/header.png");
    if (!response.ok) return null;
    const blob = await response.blob();
    const [buffer, dimensions] = await Promise.all([
      blob.arrayBuffer(),
      getImageDimensionsFromBlob(blob),
    ]);

    return { blob, buffer, ...dimensions };
  } catch {
    return null;
  }
};

const excelColumnWidthToPixels = (width = 8.43) => Math.floor(width * 7 + 5);

const getColumnRangePixelWidth = (worksheet, startColumn, endColumn) =>
  Array.from({ length: endColumn - startColumn + 1 }, (_, index) =>
    excelColumnWidthToPixels(worksheet.getColumn(startColumn + index).width),
  ).reduce((sum, width) => sum + width, 0);

const getContainedImageSize = ({ maxWidth, maxHeight, width, height, padding = 12 }) => {
  const availableWidth = Math.max(1, maxWidth - padding * 2);
  const availableHeight = Math.max(1, maxHeight - padding * 2);
  const scale = Math.min(1, availableWidth / width, availableHeight / height);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

const canvasToArrayBuffer = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to prepare Excel header image."));
        return;
      }

      blob.arrayBuffer().then(resolve, reject);
    }, "image/png");
  });

const loadImageElement = (blob) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to load Excel header image."));
    };
    image.src = objectUrl;
  });

const createPaddedHeaderLogoBuffer = async ({
  asset,
  leftSpace,
  topSpace,
  logoSize,
}) => {
  if (typeof document === "undefined") return asset.buffer;

  try {
    const renderScale = Math.max(
      1,
      asset.width / Math.max(1, logoSize.width),
      asset.height / Math.max(1, logoSize.height),
    );
    const scaledLeftSpace = Math.round(leftSpace * renderScale);
    const scaledTopSpace = Math.round(topSpace * renderScale);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(scaledLeftSpace + asset.width);
    canvas.height = Math.round(scaledTopSpace + asset.height);

    const context = canvas.getContext("2d");
    if (!context) return asset.buffer;

    const image =
      typeof createImageBitmap === "function"
        ? await createImageBitmap(asset.blob)
        : await loadImageElement(asset.blob);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, scaledLeftSpace, scaledTopSpace, asset.width, asset.height);
    image.close?.();

    return await canvasToArrayBuffer(canvas);
  } catch {
    return asset.buffer;
  }
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

const getReportColumnWidths = (columns, rows, sheetName) => {
  if (sheetName === "BoatTypes") {
    return columns.map((column) => {
      if (column.key === "typeName") return 92;
      if (column.key === "usageCount") return 40;
      return getColumnWidth(column, rows);
    });
  }

  return null;
};

const fitColumnWidthsForA4 = (columns, rows, sheetName) => {
  const reportWidths = getReportColumnWidths(columns, rows, sheetName);
  if (reportWidths) return reportWidths;

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

  const fittedColumnWidths = fitColumnWidthsForA4(columns, rows, sheetName);

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
  const logoEndColumn = Math.max(1, Math.floor(columns.length / 2));
  const hasSeparateHeaderTextCell = columns.length > logoEndColumn;
  const textStartColumn = hasSeparateHeaderTextCell ? logoEndColumn + 1 : 1;

  worksheet.spliceRows(1, 0, spacerRow);
  const topHeaderRow = worksheet.getRow(1);
  topHeaderRow.height = 76;

  const headerLogoAsset = await getHeaderLogoAsset();
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

  if (headerLogoAsset) {
    const logoHeaderWidth = getColumnRangePixelWidth(worksheet, 1, logoEndColumn);
    const logoHeaderHeight = topHeaderRow.height * (96 / 72);
    const logoSize = getContainedImageSize({
      width: headerLogoAsset.width,
      height: headerLogoAsset.height,
      maxWidth: logoHeaderWidth,
      maxHeight: logoHeaderHeight,
      padding: HEADER_LOGO_PADDING,
    });
    const logoLeftSpace = Math.max(0, (logoHeaderWidth - logoSize.width) / 2);
    const logoTopSpace = Math.max(0, (logoHeaderHeight - logoSize.height) / 2);
    const paddedLogoBuffer = await createPaddedHeaderLogoBuffer({
      asset: headerLogoAsset,
      leftSpace: logoLeftSpace,
      topSpace: logoTopSpace,
      logoSize,
    });
    const logoImageId = workbook.addImage({
      buffer: paddedLogoBuffer,
      extension: "png",
    });

    worksheet.addImage(logoImageId, {
      tl: {
        col: 0,
        row: 0,
      },
      ext: {
        width: Math.round(logoLeftSpace + logoSize.width),
        height: Math.round(logoTopSpace + logoSize.height),
      },
      editAs: "oneCell",
    });
  }

  worksheet.spliceRows(2, 0, spacerRow);

  const metadataLabels = sheetName === "BoatTypes"
    ? [
        "Report:",
        reportHeader?.useGeneratedOn ? "Generated On:" : reportHeader?.coverageLabel || "Coverage:",
      ]
    : [
        "Report:",
        reportHeader?.useGeneratedOn ? "Generated On:" : reportHeader?.coverageLabel || "Coverage:",
        totalLabel,
      ];
  const metadataValues = sheetName === "BoatTypes"
    ? [
        reportHeader?.reportTitle || reportHeader?.reportTypeLabel || "",
        reportHeader?.useGeneratedOn
          ? new Date().toLocaleDateString("en-PH", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          : reportHeader?.coverageValue || "",
      ]
    : [
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

  const metadataStart = 3;
  const useCompactMetadata = columns.length < 3;
  let metadataEnd = 4;

  if (useCompactMetadata) {
    metadataEnd = metadataStart + 1;

    [metadataLabels, metadataValues].forEach((values, rowOffset) => {
      const rowIndex = metadataStart + rowOffset;
      const row = worksheet.getRow(rowIndex);
      row.height = 18;

      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        cell.font = { ...defaultFont, size: 11, bold: rowOffset === 0 };
        cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        cell.fill = rowOffset === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } } : undefined;
        cell.border = borderStyle;
      });
    });
  } else {
    const firstThird = Math.floor(columns.length / 3);
    const secondThird = Math.floor((columns.length * 2) / 3);

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
  }

  worksheet.spliceRows(metadataEnd + 1, 0, spacerRow);
  const usesEmbeddedHeaders = sheetName === "OwnerStatement";
  const headerRowIndex = usesEmbeddedHeaders ? metadataEnd + 1 : metadataEnd + 2;
  if (!usesEmbeddedHeaders) {
    worksheet.insertRow(headerRowIndex, columns.map(formatColumnHeader));
    const headerRow = worksheet.getRow(headerRowIndex);
    headerRow.eachCell((cell) => {
      cell.font = { ...defaultFont, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
      cell.border = borderStyle;
    });
  }

  const styleDataRow = (row, { bold = false, fill = false } = {}) => {
    for (let colNumber = 1; colNumber <= columns.length; colNumber += 1) {
      const cell = row.getCell(colNumber);
      const column = columns[colNumber - 1];
      cell.font = { ...defaultFont, bold };
      cell.alignment = {
        horizontal: isNumericColumn(column) ? "right" : "left",
        vertical: "middle",
        wrapText: true,
      };
      if (column.key === "usageCount") {
        cell.numFmt = "0";
      }
      if (fill) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
      }
      cell.border = borderStyle;
    }
  };

  const getColumnNumberByKey = (key) => columns.findIndex((column) => column.key === key) + 1;

  rows.forEach((rowData) => {
    if (rowData?.__rowType === "spacer") {
      worksheet.addRow(Array(columns.length).fill(""));
      return;
    }

    if (rowData?.__rowType === "sectionTitle" || rowData?.__rowType === "boatTitle") {
      const row = worksheet.addRow(Array(columns.length).fill(""));
      worksheet.mergeCells(row.number, 1, row.number, columns.length);
      const cell = row.getCell(1);
      cell.value = rowData.__label || "";
      cell.font = { ...defaultFont, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
      cell.border = borderStyle;
      return;
    }

    if (rowData?.__rowType === "tableHeader") {
      const row = worksheet.addRow(columns.map(formatColumnHeader));
      row.eachCell((cell) => {
        cell.font = { ...defaultFont, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
        cell.border = borderStyle;
      });
      return;
    }

    if (rowData?.__rowType === "summaryHeader") {
      const row = worksheet.addRow(Array(columns.length).fill(""));
      row.getCell(1).value = "Boat Name";
      row.getCell(columns.length).value = "Total Balance Due(PHP)";
      styleDataRow(row, { bold: true, fill: true });
      return;
    }

    if (rowData?.__rowType === "summaryRow" || rowData?.__rowType === "summaryTotal") {
      const row = worksheet.addRow(Array(columns.length).fill(""));
      row.getCell(1).value = rowData.boatName || "";
      row.getCell(columns.length).value = Number(rowData.balanceDue || 0);
      styleDataRow(row, {
        bold: rowData.__rowType === "summaryTotal",
        fill: rowData.__rowType === "summaryTotal",
      });
      return;
    }

    if (rowData?.__rowType === "transactionTotal") {
      const row = worksheet.addRow(Array(columns.length).fill(""));
      const amountColumn = getColumnNumberByKey("amount");
      const lineTotalColumn = getColumnNumberByKey("running_balance");
      row.getCell(1).value = "Total(PHP)";
      if (amountColumn > 0) row.getCell(amountColumn).value = Number(rowData.amount || 0);
      if (lineTotalColumn > 0) row.getCell(lineTotalColumn).value = Number(rowData.running_balance || 0);
      styleDataRow(row, { bold: true, fill: true });
      return;
    }

    const row = worksheet.addRow(columns.map((column) => getExportValue(rowData[column.key])));
    styleDataRow(row);
  });

  const totals = {};
  let totalFound = false;
  columns.forEach((column) => {
    if (column.totalValue === undefined) return;
    totals[column.key] = column.totalValue;
    totalFound = true;
  });
  rows.forEach((rowData) => {
    if (rowData?.__rowType) return;
    columns.forEach((column) => {
      if (column.totalValue !== undefined) return;
      if (!isNumericColumn(column)) return;
      const raw = rowData[column.key];
      const numeric = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(numeric)) {
        totals[column.key] = (totals[column.key] || 0) + numeric;
        totalFound = true;
      }
    });
  });

  if (totalFound && sheetName !== "BoatTypes" && sheetName !== "OwnerStatement") {
    const totalRow = worksheet.addRow(
      columns.map((column, index) => {
        if (index === 0) return "Total";
        const value = column.totalValue !== undefined ? column.totalValue : totals[column.key];
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
      if (column.key === "usageCount") {
        cell.numFmt = "0";
      }
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
