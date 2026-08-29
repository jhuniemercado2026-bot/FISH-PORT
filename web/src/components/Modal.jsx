import React, { useEffect, useRef, useState } from "react";
import { IoAlertCircleOutline, IoCloseOutline } from "react-icons/io5";
import "typeface-montserrat";
import Spinner from "./Spinner";
import { SkeletonLoadingProvider } from "./SkeletonLoadingContext";

const FONT = "'Montserrat', sans-serif";

export const ModalFieldError = ({ message }) => (
  message ? (
    <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 font-normal">
      <IoAlertCircleOutline className="flex-shrink-0 text-[14px] text-red-400" />
      <p className="m-0 text-[12px] font-normal text-red-600" style={{ fontFamily: FONT }}>
        {message}
      </p>
    </div>
  ) : null
);

export const ModalTextInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  rightAdornment = null,
  error = "",
  inputClassName = "",
  inputStyle = {},
  labelClassName = "",
  labelStyle = {},
  disabled = false,
  containerClassName = "",
  wrapperClassName = "",
  ...inputProps
}) => {
  const isReadOnly = disabled || inputProps.readOnly;
  const visibleError = isReadOnly ? "" : error;

  return (
  <div className={containerClassName}>
    <p
      className={`m-0 mb-2 text-[11px] font-semibold uppercase ${labelClassName}`.trim()}
      style={{ color: "#6F6F82", ...labelStyle }}
    >
      {label}
    </p>
    <div
      className={`modal-input-shell flex h-[46px] items-center gap-3 rounded-[10px] border bg-white px-4 transition-all focus-within:border-[#4096ff] ${visibleError ? "border-red-300" : "border-slate-200"} ${disabled ? "bg-slate-50" : ""} ${wrapperClassName}`.trim()}
    >
      <input
        type={type}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        {...inputProps}
        className={`w-full border-none bg-transparent text-left text-[14px] font-medium text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-500 ${inputClassName} ${disabled ? "cursor-not-allowed opacity-60" : ""}`.trim()}
        style={{ fontFamily: FONT, ...inputStyle }}
      />
      {rightAdornment}
    </div>
    <ModalFieldError message={visibleError} />
  </div>
  );
};

