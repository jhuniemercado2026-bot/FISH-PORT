import { create } from "zustand";

export const getDefaultFiscalYear = () => String(new Date().getFullYear());
export const MIN_FISCAL_YEAR = 2025;

export const getFiscalYearOptions = ({ minYear = MIN_FISCAL_YEAR, maxYear = new Date().getFullYear() + 2 } = {}) => {
  const endYear = Math.max(minYear, Number(maxYear));
  return Array.from({ length: endYear - minYear + 1 }, (_, index) => String(minYear + index));
};

export const isCurrentFiscalYear = (year) => String(year) === getDefaultFiscalYear();

export const getFiscalYearLockMessage = (year) =>
  year
    ? `Transactions in ${year} is for viewing only.`
    : "Transactions in this year is for viewing only.";

const normalizeFiscalYear = (value) => {
  const year = String(value ?? "").trim();
  return /^\d{4}$/.test(year) ? year : getDefaultFiscalYear();
};

export const FISCAL_YEAR_STORAGE_KEY = "opolFiscalYear";

export const readStoredFiscalYear = () => {
  if (typeof window === "undefined") return getDefaultFiscalYear();
  return normalizeFiscalYear(window.localStorage.getItem(FISCAL_YEAR_STORAGE_KEY));
};

export const writeStoredFiscalYear = (year) => {
  const normalizedYear = normalizeFiscalYear(year);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(FISCAL_YEAR_STORAGE_KEY, normalizedYear);
  }
  return normalizedYear;
};

export const useFiscalYearStore = create((set) => ({
  fiscalYear: readStoredFiscalYear(),
  setFiscalYear: (year) => {
    const normalizedYear = writeStoredFiscalYear(year);
    set({ fiscalYear: normalizedYear });
    return normalizedYear;
  },
}));
