import { getStoredUser } from "../pages/login/auth";
import { cacheTab, getCachedTab } from "./tabSession";

const key = (section) => {
  const user = getStoredUser();
  return `opol:settings:${user?.user_id ?? user?.id ?? "session"}:${section}`;
};
const sections = (isHead) => isHead ? ["general", "penalty"] : ["general"];

export const readSettingsSection = (isHead) => {
  try { return getCachedTab(key("tab"), sections(isHead), "general"); }
  catch { return "general"; }
};
export const writeSettingsSection = (section, isHead) => {
  try { cacheTab(key("tab"), section, sections(isHead)); }
  catch { /* Settings still works when session storage is unavailable. */ }
};

export const readPenaltyTableState = () => {
  let saved;
  try { saved = JSON.parse(window.sessionStorage.getItem(key("penalty-table")) || "null"); }
  catch { /* Fall back to the default table view. */ }
  return {
    search: typeof saved?.search === "string" ? saved.search.slice(0, 200) : "",
    status: ["all", "on", "off"].includes(saved?.status) ? saved.status : "all",
    page: Number.isSafeInteger(saved?.page) && saved.page > 0 ? saved.page : 1,
  };
};

export const writePenaltyTableState = ({ search, status, page }) => {
  try { window.sessionStorage.setItem(key("penalty-table"), JSON.stringify({ search, status, page })); }
  catch { /* Do not interrupt table interactions when storage is unavailable. */ }
};
