import { getStoredUser } from "../pages/login/auth";

export const getNormalizedRole = () => String(getStoredUser()?.role || "").trim().toLowerCase();

export const isCoordinatorRole = () => getNormalizedRole() === "coordinator";

export const isHeadRole = () => getNormalizedRole() === "head";

export const getActiveTransactionLock = (transactionLock) => {
  if (!transactionLock?.is_locked) return null;
  return transactionLock;
};

const normalizeTransactionLockMessage = (message) =>
  String(message || "")
    .replace(/\s+for coordinators and inspectors(?=\s+until)/i, "")
    .trim();

export const getTransactionLockMessage = (transactionLock) =>
  normalizeTransactionLockMessage(getActiveTransactionLock(transactionLock)?.message) ||
  "Transactions are view-only.";
