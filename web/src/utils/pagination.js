export const PAGINATION_PAGE_WINDOW = 25;

export const getPaginationWindow = (
  totalPages,
  currentPage,
  windowSize = PAGINATION_PAGE_WINDOW
) => {
  const { start, end } = getPaginationWindowRange(totalPages, currentPage, windowSize);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

export const getPaginationWindowRange = (
  totalPages,
  currentPage,
  windowSize = PAGINATION_PAGE_WINDOW
) => {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal);
  const safeWindowSize = Math.max(1, Number(windowSize) || PAGINATION_PAGE_WINDOW);
  const start = Math.floor((safeCurrent - 1) / safeWindowSize) * safeWindowSize + 1;
  const end = Math.min(start + safeWindowSize - 1, safeTotal);

  return {
    start,
    end,
    hasPreviousWindow: start > 1,
    hasNextWindow: end < safeTotal,
  };
};

export const getPreviousPaginationWindowPage = (
  totalPages,
  currentPage,
  windowSize = PAGINATION_PAGE_WINDOW
) => {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal);
  const safeWindowSize = Math.max(1, Number(windowSize) || PAGINATION_PAGE_WINDOW);

  if (safeTotal <= safeWindowSize) {
    return Math.max(1, safeCurrent - 1);
  }

  const { start } = getPaginationWindowRange(safeTotal, safeCurrent, safeWindowSize);

  return Math.max(1, start - safeWindowSize);
};

export const getNextPaginationWindowPage = (
  totalPages,
  currentPage,
  windowSize = PAGINATION_PAGE_WINDOW
) => {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal);
  const safeWindowSize = Math.max(1, Number(windowSize) || PAGINATION_PAGE_WINDOW);

  if (safeTotal <= safeWindowSize) {
    return Math.min(safeTotal, safeCurrent + 1);
  }

  const { end } = getPaginationWindowRange(safeTotal, safeCurrent, safeWindowSize);

  return Math.min(safeTotal, end + 1);
};

export const hasPreviousPaginationWindow = (
  totalPages,
  currentPage,
  windowSize = PAGINATION_PAGE_WINDOW
) => {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal);
  const safeWindowSize = Math.max(1, Number(windowSize) || PAGINATION_PAGE_WINDOW);

  if (safeTotal <= safeWindowSize) {
    return safeCurrent > 1;
  }

  return getPaginationWindowRange(safeTotal, safeCurrent, safeWindowSize).hasPreviousWindow;
};

export const hasNextPaginationWindow = (
  totalPages,
  currentPage,
  windowSize = PAGINATION_PAGE_WINDOW
) => {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safeCurrent = Math.min(Math.max(1, Number(currentPage) || 1), safeTotal);
  const safeWindowSize = Math.max(1, Number(windowSize) || PAGINATION_PAGE_WINDOW);

  if (safeTotal <= safeWindowSize) {
    return safeCurrent < safeTotal;
  }

  return getPaginationWindowRange(safeTotal, safeCurrent, safeWindowSize).hasNextWindow;
};
