import { getStoredUser, normalizeRole } from "../pages/login/auth";

export const getPreparerPosition = (user = getStoredUser()) => {
  const role = normalizeRole(user?.role || user?.role_label);
  const labels = { head: "Head of MEEO", coordinator: "Coordinator", inspector: "Inspector" };
  return labels[role] || user?.role_label || "";
};
