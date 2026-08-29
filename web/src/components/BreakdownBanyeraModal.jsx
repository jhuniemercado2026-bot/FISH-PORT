import React, { useMemo } from "react";
import Modal from "./Modal";

const FONT = "'Montserrat', sans-serif";

const getClassificationName = (item) =>
  item?.classification?.classification_name ||
  item?.classification_name ||
  item?.classification_id ||
  "Unknown";

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

const BreakdownBanyeraModal = ({ open, transaction, onClose }) => {
  const rows = useMemo(() => {
    if (!transaction) return [];

    return (transaction.items ?? []).map((item, index) => {
      return {
        key: item?.item_id ?? index,
        classification: getClassificationName(item),
        quantity: Number(item?.quantity || 0),
        subtotal: Number(item?.subtotal || 0),
      };
    });
  }, [transaction]);

  if (!open || !transaction) return null;

  const reference = `BNY-${String(transaction.banyera_id ?? "").padStart(4, "0")}`;
  const totalAmount = Number(transaction.total_fee || 0);

  return (
    <Modal
      title="Banyera Breakdown"
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
            Total Banyera
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
                "minmax(150px,1fr) minmax(90px,0.55fr) minmax(130px,0.8fr)",
            }}
          >
            {["Classification", "Qty", "Subtotal"].map((label) => (
              <p
                key={label}
                className="m-0 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "#6F6F82", fontFamily: FONT }}
              >
                {label}
              </p>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center rounded-[10px] border border-slate-200 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
              No banyera items available.
            </div>
          ) : (
            <div
              className="max-h-[300px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}
            >
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="mb-2 grid items-start gap-2 pr-3 last:mb-0"
                  style={{
                    gridTemplateColumns:
                      "minmax(150px,1fr) minmax(90px,0.55fr) minmax(130px,0.8fr)",
                  }}
                >
                  <BreakdownField>{row.classification}</BreakdownField>
                  <BreakdownField align="right">
                    {Number(row.quantity || 0).toLocaleString("en-PH")}
                  </BreakdownField>
                  <BreakdownField align="right">
                    {Number(row.subtotal || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
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

export default BreakdownBanyeraModal;
