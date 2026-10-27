// Statement totals already include these charges. This amount is a breakdown only.
export const getPenaltyAmount = (record) => {
  if (record?.penalty_amount != null) return Number(record.penalty_amount) || 0;
  if (Array.isArray(record?.bills)) {
    return record.bills.reduce((sum, bill) => sum + getPenaltyAmount(bill), 0);
  }
  return (record?.line_items ?? []).reduce((sum, item) =>
    String(item.transaction_type || "").toLowerCase() === "penalty"
      ? sum + (Number(item.amount) || 0) : sum, 0);
};

export const drawPdfPenaltyRow = (composer, {
  amount, x, width, amountWidth, borderColor, textColor, borderWidth = 1.5,
  fontSize = 9, formatMoney,
}) => {
  // Keep the breakdown and the following total on the same page.
  composer.ensureSpace(56);
  composer.drawRect(x, composer.cursorY - 22, width, 22, { borderColor, borderWidth });
  composer.drawRect(x + width - amountWidth, composer.cursorY - 22, 1, 22, {
    borderColor, fillColor: borderColor, borderWidth: 0,
  });
  composer.drawText("Penalty", x + 8, composer.cursorY - 14, {
    fontSize, bold: true, color: textColor,
  });
  const text = formatMoney(amount);
  const textWidth = composer.regularFont.widthOfTextAtSize(text, fontSize);
  composer.drawText(text, Math.max(x + width - amountWidth + 6, x + width - textWidth - 6), composer.cursorY - 14, {
    fontSize, color: textColor,
  });
  composer.cursorY -= 22;
};
