import { useMemo } from "react";
import { useFiscalYearStore, isCurrentFiscalYear, getFiscalYearLockMessage } from "../store/fiscalYearStore";
import { useTransactionLockOnlyQuery } from "./useTransactionLockOnlyQuery";
import { getActiveTransactionLock, getTransactionLockMessage, isCoordinatorRole, isHeadRole } from "../utils/transactionLock";

const COORDINATOR_TRANSACTION_LOCK_EXEMPT_RESOURCES = new Set([
  "accounts",
  "boat-management",
  "archives",
  "fish-classifications",
  "vehicle-type-records",
]);

export const useTransactionLockQuery = (resource = null) => {
  const query = useTransactionLockOnlyQuery({ resource });
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  const activeTransactionLock = useMemo(() => {
    if (isHeadRole()) return null;
    if (isCoordinatorRole() && COORDINATOR_TRANSACTION_LOCK_EXEMPT_RESOURCES.has(resource)) {
      return null;
    }

    return getActiveTransactionLock(query.data?.transaction_lock ?? query.data);
  }, [query.data, resource]);

  const fiscalYearLock = useMemo(() => {
    if (isCurrentFiscalYear(fiscalYear)) return null;
    return { is_locked: true, message: getFiscalYearLockMessage(fiscalYear) };
  }, [fiscalYear]);

  const transactionLock = useMemo(
    () => activeTransactionLock || fiscalYearLock,
    [activeTransactionLock, fiscalYearLock],
  );

  return {
    ...query,
    transactionLock,
    rawTransactionLock: activeTransactionLock,
    isTransactionLocked: Boolean(transactionLock),
    transactionLockMessage: getTransactionLockMessage(transactionLock),
  };
};
