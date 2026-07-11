import React, { useState, useEffect, useCallback, useMemo } from "react";
import "typeface-montserrat";
import {
  IoArrowDownOutline,
  IoArrowUpOutline,
  IoBoatSharp,
  IoCalendarOutline,
  IoCashOutline,
  IoCarSharp,
  IoChevronDownOutline,
  IoChevronUpOutline,
  IoDocumentTextOutline,
  IoEllipsisHorizontalOutline,
  IoFishSharp,
} from "react-icons/io5";
import ReactApexChart from "react-apexcharts";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import Modal, { ModalTextInput } from "../../components/Modal";
import TitlePage from "../../components/TitlePage";
import { useSidebar } from "../../store/sidebarStore";
import { useDashboardDataQuery } from "../../hooks/useDashboardDataQuery";
import { useFiscalYearStore, getFiscalYearOptions } from "../../store/fiscalYearStore";

const FONT = "'Montserrat', sans-serif";
const PESO = "\u20B1";
const fmt = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtN = (value, decimals = false) => {
  const num = Number(value || 0);
  if (decimals) {
    return num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return num.toLocaleString("en-PH");
};

const STATS = [
  {
    key: "revenue",
    label: "Total Revenue",
    icon: IoCashOutline,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-500",
    valuePrefix: PESO,
  },
  {
    key: "remittances",
    label: "Total Remittances",
    icon: IoDocumentTextOutline,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-500",
    valuePrefix: PESO,
  },
  {
    key: "docking",
    label: "Total Docking",
    icon: IoCalendarOutline,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-500",
    valuePrefix: PESO,
  },
  {
    key: "banyera",
    label: "Total Banyera",
    icon: IoFishSharp,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-500",
    valuePrefix: PESO,
  },
  {
    key: "tickets",
    label: "Total Tickets",
    icon: IoCarSharp,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-500",
    valuePrefix: PESO,
  },
  {
    key: "boats",
    label: "Boats Registered",
    icon: IoBoatSharp,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-500",
    valuePrefix: "",
  },
];

const BILL_STATUS_CONFIG = [
  { key: "paid", name: "Paid", color: "#3b5fd4" },
  { key: "partial", name: "Partial", color: "#5b7ff5" },
  { key: "unpaid", name: "Unpaid", color: "#c5d3fc" },
];

const getFishItemsLabel = (record) => {
  const seen = new Set();
  const names = (record?.items ?? [])
    .map((item) => item?.classification?.classification_name || item?.classification_name || "")
    .map((name) => String(name).trim())
    .filter((name) => {
      if (!name) return false;
      const normalized = name.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

  return names.join(", ") || "â€”";
};

const getBoatTypeName = (record) =>
  record?.boat?.boat_type?.type_name ||
  record?.boat?.boatType?.type_name ||
  record?.boat_type?.type_name ||
  record?.boatType?.type_name ||
  record?.boat_type_name ||
  "—";

const stripApexNativeTitles = (chartContext) => {
  const root = chartContext?.el;
  if (!root) return;

  root.querySelectorAll("title").forEach((node) => node.remove());
  root.querySelectorAll("[title]").forEach((node) => node.removeAttribute("title"));
};

const StatCard = ({
  label,
  value,
  trend,
  trendUp,
  icon: Icon,
  iconBg,
  iconColor,
  valuePrefix = "",
  loading = false,
  showGrowthChart = false,
}) => (
  <div className="rounded-[10px] border border-slate-200 bg-white px-5 py-4">
    <div className="flex items-center gap-4">
      {loading ? (
        <div className="h-12 w-12 flex-shrink-0 animate-pulse rounded-2xl bg-slate-200" />
      ) : (
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
          <Icon className={iconColor} style={{ fontSize: 24 }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {loading ? (
          <>
            <div className="h-[16px] w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-8 w-28 animate-pulse rounded-lg bg-slate-200" />
          </>
        ) : (
          <>
            <p className="m-0 text-[13px] font-medium text-slate-500" style={{ fontFamily: FONT }}>
              {label}
            </p>
            <p className="m-0 mt-1 whitespace-nowrap text-[28px] font-bold leading-none text-slate-900">
              {valuePrefix}{fmtN(value, valuePrefix === PESO)}
            </p>
          </>
        )}
      </div>
      {showGrowthChart && !loading && (
        <div className="ml-2 h-12 w-20 flex-shrink-0">
          <ReactApexChart
            type="area"
            series={[{
              data: [30, 40, 35, 50, 49, 60, 70, 91, 125]
            }]}
            options={{
              chart: {
                type: "area",
                toolbar: { show: false },
                sparkline: { enabled: true },
                fontFamily: FONT,
              },
              colors: ["#2563eb"],
              stroke: {
                curve: "smooth",
                width: 2,
              },
              fill: {
                type: "gradient",
                gradient: {
                  shadeIntensity: 1,
                  opacityFrom: 0.7,
                  opacityTo: 0.1,
                  stops: [0, 90, 100],
                },
              },
              dataLabels: { enabled: false },
              tooltip: { enabled: false },
              xaxis: { labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
              yaxis: { labels: { show: false } },
              grid: { show: false },
              states: {
                hover: {
                  enabled: false,
                },
              },
            }}
            height={48}
          />
        </div>
      )}
      {showGrowthChart && loading && (
        <div className="ml-2 h-12 w-20 flex-shrink-0 animate-pulse rounded-lg bg-slate-200" />
      )}
    </div>
    {loading && trend ? (
      <div className="mt-3 h-6 w-20 animate-pulse rounded-full bg-slate-200" />
    ) : trend ? (
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{
            backgroundColor: trendUp ? "#dcfce7" : "#fee2e2",
            color: trendUp ? "#15803d" : "#dc2626",
          }}
        >
          {trendUp ? (
            <IoArrowUpOutline className="text-[12px]" />
          ) : (
            <IoArrowDownOutline className="text-[12px]" />
          )}
          {trend}
        </span>
      </div>
    ) : null}
  </div>
);

const SkeletonBlock = ({ className = "" }) => (
  <div className={`animate-pulse rounded bg-slate-200 ${className}`.trim()} />
);

const MetricChartSkeleton = ({ chartHeight = "h-[140px]" }) => (
  <div className="h-full">
    <div className="mb-3 rounded-[10px] border border-slate-200 bg-white px-6 py-3">
      <div className="mx-auto h-[16px] w-36 animate-pulse rounded bg-slate-200" />
      <div className="mx-auto mt-2 h-8 w-44 animate-pulse rounded-lg bg-slate-200" />
    </div>
    <div className={`mx-2 animate-pulse rounded-lg bg-slate-200 ${chartHeight}`} />
  </div>
);

const DonutCardSkeleton = ({ labelWidth = "w-28" }) => (
  <div className="flex flex-col items-center justify-center pt-2">
    <SkeletonBlock className={`mb-5 h-[16px] ${labelWidth}`} />
    <div className="relative h-[184px] w-[208px]">
      <div className="absolute left-[28px] top-[10px] h-[152px] w-[152px] animate-pulse rounded-full bg-slate-200" />
      <div className="absolute left-[68px] top-[50px] h-[72px] w-[72px] rounded-full bg-white" />
      <SkeletonBlock className="absolute left-0 top-10 h-4 w-10" />
      <SkeletonBlock className="absolute right-1 top-5 h-4 w-10" />
      <SkeletonBlock className="absolute bottom-8 left-1 h-4 w-10" />
      <SkeletonBlock className="absolute bottom-8 right-1 h-4 w-10" />
    </div>
  </div>
);

const LineChartSkeleton = () => (
  <div>
    <SkeletonBlock className="mx-auto mb-6 h-[16px] w-44" />
    <div className="h-[240px] animate-pulse rounded-lg bg-slate-200" />
  </div>
);

const EmptyCardSkeleton = () => (
  <div className="space-y-4">
    <SkeletonBlock className="h-5 w-32" />
    <SkeletonBlock className="h-24 w-full" />
    <SkeletonBlock className="h-16 w-4/5" />
  </div>
);

const RecentTableSkeleton = ({ columns = 5, rows = 5, subtitleWidth = "w-44" }) => (
  <>
    <div className="mb-5">
      <SkeletonBlock className="h-[16px] w-32" />
      <SkeletonBlock className={`mt-2 h-[14px] ${subtitleWidth}`} />
    </div>
    <div className="space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={`table-head-skeleton-${index}`} className="h-4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`table-row-skeleton-${rowIndex}`}
          className="grid gap-3 border-t border-slate-100 pt-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <SkeletonBlock
              key={`table-cell-skeleton-${rowIndex}-${columnIndex}`}
              className={columnIndex === 0 ? "h-4" : "h-4 w-4/5"}
            />
          ))}
        </div>
      ))}
    </div>
  </>
);

