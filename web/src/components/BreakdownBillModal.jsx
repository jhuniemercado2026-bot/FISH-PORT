import React, { useMemo } from "react";
import Modal from "./Modal";
import { formatMoneyValue, parseMoneyValue } from "../utils/money";

const FONT = "'Montserrat', sans-serif";

const formatReferenceNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-6).padStart(6, "0");
};

const getDatePartsFromValue = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  const timezoneMatch = raw.match(/[zZ]$|[+-]\d{2}:?\d{2}$/);

  if (timezoneMatch) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .reduce((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});

    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
    };
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return {
      year: Number(year),
      month: Number(month),
      day: Number(day),
    };
  }

  const fallback = new Date(value);
  if (Number.isNaN(fallback.getTime())) return null;
  return {
    year: fallback.getFullYear(),
    month: fallback.getMonth() + 1,
    day: fallback.getDate(),
  };
};

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const parts = getDatePartsFromValue(value);
  if (!parts) return String(value).slice(0, 10);
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const getBillItemDisplayType = (transactionType) =>
  transactionType === "docking"
    ? "Docking"
    : transactionType === "banyera"
      ? "Banyera"
      : "Transaction";

const getBillItemDisplayDate = (item, fallbackDate = "") => {
  const transactionType = String(item?.transaction_type || "").toLowerCase();

  if (transactionType === "docking") {
    return (
      item?.transaction_date ||
      item?.docking_date ||
      item?.docking?.docking_date ||
      fallbackDate
    );
  }

  if (transactionType === "banyera") {
    return (
      item?.transaction_date ||
      item?.banyera_transaction?.transaction_date ||
      item?.banyeraTransaction?.transaction_date ||
      item?.banyera_date ||
      fallbackDate
    );
  }

  return fallbackDate;
};

const BreakdownField = ({ children, align = "left" }) => (
  <div className="flex h-[46px] items-center rounded-[10px] border border-slate-200 bg-white px-3.5">
    <p
      className={`m-0 w-full truncate text-[13px] font-medium text-[#0d1117] ${align === "right" ? "text-right" : "text-left"}`}
      style={{ fontFamily: FONT, fontVariantNumeric: align === "right" ? "tabular-nums" : undefined }}
    >
      {children}
    </p>
  </div>
);

const FieldLabel = ({ children }) => (
  <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase" style={{ color: "#6F6F82", fontFamily: FONT }}>
    {children}
  </p>
);

const BreakdownBillModal = ({ open, bill, onClose }) => {
  const charges = useMemo(() => {
    if (!bill) return [];

    return (bill.items ?? [])
      .map((item, index) => {
        const transactionType = String(item?.transaction_type || "").toLowerCase();

        return {
          key: item?.bill_item_id ?? `${transactionType}-${index}`,
          type: getBillItemDisplayType(transactionType),
          date: getBillItemDisplayDate(item, bill?.created_at),
          amount: parseMoneyValue(item?.amount),
        };
      })
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  }, [bill]);

  if (!open || !bill) return null;

  const reference = formatReferenceNumber(bill.bill_reference_no) || "-";
  const totalAmount = parseMoneyValue(bill.total_amount);

  return (
    <Modal
      title="Billing Breakdown"
      onClose={onClose}
      closeOnBackdrop
      showFooter
      showFooterActions={false}
      footerLeftContent={
        <div className="text-left">
          <p
            className="m-0 text-left text-[11px] font-semibold uppercase"
            style={{ color: "#6F6F82", fontFamily: FONT }}
          >
            Total Billing
          </p>
          <p
            className="m-0 text-left text-[28px] font-bold leading-tight text-[#1a1f36]"
            style={{ fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}
          >
            {totalAmount.toLocaleString("en-PH", {
              style: "currency",
              currency: "PHP",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      }
      maxWidth="720px"
      bodyClassName="max-h-[72vh] overflow-y-auto !p-5"
    >
      <div className="grid grid-cols-1 gap-3">
        <div>
          <FieldLabel>Reference</FieldLabel>
          <BreakdownField>{reference}</BreakdownField>
        </div>

        <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-3">
          <div
            className="mb-2 grid gap-2 px-1 pr-3"
            style={{
              gridTemplateColumns:
                "minmax(150px,1fr) minmax(150px,0.9fr) minmax(130px,0.8fr)",
            }}
          >
            {["Type", "Date", "Amount (₱)"].map((label) => (
              <p
                key={label}
                className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "#6F6F82", fontFamily: FONT }}
              >
                {label}
              </p>
            ))}
          </div>

          {charges.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center rounded-[10px] border border-slate-200 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
              No billing items available.
            </div>
          ) : (
            <div
              className="max-h-[300px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}
            >
              {charges.map((charge) => (
                <div
                  key={charge.key}
                  className="mb-2 grid items-start gap-2 pr-3 last:mb-0"
                  style={{
                    gridTemplateColumns:
                      "minmax(150px,1fr) minmax(150px,0.9fr) minmax(130px,0.8fr)",
                  }}
                >
                  <BreakdownField>{charge.type}</BreakdownField>
                  <BreakdownField>{formatDisplayDate(charge.date)}</BreakdownField>
                  <BreakdownField align="right">
                    {formatMoneyValue(charge.amount)}
                  </BreakdownField>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </Modal>
  );
};

export default BreakdownBillModal;