const Modal = ({
  title,
  onClose,
  onCancel,
  onSave,
  closeOnBackdrop = false,
  saving = false,
  saveDisabled = false,
  children,
  saveLabel = "Save",
  savingLabel = "",
  saveButtonWidth = "103px",
  closeLabel = "Cancel",
  closeButtonWidth,
  maxWidth = "560px",
  minimumSavingMs = 2000,
  showSavingSpinner = true,
  showFooter = true,
  showFooterActions = true,
  footerLeftContent = null,
  footerRightContent = null,
  bodyClassName = "",
  contentClassName = "",
}) => {
  const [internalSaving, setInternalSaving] = useState(false);
  const [externalSavingVisible, setExternalSavingVisible] = useState(false);
  const externalSavingStartRef = useRef(0);
  const externalSavingTimeoutRef = useRef(null);
  const isSaving = internalSaving || externalSavingVisible;

  useEffect(() => {
    if (externalSavingTimeoutRef.current) {
      window.clearTimeout(externalSavingTimeoutRef.current);
      externalSavingTimeoutRef.current = null;
    }

    if (saving) {
      externalSavingStartRef.current = Date.now();
      setExternalSavingVisible(true);
      return undefined;
    }

    if (!externalSavingVisible) {
      return undefined;
    }

    const elapsed = Date.now() - externalSavingStartRef.current;
    const remaining = Math.max(minimumSavingMs - elapsed, 0);

    if (remaining === 0) {
      setExternalSavingVisible(false);
      return undefined;
    }

    externalSavingTimeoutRef.current = window.setTimeout(() => {
      setExternalSavingVisible(false);
      externalSavingTimeoutRef.current = null;
    }, remaining);

    return () => {
      if (externalSavingTimeoutRef.current) {
        window.clearTimeout(externalSavingTimeoutRef.current);
        externalSavingTimeoutRef.current = null;
      }
    };
  }, [saving, externalSavingVisible, minimumSavingMs]);

  useEffect(() => () => {
    if (externalSavingTimeoutRef.current) {
      window.clearTimeout(externalSavingTimeoutRef.current);
    }
  }, []);

  const handleSave = async () => {
    if (isSaving || saveDisabled || !onSave) return;

    try {
      const result = onSave();

      if (result && typeof result.then === "function") {
        const startedAt = Date.now();
        setInternalSaving(true);
        await result;
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(minimumSavingMs - elapsed, 0);
        if (remaining > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remaining));
        }
      }
    } finally {
      setInternalSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (closeOnBackdrop && !isSaving && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <style>{`
        .universal-modal-scroll-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .universal-modal-scroll-hide::-webkit-scrollbar {
          display: none;
        }
        .universal-modal-shell .modal-input-shell:focus-within {
          border-color: #4096ff !important;
          box-shadow: none !important;
        }
        .universal-modal-shell .modal-field-control-error .modal-input-shell,
        .universal-modal-shell .modal-field-control-error textarea,
        .universal-modal-shell .modal-field-control-error input:not([type="hidden"]),
        .universal-modal-shell .modal-field-control-error .ant-picker,
        .universal-modal-shell .modal-field-control-error .ant-select-selector {
          border-color: #fca5a5 !important;
          box-shadow: none !important;
        }
        .universal-modal-shell input::placeholder,
        .universal-modal-shell textarea::placeholder,
        .universal-modal-shell .ant-picker-input > input::placeholder,
        .universal-modal-shell .ant-select-selection-search-input::placeholder {
          color: #64748b !important;
          opacity: 1 !important;
          font-weight: 400 !important;
        }
        .universal-modal-shell input,
        .universal-modal-shell textarea,
        .universal-modal-shell .ant-picker-input > input,
        .universal-modal-shell .ant-select-selection-item,
        .universal-modal-shell .ant-select-selection-search-input {
          color: #334155 !important;
          font-weight: 500 !important;
        }
        .universal-modal-shell .ant-select-selection-placeholder {
          color: #64748b !important;
          opacity: 1 !important;
          font-weight: 400 !important;
        }
        .universal-modal-shell .ant-picker,
        .universal-modal-shell .ant-select-single .ant-select-selector {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }
        .universal-modal-shell .ant-picker-input > input,
        .universal-modal-shell .ant-select-selection-item,
        .universal-modal-shell .ant-select-selection-placeholder,
        .universal-modal-shell .ant-select-selection-search-input {
          text-align: left !important;
        }
        .universal-modal-shell .ant-select-selection-item,
        .universal-modal-shell .ant-select-selection-placeholder {
          left: 0 !important;
          padding-inline-start: 0 !important;
          padding-inline-end: 0 !important;
        }
        .universal-modal-shell .ant-select-selection-search {
          inset-inline-start: 0 !important;
          inset-inline-end: 0 !important;
        }
        .universal-modal-shell .ant-select-focused .ant-select-selector,
        .universal-modal-shell .ant-select-open .ant-select-selector,
        .universal-modal-shell .ant-picker-focused,
        .universal-modal-shell textarea:focus {
          border-color: #4096ff !important;
          box-shadow: none !important;
        }
        .universal-modal-shell .modal-field-control-error .modal-input-shell,
        .universal-modal-shell .modal-field-control-error textarea,
        .universal-modal-shell .modal-field-control-error input:not([type="hidden"]),
        .universal-modal-shell .modal-field-control-error .ant-picker,
        .universal-modal-shell .modal-field-control-error .ant-select-selector {
          border-color: #fca5a5 !important;
          box-shadow: none !important;
        }
      `}</style>
      <div
        className="universal-modal-shell w-full overflow-hidden rounded-[10px] bg-white shadow-2xl"
        style={{ maxWidth, fontFamily: FONT }}
      >
        <div className="flex items-center justify-between px-8 pb-2 pt-4">
          <h3 className="m-0 text-[20px] font-bold text-[#1a1f36]">{title}</h3>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="ml-4 flex h-10 w-10 flex-shrink-0 items-center justify-center border-none bg-transparent p-0 text-[#1a1f36] cursor-pointer disabled:cursor-not-allowed"
            style={{ opacity: isSaving ? 0.5 : 1 }}
          >
            <IoCloseOutline className="text-[24px]" />
          </button>
        </div>
        <div className="border-t border-slate-200" />
        <SkeletonLoadingProvider loading={false}>
          <div className={`universal-modal-scroll-hide max-h-[70vh] overflow-y-auto px-8 pb-5 pt-5 ${bodyClassName}`.trim()}>
            <div className={`flex flex-col gap-5 ${contentClassName}`.trim()}>{children}</div>
          </div>
        </SkeletonLoadingProvider>
        {showFooter ? (
          <div className="flex flex-col gap-4 border-t border-slate-200 px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
            {footerLeftContent ? <div className="min-w-0">{footerLeftContent}</div> : <div />}
            {footerRightContent ? (
              <div className="ml-auto min-w-0">{footerRightContent}</div>
            ) : showFooterActions ? (
            <div className="flex justify-end gap-3">
              <button
                onClick={onCancel ?? onClose}
                disabled={isSaving}
                className="cursor-pointer rounded-[10px] bg-white px-6 py-3 text-[14px] font-semibold transition-colors"
                style={{
                  border: "2px solid #1a1f36",
                  color: "#1a1f36",
                  fontFamily: FONT,
                  width: closeButtonWidth,
                  opacity: isSaving ? 0.5 : 1,
                }}
              >
                {closeLabel}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || saveDisabled}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d3561]"
                style={{
                  width: saveButtonWidth,
                  backgroundColor: "#1a1f36",
                  fontFamily: FONT,
                  opacity: isSaving || saveDisabled ? 0.7 : 1,
                }}
              >
                {isSaving ? (
                  showSavingSpinner ? (
                  <>
                    <Spinner size={4} />
                    {savingLabel ? <span>{savingLabel}</span> : null}
                  </>
                  ) : (
                    savingLabel || saveLabel
                  )
                ) : saveLabel}
              </button>
            </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Modal;
