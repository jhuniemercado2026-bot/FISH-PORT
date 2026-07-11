import React from "react";
import {
  IoCheckmarkOutline,
  IoCloseOutline,
  IoInformationCircleOutline,
} from "react-icons/io5";
import { hideBottomToast, useBottomToastStore } from "../store/bottomToastStore";

const FONT = "'Montserrat', sans-serif";
const NO_CHANGES_TITLE = "No Changes Made";
const NO_CHANGES_MESSAGE = "No changes were made. The record remains the same.";
const BOAT_UPDATED_TITLE = "Boat Updated";
const BOAT_UPDATED_MESSAGE = "Boat details have been updated successfully.";

const BottomToast = () => {
  const { open, type, title, message } = useBottomToastStore();

  if (!open) return null;

  const config = {
    success: { bg: "#22c55e", Icon: IoCheckmarkOutline },
    error: { bg: "#ef4444", Icon: IoCloseOutline },
    info: { bg: "#3b82f6", Icon: IoInformationCircleOutline },
  };

  const current = config[type] ?? config.success;
  const normalizedTitle = String(title ?? "").trim();
  const normalizedMessage = String(message ?? "").trim();
  const isNoChangesToast =
    type === "info" &&
    normalizedTitle === NO_CHANGES_TITLE;
  const isBoatUpdatedToast =
    type === "success" &&
    normalizedTitle === BOAT_UPDATED_TITLE;
  const displayTitle =
    isNoChangesToast ? NO_CHANGES_TITLE : isBoatUpdatedToast ? BOAT_UPDATED_TITLE : title;
  const displayMessage =
    isNoChangesToast ? NO_CHANGES_MESSAGE : isBoatUpdatedToast ? BOAT_UPDATED_MESSAGE : message;

  return (
    <div
      className="fixed z-[9999] flex items-center gap-4"
      style={{
        bottom: 32,
        right: 32,
        minWidth: 340,
        maxWidth: 420,
        backgroundColor: current.bg,
        borderRadius: 16,
        padding: "18px 22px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        fontFamily: FONT,
      }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 46, height: 46, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.25)" }}
      >
        <current.Icon style={{ fontSize: 26, color: "#fff" }} />
      </div>
      <div className="flex-1">
        <p className="m-0 text-[15px] font-bold text-white">{displayTitle}</p>
        <p className="m-0 mt-0.5 text-[13px] font-medium text-white/85">{displayMessage}</p>
      </div>
      <button
        onClick={hideBottomToast}
        className="border-none bg-transparent text-white cursor-pointer"
        aria-label="Close toast"
      >
        <IoCloseOutline style={{ fontSize: 18 }} />
      </button>
    </div>
  );
};

export default BottomToast;
