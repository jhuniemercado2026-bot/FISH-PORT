import { getStoredUser } from "../pages/login/auth";

export const getNormalizedRole = () => String(getStoredUser()?.role || "").trim().toLowerCase();

export const isCoordinatorRole = () => getNormalizedRole() === "coordinator";

export const isHeadRole = () => getNormalizedRole() === "head";

export const getActiveTransactionLock = (transactionLock) => {
  if (!transactionLock?.is_locked) return null;
  return transactionLock;
};

export const getTransactionLockMessage = (transactionLock) =>
  getActiveTransactionLock(transactionLock)?.message || "Transactions are temporarily view-only.";
