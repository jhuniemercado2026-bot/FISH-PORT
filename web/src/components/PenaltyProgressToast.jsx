import { IoCheckmarkOutline, IoCloseOutline, IoSyncOutline } from "react-icons/io5";
import { dismissPenaltyProgress, usePenaltyToggleStore } from "../store/penaltyToggleStore";

export default function PenaltyProgressToast() {
  const operation = usePenaltyToggleStore((state) => state.operation);
  if (!operation) return null;
  const running = operation.status === "running";
  const failed = operation.status === "error";
  const Icon = running ? IoSyncOutline : failed ? IoCloseOutline : IoCheckmarkOutline;
  return <div role={failed ? "alert" : "status"} aria-live="polite"
    className="fixed bottom-4 right-4 z-[10000] w-[400px] max-w-[calc(100vw-32px)] rounded-2xl p-5 text-white shadow-2xl sm:bottom-8 sm:right-8"
    style={{ backgroundColor: failed ? "#ef4444" : running ? "#3b82f6" : "#22c55e", fontFamily: "'Montserrat', sans-serif" }}>
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Icon aria-hidden="true" className={`text-[23px] ${running ? "animate-spin" : ""}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14px] font-bold leading-5">{running ? `Turning Penalty ${operation.target ? "On" : "Off"}` : failed ? "Penalty Update Failed" : "Penalty Updated"}</p>
        <p className="m-0 break-words text-[12px] leading-4 text-white/85">{operation.name}</p>
      </div>
      {!running && <button type="button" onClick={dismissPenaltyProgress} aria-label="Close penalty progress" className="cursor-pointer border-none bg-transparent text-white"><IoCloseOutline size={18} /></button>}
    </div>
    <div className="mt-4 flex items-start justify-between gap-4">
      <p className="m-0 min-w-0 text-[12px] leading-5 text-white/90">{operation.message}</p>
      {!failed && <span className="shrink-0 text-[13px] font-semibold leading-5 tabular-nums">{operation.progress}%</span>}
    </div>
    {!failed && <>
      <div role="progressbar" aria-label="Penalty update progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={operation.progress} className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${operation.progress}%` }} />
      </div>
    </>}
  </div>;
}