const HIDE_SCROLLBAR_STYLE = {
  msOverflowStyle: "none",
  scrollbarWidth: "none",
};

const Dashboard = () => {
  const [activeItem, setActiveItem] = useState("Dashboard");
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const [contentMargin, setContentMargin] = useState(() =>
    window.innerWidth >= 1024 ? 256 : 0
  );
  const fiscalYear = useFiscalYearStore((state) => state.fiscalYear);
  const [selectedYear, setSelectedYear] = useState(fiscalYear);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const { data, isLoading } = useDashboardDataQuery();
  const showInitialSkeleton = !data && isLoading;

  // Monthly Target state
  const [monthlyTarget, setMonthlyTarget] = useState(() => {
    if (typeof window === "undefined") return 0;
    const savedTarget = window.localStorage.getItem("dashboardMonthlyTarget");
    const parsedTarget = Number(savedTarget);
    return Number.isFinite(parsedTarget) && parsedTarget >= 0 ? parsedTarget : 0;
  });
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [targetError, setTargetError] = useState("");
  const [activeCashMonthIndex, setActiveCashMonthIndex] = useState(null);
  const [activeReceivableMonthIndex, setActiveReceivableMonthIndex] = useState(null);

  const handleWidthChange = useCallback((width) => setContentMargin(width), []);

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen)
      setContentMargin(sidebarCollapsed ? 72 : 256);
    else if (window.innerWidth < 1024) setContentMargin(0);
  }, [sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    if (!yearDropdownOpen) return;
    const handler = (e) => {
      if (!e.target.closest("[data-year-dropdown]")) setYearDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [yearDropdownOpen]);

  useEffect(() => {
    if (!targetDropdownOpen) return;
    const handler = (e) => {
      if (!e.target.closest("[data-target-dropdown]")) setTargetDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [targetDropdownOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("dashboardMonthlyTarget", String(monthlyTarget));
  }, [monthlyTarget]);

  useEffect(() => {
    setSelectedYear(fiscalYear);
  }, [fiscalYear]);

  useEffect(() => {
    if (!targetModalOpen) {
      setTargetError("");
    }
  }, [targetModalOpen]);

  useEffect(() => {
    setActiveCashMonthIndex(null);
    setActiveReceivableMonthIndex(null);
  }, [selectedYear]);

  const {
    boatsRegistered,
    totalDockingReceived,
    totalDockingTransactions,
    totalBanyeraReceived,
    totalBanyeraTransactions,
    totalTicketCollections,
    totalVehicleTicketTransactions,
    totalRemittances,
    totalTransactionRevenue,
    billsStatus,
    billsStatusWithPercent,
    totalBills,
    recentDockings,
    recentBanyera,
    topFishCatches,
    monthlyFishCatches,
  } = useMemo(() => {
    const selectedYearNumber = Number(selectedYear) || new Date().getFullYear();
    const bills = data?.bills ?? [];
    const payments = data?.payments ?? [];
    const remittances = data?.remittances ?? [];
    const dockings = data?.dockings ?? [];
    const vehicleTickets = data?.vehicleTickets ?? [];
    const boats = data?.boats ?? [];

    const getYear = (value) => {
      const parsedDate = new Date(value || 0);
      return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getFullYear();
    };
    const isActiveVehicleTicket = (ticket) =>
      !Boolean(ticket?.is_voided || ticket?.voided_at) &&
      String(ticket?.status || "").toLowerCase() !== "voided";

    const billsForYear = bills.filter(
      (bill) => getYear(bill?.created_at || bill?.billing_date) === selectedYearNumber,
    );
    const paymentsForYear = payments.filter(
      (payment) => getYear(payment?.payment_date || payment?.created_at) === selectedYearNumber,
    );
    const vehicleTicketsForYear = vehicleTickets.filter(
      (ticket) =>
        isActiveVehicleTicket(ticket) &&
        getYear(ticket?.ticket_date || ticket?.issued_at || ticket?.created_at) ===
        selectedYearNumber,
    );
    const remittancesForYear = remittances.filter(
      (remittance) => getYear(remittance?.date || remittance?.created_at) === selectedYearNumber,
    );
    const paymentTotalsByBillId = paymentsForYear.reduce((acc, payment) => {
      const key = String(payment?.bill_id ?? "");
      if (!key) return acc;
      acc[key] = (acc[key] ?? 0) + Number(payment?.amount_paid || 0);
      return acc;
    }, {});

    const getBillItemAmount = (item) =>
      Number(
        item?.amount ||
          item?.subtotal ||
          item?.docking?.docking_fee ||
          item?.banyera_transaction?.total_fee ||
          item?.banyeraTransaction?.total_fee ||
          0,
      );

    const getCategoryCollectionsFromPayments = (categoryKey) =>
      billsForYear.reduce((sum, bill) => {
        const billItems = Array.isArray(bill?.items) ? bill.items : [];
        const totalPaid = Number(paymentTotalsByBillId[String(bill?.bill_id ?? "")] ?? 0);
        if (totalPaid <= 0 || billItems.length === 0) return sum;

        const groupedAmounts = billItems.reduce((acc, item) => {
          const itemCategory = String(item?.transaction_type || "").toLowerCase();
          if (!itemCategory) return acc;
          acc[itemCategory] = (acc[itemCategory] ?? 0) + getBillItemAmount(item);
          return acc;
        }, {});

        const trackedTotal = Object.values(groupedAmounts).reduce(
          (itemSum, amount) => itemSum + Number(amount || 0),
          0,
        );
        const categoryAmount = Number(groupedAmounts[categoryKey] ?? 0);

        if (trackedTotal <= 0 || categoryAmount <= 0) return sum;

        const payableWithinTrackedItems = Math.min(totalPaid, trackedTotal);
        return sum + (payableWithinTrackedItems * categoryAmount) / trackedTotal;
      }, 0);

    const dockingReceived = getCategoryCollectionsFromPayments("docking");
    const banyeraReceived = getCategoryCollectionsFromPayments("banyera");

    const ticketCollections = vehicleTicketsForYear.reduce(
      (sum, ticket) => sum + Number(ticket?.ticket_fee || 0),
      0,
    );

    const statusItems = BILL_STATUS_CONFIG.map((status) => ({
      ...status,
      value: billsForYear.filter((bill) => {
        const totalAmount = Number(bill?.total_amount || 0);
        const totalPaid = Number(paymentTotalsByBillId[String(bill?.bill_id ?? "")] ?? 0);
        if (status.key === "paid") return totalAmount > 0 && totalPaid >= totalAmount;
        if (status.key === "partial") return totalPaid > 0 && totalPaid < totalAmount;
        return totalPaid <= 0;
      }).length,
    }));

    const statusTotal = statusItems.reduce((sum, item) => sum + item.value, 0);
    const statusItemsWithPercent = statusItems.map((item) => ({
      ...item,
      percent: statusTotal > 0 ? Math.round((item.value / statusTotal) * 100) : 0,
    }));

    const dockingsForYear = dockings.filter(
      (docking) => getYear(docking?.docking_date || docking?.created_at) === selectedYearNumber,
    );
    const banyeraTransactionsForYear = (data?.banyeraTransactions ?? []).filter(
      (transaction) =>
        getYear(transaction?.transaction_date || transaction?.created_at) === selectedYearNumber,
    );
    const getBanyeraTransactionTotal = (transaction) => {
      const storedTotal = Number(transaction?.total_fee ?? 0);
      if (storedTotal > 0) return storedTotal;
      return (transaction?.items ?? []).reduce(
        (sum, item) => sum + Number(item?.subtotal ?? 0),
        0,
      );
    };
    const totalDockingTransactions = dockingsForYear.reduce(
      (sum, docking) => sum + Number(docking?.docking_fee ?? 0),
      0,
    );
    const totalBanyeraTransactions = banyeraTransactionsForYear.reduce(
      (sum, transaction) => sum + getBanyeraTransactionTotal(transaction),
      0,
    );
    const totalVehicleTicketTransactions = vehicleTicketsForYear.reduce(
      (sum, ticket) => sum + Number(ticket?.ticket_fee ?? 0),
      0,
    );
    const totalRemittances = remittancesForYear.reduce(
      (sum, remittance) => sum + Number(remittance?.amount ?? 0),
      0,
    );

    const latestDockings = [...dockingsForYear]
      .sort((a, b) => {
        const aTime = new Date(a?.docking_date || a?.created_at || 0).getTime();
        const bTime = new Date(b?.docking_date || b?.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 5);

    const latestBanyera = [...banyeraTransactionsForYear]
      .sort((a, b) => {
        const aTime = new Date(a?.transaction_date || a?.created_at || 0).getTime();
        const bTime = new Date(b?.transaction_date || b?.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 5);

    const fishCatchTotals = banyeraTransactionsForYear.reduce((acc, transaction) => {
      (transaction?.items ?? []).forEach((item) => {
        const fishName = String(
          item?.classification?.classification_name || item?.classification_name || "",
        ).trim();
        if (!fishName) return;
        acc[fishName] = (acc[fishName] ?? 0) + 1;
      });
      return acc;
    }, {});

    const topFishCatches = Object.entries(fishCatchTotals)
      .map(([name, quantity]) => ({
        name,
        quantity: Number(quantity || 0),
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 2);

    const monthlyFishCatches = Array.from({ length: 12 }, (_, index) => ({
      month: new Date(2000, index, 1).toLocaleString("en-PH", { month: "short" }),
      catches: 0,
      breakdown: {},
    }));

    banyeraTransactionsForYear.forEach((transaction) => {
      const parsedDate = new Date(transaction?.transaction_date || transaction?.created_at || 0);
      if (Number.isNaN(parsedDate.getTime())) return;
      const monthBucket = monthlyFishCatches[parsedDate.getMonth()];

      (transaction?.items ?? []).forEach((item) => {
        const fishName = String(
          item?.classification?.classification_name || item?.classification_name || "",
        ).trim();
        const quantity = Number(item?.quantity ?? 0);
        if (!fishName || quantity <= 0) return;

        monthBucket.catches += quantity;
        monthBucket.breakdown[fishName] = (monthBucket.breakdown[fishName] ?? 0) + quantity;
      });
    });

    return {
      boatsRegistered: boats.length,
      totalDockingReceived: dockingReceived,
      totalDockingTransactions,
      totalBanyeraReceived: banyeraReceived,
      totalBanyeraTransactions,
      totalTicketCollections: ticketCollections,
      totalVehicleTicketTransactions,
      totalRemittances,
      totalTransactionRevenue:
        totalDockingTransactions +
        totalBanyeraTransactions +
        totalVehicleTicketTransactions,
      billsStatus: statusItems,
      billsStatusWithPercent: statusItemsWithPercent,
      totalBills: statusItems.reduce((sum, item) => sum + item.value, 0),
      recentDockings: latestDockings,
      recentBanyera: latestBanyera,
      topFishCatches,
      monthlyFishCatches,
    };
  }, [data, selectedYear]);

  const yearOptions = getFiscalYearOptions();

  const cashflowData = useMemo(() => {
    const selectedYearNumber = Number(selectedYear);
    const previousYearNumber = selectedYearNumber - 1;
    const payments = data?.payments ?? [];
    const vehicleTickets = (data?.vehicleTickets ?? []).filter(
      (ticket) =>
        !Boolean(ticket?.is_voided || ticket?.voided_at) &&
        String(ticket?.status || "").toLowerCase() !== "voided",
    );

    const baseMonths = Array.from({ length: 12 }, (_, index) => ({
      month: new Date(2000, index, 1).toLocaleString("en-PH", { month: "short" }),
      revenue: 0,
      outstanding: 0,
    }));

    let totalRevenue = 0;
    let previousYearRevenue = 0;
    let currentMonthRevenue = 0;
    let todayRevenue = 0;
    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const currentDate = now.getDate();
    const currentYear = now.getFullYear();
    const getRawDateParts = (value) => {
      const raw = String(value || "").slice(0, 10);
      const [year, month, day] = raw.split("-");
      const parsedYear = Number(year);
      const parsedMonth = Number(month);
      const parsedDay = Number(day);
      if (!parsedYear || !parsedMonth || !parsedDay) return null;
      return { year: parsedYear, monthIndex: parsedMonth - 1, day: parsedDay };
    };

    // Add payments (bills-based) to revenue
    payments.forEach((payment) => {
      const rawDate = payment?.payment_date || payment?.created_at;
      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) return;
      const amount = Number(payment?.amount_paid || 0);
      if (parsedDate.getFullYear() === selectedYearNumber) {
        baseMonths[parsedDate.getMonth()].revenue += amount;
        totalRevenue += amount;
        if (parsedDate.getMonth() === currentMonthIndex) {
          currentMonthRevenue += amount;
        }
        if (
          selectedYearNumber === currentYear &&
          parsedDate.getMonth() === currentMonthIndex &&
          parsedDate.getDate() === currentDate
        ) {
          todayRevenue += amount;
        }
      } else if (parsedDate.getFullYear() === previousYearNumber) {
        previousYearRevenue += amount;
      }
    });

    vehicleTickets.forEach((ticket) => {
      const rawDate = ticket?.ticket_date || ticket?.issued_at || ticket?.created_at;
      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) return;
      const amount = Number(ticket?.ticket_fee || 0);
      if (parsedDate.getFullYear() === selectedYearNumber) {
        baseMonths[parsedDate.getMonth()].revenue += amount;
        totalRevenue += amount;
        if (parsedDate.getMonth() === currentMonthIndex) {
          currentMonthRevenue += amount;
        }
        if (
          selectedYearNumber === currentYear &&
          parsedDate.getMonth() === currentMonthIndex &&
          parsedDate.getDate() === currentDate
        ) {
          todayRevenue += amount;
        }
      } else if (parsedDate.getFullYear() === previousYearNumber) {
        previousYearRevenue += amount;
      }
    });

    const percentChange =
      previousYearRevenue > 0
        ? ((totalRevenue - previousYearRevenue) / previousYearRevenue) * 100
        : 0;

    const dockings = data?.dockings ?? [];
    const banyeraTransactions = data?.banyeraTransactions ?? [];
    const getBanyeraTransactionTotal = (transaction) => {
      const storedTotal = Number(transaction?.total_fee ?? 0);
      if (storedTotal > 0) return storedTotal;
      return (transaction?.items ?? []).reduce(
        (sum, item) => sum + Number(item?.subtotal ?? 0),
        0,
      );
    };

    currentMonthRevenue = 0;
    todayRevenue = 0;

    dockings.forEach((docking) => {
      const dateParts = getRawDateParts(docking?.docking_date || docking?.created_at);
      if (!dateParts || dateParts.year !== selectedYearNumber) return;
      const amount = Number(docking?.docking_fee ?? 0);
      if (dateParts.monthIndex === currentMonthIndex) currentMonthRevenue += amount;
      if (
        selectedYearNumber === currentYear &&
        dateParts.monthIndex === currentMonthIndex &&
        dateParts.day === currentDate
      ) {
        todayRevenue += amount;
      }
    });

    banyeraTransactions.forEach((transaction) => {
      const dateParts = getRawDateParts(transaction?.transaction_date || transaction?.created_at);
      if (!dateParts || dateParts.year !== selectedYearNumber) return;
      const amount = getBanyeraTransactionTotal(transaction);
      if (dateParts.monthIndex === currentMonthIndex) currentMonthRevenue += amount;
      if (
        selectedYearNumber === currentYear &&
        dateParts.monthIndex === currentMonthIndex &&
        dateParts.day === currentDate
      ) {
        todayRevenue += amount;
      }
    });

    vehicleTickets.forEach((ticket) => {
      const dateParts = getRawDateParts(ticket?.ticket_date || ticket?.issued_at || ticket?.created_at);
      if (!dateParts || dateParts.year !== selectedYearNumber) return;
      const amount = Number(ticket?.ticket_fee || 0);
      if (dateParts.monthIndex === currentMonthIndex) currentMonthRevenue += amount;
      if (
        selectedYearNumber === currentYear &&
        dateParts.monthIndex === currentMonthIndex &&
        dateParts.day === currentDate
      ) {
        todayRevenue += amount;
      }
    });

    // Calculate outstanding per month
    const bills = data?.bills ?? [];
    const billsForYear = bills.filter((bill) => {
      const parsedDate = new Date(bill?.created_at || bill?.billing_date || 0);
      return !Number.isNaN(parsedDate.getTime()) && parsedDate.getFullYear() === selectedYearNumber;
    });
    const paymentsForYear = payments.filter((payment) => {
      const parsedDate = new Date(payment?.payment_date || payment?.created_at);
      return !Number.isNaN(parsedDate.getTime()) && parsedDate.getFullYear() === selectedYearNumber;
    });
    const paymentTotalsByBillId = paymentsForYear.reduce((acc, payment) => {
      const key = String(payment?.bill_id ?? "");
      if (!key) return acc;
      acc[key] = (acc[key] ?? 0) + Number(payment?.amount_paid || 0);
      return acc;
    }, {});

    const billedDockingIds = new Set();
    const billedBanyeraIds = new Set();
    billsForYear.forEach((bill) => {
      const items = Array.isArray(bill?.items) ? bill.items : [];
      items.forEach((item) => {
        const transactionType = String(item?.transaction_type || "").toLowerCase();
        const referenceId =
          transactionType === "docking"
            ? item?.docking_id
            : transactionType === "banyera"
              ? item?.banyera_id
              : null;
        if (!referenceId) return;
        if (transactionType === "docking") billedDockingIds.add(String(referenceId));
        if (transactionType === "banyera") billedBanyeraIds.add(String(referenceId));
      });
    });

    let totalOutstanding = 0;
    billsForYear.forEach((bill) => {
      const totalAmount = Number(bill?.total_amount || 0);
      const totalPaid = Number(paymentTotalsByBillId[String(bill?.bill_id ?? "")] ?? 0);
      const outstanding = Math.max(0, totalAmount - totalPaid);
      totalOutstanding += outstanding;

      // Add outstanding to its month bucket
      const parsedDate = new Date(bill?.created_at || bill?.billing_date || 0);
      if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getFullYear() === selectedYearNumber) {
        baseMonths[parsedDate.getMonth()].outstanding += outstanding;
      }
    });

    const unbilledDockingTotal = dockings.reduce((sum, docking) => {
      const parsedDate = new Date(docking?.docking_date || docking?.created_at || 0);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.getFullYear() !== selectedYearNumber) {
        return sum;
      }
      if (billedDockingIds.has(String(docking?.docking_id ?? ""))) return sum;
      baseMonths[parsedDate.getMonth()].outstanding += Number(docking?.docking_fee ?? 0);
      return sum + Number(docking?.docking_fee ?? 0);
    }, 0);

    const unbilledBanyeraTotal = banyeraTransactions.reduce((sum, transaction) => {
      const parsedDate = new Date(transaction?.transaction_date || transaction?.created_at || 0);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.getFullYear() !== selectedYearNumber) {
        return sum;
      }
      if (billedBanyeraIds.has(String(transaction?.banyera_id ?? ""))) return sum;
      const amount = getBanyeraTransactionTotal(transaction);
      baseMonths[parsedDate.getMonth()].outstanding += amount;
      return sum + amount;
    }, 0);

    const totalReceivables = totalOutstanding + unbilledDockingTotal + unbilledBanyeraTotal;

    return {
      chart: baseMonths,
      totalRevenue,
      totalOutstanding: totalReceivables,
      currentMonthRevenue,
      todayRevenue,
      percentChange,
      hasPreviousYear: previousYearRevenue > 0,
    };
  }, [data, selectedYear]);

  // Monthly target gauge — revenue now includes tickets
  const monthlyRevenue = cashflowData.currentMonthRevenue;
  const todayRevenue = cashflowData.todayRevenue;
  const monthlyTargetProgress =
    monthlyTarget > 0 ? (monthlyRevenue / monthlyTarget) * 100 : 0;
  const monthlyTargetFill = Math.min(Math.max(monthlyTargetProgress, 0), 100);

  const monthlyTargetChartOptions = useMemo(
    () => ({
      chart: {
        type: "radialBar",
        sparkline: { enabled: true },
        parentHeightOffset: 0,
        events: {
          mounted: stripApexNativeTitles,
          updated: stripApexNativeTitles,
        },
        animations: {
          easing: "easeinout",
          speed: 600,
        },
      },
      colors: ["#3b5fd4"],
      stroke: {
        lineCap: "round",
      },
      plotOptions: {
        radialBar: {
          startAngle: -90,
          endAngle: 90,
          offsetY: 36,
          hollow: {
            margin: 0,
            size: "56%",
          },
          track: {
            background: "#e5e7eb",
            strokeWidth: "100%",
            margin: 0,
          },
          dataLabels: {
            show: false,
          },
        },
      },
      grid: {
        padding: {
          top: -18,
          bottom: -10,
          left: -12,
          right: -12,
        },
      },
      tooltip: {
        enabled: true,
        x: { show: false },
        marker: { show: false },
        custom: ({ dataPointIndex }) => {
          const point = cashflowData.chart[dataPointIndex];
          if (!point) return "";
          return `<div style="padding:8px 10px;font-family:${FONT};font-size:12px;color:#0f172a;font-weight:700;">${PESO}${fmt(point.revenue)}</div>`;
        },
      },
      states: {
        hover: { filter: { type: "none" } },
        active: { filter: { type: "none" } },
      },
    }),
    [],
  );

  const billsChartData = useMemo(() => {
    if (totalBills > 0) return billsStatus;
    return [{ key: "empty", name: "No Bills", value: 1, color: "#e5e7eb" }];
  }, [billsStatus, totalBills]);

  const billsDonutSeries = useMemo(
    () => billsChartData.map((item) => item.value),
    [billsChartData],
  );

  const billsDonutOptions = useMemo(
    () => ({
      chart: {
        type: "donut",
        sparkline: { enabled: true },
      },
      labels: billsChartData.map((item) => item.name),
      colors: billsChartData.map((item) => item.color),
      dataLabels: { enabled: false },
      legend: { display: "none", show: false },
      tooltip: { enabled: false },
      stroke: { width: 0 },
      plotOptions: {
        pie: {
          donut: {
            size: "64%",
          },
        },
      },
      states: {
        hover: { filter: { type: "none" } },
        active: { filter: { type: "none" } },
      },
    }),
    [billsChartData],
  );

  const quarterlyRevenue = useMemo(() => {
    const quarterConfig = [
      { key: "q1", name: "Q1", months: [0, 1, 2] },
      { key: "q2", name: "Q2", months: [3, 4, 5] },
      { key: "q3", name: "Q3", months: [6, 7, 8] },
      { key: "q4", name: "Q4", months: [9, 10, 11] },
    ];

    const items = quarterConfig.map((quarter) => ({
      ...quarter,
      value: quarter.months.reduce(
        (sum, monthIndex) => sum + Number(cashflowData.chart[monthIndex]?.revenue || 0),
        0,
      ),
    }));

    const total = items.reduce((sum, item) => sum + item.value, 0);

    return {
      total,
      items: items.map((item, index) => ({
        ...item,
        color: ["#2563eb", "#5b7ff5", "#8cabff", "#c5d3fc"][index],
        percent: total > 0 ? Math.round((item.value / total) * 100) : 0,
      })),
    };
  }, [cashflowData.chart]);

  const quarterlyRevenueSeries = useMemo(() => {
    if (quarterlyRevenue.total > 0) return quarterlyRevenue.items.map((item) => item.value);
    return [1];
  }, [quarterlyRevenue]);

  const quarterlyRevenueDonutOptions = useMemo(
    () => ({
      chart: {
        type: "donut",
        sparkline: { enabled: true },
      },
      labels:
        quarterlyRevenue.total > 0
          ? quarterlyRevenue.items.map((item) => item.name)
          : ["No Revenue"],
      colors:
        quarterlyRevenue.total > 0
          ? quarterlyRevenue.items.map((item) => item.color)
          : ["#e5e7eb"],
      dataLabels: { enabled: false },
      legend: { show: false },
      tooltip: { enabled: false },
      stroke: { width: 0 },
      plotOptions: {
        pie: {
          donut: {
            size: "64%",
          },
        },
      },
      states: {
        hover: { filter: { type: "none" } },
        active: { filter: { type: "none" } },
      },
    }),
    [quarterlyRevenue],
  );

  const cashReceivedChartOptions = useMemo(
    () => ({
      chart: {
        type: "bar",
        toolbar: { show: false },
        sparkline: { enabled: false },
        fontFamily: FONT,
        events: {
          mounted: stripApexNativeTitles,
          updated: stripApexNativeTitles,
        },
      },
      colors: ["#2563eb"],
      plotOptions: {
        bar: {
          borderRadius: 0,
          columnWidth: "58%",
          distributed: false,
          dataLabels: {
            position: "top",
          },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: {
          colors: ["#2563eb"],
          fontSize: "9px",
          fontFamily: FONT,
          fontWeight: 700,
        },
        formatter: (value) => (value > 0 ? fmtN(value) : ""),
      },
      legend: { show: false },
      tooltip: {
        enabled: true,
        fillSeriesColor: false,
        theme: false,
        shared: false,
        intersect: false,
        x: { show: false },
        marker: { show: false },
        custom: ({ dataPointIndex }) => {
          const point = cashflowData.chart[dataPointIndex];
          if (!point) return "";
          return `<div style="padding:10px 12px;font-family:${FONT};min-width:120px;">
            <div style="font-size:12px;font-weight:700;color:#0f172a;">${point.month}</div>
            <div style="margin-top:4px;font-size:12px;color:#000000;font-weight:500;">${PESO}${fmt(point.revenue)}</div>
          </div>`;
        },
      },
      xaxis: {
        categories: cashflowData.chart.map((item) => item.month),
        labels: {
          rotate: -35,
          rotateAlways: true,
          style: {
            colors: "#475569",
            fontSize: "10px",
            fontFamily: FONT,
          },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        min: 0,
        max: 400000,
        tickAmount: 4,
        labels: {
          formatter: (value) => (value === 0 ? "0" : `${Math.round(value / 1000)}K`),
          style: {
            colors: "#475569",
            fontSize: "10px",
            fontFamily: FONT,
          },
        },
      },
      grid: {
        borderColor: "#eef2f7",
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
      },
      stroke: { show: false },
    }),
    [cashflowData.chart],
  );

  const receivablesChartOptions = useMemo(
    () => ({
      chart: {
        type: "bar",
        toolbar: { show: false },
        sparkline: { enabled: false },
        fontFamily: FONT,
        events: {
          mounted: stripApexNativeTitles,
          updated: stripApexNativeTitles,
        },
      },
      colors: ["#5B7FF5"],
      plotOptions: {
        bar: {
          borderRadius: 0,
          columnWidth: "58%",
          distributed: false,
          dataLabels: {
            position: "top",
          },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: {
          colors: ["#5B7FF5"],
          fontSize: "9px",
          fontFamily: FONT,
          fontWeight: 700,
        },
        formatter: (value) => (value > 0 ? fmtN(value) : ""),
      },
      legend: { show: false },
      tooltip: {
        enabled: true,
        fillSeriesColor: false,
        theme: false,
        shared: false,
        intersect: false,
        x: { show: false },
        marker: { show: false },
        custom: ({ dataPointIndex }) => {
          const point = cashflowData.chart[dataPointIndex];
          if (!point) return "";
          return `<div style="padding:10px 12px;font-family:${FONT};min-width:120px;">
            <div style="font-size:12px;font-weight:700;color:#0f172a;">${point.month}</div>
            <div style="margin-top:4px;font-size:12px;color:#000000;font-weight:500;">${PESO}${fmt(point.outstanding)}</div>
          </div>`;
        },
      },
      xaxis: {
        categories: cashflowData.chart.map((item) => item.month),
        labels: {
          rotate: -35,
          rotateAlways: true,
          style: {
            colors: "#475569",
            fontSize: "10px",
            fontFamily: FONT,
          },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        min: 0,
        max: 400000,
        tickAmount: 4,
        labels: {
          formatter: (value) => (value === 0 ? "0" : `${Math.round(value / 1000)}K`),
          style: {
            colors: "#475569",
            fontSize: "10px",
            fontFamily: FONT,
          },
        },
      },
      grid: {
        borderColor: "#eef2f7",
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
      },
      stroke: { show: false },
    }),
    [cashflowData.chart],
  );

  const topFishCatchChartOptions = useMemo(
    () => {
      const topFishCatchSlots = [...topFishCatches];
      while (topFishCatchSlots.length < 2) {
        topFishCatchSlots.push({
          name: "",
          quantity: 0,
          isPlaceholder: true,
        });
      }

      return {
        chart: {
          type: "bar",
          toolbar: { show: false },
          sparkline: { enabled: false },
          fontFamily: FONT,
          events: {
            mounted: stripApexNativeTitles,
            updated: stripApexNativeTitles,
          },
        },
        colors: ["#2563eb"],
        plotOptions: {
          bar: {
            horizontal: true,
            borderRadius: 6,
            barHeight: "78%",
          },
        },
        fill: {
          opacity: 1,
          colors: ["#2563eb"],
        },
        dataLabels: {
          enabled: false,
        },
        legend: { show: false },
        tooltip: {
          enabled: true,
          fillSeriesColor: false,
          theme: false,
          shared: false,
          custom: ({ dataPointIndex }) => {
            const point = topFishCatchSlots[dataPointIndex];
            if (!point || point.isPlaceholder) return "";
            return `<div style="padding:10px 12px;font-family:${FONT};min-width:140px;">
              <div style="font-size:12px;font-weight:700;color:#0f172a;">${point.name}</div>
              <div style="margin-top:4px;font-size:12px;color:#475569;">${fmtN(point.quantity)} catches</div>
            </div>`;
          },
        },
        xaxis: {
          min: 0,
          max: 100,
          tickAmount: 5,
          categories: topFishCatchSlots.map((item, index) => item.name || ` `),
          labels: {
            style: {
              colors: "#475569",
              fontSize: "10px",
              fontFamily: FONT,
            },
            formatter: (value) => fmtN(value),
          },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: {
          labels: {
            style: {
              colors: "#475569",
              fontSize: "11px",
              fontFamily: FONT,
              fontWeight: 600,
            },
            maxWidth: 120,
            formatter: (value) => value || " ",
          },
        },
        grid: {
          borderColor: "#eef2f7",
          strokeDashArray: 3,
          yaxis: { lines: { show: false } },
        },
        stroke: {
          show: true,
          width: 1,
          colors: ["#1d4ed8"],
        },
      };
    },
    [topFishCatches],
  );

  const monthlyFishCatchChartOptions = useMemo(
    () => ({
      chart: {
        type: "line",
        toolbar: { show: false },
        sparkline: { enabled: false },
        fontFamily: FONT,
      },
      colors: ["#2563eb"],
      stroke: {
        curve: "smooth",
        width: 3,
      },
      markers: {
        size: 5,
        strokeWidth: 2,
        strokeColors: "#ffffff",
        colors: ["#2563eb"],
        hover: {
          size: 6,
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -10,
        style: {
          colors: ["#2563eb"],
          fontSize: "10px",
          fontFamily: FONT,
          fontWeight: 700,
        },
        formatter: (value) => fmtN(value),
      },
      legend: { show: false },
      tooltip: {
        enabled: true,
        shared: true,
        intersect: false,
        custom: ({ dataPointIndex }) => {
          const point = monthlyFishCatches[dataPointIndex];
          if (!point) return "";

          const rows = Object.entries(point.breakdown || {})
            .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
            .map(
              ([name, quantity]) =>
                `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:6px;">
                  <span style="color:#475569;">${name}</span>
                  <span style="color:#0f172a;font-weight:700;">${fmtN(quantity)}</span>
                </div>`,
            )
            .join("");

          return `<div style="padding:10px 12px;font-family:${FONT};min-width:180px;">
            <div style="font-size:12px;font-weight:700;color:#0f172a;">${point.month}</div>
            ${rows || `<div style="margin-top:6px;font-size:12px;color:#94a3b8;">No fish data</div>`}
          </div>`;
        },
      },
      xaxis: {
        categories: monthlyFishCatches.map((item) => item.month),
        labels: {
          rotate: -35,
          rotateAlways: true,
          style: {
            colors: "#475569",
            fontSize: "10px",
            fontFamily: FONT,
          },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        min: 0,
        max: 30000,
        tickAmount: 3,
        labels: {
          style: {
            colors: "#475569",
            fontSize: "10px",
            fontFamily: FONT,
          },
          formatter: (value) => fmtN(value),
        },
      },
      grid: {
        borderColor: "#eef2f7",
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
      },
      fill: {
        opacity: 1,
      },
    }),
    [monthlyFishCatches],
  );

  const yearlyRevenueData = useMemo(() => {
    const years = getFiscalYearOptions().map((value) => Number(value));
    const vehicleTickets = (data?.vehicleTickets ?? []).filter(
      (ticket) =>
        !Boolean(ticket?.is_voided || ticket?.voided_at) &&
        String(ticket?.status || "").toLowerCase() !== "voided",
    );
    const dockings = data?.dockings ?? [];
    const banyeraTransactions = data?.banyeraTransactions ?? [];

    const getYear = (value) => {
      const parsedDate = new Date(value || 0);
      return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getFullYear();
    };

    const getBanyeraTransactionTotal = (transaction) => {
      const storedTotal = Number(transaction?.total_fee ?? 0);
      if (storedTotal > 0) return storedTotal;
      return (transaction?.items ?? []).reduce(
        (sum, item) => sum + Number(item?.subtotal ?? 0),
        0,
      );
    };

    const revenueByYear = {};

    // Calculate revenue from vehicle tickets (transaction amounts)
    vehicleTickets.forEach((ticket) => {
      const year = getYear(ticket?.ticket_date || ticket?.issued_at || ticket?.created_at);
      if (!year) return;
      const amount = Number(ticket?.ticket_fee || 0);
      revenueByYear[year] = (revenueByYear[year] ?? 0) + amount;
    });

    // Calculate revenue from dockings (transaction amounts)
    dockings.forEach((docking) => {
      const year = getYear(docking?.docking_date || docking?.created_at);
      if (!year) return;
      const amount = Number(docking?.docking_fee ?? 0);
      revenueByYear[year] = (revenueByYear[year] ?? 0) + amount;
    });

    // Calculate revenue from banyera transactions (transaction amounts)
    banyeraTransactions.forEach((transaction) => {
      const year = getYear(transaction?.transaction_date || transaction?.created_at);
      if (!year) return;
      const amount = getBanyeraTransactionTotal(transaction);
      revenueByYear[year] = (revenueByYear[year] ?? 0) + amount;
    });

    return years.map((year) => ({
      year: String(year),
      revenue: revenueByYear[year] ?? 0,
    }));
  }, [data]);

  const yearlyRevenueChartOptions = useMemo(
    () => ({
      chart: {
        type: "bar",
        toolbar: { show: false },
        sparkline: { enabled: false },
        fontFamily: FONT,
        events: {
          mounted: stripApexNativeTitles,
          updated: stripApexNativeTitles,
        },
      },
      colors: ["#2563eb"],
      plotOptions: {
        bar: {
          borderRadius: 0,
          columnWidth: "58%",
          distributed: false,
          dataLabels: {
            position: "top",
          },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: {
          colors: ["#2563eb"],
          fontSize: "9px",
          fontFamily: FONT,
          fontWeight: 700,
        },
        formatter: (value) => (value > 0 ? fmtN(value) : ""),
      },
      legend: { show: false },
      tooltip: {
        enabled: true,
        fillSeriesColor: false,
        theme: false,
        shared: false,
        intersect: false,
        x: { show: false },
        marker: { show: false },
        custom: ({ dataPointIndex }) => {
          const point = yearlyRevenueData[dataPointIndex];
          if (!point) return "";
          return `<div style="padding:10px 12px;font-family:${FONT};min-width:120px;">
            <div style="font-size:12px;font-weight:700;color:#0f172a;">${point.year}</div>
            <div style="margin-top:4px;font-size:12px;color:#000000;font-weight:500;">${PESO}${fmt(point.revenue)}</div>
          </div>`;
        },
      },
      xaxis: {
        categories: yearlyRevenueData.map((item) => item.year),
        labels: {
          rotate: -35,
          rotateAlways: true,
          style: {
            colors: "#475569",
            fontSize: "10px",
            fontFamily: FONT,
          },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        min: 0,
        max: 1800000,
        tickAmount: 6,
        labels: {
          formatter: (value) => {
            if (value === 0) return "0";
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            return `${Math.round(value / 1000)}K`;
          },
          style: {
            colors: "#475569",
            fontSize: "10px",
            fontFamily: FONT,
          },
        },
      },
      grid: {
        borderColor: "#eef2f7",
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
      },
      stroke: { show: false },
    }),
    [yearlyRevenueData],
  );

  const handleSaveMonthlyTarget = async () => {
    const trimmedValue = String(targetInput ?? "").trim();
    if (!trimmedValue) {
      setTargetError("Monthly target amount is required.");
      return;
    }
    const numericValue = Number(trimmedValue);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setTargetError("Enter a valid target amount of 0 or higher.");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    setMonthlyTarget(numericValue);
    setTargetError("");
    setTargetModalOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-white" style={{ fontFamily: FONT }}>
      <Sidebar
        activeItem={activeItem}
        setActiveItem={setActiveItem}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onWidthChange={handleWidthChange}
      />

      <div
        className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
        style={{
          marginLeft:
            sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px",
          transition: "margin-left 0.3s ease",
        }}
      >
        <Topbar
          sidebarOpen={sidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          onMenuToggle={toggleSidebar}
        />

        <main
          className="min-w-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8 [&::-webkit-scrollbar]:hidden"
          style={HIDE_SCROLLBAR_STYLE}
        >
          <div className="mx-auto w-full max-w-[1440px]">

            {/* Page heading */}
            <div className="mb-6 flex items-start justify-between gap-4">
              <TitlePage title="Dashboard" subtitle="Overview of fish port operations" loading={showInitialSkeleton} />

              <div className="relative" data-year-dropdown>
                {showInitialSkeleton ? (
                  <div className="h-[42px] min-w-[112px] animate-pulse rounded-[10px] border border-slate-200 bg-slate-100" />
                ) : (
                  <button
                    type="button"
                    onClick={() => setYearDropdownOpen((v) => !v)}
                    className="flex min-w-[112px] items-center justify-between gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {selectedYear}
                    {yearDropdownOpen ? (
                      <IoChevronUpOutline className="text-[13px] text-slate-400" />
                    ) : (
                      <IoChevronDownOutline className="text-[13px] text-slate-400" />
                    )}
                  </button>
                )}
                {yearDropdownOpen && (
                  <div
                    className="absolute right-0 top-[calc(100%+8px)] z-20 max-h-[220px] min-w-[112px] overflow-y-auto rounded-[10px] border border-slate-200 bg-white pt-0 pb-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)] [&::-webkit-scrollbar]:hidden"
                    style={HIDE_SCROLLBAR_STYLE}
                  >
                    {yearOptions.map((year) => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setSelectedYear(year);
                          setYearDropdownOpen(false);
                        }}
                        className="block w-full border-none px-3 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                        style={{
                          backgroundColor: year === selectedYear ? "#1a1f36" : "transparent",
                          color: year === selectedYear ? "#ffffff" : "#1a1f36",
                          fontWeight: 400,
                        }}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Stat cards */}
            <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {STATS.map((card) => (
                <StatCard
                  key={card.label}
                  {...card}
                  value={
                    card.key === "boats"
                      ? boatsRegistered
                      : card.key === "docking"
                        ? totalDockingTransactions
                        : card.key === "banyera"
                          ? totalBanyeraTransactions
                          : card.key === "tickets"
                            ? totalVehicleTicketTransactions
                            : card.key === "remittances"
                              ? totalRemittances
                              : card.key === "revenue"
                                ? totalTransactionRevenue
                                : card.value
                  }
                  loading={showInitialSkeleton}
                  showGrowthChart={true}
                />
              ))}
            </div>

            {/* Revenue + Bill Status + Monthly Target */}
            <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_390px]">
              <div className="order-2">
                <section className="ml-auto w-full max-w-[390px] rounded-[10px] border border-slate-200 bg-white px-4 py-3">
                  {showInitialSkeleton ? (
                    <div className="pb-5">
                      <SkeletonBlock className="mx-auto mt-2 h-[16px] w-32" />
                      <div className="mx-auto mt-6 h-[132px] w-[264px] animate-pulse rounded-t-full bg-slate-200" />
                      <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div key={`monthly-target-skeleton-${index}`} className="flex items-center justify-between px-4 py-3">
                            <SkeletonBlock className="h-[16px] w-20" />
                            <SkeletonBlock className="h-5 w-28" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="relative flex items-start justify-center">
                        <p
                          className="mt-2 text-[13px] text-slate-600 font-medium text-center"
                          style={{ fontFamily: FONT }}
                        >
                          Monthly Target
                        </p>
                        <div className="absolute right-0 top-0" data-target-dropdown>
                          <button
                            type="button"
                            onClick={() => setTargetDropdownOpen((v) => !v)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                          >
                            <IoEllipsisHorizontalOutline className="text-[18px]" />
                          </button>
                          {targetDropdownOpen && (
                            <div className="absolute right-0 top-[calc(100%+6px)] z-20 rounded-2xl border border-slate-200 bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetInput(String(monthlyTarget));
                                  setTargetError("");
                                  setTargetModalOpen(true);
                                  setTargetDropdownOpen(false);
                                }}
                                className="block whitespace-nowrap border-none bg-transparent px-3 py-2 text-left text-[13px] font-medium text-slate-700"
                                style={{ fontFamily: FONT }}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-1 flex flex-col items-center">
                        <div className="relative mb-1 h-[152px] w-full overflow-hidden">
                          <div className="absolute left-1/2 top-[-32px] -translate-x-1/2">
                            <ReactApexChart
                              type="radialBar"
                              series={[monthlyTargetFill]}
                              options={monthlyTargetChartOptions}
                              width={360}
                              height={220}
                            />
                          </div>
                          <div className="pointer-events-none absolute left-1/2 bottom-[24px] -translate-x-1/2">
                            <p
                              className="m-0 text-[22px] font-extrabold leading-none text-slate-900"
                              style={{ fontFamily: FONT }}
                            >
                              {monthlyTargetProgress.toFixed(2)}%
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-1 mb-5 overflow-hidden rounded-[10px] border border-slate-200 bg-white">
                        <div className="grid grid-cols-1 divide-y divide-slate-200">
                          {[
                            { label: "Target", value: `\u20B1${fmt(monthlyTarget)}` },
                            { label: "Revenue", value: `\u20B1${fmt(monthlyRevenue)}` },
                            { label: "Today", value: `\u20B1${fmt(todayRevenue)}` },
                          ].map(({ label, value }) => (
                            <div
                              key={label}
                              className="flex items-center justify-between gap-4 px-4 py-3"
                            >
                              <p
                                className="text-[13px] font-medium text-slate-500"
                                style={{ fontFamily: FONT }}
                              >
                                {label}
                              </p>
                              <p
                                className="text-[18px] font-bold leading-none text-slate-900"
                                style={{ fontFamily: FONT }}
                              >
                                {value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </section>

                <section className="mt-5 h-[180px] ml-auto w-full max-w-[390px] rounded-[10px] border border-slate-200 bg-white px-4 py-3">
                </section>
              </div>

              <div className="order-1 space-y-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch">
                  <div className="xl:w-[300px] xl:flex-shrink-0">
                    <section className="h-full rounded-[10px] border border-slate-200 bg-white px-5 py-4">
                      {showInitialSkeleton ? (
                        <DonutCardSkeleton labelWidth="w-24" />
                      ) : (
                      <div className="flex flex-col items-center justify-center pt-2">
                        <div className="mb-4 flex items-center gap-2">
                          <p
                            className="text-[13px] font-medium text-slate-500"
                            style={{ fontFamily: FONT }}
                          >
                            Bill Status
                          </p>
                        </div>

                        <div className="relative" style={{ width: 208, height: 184 }}>
                          <div
                            className="absolute"
                            style={{ top: 8, left: 24, width: 152, height: 152 }}
                          >
                            <ReactApexChart
                              type="donut"
                              series={billsDonutSeries}
                              options={billsDonutOptions}
                              width={152}
                              height={152}
                            />
                          </div>

                          <div
                            className="pointer-events-none absolute flex flex-col items-center justify-center"
                            style={{ top: 34, left: 54, width: 96, height: 96 }}
                          >
                            <p className="m-0 text-[10px] font-medium text-[#7b8ba7]">Total</p>
                            <p className="m-0 text-[15px] font-extrabold leading-none text-[#10233f]">
                              {fmtN(totalBills)}
                            </p>
                          </div>

                          {(totalBills > 0
                            ? billsStatusWithPercent
                            : billsStatus.map((s) => ({ ...s, percent: 0 }))
                          ).map((item, index) => {
                            const positions = [
                              { left: 0, top: 38, align: "left" },
                              { right: 4, top: 18, align: "right" },
                              { right: 2, bottom: 28, align: "right" },
                            ];
                            const position = positions[index] ?? positions[0];

                            return (
                              <div
                                key={item.key}
                                className="absolute"
                                style={position}
                              >
                                <p
                                  className={`m-0 text-[12px] font-bold leading-none text-slate-900 ${
                                    position.align === "right" ? "text-right" : "text-left"
                                  }`}
                                >
                                  {item.value}
                                </p>
                                <p
                                  className={`m-0 mt-1 text-[10px] font-medium text-slate-600 ${
                                    position.align === "right" ? "text-right" : "text-left"
                                  }`}
                                >
                                  {item.name}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      )}
                    </section>
                  </div>

                  <div className="min-w-0 xl:flex-1">
                    <section className="h-[276px] rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                      {showInitialSkeleton ? (
                        <MetricChartSkeleton />
                      ) : (
                      <>
                      <div className="mb-3">
                        <div className="w-full rounded-[10px] border border-slate-200 bg-white px-6 py-3 text-center">
                          <p
                            className="m-0 text-[13px] font-medium text-slate-500"
                            style={{ fontFamily: FONT }}
                          >
                            Total Cash Received
                          </p>
                          <p
                            className="m-0 mt-1 text-[28px] font-bold leading-none text-slate-900"
                            style={{ fontFamily: FONT }}
                          >
                            {`\u20B1${fmt(cashflowData.totalRevenue)}`}
                          </p>
                        </div>
                      </div>

                      <div className="relative -mt-2 -mb-2 -ml-3 -mr-2">
                        {activeCashMonthIndex !== null && cashflowData.chart[activeCashMonthIndex] ? (
                          <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                            <p className="m-0 text-[12px] font-bold text-black">
                              {cashflowData.chart[activeCashMonthIndex].month}
                            </p>
                            <p className="m-0 mt-1 text-[15px] font-medium leading-none text-black">
                              {`\u20B1${fmt(cashflowData.chart[activeCashMonthIndex].revenue)}`}
                            </p>
                          </div>
                        ) : null}
                        <ReactApexChart
                          type="bar"
                          series={[
                          {
                            name: "Cash Received",
                            data: cashflowData.chart.map((item) => item.revenue),
                          },
                        ]}
                        options={cashReceivedChartOptions}
                        height={190}
                        />
                        <div className="absolute inset-x-[18px] bottom-[8px] z-20 flex h-[30px]">
                          {cashflowData.chart.map((item, index) => (
                            <button
                              key={`cash-month-${item.month}`}
                              type="button"
                              aria-label={`Show cash received for ${item.month}`}
                              onClick={() =>
                                setActiveCashMonthIndex((current) =>
                                  current === index ? null : index,
                                )
                              }
                              className="h-full flex-1 bg-transparent"
                            />
                          ))}
                        </div>
                      </div>
                      </>
                      )}
                    </section>
                  </div>
                </div>

                <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch">
                  <div className="xl:w-[300px] xl:flex-shrink-0">
                    <section className="h-full rounded-[10px] border border-slate-200 bg-white px-5 py-4">
                      {showInitialSkeleton ? (
                        <DonutCardSkeleton labelWidth="w-36" />
                      ) : (
                      <div className="flex flex-col items-center justify-center pt-2">
                        <div className="mb-4 flex items-center gap-2">
                          <p
                            className="text-[13px] font-medium text-slate-500"
                            style={{ fontFamily: FONT }}
                          >
                            Revenue Per Quarter
                          </p>
                        </div>

                        <div className="relative" style={{ width: 208, height: 176 }}>
                          <div
                            className="absolute"
                            style={{ top: 6, left: 24, width: 152, height: 152 }}
                          >
                            <ReactApexChart
                              type="donut"
                              series={quarterlyRevenueSeries}
                              options={quarterlyRevenueDonutOptions}
                              width={152}
                              height={152}
                            />
                          </div>

                          <div
                            className="pointer-events-none absolute flex flex-col items-center justify-center"
                            style={{ top: 34, left: 54, width: 96, height: 96 }}
                          >
                          </div>

                          {(quarterlyRevenue.total > 0
                            ? quarterlyRevenue.items
                            : [
                                { key: "q1", name: "Q1", percent: 0 },
                                { key: "q2", name: "Q2", percent: 0 },
                                { key: "q3", name: "Q3", percent: 0 },
                                { key: "q4", name: "Q4", percent: 0 },
                              ]
                          ).map((item, index) => {
                            const positions = [
                              { left: -2, top: 28, align: "left" },
                              { right: 2, top: 16, align: "right" },
                              { left: 0, bottom: 22, align: "left" },
                              { right: 2, bottom: 22, align: "right" },
                            ];
                            const position = positions[index] ?? positions[0];

                            return (
                              <div key={item.key} className="absolute" style={position}>
                                <p
                                  className={`m-0 text-[12px] font-bold leading-none text-slate-900 ${
                                    position.align === "right" ? "text-right" : "text-left"
                                  }`}
                                >
                                  {item.percent}%
                                </p>
                                <p
                                  className={`m-0 mt-1 text-[10px] font-medium text-slate-600 ${
                                    position.align === "right" ? "text-right" : "text-left"
                                  }`}
                                >
                                  {item.name}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      )}
                    </section>
                  </div>

                  <div className="min-w-0 xl:flex-1">
                    <section className="h-[276px] overflow-hidden rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                      {showInitialSkeleton ? (
                        <MetricChartSkeleton />
                      ) : (
                      <>
                      <div className="mb-3">
                        <div className="w-full rounded-[10px] border border-slate-200 bg-white px-6 py-3 text-center">
                          <p
                            className="m-0 text-[13px] font-medium text-slate-500"
                            style={{ fontFamily: FONT }}
                          >
                            Total Receivables
                          </p>
                          <p
                            className="m-0 mt-1 text-[28px] font-bold leading-none text-slate-900"
                            style={{ fontFamily: FONT }}
                          >
                            {`\u20B1${fmt(cashflowData.totalOutstanding)}`}
                          </p>
                        </div>
                      </div>

                      <div className="relative -mt-2 -mb-2 -ml-3 -mr-2">
                        {activeReceivableMonthIndex !== null &&
                        cashflowData.chart[activeReceivableMonthIndex] ? (
                          <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                            <p className="m-0 text-[12px] font-bold text-black">
                              {cashflowData.chart[activeReceivableMonthIndex].month}
                            </p>
                            <p className="m-0 mt-1 text-[15px] font-medium leading-none text-black">
                              {`\u20B1${fmt(cashflowData.chart[activeReceivableMonthIndex].outstanding)}`}
                            </p>
                          </div>
                        ) : null}
                        <ReactApexChart
                          type="bar"
                          series={[
                            {
                              name: "Receivables",
                              data: cashflowData.chart.map((item) => item.outstanding),
                            },
                          ]}
                          options={receivablesChartOptions}
                          height={190}
                        />
                        <div className="absolute inset-x-[18px] bottom-[8px] z-20 flex h-[30px]">
                          {cashflowData.chart.map((item, index) => (
                            <button
                              key={`receivable-month-${item.month}`}
                              type="button"
                              aria-label={`Show receivables for ${item.month}`}
                              onClick={() =>
                                setActiveReceivableMonthIndex((current) =>
                                  current === index ? null : index,
                                )
                              }
                              className="h-full flex-1 bg-transparent"
                            />
                          ))}
                        </div>
                      </div>
                      </>
                      )}
                    </section>
                  </div>
                </div>

              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
              <section className="rounded-[10px] border border-slate-200 bg-white px-5 py-4">
                {showInitialSkeleton ? (
                  <LineChartSkeleton />
                ) : (
                  <>
                    <div className="mb-4">
                      <p
                        className="m-0 text-center text-[13px] font-medium text-slate-500"
                        style={{ fontFamily: FONT }}
                      >
                        Fish Catches Per Month
                      </p>
                    </div>

                    <ReactApexChart
                      type="line"
                      series={[
                        {
                          name: "Fish Catches",
                          data: monthlyFishCatches.map((item) => item.catches),
                        },
                      ]}
                      options={monthlyFishCatchChartOptions}
                      height={240}
                    />
                  </>
                )}
              </section>

              <section className="rounded-[10px] border border-slate-200 bg-white px-5 py-4">
                {showInitialSkeleton ? (
                  <LineChartSkeleton />
                ) : (
                  <>
                    <div className="mb-4">
                      <p
                        className="m-0 text-center text-[13px] font-medium text-slate-500"
                        style={{ fontFamily: FONT }}
                      >
                        Yearly Revenue
                      </p>
                    </div>

                    <ReactApexChart
                      type="bar"
                      series={[
                        {
                          name: "Revenue",
                          data: yearlyRevenueData.map((item) => item.revenue),
                        },
                      ]}
                      options={yearlyRevenueChartOptions}
                      height={240}
                    />
                  </>
                )}
              </section>
            </div>

            {/* Recent Dockings + Recent Banyera — side by side */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

              {/* Recent Dockings */}
              <section
                className="rounded-[10px] bg-white p-6"
                style={{ border: "1px solid #e5e7eb" }}
              >
                {showInitialSkeleton ? (
                  <RecentTableSkeleton columns={5} rows={5} />
                ) : (
                  <>
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <p className="text-[13px] text-slate-700 font-bold">Recent Dockings</p>
                        <p className="mt-0.5 text-xs text-gray-400">Latest boat docking records</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" style={{ minWidth: "460px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e5e7eb", borderTop: "2px solid #e5e7eb" }}>
                        {["Boat Name", "Boat Type", "Date Added", "Time", `Total (${PESO})`].map((heading) => (
                          <th
                            key={heading}
                            className="pb-3 pt-3 text-left text-[11px] font-medium uppercase"
                            style={{ color: "#8C8CA0" }}
                          >
                            {heading === `Total (${PESO})` ? (
                              <div className="text-right">{heading}</div>
                            ) : (
                              heading
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentDockings.length ? (
                        recentDockings.map((record, index) => {
                          const dockingDate = new Date(record.docking_date || record.created_at);
                          const isLast = index === recentDockings.length - 1;
                          return (
                            <tr
                              key={record.docking_id}
                              style={{ borderBottom: isLast ? "none" : "1px solid #f1f5f9" }}
                            >
                              <td className="py-3 text-[13px] font-semibold text-blue-600">
                                {record.boat?.boat_name ?? record.boat_name ?? "—"}
                              </td>
                              <td className="py-3 text-[13px] text-slate-600">
                                {getBoatTypeName(record)}
                              </td>
                              <td className="py-3 text-xs text-gray-500">
                                {dockingDate.toLocaleDateString("en-PH", {
                                  year: "numeric",
                                  month: "short",
                                  day: "2-digit",
                                })}
                              </td>
                              <td className="py-3 text-xs text-gray-500">
                                {dockingDate.toLocaleTimeString("en-PH", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="py-3 text-right text-xs font-bold text-gray-800">
                                {fmt(record.docking_fee)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-[13px] text-slate-400">
                            No docking records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              {/* Recent Banyera */}
              <section
                className="rounded-[10px] bg-white p-6"
                style={{ border: "1px solid #e5e7eb" }}
              >
                {showInitialSkeleton ? (
                  <RecentTableSkeleton columns={6} rows={5} subtitleWidth="w-52" />
                ) : (
                  <>
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <p className="text-[13px] text-slate-700 font-bold">Recent Banyera</p>
                        <p className="mt-0.5 text-xs text-gray-400">Latest banyera transactions</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={HIDE_SCROLLBAR_STYLE}>
                      <table className="w-full text-sm" style={{ minWidth: "700px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e5e7eb", borderTop: "2px solid #e5e7eb" }}>
                        {["Boat Name", "Boat Type", "Fish Items", "Date", "Time", `Total (${PESO})`].map((heading) => (
                          <th
                            key={heading}
                            className="pb-3 pt-3 text-left text-[11px] font-medium uppercase"
                            style={{ color: "#8C8CA0" }}
                          >
                            {heading === `Total (${PESO})` ? (
                              <div className="text-right">{heading}</div>
                            ) : (
                              heading
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentBanyera.length ? (
                        recentBanyera.map((record, index) => {
                          const transactionDate = new Date(record.transaction_date || record.created_at);
                          const isLast = index === recentBanyera.length - 1;

                          return (
                            <tr
                              key={record.transaction_id}
                              style={{ borderBottom: isLast ? "none" : "1px solid #f1f5f9" }}
                            >
                              <td className="py-3 text-[13px] font-semibold text-blue-600">
                                {record?.boat?.boat_name || "—"}
                              </td>
                              <td className="py-3 text-[13px] text-slate-600">
                                {getBoatTypeName(record)}
                              </td>
                              <td className="py-3 text-[13px] text-slate-600">
                                {getFishItemsLabel(record)}
                              </td>
                              <td className="py-3 text-xs text-gray-500">
                                {transactionDate.toLocaleDateString("en-PH", {
                                  year: "numeric",
                                  month: "short",
                                  day: "2-digit",
                                })}
                              </td>
                              <td className="py-3 text-xs text-gray-500">
                                {transactionDate.toLocaleTimeString("en-PH", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="py-3 text-right text-xs font-bold text-gray-800">
                                {fmt(record?.total_fee || 0)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[13px] text-slate-400">
                            No banyera transactions found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

            </div>
          </div>
        </main>
      </div>

      {/* Monthly Target Modal */}
      {targetModalOpen && (
        <Modal
          title="Set Monthly Target"
          onClose={() => setTargetModalOpen(false)}
          onSave={handleSaveMonthlyTarget}
          saveLabel="Save"
          closeOnBackdrop
        >
          <ModalTextInput
            label={
              <>
                Monthly Target Amount <span className="text-red-500">*</span>
              </>
            }
            autoFocus
            type="text"
            inputMode="decimal"
            value={targetInput}
            onChange={(e) => {
              const sanitizedValue = e.target.value.replace(/[^\d.]/g, "");
              setTargetInput(sanitizedValue);
              if (targetError) setTargetError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveMonthlyTarget();
            }}
            placeholder="Enter target amount"
            icon={IoCashOutline}
            error={targetError}
          />
        </Modal>
      )}
    </div>
  );
};

export default Dashboard;

