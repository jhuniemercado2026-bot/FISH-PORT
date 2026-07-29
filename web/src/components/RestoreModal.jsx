import { useEffect, useState } from "react";
import { IoCloseOutline, IoWarningOutline } from "react-icons/io5";
import Spinner from "./Spinner";

const FONT = "'Montserrat', sans-serif";

const RestoreModal = ({
  open,
  title = "Restore Record",
  itemName = "",
  onClose,
  onConfirm,
  saving,
  fontFamily = FONT,
}) => {
  const [internalSaving, setInternalSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setInternalSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const restoring = typeof saving === "boolean" ? saving : internalSaving;

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
        if (!restoring && event.target === event.currentTarget) {
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
          animation: "restoreModalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <style>{`@keyframes restoreModalPop{from{opacity:0;transform:scale(0.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <button
          type="button"
          onClick={onClose}
          disabled={restoring}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-none bg-transparent text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Close"
        >
          <IoCloseOutline className="text-[22px]" />
        </button>

        <div className="flex flex-col items-center px-6 pb-5 pt-8 text-center">
          <div
            className="mb-5 flex items-center justify-center"
            style={{ width: 68, height: 68, borderRadius: 18, backgroundColor: "#eff6ff" }}
          >
            <IoWarningOutline style={{ fontSize: 36, color: "#2563eb" }} />
          </div>
          <p className="m-0 mb-2 text-[18px] font-bold" style={{ color: "#0d1117" }}>
            {title}
          </p>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: "#64748b" }}>
            Are you sure you want to restore{" "}
            <span className="font-bold" style={{ color: "#1a1f36" }}>
              "{itemName}"
            </span>
            ?
          </p>
        </div>

        <div className="flex gap-3 px-6 pb-8">
          <button
            onClick={onClose}
            disabled={restoring}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-gray-50"
            style={{ fontFamily, color: "#1a1f36" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={restoring}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white cursor-pointer transition-colors"
            style={{
              fontFamily,
              backgroundColor: restoring ? "#1a1f36" : "#1a1f36",
              border: "none",
              minWidth: 108,
              opacity: restoring ? 0.7 : 1,
            }}
            onMouseEnter={(event) => {
              if (!restoring) event.currentTarget.style.backgroundColor = "#2d3561";
            }}
            onMouseLeave={(event) => {
              if (!restoring) event.currentTarget.style.backgroundColor = "#1a1f36";
            }}
          >
            {restoring ? <Spinner size={4} /> : "Restore"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestoreModal;
