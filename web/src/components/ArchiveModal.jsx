import { useEffect, useState } from "react";
import { IoAlertCircleOutline, IoCloseOutline, IoWarningOutline } from "react-icons/io5";
import Spinner from "./Spinner";

const FONT = "'Montserrat', sans-serif";

const ArchiveModal = ({
  open,
  title = "Archive Record",
  itemName = "",
  onClose,
  onConfirm,
  saving,
  warningItems = [],
  fontFamily = FONT,
}) => {
  const [internalSaving, setInternalSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setInternalSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const archiving = typeof saving === "boolean" ? saving : internalSaving;

  const handleConfirm = async () => {
    if (typeof saving === "boolean") {
      onConfirm?.();
      return;
    }

    setInternalSaving(true);
    try {
      await onConfirm?.();
    } finally {
      setInternalSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(10,13,28,0.55)", backdropFilter: "blur(6px)" }}
      onMouseDown={(event) => {
        if (!archiving && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className="relative w-full overflow-hidden bg-white"
        style={{
          maxWidth: 400,
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          fontFamily,
          animation: "archiveModalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <style>{`@keyframes archiveModalPop{from{opacity:0;transform:scale(0.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <button
          type="button"
          onClick={onClose}
          disabled={archiving}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-none bg-transparent text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Close"
        >
          <IoCloseOutline className="text-[22px]" />
        </button>

        <div className="flex flex-col items-center px-6 pb-5 pt-8 text-center">
          <div
            className="mb-5 flex items-center justify-center"
            style={{ width: 68, height: 68, borderRadius: 18, backgroundColor: "#fef2f2" }}
          >
            <IoWarningOutline style={{ fontSize: 36, color: "#dc2626" }} />
          </div>
          <p className="m-0 mb-2 text-[18px] font-bold" style={{ color: "#0d1117" }}>
            {title}
          </p>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: "#64748b" }}>
            Are you sure you want to archive{" "}
            <span className="font-bold" style={{ color: "#1a1f36" }}>
              "{itemName}"
            </span>
            ?
          </p>
        </div>

        {warningItems.length > 0 ? (
          <div className="mx-6 mb-4 overflow-hidden rounded-xl border border-red-200 bg-red-50">
            <div className="flex flex-col gap-1.5 px-4 py-3">
              {warningItems.map((warning, index) => {
                const WarningIcon = warning.icon ?? IoAlertCircleOutline;
                return (
                  <div key={`${warning.text}-${index}`} className="flex items-center gap-2">
                    <WarningIcon className="text-[13px] text-[#dc2626] flex-shrink-0" />
                    <p className="m-0 text-[13px] leading-relaxed text-[#dc2626]">
                      {warning.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex gap-3 px-6 pb-8">
          <button
            onClick={onClose}
            disabled={archiving}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-gray-50"
            style={{ fontFamily, color: "#1a1f36" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={archiving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white cursor-pointer transition-colors"
            style={{
              fontFamily,
              backgroundColor: archiving ? "#fca5a5" : "#dc2626",
              border: "none",
              minWidth: 108,
            }}
            onMouseEnter={(e) => {
              if (!archiving) e.currentTarget.style.backgroundColor = "#b91c1c";
            }}
            onMouseLeave={(e) => {
              if (!archiving) e.currentTarget.style.backgroundColor = "#dc2626";
            }}
          >
            {archiving ? <Spinner size={4} /> : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchiveModal;
