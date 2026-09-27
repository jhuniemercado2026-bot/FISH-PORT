import type { BluetoothPrinter } from "@netinove/thermal-printer";

function centerPrinterText(text: string, width = 32) {
  const trimmed = text.trim();
  const padding = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return `${" ".repeat(padding)}${trimmed}`;
}

function findPreferredThermalPrinter(printers: BluetoothPrinter[]) {
  const bondedPrinters = printers.filter((printer) => printer.bonded);
  const pt210Printer = bondedPrinters.find((printer) => {
    const name = printer.name.trim().toLowerCase();
    return name.includes("pt-210") || name.includes("pt210");
  });

  if (pt210Printer) {
    return pt210Printer;
  }

  return (
    bondedPrinters.find((printer) => {
      const name = printer.name.trim().toLowerCase();
      return name.includes("printer") || name.includes("thermal");
    }) ??
    bondedPrinters[0] ??
    null
  );
}

function toThermalCurrencyText(value: string) {
  return String(value ?? "")
    .replace(/₱/g, "PHP ")
    .replace(/PHP\s+/g, "PHP ")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type ThermalReceiptPreview = {
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
  lines: {
    name: string;
    quantity: number;
    feeText: string;
    subtotalText: string;
    daugText?: string | null;
  }[];
  totalText: string;
};

function wrapPrinterText(value: string, width = 32) {
  const trimmed = value.trim();
  if (!trimmed) return [""];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= width) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length <= width) {
      current = word;
      return;
    }

    for (let index = 0; index < word.length; index += width) {
      lines.push(word.slice(index, index + width));
    }

    current = "";
  });

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function buildThermalReceiptTextFromPreview(preview: ThermalReceiptPreview) {
  const title = String(preview.title || "OPOL FISH PORT").trim();
  const subtitle = String(preview.subtitle || "TRANSACTION").trim();
  const lines = [
    centerPrinterText(title),
    centerPrinterText(subtitle),
    "-".repeat(32),
  ];

  preview.details.forEach(({ label, value }) => {
    const detailLabel = String(label || "").trim();
    const detailValue = String(value || "-").trim();

    if (!detailLabel && !detailValue) {
      return;
    }

    const detailText = detailLabel ? `${detailLabel}: ${detailValue}` : detailValue;

    if (detailText.length <= 32) {
      lines.push(detailText);
      return;
    }

    lines.push(`${detailLabel}:`);
    wrapPrinterText(detailValue, 32).forEach((chunk) => lines.push(chunk));
  });

  lines.push("-".repeat(32));

  preview.lines.forEach((line, index) => {
    const itemName = String(line.name || "Fish").trim() || "Fish";
    const feeText = toThermalCurrencyText(line.feeText || "PHP 0.00");
    const subtotalText = toThermalCurrencyText(line.subtotalText || "PHP 0.00");
    lines.push(`${index + 1}. ${itemName}`);
    lines.push(`${String(line.quantity || 0)} x ${feeText}`.padEnd(22, " ") + subtotalText);

    if (line.daugText) {
      lines.push(`Daug${" ".repeat(17)}${toThermalCurrencyText(line.daugText)}`);
    }
  });

  lines.push("-".repeat(32));

  const totalLabel = "TOTAL";
  const totalValue = toThermalCurrencyText(preview.totalText || "PHP 0.00");
  const totalPadding = Math.max(1, 32 - totalLabel.length - totalValue.length);
  lines.push(`${totalLabel}${" ".repeat(totalPadding)}${totalValue}`);
  lines.push("");

  return lines.join("\n");
}

export async function printThermalReceipt(receipt: string | ThermalReceiptPreview) {
  const {
    connect: connectThermalPrinter,
    getBondedPrinters,
    getConnectionState,
    requestBluetoothPermissions,
    writeText: writeThermalText,
  } = await import("@netinove/thermal-printer");

  const granted = await requestBluetoothPermissions();

  if (!granted) {
    throw new Error("Bluetooth permission was not granted.");
  }

  const printers = await getBondedPrinters();
  const printer = findPreferredThermalPrinter(printers);

  if (!printer) {
    throw new Error("No paired Bluetooth thermal printer found.");
  }

  const connection = getConnectionState();

  if (!connection.connected || connection.address !== printer.address) {
    await connectThermalPrinter(printer.address);
  }

  const receiptText = typeof receipt === "string" ? receipt : buildThermalReceiptTextFromPreview(receipt);

  await writeThermalText(`${receiptText.trimEnd()}\n\n`);
  await writeThermalText("\n", { trailingLines: 3 });
}
