import React from "react";
import { IoChevronBackOutline } from "react-icons/io5";

const PdfViewerPanel = ({
  fileSource,
  isLoading = false,
  onBack,
  backLabel = "Back",
  height = "calc(100vh - 150px)",
}) => {
  return (
    <section className="w-full">
      {onBack ? (
        <div className="mb-3 flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cbd5e1] bg-white px-3 text-[13px] text-[#1a1f36] shadow-sm transition-colors hover:bg-slate-50"
          >
            <IoChevronBackOutline className="text-[15px]" />
            {backLabel}
          </button>
        </div>
      ) : null}

      <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
        {isLoading ? (
          <div
            className="flex items-center justify-center px-6 text-center text-[13px] text-slate-500"
            style={{ minHeight: height }}
          >
            Generating PDF preview...
          </div>
        ) : fileSource ? (
          <iframe
            key={String(fileSource)}
            src={fileSource}
            title="PDF preview"
            className="block w-full border-0"
            style={{ height, backgroundColor: "#f8fafc" }}
          />
        ) : (
          <div
            className="flex items-center justify-center px-6 text-center text-[13px] text-slate-500"
            style={{ minHeight: height }}
          >
            PDF preview is not available right now.
          </div>
        )}
      </div>
    </section>
  );
};

export default PdfViewerPanel;
