import React, { useEffect, useRef, useState } from "react";
import "typeface-montserrat";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IoSearchOutline,
  IoNotificationsOutline,
  IoChevronDownOutline,
  IoCloseOutline,
  IoLogOutOutline,
  IoMenuOutline,
  IoPersonCircleOutline,
} from "react-icons/io5";
import { logoutUser } from "../pages/login/logout";
import { getStoredUser } from "../pages/login/auth";
import { useNotificationsDataQuery } from "../hooks/useNotificationsDataQuery";
import { useSettingsQuery } from "../hooks/useSettingsQuery";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useUniversalSearchQuery } from "../hooks/useUniversalSearchQuery";
import Spinner from "../components/Spinner";
import NoDataFound from "../components/NoDataFound";
import api from "../api/axios";

const formatDisplayDate = (value) => {
  const normalized = String(value || "").slice(0, 10);
  if (!normalized) return "-";
  const [year = "", month = "", day = ""] = normalized.split("-");
  if (!year || !month || !day) return normalized;

  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatMoney = (value) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "-";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatNotificationMessage = (message) =>
  String(message || "").replace(/\bPHP\s+/g, "₱");

const getPaymentReference = (payment, fallback = "") =>
  String(
    payment?.payment_reference_no ||
      payment?.payment_reference ||
      payment?.reference_no ||
      payment?.reference_number ||
      payment?.official_receipt_no ||
      payment?.official_receipt_number ||
      fallback
  ).trim();

const getBillReference = (bill, payment, fallback = "") =>
  String(
    bill?.bill_reference_no ||
      bill?.bill_reference ||
      bill?.reference_no ||
      bill?.reference_number ||
      payment?.bill_reference_no ||
      payment?.bill_reference ||
      fallback
  ).trim();

const getVehicleTypeName = (ticket) =>
  String(ticket?.vehicle_type?.type_name || ticket?.vehicleType?.type_name || ticket?.vehicle_type_name || "").trim();

const findVehicleTicketForLog = ({ ticketType, vehicleTypeName, plateNumber, tickets = [], logTimestamp }) => {
  const normalizedTicketType = String(ticketType || "").toLowerCase();
  const normalizedVehicleType = String(vehicleTypeName || "").trim().toLowerCase();
  const normalizedPlateNumber = String(plateNumber || "").trim().toLowerCase();
  const logTime = logTimestamp ? new Date(logTimestamp).getTime() : 0;

  return [...tickets]
    .filter((ticket) => {
      const currentTicketType = String(ticket?.ticket_type || "").toLowerCase();
      const currentVehicleType = getVehicleTypeName(ticket).toLowerCase();
      const currentPlateNumber = String(ticket?.plate_number || "").trim().toLowerCase();

      return currentTicketType === normalizedTicketType &&
        (normalizedVehicleType ? currentVehicleType === normalizedVehicleType : currentPlateNumber === normalizedPlateNumber);
    })
    .sort((a, b) => {
      const aTime = new Date(a?.created_at || a?.updated_at || a?.ticket_date || 0).getTime();
      const bTime = new Date(b?.created_at || b?.updated_at || b?.ticket_date || 0).getTime();

      if (logTime && Number.isFinite(aTime) && Number.isFinite(bTime)) {
        return Math.abs(aTime - logTime) - Math.abs(bTime - logTime);
      }

      return bTime - aTime;
    })[0];
};

const formatActivityDetails = (details, context = {}) => {
  const normalized = String(details || "").trim();
  if (!normalized) return "";

  const paymentBillMatch = normalized.match(/\bRecorded payment\s+#(\d+)\s+for bill\s+#(\d+)\.?/i);
  if (paymentBillMatch) {
    const [, paymentId, billId] = paymentBillMatch;
    const payment = context.paymentsById?.get(String(paymentId));
    const bill = context.billsById?.get(String(billId)) || context.billsById?.get(String(payment?.bill_id ?? ""));
    const billReference = getPaymentReference(payment, "") || getBillReference(bill, payment, "bill record");
    const amount = payment ? formatMoney(payment?.amount_paid) : "";

    return [
      `Recorded payment for bill "${billReference}"`,
      amount ? `with the amount of ${amount}.` : "",
    ].filter(Boolean).join(" ");
  }

  const vehicleTicketMatch = normalized.match(/\bCreated\s+(daily|annual)\s+vehicle ticket for vehicle type\s+"([^"]+)"\.?/i);
  if (vehicleTicketMatch) {
    if (/\bwith the amount of\b/i.test(normalized)) {
      return normalized;
    }

    const [, ticketType, vehicleTypeName] = vehicleTicketMatch;
    const ticket = findVehicleTicketForLog({
      ticketType,
      vehicleTypeName,
      tickets: context.vehicleTickets,
      logTimestamp: context.logTimestamp,
    });
    const amount = ticket ? formatMoney(ticket?.ticket_fee) : "";

    return [
      `Created ${ticketType.toLowerCase()} vehicle ticket for vehicle type "${vehicleTypeName}"`,
      amount ? `with the amount of ${amount}.` : "",
    ].filter(Boolean).join(" ");
  }

  const vehicleTicketPlateMatch = normalized.match(/\bCreated\s+(daily|annual)\s+vehicle ticket for plate\s+"([^"]*)"\.?/i);
  if (vehicleTicketPlateMatch) {
    const [, ticketType, plateNumber] = vehicleTicketPlateMatch;
    const ticket = findVehicleTicketForLog({
      ticketType,
      plateNumber,
      tickets: context.vehicleTickets,
      logTimestamp: context.logTimestamp,
    });
    if (!ticket) {
      return normalized;
    }

    const vehicleTypeName = getVehicleTypeName(ticket) || "vehicle type";
    const amount = formatMoney(ticket?.ticket_fee);

    return [
      `Created ${ticketType.toLowerCase()} vehicle ticket for vehicle type "${vehicleTypeName}"`,
      amount ? `with the amount of ${amount}.` : "",
    ].filter(Boolean).join(" ");
  }

  return normalized
    .replace(/\bPayment\s+#\d+\b/gi, "Payment")
    .replace(/\bBill\s+#\d+\b/gi, "Bill")
    .replace(/\s+#\d+\b/g, "");
};

const getStatementStatus = (totalPaid, balance) => {
  if (balance <= 0.009) return { key: "paid", label: "Paid" };
  if (totalPaid > 0.009) return { key: "partial", label: "Partial" };
  return { key: "pending", label: "Unpaid" };
};

const normalizeVehicleTicketSearchRecord = (ticket) => ({
  controlNumber: ticket?.control_number || `VTC-${String(ticket?.ticket_id ?? "").padStart(4, "0")}`,
  vehicleTypeName: ticket?.vehicle_type?.type_name || "-",
  plateNumber: ticket?.plate_number || "-",
  driverName: ticket?.driver_name || "-",
  ticketType: String(ticket?.ticket_type || "").toLowerCase() === "annual" ? "Annual" : "Daily",
  feeName:
    ticket?.fee?.fee_type_name ||
    ticket?.fee?.fee_type?.fee_name ||
    ticket?.fee?.feeType?.fee_name ||
    ticket?.fee?.fee_name ||
    "-",
  ticketFee: Number(ticket?.ticket_fee || 0),
  rawTicketDate: String(ticket?.ticket_date || "").slice(0, 10),
  ticketDate: formatDisplayDate(ticket?.ticket_date),
  endDate: formatDisplayDate(ticket?.end_date),
  status: String(ticket?.status || ""),
  voidReason: ticket?.void_reason || "",
  voidedBy: ticket?.voided_by_name || ticket?.voidedBy?.full_name || "-",
  encodedBy: ticket?.created_by_name || ticket?.createdBy?.full_name || "-",
});

const getBanyeraTotalFee = (transaction) => {
  const storedTotal = Number(transaction?.total_fee ?? 0);
  if (storedTotal > 0) return storedTotal;

  return (transaction?.items ?? []).reduce((sum, item) => {
    const quantity = Number(item?.quantity ?? 0);
    const unitPrice = Number(item?.price ?? item?.unit_price ?? item?.fee ?? item?.amount ?? 0);
    return sum + (quantity * unitPrice);
  }, 0);
};

const buildSearchRoute = (path) => path;
const ACTIVITY_LOGS_PAGE_SIZE = 20;
const toSentenceCase = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};
const formatBillReferenceNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-6).padStart(6, "0");
};
const buildLabeledSubtitle = (pairs) =>
  pairs
    .filter(([, value]) => String(value ?? "").trim())
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join(" | ");
const UNIVERSAL_SEARCH_MIN_LENGTH = 1;

