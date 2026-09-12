import React, { useMemo } from "react";
import Modal from "./Modal";
import { formatMoneyValue, parseMoneyValue } from "../utils/money";

const FONT = "'Montserrat', sans-serif";

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

const BreakdownRemittanceModal = ({ open, rows = [], totalAmount = 0, onClose }) => {
  const breakdownRows = useMemo(
    () =>
      (Array.isArray(rows) ? rows : []).map((row, index) => ({
        key: `${row?.transaction || "transaction"}-${row?.type_name || "type"}-${index}`,
        transaction: row?.transaction || "-",
        typeName: row?.type_name || row?.boat_name || row?.boatName || row?.boat_type || row?.vehicle_type || "-",
        cashReceived: parseMoneyValue(row?.cash_received),
      })),
    [rows],
  );

  if (!open) return null;

  return (
    <Modal
      title="Remittance Breakdown"
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
            Today's Collection
          </p>
          <p
            className="m-0 text-left text-[28px] font-bold leading-tight text-[#1a1f36]"
            style={{ fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}
          >
            {parseMoneyValue(totalAmount).toLocaleString("en-PH", {
              style: "currency",
              currency: "PHP",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      }
      maxWidth="760px"
      bodyClassName="max-h-[72vh] overflow-y-auto !p-5"
    >
      <div className="rounded-[10px] border border-slate-200 bg-slate-50/60 p-3">
        <div
          className="mb-2 grid gap-2 px-1 pr-3"
          style={{
            gridTemplateColumns:
              "minmax(150px,1fr) minmax(150px,0.95fr) minmax(140px,0.8fr)",
          }}
        >
          {["Transaction", "Boat Name/Vehicle Type", "Cash Received (₱)"].map((label) => (
            <p
              key={label}
              className="m-0 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "#6F6F82", fontFamily: FONT }}
            >
              {label}
            </p>
          ))}
        </div>

        {breakdownRows.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-[10px] border border-slate-200 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
            No collection breakdown available.
          </div>
        ) : (
          <div
            className="max-h-[320px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}
          >
            {breakdownRows.map((row) => (
              <div
                key={row.key}
                className="mb-2 grid items-start gap-2 pr-3 last:mb-0"
                style={{
                  gridTemplateColumns:
                    "minmax(150px,1fr) minmax(150px,0.95fr) minmax(140px,0.8fr)",
                }}
              >
                <BreakdownField>{row.transaction}</BreakdownField>
                <BreakdownField>{row.typeName}</BreakdownField>
                <BreakdownField align="right">
                  {formatMoneyValue(row.cashReceived)}
                </BreakdownField>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BreakdownRemittanceModal;
