export const getCachedTab = (storageKey, allowedTabs = [], fallback = "") => {
  if (typeof window === "undefined") return fallback;
  const cachedTab = window.sessionStorage.getItem(storageKey);
  return allowedTabs.includes(cachedTab) ? cachedTab : fallback;
};

export const cacheTab = (storageKey, tab, allowedTabs = []) => {
  if (typeof window === "undefined" || !allowedTabs.includes(tab)) return;
  window.sessionStorage.setItem(storageKey, tab);
};
