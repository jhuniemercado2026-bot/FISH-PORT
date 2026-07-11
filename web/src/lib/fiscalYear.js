import { readStoredFiscalYear } from "../store/fiscalYearStore";

const getYear = (value) => {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(\d{4})/);
  return match ? match[1] : "";
};

export const isCurrentFiscalYear = (year) => String(year) === String(new Date().getFullYear());

export const recordMatchesFiscalYear = (record, fields, fiscalYear = readStoredFiscalYear()) => {
  if (!record || !fiscalYear) return true;

  return fields.some((field) => {
    const value = field.split(".").reduce((current, key) => current?.[key], record);
    return getYear(value) === String(fiscalYear);
  });
};

export const filterByFiscalYear = (records, fields, fiscalYear = readStoredFiscalYear()) => {
  if (!Array.isArray(records)) return [];
  return records.filter((record) => recordMatchesFiscalYear(record, fields, fiscalYear));
};

export const buildFiscalMeta = (meta, records, fallback = {}) => {
  if (meta) return meta;

  return {
    ...fallback,
    current_page: 1,
    last_page: 1,
    total: records.length,
    from: records.length ? 1 : 0,
    to: records.length,
  };
};

const OPERATIONAL_DATE_FIELDS = new Set([
  "billing_date",
  "date_billed",
  "docking_date",
  "transaction_date",
  "payment_date",
  "ticket_date",
  "end_date",
  "remittance_date",
  "date",
  "effective_from",
  "effective_to",
]);

const OPERATIONAL_YEAR_PART_FIELDS = new Set([
  "billing_date_year",
  "date_billed_year",
  "docking_date_year",
  "transaction_date_year",
  "payment_date_year",
  "ticket_date_year",
  "end_date_year",
  "remittance_date_year",
  "effective_from_year",
  "effective_to_year",
]);

export const applyFiscalYearToPayloadDates = (value, fiscalYear = readStoredFiscalYear()) => {
  if (!value || !fiscalYear) return value;
  if (Array.isArray(value)) return value.map((item) => applyFiscalYearToPayloadDates(item, fiscalYear));
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (OPERATIONAL_DATE_FIELDS.has(key) && typeof entryValue === "string" && /^\d{4}-\d{2}-\d{2}/.test(entryValue)) {
        return [key, `${fiscalYear}${entryValue.slice(4)}`];
      }

      if (OPERATIONAL_YEAR_PART_FIELDS.has(key) && entryValue) {
        return [key, fiscalYear];
      }

      if (Array.isArray(entryValue)) {
        return [key, entryValue.map((item) => applyFiscalYearToPayloadDates(item, fiscalYear))];
      }

      return [key, entryValue];
    })
  );
};

export const OPERATIONAL_FISCAL_ENDPOINT_PATTERN =
  /^\/(?:banyera-transactions|bills|dockings|payments|record-payment|remittances|vehicle-tickets|daily-vehicle-tickets|annual-vehicle-tickets|vehicle-types|billing|create-billing|fees)(?:\/|$)/;