const Topbar = ({ sidebarOpen, onMenuToggle, sidebarCollapsed }) => {
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isTouchViewport, setIsTouchViewport] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [burgerHovered, setBurgerHovered] = useState(false);
  const dropdownRef = useRef(null);
  const notificationsRef = useRef(null);
  const searchRef = useRef(null);
  const queryClient = useQueryClient();
  const storedUser = getStoredUser();
  const settingsQuery = useSettingsQuery({
    enabled: Boolean(storedUser),
    staleTime: 60 * 1000,
  });
  const user = settingsQuery.data?.user || storedUser || {};
  const normalizedSearchValue = searchValue.trim();
  const debouncedSearchValue = useDebouncedValue(normalizedSearchValue, 300);
  const searchDataEnabled = debouncedSearchValue.length >= UNIVERSAL_SEARCH_MIN_LENGTH;
  const isSearchWaitingForDebounce = normalizedSearchValue !== debouncedSearchValue;

  const notificationsQuery = useNotificationsDataQuery({ perPage: 10, paginated: true });
  const universalSearchQuery = useUniversalSearchQuery(
    { search: debouncedSearchValue, limit: 30 },
    { enabled: searchDataEnabled }
  );

  const rawFirstName = String(user?.first_name || user?.full_name?.split(" ")[0] || "").trim();
  const rawLastName = String(user?.last_name || user?.full_name?.split(" ").slice(1).join(" ") || "").trim();
  const fallbackName = String(user?.email || "").trim() || "Account";
  const firstName = rawFirstName || fallbackName;
  const fullName = user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || fallbackName;
  const initials = `${rawFirstName.charAt(0)}${rawLastName.charAt(0)}`.toUpperCase();
  const displayName = firstName;
  const notifications = notificationsQuery.data?.notifications ?? [];
  const visibleNotifications = notifications.slice(0, 10);
  const isNotificationsLoading = notificationsQuery.isLoading || (notificationsQuery.isFetching && visibleNotifications.length === 0);
  const unreadNotifications = notifications.filter((row) => !Boolean(row?.is_read));
  const unreadNotificationCount = Number(notificationsQuery.data?.unreadCount ?? unreadNotifications.length);
  const hasUnreadNotifications = unreadNotificationCount > 0;

  const universalSearchResults = isSearchWaitingForDebounce ? [] : universalSearchQuery.data?.results ?? [];

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
    const syncTouchViewport = () => setIsTouchViewport(mediaQuery.matches);

    syncTouchViewport();
    mediaQuery.addEventListener?.("change", syncTouchViewport);
    return () => mediaQuery.removeEventListener?.("change", syncTouchViewport);
  }, []);

  const formatNotificationDate = (value) => {
    const normalized = String(value || "").slice(0, 10);
    if (!normalized) return "-";
    const [year = "", month = "", day = ""] = normalized.split("-");
    if (!year || !month || !day) return normalized;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const isUniversalSearchLoading =
    normalizedSearchValue.length >= UNIVERSAL_SEARCH_MIN_LENGTH &&
    (isSearchWaitingForDebounce || universalSearchQuery.isFetching);

  const handleConfirmLogout = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);

    try {
      await logoutUser();
      window.location.replace("/login");
    } catch (error) {
      setIsSigningOut(false);
    }
  };

  const markReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      await api.patch(`/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-data"], refetchType: "active" });
    },
  });

  const getNotificationNavigationTarget = (notification) => {
    const relatedType = String(notification?.related_type || "").trim().toLowerCase();
    const relatedId = notification?.related_id;

    if (relatedType === "void_request_docking" && relatedId) {
      const highlightId = `docking-${relatedId}`;

      return {
        pathname: "/docking",
        search: `?highlight=${highlightId}`,
        state: {
          universalSearchResult: {
            id: highlightId,
            group: "Docking",
            path: `/docking?highlight=${highlightId}`,
            title: notification?.title || "Void Request",
            subtitle: notification?.message || "",
          },
        },
      };
    }

    if (relatedType === "void_request_banyera" && relatedId) {
      const highlightId = `banyera-${relatedId}`;

      return {
        pathname: "/banyera",
        search: `?highlight=${highlightId}`,
        state: {
          universalSearchResult: {
            id: highlightId,
            group: "Banyera",
            path: `/banyera?highlight=${highlightId}`,
            title: notification?.title || "Void Request",
            subtitle: notification?.message || "",
          },
        },
      };
    }

    if (
      [
        "void_request_tickets",
        "void_request_daily_ticket",
        "void_request_annual_ticket",
      ].includes(relatedType) &&
      relatedId
    ) {
      const highlightId = `ticket-${relatedId}`;
      const isAnnualTicket = relatedType === "void_request_annual_ticket";
      const pathname = isAnnualTicket ? "/annual-vehicle-tickets" : "/daily-vehicle-tickets";
      const group = isAnnualTicket ? "Annual Vehicle Tickets" : "Daily Vehicle Tickets";

      return {
        pathname,
        search: `?highlight=${highlightId}`,
        state: {
          universalSearchResult: {
            id: highlightId,
            group,
            path: `${pathname}?highlight=${highlightId}`,
            title: notification?.title || "Void Request",
            subtitle: notification?.message || "",
          },
        },
      };
    }

    if (relatedType === "remittance" && relatedId) {
      const highlightId = `remittance-${relatedId}`;

      return {
        pathname: "/remittance",
        search: `?highlight=${highlightId}`,
        state: {
          universalSearchResult: {
            id: highlightId,
            group: "Remittance",
            path: `/remittance?highlight=${highlightId}`,
            title: notification?.title || "Remittance",
            subtitle: notification?.message || "",
          },
        },
      };
    }

    return {
      pathname: "/notification",
      search: "",
      state: null,
    };
  };

  const handleNotificationClick = async (notification) => {
    const target = getNotificationNavigationTarget(notification);

    if (!notification?.notification_id) {
      setShowNotifications(false);
      navigate(
        { pathname: target.pathname, search: target.search },
        { state: target.state }
      );
      return;
    }

    if (!notification.is_read) {
      try {
        await markReadMutation.mutateAsync(notification.notification_id);
      } catch (error) {
        // Keep navigation responsive even if the read-state update fails.
      }
    }

    setShowNotifications(false);
    navigate(
      { pathname: target.pathname, search: target.search },
      { state: target.state }
    );
  };

  const closeSearchResults = () => {
    setShowSearchResults(false);
    setShowSearch(false);
  };

  const handleSearchFocus = () => {
    if (String(searchValue || "").trim()) {
      setShowSearchResults(true);
    }
  };

  const handleSearchChange = (event) => {
    const nextValue = event.target.value;
    setSearchValue(nextValue);
    setShowSearchResults(Boolean(nextValue.trim()));
  };

  const handleSearchSubmit = (event) => {
    if (event.key !== "Enter") return;
    if (!universalSearchResults.length) return;
    const [firstResult] = universalSearchResults;
    setSearchValue("");
    closeSearchResults();
    navigate(firstResult.path, { state: { universalSearchResult: firstResult } });
  };

  const handleSearchResultClick = (item) => {
    setSearchValue("");
    closeSearchResults();
    navigate(item.path, { state: { universalSearchResult: item } });
  };

  useEffect(() => {
    if (!showDropdown) return undefined;

    const handlePointerDown = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showDropdown]);

  useEffect(() => {
    if (!showNotifications) return undefined;

    const handlePointerDown = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showNotifications]);

  useEffect(() => {
    if (!showSearchResults) return undefined;

    const handlePointerDown = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showSearchResults]);

  return (
    <>
      <style>{`
        .topbar-panel-scroll {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .topbar-panel-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .topbar-panel-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .topbar-panel-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .topbar-panel-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>
      {showLogoutModal && (
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
                onClick={() => setShowLogoutModal(false)}
                disabled={isSigningOut}
                className="flex-1 py-2.5 rounded-xl text-sm font-normal bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ border: "2px solid #1a1f36", color: "#1a1f36", fontFamily: "'Montserrat', sans-serif", opacity: isSigningOut ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLogout}
                disabled={isSigningOut}
                className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-normal bg-[#1a1f36] text-white disabled:cursor-not-allowed disabled:opacity-80"
              >
                {isSigningOut ? <Spinner size={16} className="text-white" /> : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      )}

      <header
        className="flex items-center justify-between sticky top-0 z-10"
        style={{
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #eef0f4",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          fontFamily: "'Montserrat', sans-serif",
          padding: "16px 24px",
          zIndex: 40,
        }}
      >
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={onMenuToggle}
            onMouseEnter={() => setBurgerHovered(true)}
            onMouseLeave={() => setBurgerHovered(false)}
            className="flex items-center justify-center rounded-xl transition-all duration-150 flex-shrink-0"
            style={{
              width: "40px",
              height: "40px",
              backgroundColor: sidebarCollapsed
                ? "#1a1f36"
                : burgerHovered ? "#f4f6f9" : "#ffffff",
              color: sidebarCollapsed ? "#ffffff" : "#6b7280",
            }}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IoMenuOutline style={{ fontSize: "20px" }} />
          </button>

          <div ref={searchRef} className="relative flex-1" style={{ maxWidth: "490px" }}>
            <div
              className="hidden sm:flex items-center gap-3 rounded-xl flex-1"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                height: "44px",
                padding: "0 16px",
              }}
            >
              <IoSearchOutline style={{ color: "#9ca3af", fontSize: "20px", flexShrink: 0 }} />
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Search for boats, docking, banyera, tickets, bills, etc..."
                  value={searchValue}
                  onChange={handleSearchChange}
                  onFocus={handleSearchFocus}
                onKeyDown={handleSearchSubmit}
                className="outline-none w-full border-none bg-white"
                style={{
                  color: "#1a1f36",
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: "14px",
                  fontWeight: 500,
                  backgroundColor: "#ffffff",
                }}
              />
            </div>

            {showSearch && (
              <div
                className="flex sm:hidden items-center gap-2.5 rounded-xl"
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  height: "40px",
                  padding: "0 14px",
                }}
              >
                <IoSearchOutline style={{ color: "#9ca3af", fontSize: "20px", flexShrink: 0 }} />
                <input
                  autoFocus
                  type="text"
                  autoComplete="off"
                  placeholder=""
                  value={searchValue}
                  onChange={handleSearchChange}
                  onFocus={handleSearchFocus}
                  onKeyDown={handleSearchSubmit}
                  className="outline-none w-full border-none bg-white"
                  style={{
                    color: "#1a1f36",
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: "14px",
                    fontWeight: 500,
                    backgroundColor: "#ffffff",
                  }}
                />
              </div>
            )}

            {showSearchResults && (
              <div
                className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl bg-white"
                style={{
                  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.14)",
                  border: "1px solid #eef0f4",
                  fontFamily: "'Montserrat', sans-serif",
                  zIndex: 50,
                }}
              >
                <div className="topbar-panel-scroll max-h-[360px] overflow-y-auto">
                  {isUniversalSearchLoading ? (
                    <div className="flex items-center justify-center px-4 py-8">
                      <Spinner size={20} className="text-slate-500" />
                    </div>
                  ) : universalSearchResults.length > 0 ? (
                    universalSearchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSearchResultClick(item)}
                        className="w-full border-none bg-transparent px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="m-0 truncate text-[13px] font-semibold text-[#1a1f36]">{item.title}</p>
                            {String(item.subtitle || "").trim() ? (
                              <p className="m-0 mt-0.5 truncate text-[12px] text-slate-700">{item.subtitle}</p>
                            ) : null}
                          </div>
                          {String(item.group || "").toLowerCase() !== "module" ? (
                            <span
                              className="shrink-0 px-2 py-1 text-[11px] font-semibold"
                              style={{ backgroundColor: "#eff6ff", color: "#2563eb", borderRadius: 6 }}
                            >
                              {item.group}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))
                  ) : (
                    <NoDataFound title="No Data Found" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            className="flex sm:hidden items-center justify-center rounded-xl transition"
            style={{
              width: "40px",
              height: "40px",
              backgroundColor: showSearch ? "#f4f6f9" : "transparent",
              color: "#1a1f36",
            }}
            onClick={() => {
              const nextOpen = !showSearch;
              setShowSearch(nextOpen);
              setShowSearchResults(nextOpen && Boolean(searchValue.trim()));
            }}
          >
            {showSearch ? <IoCloseOutline style={{ fontSize: "20px" }} /> : <IoSearchOutline style={{ fontSize: "20px" }} />}
          </button>

          <div ref={notificationsRef} className="relative">
            <button
              className="relative flex items-center justify-center rounded-full transition border flex-shrink-0"
              style={{
                width: "40px",
                height: "40px",
                backgroundColor: "#ffffff",
                color: "#1a1f36",
                borderColor: "#e2e8f0",
              }}
              onClick={() => setShowNotifications((current) => !current)}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f4f6f9"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#ffffff"; }}
            >
              <IoNotificationsOutline style={{ fontSize: "20px" }} />
              {hasUnreadNotifications ? (
                <span
                  className="absolute rounded-full"
                  style={{
                    width: "8px",
                    height: "8px",
                    backgroundColor: "#f97316",
                    top: "6px",
                    right: "6px",
                    border: "1.5px solid #fff",
                  }}
                />
              ) : null}
            </button>

            {showNotifications && (
              <div
                className={`${isTouchViewport ? "fixed" : "absolute right-0 mt-2"} z-50 overflow-hidden rounded-2xl bg-white`}
                style={{
                  top: isTouchViewport ? 74 : undefined,
                  right: isTouchViewport ? 12 : undefined,
                  width: isTouchViewport ? "min(360px, calc(100vw - 24px))" : 320,
                  maxWidth: "calc(100vw - 24px)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                  border: "1px solid #eef0f4",
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                <div className="px-4 py-3 mt-2 flex items-center justify-between" style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <p className="m-0 text-[13px] font-bold text-[#1a1f36]">Notifications</p>
                    <p className="m-0 mt-0.5 text-[11px] text-slate-500" />
                  </div>
                </div>

                <div className="topbar-panel-scroll max-h-[min(320px,calc(100dvh-180px))] overflow-y-auto">
                  {isNotificationsLoading ? (
                    <div className="flex items-center justify-center px-4 py-8">
                      <Spinner size={20} className="text-slate-500" />
                    </div>
                  ) : visibleNotifications.length > 0 ? (
                    visibleNotifications.map((row) => (
                      <button
                        key={row.notification_id}
                        type="button"
                        onClick={() => handleNotificationClick(row)}
                        className="w-full cursor-pointer border-none bg-transparent px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: row.is_read ? "#16a34a" : "#f59e0b" }}
                          />
                          <div className="min-w-0">
                            <p className="m-0 text-[12px] font-semibold text-[#1a1f36]">
                              {row.title || "Notification"}
                            </p>
                            <p className="m-0 mt-1 text-[11px] text-slate-500">
                              {row.message ? formatNotificationMessage(row.message) : `Submitted for ${formatNotificationDate(row.created_at)}`}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <NoDataFound title="No Data Found" />
                  )}
                </div>
                <div className="px-4 py-3" style={{ borderTop: "1px solid #f3f4f6" }}>
                  <button
                    type="button"
                    onClick={() => { setShowNotifications(false); navigate('/notification'); }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: "#1a1f36", color: "#fff" }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#252b47"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#1a1f36"; }}
                  >
                    View All Notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ width: "1px", height: "20px", backgroundColor: "#e5e7eb", margin: "0 2px" }} />

          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 rounded-xl transition px-1.5 py-1"
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f4f6f9"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <div
                className="flex items-center justify-center flex-shrink-0 overflow-hidden rounded-full border"
                style={{
                  width: "40px",
                  height: "40px",
                  background: "linear-gradient(135deg, #2d3561, #1a1f36)",
                  borderColor: "#e2e8f0",
                }}
              >
                {initials
                  ? <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{initials}</span>
                  : <IoPersonCircleOutline style={{ fontSize: "22px", color: "#fff" }} />}
              </div>
              <span className="hidden sm:block text-[14px] font-semibold" style={{ color: "#1a1f36" }}>
                {displayName}
              </span>
              <IoChevronDownOutline
                style={{
                  color: "#9ca3af",
                  fontSize: "13px",
                  transition: "transform 0.2s",
                  transform: showDropdown ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {showDropdown && (
              <div
                className="absolute right-0 mt-2 rounded-2xl py-2 z-50 overflow-hidden"
                style={{
                  width: 230,
                  backgroundColor: "#fff",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                  border: "1px solid #eef0f4",
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                <div className="px-4 py-3" style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <p className="m-0 text-[13px] font-bold" style={{ color: "#1a1f36" }}>{fullName}</p>
                  <p className="m-0 text-[11px] mt-0.5 text-slate-400">{user?.email || "No email available"}</p>
                </div>

                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-semibold border-none bg-transparent cursor-pointer transition-colors"
                  style={{ color: "#1a1f36", fontFamily: "'Montserrat', sans-serif" }}
                  onClick={() => {
                    setShowDropdown(false);
                    navigate("/settings");
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f8f9fc"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <IoPersonCircleOutline style={{ fontSize: "16px", color: "#1a1f36" }} />
                  Edit Profile
                </button>

                <div style={{ height: "1px", backgroundColor: "#f3f4f6", margin: "4px 0" }} />

                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-semibold border-none bg-transparent cursor-pointer"
                  style={{ color: "#1a1f36", fontFamily: "'Montserrat', sans-serif" }}
                  onClick={() => {
                    setShowDropdown(false);
                    setShowLogoutModal(true);
                  }}
                >
                  <IoLogOutOutline style={{ fontSize: "16px", color: "#1a1f36" }} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
};

export default Topbar;
