const getManilaDateString = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const getBanyeraDate = (transaction) => String(transaction?.transaction_date ?? "").slice(0, 10);

const getBanyeraFee = (transaction) => Number(transaction?.total_fee ?? transaction?.fee ?? 0);

const adjustStatValue = (value, delta) => Math.max(0, Number(value ?? 0) + delta);

const normalizeClassification = (classification) => classification?.data ?? classification;

const sortClassificationsByCreatedAt = (items = []) => {
  const classifications = Array.isArray(items) ? items : [];

  return [...classifications].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at || left?.createdAt || left?.date_added || "");
    const rightTime = Date.parse(right?.created_at || right?.createdAt || right?.date_added || "");
    const leftHasTime = Number.isFinite(leftTime);
    const rightHasTime = Number.isFinite(rightTime);

    if (leftHasTime && rightHasTime) {
      return rightTime - leftTime;
    }

    if (leftHasTime !== rightHasTime) {
      return leftHasTime ? -1 : 1;
    }

    return String(left?.classification_id ?? "").localeCompare(String(right?.classification_id ?? ""));
  });
};

export const updateBanyeraStatsInCache = (queryClient, transaction, action = "add") => {
  if (!transaction) return;

  const isTodaysTransaction = getBanyeraDate(transaction) === getManilaDateString();
  const transactionFee = getBanyeraFee(transaction);
  const delta = action === "void" ? -1 : action === "restore" || action === "add" ? 1 : 0;

  queryClient.setQueriesData({ queryKey: ["banyera-data"] }, (previous) => {
    if (!previous || !previous.stats) return previous;

    const stats = {
      ...previous.stats,
      total_records: adjustStatValue(previous.stats.total_records, delta),
    };

    if (isTodaysTransaction) {
      stats.today_count = adjustStatValue(previous.stats.today_count, delta);
      stats.today_total_fee = adjustStatValue(previous.stats.today_total_fee, delta * transactionFee);
    }

    return {
      ...previous,
      stats,
    };
  });
};

export const upsertBanyeraTransactionInDataCache = (queryClient, transaction, options = {}) => {
  if (!transaction?.banyera_id) return;

  const { insertIfMissing = false } = options;

  queryClient.getQueriesData({ queryKey: ["banyera-data"] }).forEach(([queryKey, previous]) => {
    if (!previous) return previous;

    if (!Array.isArray(previous.transactions) && !Array.isArray(previous.data?.transactions)) return previous;

    const previousTransactions = Array.isArray(previous.transactions)
      ? previous.transactions
      : Array.isArray(previous.data?.transactions)
        ? previous.data.transactions
        : [];
    const transactionId = String(transaction.banyera_id);
    const existingIndex = previousTransactions.findIndex(
      (item) => String(item?.banyera_id ?? "") === transactionId
    );

    if (existingIndex >= 0) {
      const nextTransactions = [...previousTransactions];
      nextTransactions[existingIndex] = {
        ...nextTransactions[existingIndex],
        ...transaction,
      };

      queryClient.setQueryData(queryKey, {
        ...previous,
        transactions: nextTransactions,
        ...(previous.data ? { data: { ...previous.data, transactions: nextTransactions } } : {}),
      });
      return;
    }

    if (!insertIfMissing || !transactionId) return;

    queryClient.setQueryData(queryKey, {
      ...previous,
      transactions: [transaction, ...previousTransactions],
      ...(previous.data ? { data: { ...previous.data, transactions: [transaction, ...previousTransactions] } } : {}),
    });
  });
};

