import { getPreparerPosition } from "./preparerPosition";

// Leave room for the signing block and any totals below the last table row.
export const REPORT_SIGNATURE_SPACE = 144;

export const drawPreparedBySignature = (composer, preparedBy, {
  marginX = 42,
  marginY = 42,
  contentWidth = 511.28,
  position = getPreparerPosition(),
} = {}) => {
  const width = Math.min(240, contentWidth);
  const signatureX = marginX + contentWidth - width;
  const centerX = signatureX + width / 2;
  const name = String(preparedBy || "Admin")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Admin";
  const nameWidth = composer.boldFont.widthOfTextAtSize(name, 10);
  const fontSize = Math.min(10, 10 * (width - 8) / Math.max(1, nameWidth));

  // This is drawn once, at the bottom of the final page. The blank space
  // between the label and line is reserved for a handwritten signature.
  const label = "Prepared By:";
  composer.drawCenteredText(label, centerX, marginY + 74, { fontSize: 10, bold: true });
  composer.drawRect(signatureX, marginY + 30, width, 0, { borderWidth: 0.75 });
  composer.drawCenteredText(name, centerX, marginY + 14, { fontSize, bold: true });
  const positionText = String(position).replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  if (positionText) {
    const positionWidth = composer.regularFont.widthOfTextAtSize(positionText, 9);
    const positionFontSize = Math.min(9, 9 * (width - 8) / Math.max(1, positionWidth));
    composer.drawCenteredText(positionText, centerX, marginY + 1, { fontSize: positionFontSize, bold: false });
  }
};
