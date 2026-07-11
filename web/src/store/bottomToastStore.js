import { create } from "zustand";

let dismissTimer = null;

const clearDismissTimer = () => {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
};

export const useBottomToastStore = create((set) => ({
  open: false,
  type: "success",
  title: "",
  message: "",

  showToast: ({ type = "success", title = "", message = "", duration = 5000 }) => {
    clearDismissTimer();

    set({
      open: true,
      type,
      title,
      message,
    });

    dismissTimer = setTimeout(() => {
      set({ open: false });
      dismissTimer = null;
    }, duration);
  },

  hideToast: () => {
    clearDismissTimer();
    set({ open: false });
  },
}));

export const showBottomToast = (type, title, message, duration = 5000) =>
  useBottomToastStore.getState().showToast({ type, title, message, duration });

export const hideBottomToast = () => useBottomToastStore.getState().hideToast();

export const showSuccessToast = (title, message, duration = 5000) =>
  showBottomToast("success", title, message, duration);

export const showErrorToast = (title, message, duration = 5000) =>
  showBottomToast("error", title, message, duration);

export const showInfoToast = (title, message, duration = 5000) =>
  showBottomToast("info", title, message, duration);

export const showNoChangesToast = (duration = 5000) =>
  showInfoToast("No Changes Made", "No changes were made. The record remains the same.", duration);

const buildToastEntityLabel = (value, fallback = "Record") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

export const showAddedToast = (
  titleEntity,
  messageEntity = titleEntity,
  duration = 5000
) => {
  const normalizedTitleEntity = buildToastEntityLabel(titleEntity);
  const normalizedMessageEntity = buildToastEntityLabel(messageEntity).toLowerCase();
  return showSuccessToast(
    `${normalizedTitleEntity} Added`,
    `The ${normalizedMessageEntity} was added successfully.`,
    duration
  );
};

export const showUpdatedToast = (
  titleEntity,
  messageEntity = titleEntity,
  duration = 5000
) => {
  const normalizedTitleEntity = buildToastEntityLabel(titleEntity);
  const normalizedMessageEntity = buildToastEntityLabel(messageEntity).toLowerCase();
  return showSuccessToast(
    `${normalizedTitleEntity} Updated`,
    `The ${normalizedMessageEntity} was updated successfully.`,
    duration
  );
};

export const showBoatUpdatedToast = (duration = 5000) =>
  showUpdatedToast("Boat", "boat details", duration);