export const upsertBanyeraFishClassificationInCache = (queryClient, classification) => {
  const nextClassification = normalizeClassification(classification);
  if (!nextClassification?.classification_id) return;

  queryClient.setQueryData(["banyera-data", "lookups"], (previous) => {
    if (!previous) return previous;

    const previousClassifications = Array.isArray(previous.classifications)
      ? previous.classifications
      : [];
    const nextId = String(nextClassification.classification_id);
    const existingIndex = previousClassifications.findIndex(
      (item) => String(item?.classification_id ?? "") === nextId
    );

    if (existingIndex < 0) {
      return {
        ...previous,
        classifications: sortClassificationsByCreatedAt([nextClassification, ...previousClassifications]),
      };
    }

    const nextClassifications = [...previousClassifications];
    nextClassifications[existingIndex] = {
      ...nextClassifications[existingIndex],
      ...nextClassification,
    };

    return {
      ...previous,
      classifications: nextClassifications,
    };
  });

  queryClient.setQueriesData({ queryKey: ["banyera-data", "fish-classifications"] }, (previous) => {
    if (!previous) return previous;

    const previousClassifications = Array.isArray(previous.classifications)
      ? previous.classifications
      : [];
    const nextId = String(nextClassification.classification_id);
    const existingIndex = previousClassifications.findIndex(
      (item) => String(item?.classification_id ?? "") === nextId
    );

    const nextClassifications = [...previousClassifications];
    const nextSummary = previous.summary ? { ...previous.summary } : { total: 0, used: 0, unused: 0 };
    const nextIsUsed = Number(nextClassification?.fish_using_count ?? 0) > 0;

    if (existingIndex < 0) {
      nextClassifications.unshift(nextClassification);
      nextSummary.total = Number(nextSummary.total ?? 0) + 1;
      if (nextIsUsed) {
        nextSummary.used = Number(nextSummary.used ?? 0) + 1;
      } else {
        nextSummary.unused = Number(nextSummary.unused ?? 0) + 1;
      }
    } else {
      const previousClassification = previousClassifications[existingIndex] ?? {};
      const previousIsUsed = Number(previousClassification?.fish_using_count ?? 0) > 0;
      if (previousIsUsed !== nextIsUsed) {
        if (previousIsUsed) {
          nextSummary.used = Math.max(0, Number(nextSummary.used ?? 0) - 1);
          nextSummary.unused = Number(nextSummary.unused ?? 0) + 1;
        } else {
          nextSummary.unused = Math.max(0, Number(nextSummary.unused ?? 0) - 1);
          nextSummary.used = Number(nextSummary.used ?? 0) + 1;
        }
      }
      nextClassifications[existingIndex] = {
        ...nextClassifications[existingIndex],
        ...nextClassification,
      };
    }

    return {
      ...previous,
      classifications: sortClassificationsByCreatedAt(nextClassifications),
      ...(previous.classificationsMeta ? { classificationsMeta: { ...previous.classificationsMeta } } : {}),
      summary: nextSummary,
    };
  });
};

export const removeBanyeraFishClassificationFromCache = (queryClient, classificationId) => {
  queryClient.setQueryData(["banyera-data", "lookups"], (previous) =>
    previous
      ? {
          ...previous,
          classifications: (previous.classifications ?? []).filter(
            (item) => String(item?.classification_id ?? "") !== String(classificationId)
          ),
        }
      : previous
  );

  queryClient.setQueriesData({ queryKey: ["banyera-data", "fish-classifications"] }, (previous) => {
    if (!previous) return previous;

    const nextClassifications = (previous.classifications ?? []).filter(
      (item) => String(item?.classification_id ?? "") !== String(classificationId)
    );
    const nextSummary = previous.summary ? { ...previous.summary } : { total: 0, used: 0, unused: 0 };

    nextSummary.total = Math.max(0, Number(nextSummary.total ?? 0) - 1);
    nextSummary.used = Math.max(0, Number(nextSummary.used ?? 0) - 1);
    nextSummary.unused = Math.max(0, Number(nextSummary.unused ?? 0) - 1);

    return {
      ...previous,
      classifications: nextClassifications,
      summary: nextSummary,
      classificationsMeta: previous.classificationsMeta
        ? {
            ...previous.classificationsMeta,
            total: Math.max(0, Number(previous.classificationsMeta.total ?? previous.classifications.length ?? 0) - 1),
            to: Math.min(Number(previous.classificationsMeta.per_page ?? nextClassifications.length), nextClassifications.length),
          }
        : previous.classificationsMeta,
    };
  });
};
