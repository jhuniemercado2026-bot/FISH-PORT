import { useMemo } from "react";
import { useFiscalYearStore, isCurrentFiscalYear, getFiscalYearLockMessage } from "../store/fiscalYearStore";
import { useTransactionLockOnlyQuery } from "./useTransactionLockOnlyQuery";
import { getActiveTransactionLock, getTransactionLockMessage } from "../utils/transactionLock";

export const useTransactionLockQuery = () => {
  const query = useTransactionLockOnlyQuery();
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);

  const activeTransactionLock = useMemo(
    () => getActiveTransactionLock(query.data?.transaction_lock ?? query.data),
    [query.data],
  );

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
