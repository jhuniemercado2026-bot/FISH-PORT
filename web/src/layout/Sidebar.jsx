import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "typeface-montserrat";
import "@fontsource/anton";
import {
  IoHomeOutline,
  IoNotificationsOutline,
  IoBoatOutline,
  IoCarOutline,
  IoFishOutline,
  IoCashOutline,
  IoLogOutOutline,
  IoPeopleOutline,
    IoChevronDownOutline,
    IoChevronUpOutline,
  IoPersonOutline,
  IoAddOutline,
  IoCalendarOutline,
  IoListOutline,
  IoPricetagOutline,
  IoReceiptOutline,
  IoCardOutline,
  IoBarChartOutline,
  IoSettingsOutline,
  IoDocumentTextOutline,
  IoStatsChartOutline,
  IoArchiveOutline,
  IoTimeOutline,
  IoMailOutline ,
} from "react-icons/io5";
import { logoutUser } from "../pages/login/logout";
import Spinner from "../components/Spinner";


const LOGO_SRC = "/images/opol_fish_port.png";
const SIDEBAR_SCROLL_KEY = "superadmin-sidebar-scroll-top";

// ── Logout Modal ──────────────────────────────────────────────────────────────
const LogoutModal = ({ onConfirm, onCancel, isLoading }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div className="rounded-2xl p-8 flex flex-col items-center gap-5 mx-4 w-full max-w-sm bg-white shadow-2xl">
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[#1a1f36]">
        <IoLogOutOutline className="text-3xl text-white" />
      </div>
      <div className="text-center">
        <p className="text-base font-bold mb-1 text-[#1a1f36]">Sign Out</p>
        <p className="text-sm text-gray-500">Are you sure you want to sign out of your account?</p>
      </div>
      <div className="flex gap-3 w-full">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 py-2.5 rounded-xl text-sm font-normal bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ border: "2px solid #1a1f36", color: "#1a1f36", fontFamily: "'Montserrat', sans-serif", opacity: isLoading ? 0.5 : 1 }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-normal bg-[#1a1f36] text-white disabled:cursor-not-allowed disabled:opacity-80"
        >
          {isLoading ? <Spinner size={16} className="text-white" /> : "Sign Out"}
        </button>
      </div>
    </div>
  </div>
);

// ── Collapsible menu item ─────────────────────────────────────────────────────
const CollapseMenuItem = ({ icon: Icon, label, subItems, activeItem, setActiveItem, onSubItemClick, onSubItemHover, isExpanded }) => {
  const isAnyChildActive = subItems.some((s) => s.label === activeItem);
  const [open, setOpen] = useState(isAnyChildActive);

  useEffect(() => {
    if (isAnyChildActive) setOpen(true);
  }, [isAnyChildActive]);

  return (
    <div className="my-1">
      <button
        onClick={() => isExpanded && setOpen((v) => !v)}
        className={`w-full flex items-center border-l-4 py-2.5 transition-all duration-150 text-left ${
          isExpanded ? "gap-3 pl-3 pr-4" : "justify-center px-0"
        } ${
          isAnyChildActive
            ? "border-white bg-white/10 text-white font-semibold"
            : "border-transparent bg-transparent text-white/50 font-normal hover:bg-white/[0.06] hover:text-white/80"
        }`}
      >
        <Icon className="text-lg flex-shrink-0" />
        {isExpanded && (
          <>
              <span className="flex-1 whitespace-nowrap overflow-hidden">{label}</span>
              <span className="flex items-center flex-shrink-0">
                {open ? (
                  <IoChevronUpOutline className="text-[18px]" />
                ) : (
                  <IoChevronDownOutline className="text-[18px]" />
                )}
              </span>
            </>
          )}
      </button>

      {isExpanded && (
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: open ? "300px" : "0px" }}
        >
          {subItems.map(({ icon: SubIcon, label: subLabel }) => {
            const isActive = activeItem === subLabel;
            return (
              <button
                key={subLabel}
                onMouseEnter={() => onSubItemHover?.(subLabel)}
                onClick={() => {
                  setActiveItem(subLabel);
                  if (onSubItemClick) onSubItemClick(subLabel);
                }}
                className={`w-full flex items-center gap-3 border-l-4 py-2.5 pl-9 pr-4 transition-all duration-150 text-left text-sm my-1 ${
                  isActive
                    ? "border-white bg-white/10 text-white font-semibold"
                    : "border-transparent bg-transparent text-white/50 font-normal hover:bg-white/[0.06] hover:text-white/80"
                }`}
              >
                <SubIcon className="text-lg flex-shrink-0" />
                <span className="whitespace-nowrap overflow-hidden">{subLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Plain menu item ───────────────────────────────────────────────────────────
const MenuItem = ({ icon: Icon, label, isActive, onClick, onHover, isExpanded }) => (
  <button
    onMouseEnter={onHover}
    onClick={onClick}
    className={`w-full flex items-center border-l-4 py-2.5 transition-all duration-150 text-left my-1 ${
      isExpanded ? "gap-3 pl-3 pr-4" : "justify-center px-0"
    } ${
      isActive
        ? "border-white bg-white/10 text-white font-semibold"
        : "border-transparent bg-transparent text-white/50 font-normal hover:bg-white/[0.06] hover:text-white/80"
    }`}
  >
    <Icon className="text-lg flex-shrink-0" />
    {isExpanded && <span className="whitespace-nowrap overflow-hidden">{label}</span>}
  </button>
);

// ── Sidebar ───────────────────────────────────────────────────────────────────
const Sidebar = ({
  activeItem,
  setActiveItem,
  open = true,
  onClose,
  collapsed = false,
  onWidthChange,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hovered, setHovered] = useState(false);
  const navRef = useRef(null);
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  const isCoordinator = normalizedRole === "coordinator";

  useEffect(() => {
    if (!collapsed) setHovered(false);
  }, [collapsed]);

  const isExpanded = !collapsed || hovered;
  const sidebarWidth = isExpanded ? 256 : 72;

  useLayoutEffect(() => {
    if (onWidthChange && open && typeof window !== "undefined" && window.innerWidth >= 1024) {
      onWidthChange(sidebarWidth);
    }
  }, [sidebarWidth, open, onWidthChange]);

  useEffect(() => {
    const navElement = navRef.current;
    if (!navElement || typeof window === "undefined") return undefined;

    const savedScrollTop = window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (savedScrollTop !== null) {
      navElement.scrollTop = Number(savedScrollTop) || 0;
    }

    const handleScroll = () => {
      window.sessionStorage.setItem(
        SIDEBAR_SCROLL_KEY,
        String(navElement.scrollTop),
      );
    };

    navElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => navElement.removeEventListener("scroll", handleScroll);
  }, []);

  const confirmLogout = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);

    try {
      await logoutUser();
      navigate("/login", { replace: true });
    } catch (error) {
      setIsSigningOut(false);
    }
  };

  const navigateIfNeeded = (path) => {
    if (!path) return;
    if (location.pathname === path && !location.search && !location.state) return;
    navigate(path, { replace: location.pathname === path, state: null });
  };

  const activeLabelFromPath = (() => {
    const pathname = location.pathname;
    const boatRegisteredPath = "/registered-boats";
    const boatTypePath = "/boat-type";
    const boatOwnersPath = "/boat-owners";
    const addBoatPath = "/add-boat";
    const dashboardPath = "/dashboard";
    const settingsPath = "/settings";
    const dockingPath = "/docking";
    const dockingCalendarPath = "/docking-calendar";
    const banyeraPath = "/banyera";
    const fishClassificationPath = "/fish-classification";
    const vehicleTicketsPath = "/daily-vehicle-tickets";
    const annualVehicleTicketsPath = "/annual-vehicle-tickets";
    const vehicleTypesPath = "/vehicle-types";
    const billingPath = "/billing";
    const billingPaymentsPath = "/billing-payments";
    const collectionsPath = "/collections";
    const soaPath = "/owner-statement";
    const reportsPath = "/reports";
    const remittancePath = "/remittance";
    const archivesPath = "/archives";

    const pathMap = new Map([
      [dashboardPath, "Dashboard"],
      [boatRegisteredPath, "Boat Management"],
      [boatTypePath, "Boat Management"],
      [boatOwnersPath, "Boat Management"],
      [addBoatPath, "Boat Management"],
      [dockingPath, "Docking"],
      [dockingCalendarPath, "Docking"],
      [banyeraPath, "Banyera"],
      [fishClassificationPath, "Banyera"],
      ["/vehicle-tickets", "Vehicle Tickets"],
      [vehicleTicketsPath, "Vehicle Tickets"],
      [annualVehicleTicketsPath, "Vehicle Tickets"],
      [vehicleTypesPath, "Vehicle Tickets"],
      [billingPath, "Billing"],
      [billingPaymentsPath, "Billing"],
      [collectionsPath, "Collections"],
      ["/payments", "Collections"],
      [soaPath, "Statement of Account"],
      ["/boat-statement", "Statement of Account"],
      ["/statement-of-account", "Statement of Account"],
      [reportsPath, "Reports"],
      [remittancePath, "Collections"],
      ["/notification", "Notification"],
      ["/set-fees", "Set Fees"],
      ["/manage-accounts", "Accounts"],
      [archivesPath, "Archives"],
      ["/activity-logs", "Activity Logs"],
      [settingsPath, "Settings"],
    ]);

    return pathMap.get(pathname) || activeItem;
  })();

  const prefetchForLabel = (label) => {
    return label;
  };

  const handleSubItemClick = (subLabel) => {
    prefetchForLabel(subLabel);
    if (subLabel === "Registered Boats")          navigateIfNeeded("/registered-boats");
    else if (subLabel === "Boat Types")           navigateIfNeeded("/boat-type");
    else if (subLabel === "Boat Owners")          navigateIfNeeded("/boat-owners");
    else if (subLabel === "Add Boat")             navigateIfNeeded("/add-boat");
    else if (subLabel === "Boat Reports")         navigateIfNeeded("/super_boatreports");
    else if (subLabel === "Revenue Reports")      navigateIfNeeded("/super_revenuereports");
    else if (subLabel === "Docking Reports")      navigateIfNeeded("/super_dockingreports");
    else if (subLabel === "Banyera Reports")      navigateIfNeeded("/super_banyerareports");
    else if (subLabel === "Vehicle Reports")      navigateIfNeeded("/super_vehiclereports");
  };

  const sections = [
    {
      label: "GENERAL",
      items: [
        { type: "item", icon: IoHomeOutline, label: "Dashboard", path: "/dashboard" },
      ],
    },
    {
      label: "Transactions",
      items: [
        { type: "item", icon: IoBoatOutline, label: "Boat Management", path: "/registered-boats" },
        { type: "item", icon: IoCalendarOutline, label: "Docking", path: "/docking" },
        { type: "item", icon: IoFishOutline, label: "Banyera", path: "/banyera" },
        { type: "item", icon: IoCarOutline, label: "Vehicle Tickets", path: "/vehicle-tickets" },
        { type: "item", icon: IoReceiptOutline, label: "Billing", path: "/billing" },
        { type: "item", icon: IoCashOutline, label: "Collections", path: "/collections" },
        { type: "item", icon: IoDocumentTextOutline, label: "Statement of Account", path: "/owner-statement" },
        { type: "item", icon: IoPricetagOutline, label: "Set Fees", path: "/set-fees" },
      ],
    },
    {
      label: "Reports",
      items: [
        { type: "item", icon: IoBarChartOutline, label: "Reports", path: "/reports" },
      ],
    },
    {
      label: "Others",
      items: [
        {
          type: "item", icon: IoPeopleOutline, label: "Accounts", path: "/manage-accounts"
        },
        { type: "item", icon: IoArchiveOutline,       label: "Archives",     path: "/archives" },
        { type: "item", icon: IoNotificationsOutline, label: "Notification", path: "/notification"             },
        { type: "item", icon: IoTimeOutline,          label: "Activity Logs", path: "/activity-logs" },
      ],
    },
  ].map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!isCoordinator) return true;

      return !["Set Fees", "Activity Logs"].includes(item.label);
    }),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {showLogoutModal && (
        <LogoutModal
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutModal(false)}
          isLoading={isSigningOut}
        />
      )}

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-20 lg:hidden bg-black/40" onClick={onClose} />
      )}

      <aside
        className="flex flex-col fixed top-0 left-0 h-full z-30 overflow-hidden"
        style={{
          backgroundColor: "#1a1f36",
          fontFamily: "'Montserrat', sans-serif",
          width: `${sidebarWidth}px`,
          transition: "width 0.3s ease, transform 0.3s ease",
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
        onMouseEnter={() => { if (collapsed) setHovered(true);  }}
        onMouseLeave={() => { if (collapsed) setHovered(false); }}
      >
        {/* Logo + Title */}
        <div className="flex items-center pt-5 pb-3 px-4 gap-1 overflow-hidden">
          {/* ── Logo image replaces the old IoBoatOutline icon ── */}
          <div className="h-11 w-11 min-h-[45px] min-w-[47px] flex-none overflow-hidden flex items-center justify-center">
            <img
              src={LOGO_SRC}
              alt="Opol Fish Port Logo"
              className="h-full w-full object-contain scale-120"
            />
          </div>

          <div
            className="flex flex-col leading-tight"
            style={{
              opacity: isExpanded ? 1 : 0,
              transform: isExpanded ? "translateX(0)" : "translateX(-8px)",
              transition: "opacity 0.3s ease, transform 0.3s ease",
              pointerEvents: isExpanded ? "auto" : "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                fontFamily: "'Anton', sans-serif",
                fontSize: "15px",
                letterSpacing: "0.04em",
                lineHeight: 1.1,
              }}
            >
              <span className="text-white/80">Opol Fish</span>
              <span style={{ color: "#3b82f6" }}> Port</span>
            </span>
            <span
              className="text-white/80 font-light"
              style={{
                fontSize: "9.3px",
                letterSpacing: "0.21em",
                fontFamily: "'Montserrat', sans-serif",
              }}
            >
              Management System
            </span>
          </div>
        </div>

        {/* Menu */}
        <nav
          ref={navRef}
          className={`flex-1 text-sm overflow-y-auto pb-2 pt-0 ${!isExpanded ? "px-2" : "px-3"}`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {sections.map((section) => (
            <div key={section.label}>
              {isExpanded ? (
                <p
                  className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {section.label}
                </p>
              ) : (
                <p
                  className="text-center pt-4 pb-1 text-[11px] font-bold"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  ···
                </p>
              )}

              {section.items.map((item) => {
                if (item.type === "collapse") {
                  return (
                    <CollapseMenuItem
                      key={item.label}
                      icon={item.icon}
                      label={item.label}
                      subItems={item.subItems}
                      activeItem={activeItem}
                      setActiveItem={setActiveItem}
                      onSubItemClick={handleSubItemClick}
                      onSubItemHover={prefetchForLabel}
                      isExpanded={isExpanded}
                    />
                  );
                }
                return (
                  <MenuItem
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    isActive={activeLabelFromPath === item.label}
                    isExpanded={isExpanded}
                    onHover={() => prefetchForLabel(item.label)}
                    onClick={() => {
                      setActiveItem?.(item.label);
                      prefetchForLabel(item.label);
                      if (!item.path) {
                        return;
                      }
                      navigateIfNeeded(item.path);
                    }}
                  />
                );
              })}
            </div>
          ))}

          {/* System section */}
          <div>
            {isExpanded ? (
              <p
                className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                System
              </p>
            ) : (
              <p
                className="text-center pt-4 pb-1 text-[11px] font-bold"
                style={{ color: "rgba(255,255,255,0.2)" }}
              >
                ···
              </p>
            )}

            <MenuItem
              icon={IoSettingsOutline}
              label="Settings"
              isActive={activeLabelFromPath === "Settings"}
              isExpanded={isExpanded}
              onClick={() => {
                navigateIfNeeded("/settings");
              }}
            />

            <button
              onClick={() => setShowLogoutModal(true)}
              className={`w-full flex items-center gap-3 py-2.5 rounded-[10px] text-sm transition-all duration-150 text-white/50 hover:bg-white/[0.06] hover:text-white/80 mb-4 ${
                !isExpanded ? "justify-center px-0" : "px-4"
              }`}
            >
              <IoLogOutOutline className="text-lg flex-shrink-0" />
              {isExpanded && <span className="whitespace-nowrap">Sign out</span>}
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
