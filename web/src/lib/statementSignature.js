import { getStoredUser } from "../pages/login/auth";
import { drawPreparedBySignature, REPORT_SIGNATURE_SPACE } from "./reportSignature";

export const drawStatementSignature = (composer, options) => {
  const user = getStoredUser();
  const name = user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.user_name || "Admin";
  composer.ensureSpace(REPORT_SIGNATURE_SPACE);
  drawPreparedBySignature(composer, name, options);
};
