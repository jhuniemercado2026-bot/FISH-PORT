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
    },
  });

  const defaultFont = { name: "Calibri", size: 11 };
  const bodyFont = { name: "Calibri", size: 10 };
  const borderStyle = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };

  worksheet.columns = columns.map((column) => ({
    header: formatColumnHeader(column),
    key: column.key,
    width: typeof column.width === "number"
      ? column.width
      : Math.max(14, String(formatColumnHeader(column)).length + 6),
  }));

  const formatCurrency = (value) =>
    `PHP ${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formattedTotalValue = reportSummary?.totalValue ?? "";
  const totalLabel = reportSummary?.totalLabel ?? "";

  const topHeaderText = [
    "MUNICIPALITY OF OPOL",
    "MUNICIPAL ECONOMIC ENTERPRISE OFFICE",
    "OPOL FISH PORT",
  ].join("\n");

  worksheet.spliceRows(1, 0, [topHeaderText]);
  worksheet.mergeCells(1, 1, 1, columns.length);
  const mergedHeaderRow = worksheet.getRow(1);
  mergedHeaderRow.height = 45;
  mergedHeaderRow.getCell(1).font = { ...defaultFont, size: 12, bold: true };
  mergedHeaderRow.getCell(1).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  mergedHeaderRow.getCell(1).border = borderStyle;

  const spacerRow = Array(columns.length).fill("");
  worksheet.spliceRows(2, 0, spacerRow);

  const metadataStart = 3;
  const metadataEnd = 4;
  const firstThird = Math.floor(columns.length / 3);
  const secondThird = Math.floor((columns.length * 2) / 3);

  const metadataLabels = [
    "Report Type:",
    reportHeader?.useGeneratedOn ? "Generated On:" : reportHeader?.coverageLabel || "Coverage:",
    totalLabel,
  ];
  const metadataValues = [
    reportHeader?.reportTypeLabel || "",
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
    leftCell.font = { ...defaultFont, size: 10, bold: rowOffset === 0 };
    leftCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    leftCell.fill = rowOffset === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } } : undefined;
    leftCell.border = borderStyle;

    const centerCell = row.getCell(firstThird + 1);
    centerCell.value = values[1];
    centerCell.font = { ...defaultFont, size: 10, bold: rowOffset === 0 };
    centerCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    centerCell.fill = rowOffset === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } } : undefined;
    centerCell.border = borderStyle;

    const rightCell = row.getCell(secondThird + 1);
    rightCell.value = values[2];
    rightCell.font = { ...defaultFont, size: 10, bold: rowOffset === 0 };
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
