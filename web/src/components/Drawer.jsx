import React from "react";
import { Drawer as AntDrawer } from "antd";
import { IoCloseOutline } from "react-icons/io5";
import "typeface-montserrat";

const DEFAULT_FONT = "'Montserrat', sans-serif";

export const DrawerSection = ({
  icon: Icon,
  title,
  subtitle,
  children,
  fontFamily = DEFAULT_FONT,
}) => (
  <div
    className="bg-white overflow-hidden mb-4"
    style={{
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    }}
  >
    <div
      className="flex items-center gap-3 px-5 py-3.5"
      style={{ borderBottom: "1px solid #e5e7eb" }}
    >
      {Icon ? (
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Icon className="text-blue-500 text-[18px]" />
        </div>
      ) : null}
      <div>
        <p
          className="m-0 text-[13px] font-medium uppercase"
          style={{ color: "#1a1f36", fontFamily }}
        >
          {title}
        </p>
        {subtitle ? (
          <p
            className="m-0 text-[11px] text-slate-500"
            style={{ fontFamily }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

export const DrawerInfoCard = ({ label, value, className = "", indicatorColor }) => (
  <div
    className={`px-4 py-3 ${className}`.trim()}
    style={{
      backgroundColor: "#f8fafc",
      border: "1px solid #e5e7eb",
      borderRadius: 10,
    }}
  >
    <p
      className="m-0 text-[11px] font-semibold uppercase"
      style={{ color: "#6F6F82" }}
    >
      {label}
    </p>
    <div className="mt-1 flex items-center gap-2 break-words text-[13px] font-medium text-slate-700">
      {indicatorColor ? (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: indicatorColor }}
          aria-hidden="true"
        />
      ) : null}
      <span>{value}</span>
    </div>
  </div>
);

const Drawer = ({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  width = 460,
  fontFamily = DEFAULT_FONT,
  closeIcon: CloseIcon = IoCloseOutline,
  onCloseButtonClick,
}) => (
  <AntDrawer
    open={open}
    onClose={onClose}
    width={width}
    closable={false}
    styles={{
      body: { padding: 0, fontFamily, backgroundColor: "#f8fafc" },
      header: { display: "none" },
    }}
  >
    <div
      className="flex items-center justify-between px-5 py-4"
      style={{ backgroundColor: "#1a1f36" }}
    >
      <div className="flex items-center gap-3">
        {Icon ? (
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <Icon className="text-white text-[18px]" />
          </div>
        ) : null}
        <div>
          <p className="m-0 text-[14px] font-medium text-white uppercase">
            {title}
          </p>
          {subtitle ? (
            <p className="m-0 text-[11px] text-white/60">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <button
        onClick={onCloseButtonClick || onClose}
        className="flex items-center justify-center border-none cursor-pointer transition-colors"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.1)",
          color: "#fff",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")
        }
      >
        <CloseIcon style={{ fontSize: 17 }} />
      </button>
    </div>

    <div
      className="modal-hide-scrollbar p-5 overflow-y-auto"
      style={{ maxHeight: "calc(100vh - 84px)", scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {children}
    </div>
  </AntDrawer>
);

export default Drawer;
