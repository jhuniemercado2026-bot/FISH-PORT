import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import "typeface-montserrat";
import { Tooltip } from "antd";
import {
  IoCashOutline,
  IoChevronDownOutline,
  IoDocumentTextOutline,
  IoLayersOutline,
  IoPeopleOutline,
  IoReceiptOutline,
  IoSearchOutline,
} from "react-icons/io5";
import Sidebar from "../../layout/Sidebar";
import Topbar from "../../layout/Topbar";
import FilterButton from "../../components/FilterButton";
import Modal from "../../components/Modal";
import TableCard from "../../components/TableCard";
import OverviewCard from "../../components/Overview";
import Legend from "../../components/Legend";
import Tabs from "../../components/Tabs";
import Breadcrumbs from "../../components/Breadcrumbs";
import TitlePage from "../../components/TitlePage";
import NoDataFound from "../../components/NoDataFound";
import { useSidebar } from "../../store/sidebarStore";
import { getStatementOfAccountDataQueryOptions, useStatementOfAccountDataQuery } from "../../hooks/useStatementOfAccountDataQuery";
import { buildStatementOfAccountPdf } from "../../lib/pdfDocumentBoatStatement";
import { buildOwnerStatementPdf } from "../../lib/pdfDocumentOwnerStatement";

const FONT = "'Montserrat', sans-serif";
const PAGE_SIZE = 10;
const PAGE_DEBOUNCE_MS = 150;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "pending", label: "Unpaid" },
];

const STATUS_LEGEND = [
  { key: "paid", label: "Paid", meaning: "Fully settled billing record", color: "#16a34a" },
  { key: "partial", label: "Partial", meaning: "With payment but not yet fully settled", color: "#f59e0b" },
  { key: "pending", label: "Unpaid", meaning: "No payment recorded yet", color: "#ef4444" },
];

const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
};
const SOA_TABS = [
  { key: "owner-statement", label: "Owner Statement", icon: IoPeopleOutline },
  { key: "boat-statement", label: "Boat Statement", icon: IoDocumentTextOutline },
];

const getStatementTabFromPathname = (pathname) =>
  pathname === "/boat-statement" ? "boat-statement" : "owner-statement";

const getStatementPathFromTab = (tab) =>
  tab === "boat-statement" ? "/boat-statement" : "/owner-statement";

const formatMoney = (value) =>
  `\u20B1${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatAccountingMoney = (value) => {
  const amount = Number(value || 0);
  const formatted = formatMoney(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
};

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const getStatementStatus = (totalPaid, balance) => {
  if (balance <= 0.009) return { key: "paid", label: "Paid" };
  if (totalPaid > 0.009) return { key: "partial", label: "Partial" };
  return { key: "pending", label: "Unpaid" };
};

const getStatusColor = (status) => {
  switch (status) {
    case "paid": return "#16a34a";
    case "partial": return "#f59e0b";
    default: return "#ef4444";
  }
};

const normalizeTransactionLabel = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "ticket") return "Vehicle Ticket";
  if (normalized === "banyera") return "Banyera";
  if (normalized === "docking") return "Docking";
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getSortTimestamp = (value) => {
  const timestamp = new Date(value ?? 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getSoaHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = ["Statement of Account", "Boat Statement"].includes(highlightedSearchResult?.group)
    ? String(highlightedSearchResult?.id || "")
    : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("boat-") ? rawId.slice("boat-".length) : "";
};

const getOwnerStatementHighlightId = ({ highlightedSearchResult, search }) => {
  const stateId = highlightedSearchResult?.group === "Owner Statement" ? String(highlightedSearchResult?.id || "") : "";
  const urlId = new URLSearchParams(search).get("highlight") || "";
  const rawId = stateId || urlId;

  return rawId.startsWith("owner-") ? rawId.slice("owner-".length) : "";
};

const printPdfFile = (fileUrl) => {
  if (!fileUrl) return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = fileUrl;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };
};

const downloadPdfFile = (fileUrl, filename) => {
  if (!fileUrl) return;

  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const TH = ({ children, className = "" }) => (
  <th
    className={`whitespace-nowrap bg-white px-4 py-3 text-left text-[13px] font-semibold ${className}`.trim()}
    style={{ color: "#1a1f36", borderBottom: "2px solid #e5e7eb" }}
  >
    {children}
  </th>
);


const TailDropdown = ({ value, onChange, options }) => (
  <FilterButton value={value} onChange={onChange} options={options} height={42} width={160} />
);

const StatementOfAccountModal = ({
  open,
  record,
  pdfUrl,
  loading,
  onClose,
  title = "Boat Statement",
}) => {
  if (!open) return null;

  return (
    <Modal
      title={title}
      onClose={onClose}
      closeOnBackdrop
      maxWidth="920px"
      showFooter={false}
      bodyClassName="h-[68vh] max-h-[68vh] !overflow-hidden !p-0"
      contentClassName="h-full !gap-0"
    >
      <div className="relative h-full overflow-hidden bg-white">
        {loading || !pdfUrl ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-[13px] text-slate-500">
            Generating PDF preview...
          </div>
        ) : (
          <iframe
            key={pdfUrl}
            src={pdfUrl}
            title={`Statement of Account ${record?.boat_name || ""}`.trim()}
            className="h-full w-full border-0 bg-white"
          />
        )}
      </div>
    </Modal>
  );
};

const SuperStatementOfAccount = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedSearchResult = location.state?.universalSearchResult ?? null;
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebar } = useSidebar();
  const [activeItem, setActiveItem] = useState("SOA");
  const [contentMargin, setContentMargin] = useState(() => (window.innerWidth >= 1024 ? 256 : 0));
  const [activeSoaTab, setActiveSoaTab] = useState(() => getStatementTabFromPathname(location.pathname));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [requestedPage, setRequestedPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [ownerRequestedPage, setOwnerRequestedPage] = useState(1);
  const [soaPdfUrl, setSoaPdfUrl] = useState("");
  const [soaPdfLoading, setSoaPdfLoading] = useState(false);
  const [selectedBoatPreviewRecord, setSelectedBoatPreviewRecord] = useState(null);
  const [selectedOwnerRecord, setSelectedOwnerRecord] = useState(null);
  const selectedBoatKey = searchParams.get("boat") ?? "";
  
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const rawHighlightedBoatId = getSoaHighlightId({ highlightedSearchResult, search: location.search });
  const rawHighlightedOwnerId = getOwnerStatementHighlightId({ highlightedSearchResult, search: location.search });
  const highlightToken = rawHighlightedBoatId
    ? `${rawHighlightedBoatId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : rawHighlightedOwnerId
      ? `${rawHighlightedOwnerId}|${location.search}|${highlightedSearchResult?.group || ""}`
    : "";
  const [dismissedHighlightToken, setDismissedHighlightToken] = useState("");
  const highlightedBoatId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedBoatId;
  const highlightedOwnerId = dismissedHighlightToken === highlightToken ? "" : rawHighlightedOwnerId;
  const clearUniversalHighlight = React.useCallback(() => {
    const params = new URLSearchParams(location.search);
    const hadHighlight = params.delete("highlight");

    if (hadHighlight) {
      params.delete("status");
    }

    if (!highlightedSearchResult && !hadHighlight) return;

    if (highlightToken) {
      setDismissedHighlightToken(highlightToken);
    }

    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true, state: null }
    );
  }, [highlightToken, highlightedSearchResult, location.pathname, location.search, navigate]);

  useEffect(() => {
    setDismissedHighlightToken("");
  }, [location.key]);
  
  const { data, isLoading, isFetching, isError, refetch } = useStatementOfAccountDataQuery({
    page: currentPage,
    perPage: PAGE_SIZE,
    search: highlightedBoatId ? "" : debouncedSearch,
    status: highlightedBoatId ? "all" : statusFilter,
    highlightBoatId: highlightedBoatId,
  }, {
    enabled: activeSoaTab === "boat-statement" || Boolean(highlightedBoatId),
  });
  const {
    data: ownerStatementData,
    isLoading: isOwnerStatementLoading,
    isError: isOwnerStatementError,
    refetch: refetchOwnerStatements,
  } = useStatementOfAccountDataQuery({
    page: ownerRequestedPage,
    perPage: PAGE_SIZE,
    search: highlightedOwnerId ? "" : debouncedSearch,
    status: highlightedOwnerId ? "all" : statusFilter,
    statementType: "owners",
    highlightOwnerId: highlightedOwnerId,
  }, {
    enabled: activeSoaTab === "owner-statement" || Boolean(highlightedOwnerId),
  });
  const { data: selectedBoatData } = useStatementOfAccountDataQuery(
    {
      boat: selectedBoatKey,
      perPage: PAGE_SIZE,
      selectedOnly: true,
    },
    {
      enabled: Boolean(selectedBoatKey),
    },
  );
  const boatRecords = data?.boatRecords ?? [];
  const soaMeta = data?.meta ?? {
    current_page: currentPage,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };
  const soaStats = (
    activeSoaTab === "owner-statement"
      ? ownerStatementData?.overviewStats
      : data?.overviewStats
  ) ?? data?.overviewStats ?? ownerStatementData?.overviewStats ?? data?.stats ?? ownerStatementData?.stats ?? {
    total_billed: 0,
    total_collected: 0,
    total_receivables: 0,
  };

  useEffect(() => {
    setActiveItem("SOA");
  }, []);

  useEffect(() => {
    setActiveSoaTab(getStatementTabFromPathname(location.pathname));
  }, [location.pathname]);

  const handleStatementTabChange = (tab) => {
    setActiveSoaTab(tab);
    navigate({
      pathname: getStatementPathFromTab(tab),
      search: location.search,
    });
  };

  useEffect(() => {
    if (window.innerWidth >= 1024 && sidebarOpen) {
      setContentMargin(sidebarCollapsed ? 72 : 256);
    } else if (window.innerWidth < 1024) {
      setContentMargin(0);
    }
  }, [sidebarCollapsed, sidebarOpen]);

  const filteredBoatRecords = boatRecords;
  const ownerRecords = ownerStatementData?.ownerRecords ?? [];
  const ownerMeta = ownerStatementData?.meta ?? {
    current_page: ownerRequestedPage,
    last_page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    from: 0,
    to: 0,
  };

  useEffect(() => {
    setRequestedPage(1);
    setCurrentPage(1);
    setOwnerRequestedPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (requestedPage === currentPage) return undefined;

    const timeout = window.setTimeout(() => {
      setCurrentPage(requestedPage);
    }, PAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [currentPage, requestedPage]);

  const requestedQuery = searchParams.get("q") ?? "";

  useEffect(() => {
    setSearch(highlightedSearchResult ? "" : requestedQuery);
  }, [highlightedSearchResult, requestedQuery]);

  useEffect(() => {
    if (!highlightedBoatId && !highlightedOwnerId) return;
    setSearch("");
    setStatusFilter("all");
  }, [highlightedBoatId, highlightedOwnerId]);

  useEffect(() => {
    if (!highlightedBoatId) return;
    const resolvedPage = Number(soaMeta.current_page || 0);
    if (resolvedPage > 0 && (resolvedPage !== currentPage || resolvedPage !== requestedPage)) {
      setRequestedPage(resolvedPage);
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, requestedPage, soaMeta.current_page, highlightedBoatId]);

  useEffect(() => {
    if (!highlightedOwnerId) return;
    const resolvedPage = Number(ownerMeta.current_page || 0);
    if (resolvedPage > 0 && resolvedPage !== ownerRequestedPage) {
      setOwnerRequestedPage(resolvedPage);
    }
  }, [highlightedOwnerId, ownerMeta.current_page, ownerRequestedPage]);

  const highlightedRecordIndex = highlightedBoatId
    ? filteredBoatRecords.findIndex((record) => String(highlightedBoatId) === String(record.boat_id ?? record.boat_key))
    : -1;

  const rawSelectedBoatDetailRecord = selectedBoatData?.selectedBoatRecord ?? null;
  const selectedBoatDetailRecord =
    rawSelectedBoatDetailRecord && String(rawSelectedBoatDetailRecord.boat_key) === String(selectedBoatKey)
      ? rawSelectedBoatDetailRecord
      : null;
  const selectedBoatListRecord = useMemo(
    () =>
      selectedBoatKey
        ? boatRecords.find((record) => String(record.boat_key) === String(selectedBoatKey)) ?? null
        : null,
    [boatRecords, selectedBoatKey],
  );
  const selectedBoatRecord = selectedBoatDetailRecord ?? selectedBoatPreviewRecord ?? selectedBoatListRecord;
  const selectedBoatIsReady = Boolean(selectedBoatDetailRecord);

  useEffect(() => {
    if (!selectedBoatKey) {
      setSelectedBoatPreviewRecord(null);
      return;
    }

    if (selectedBoatDetailRecord) {
      setSelectedBoatPreviewRecord(selectedBoatDetailRecord);
    }
  }, [selectedBoatDetailRecord, selectedBoatKey]);

  const openStatementOfAccount = (record) => {
    setSelectedBoatPreviewRecord(record);
    setSoaPdfUrl("");
    setSoaPdfLoading(true);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set("boat", String(record.boat_key));
      return nextParams;
    });
  };

  const closeStatementOfAccount = () => {
    setSoaPdfLoading(false);
    setSelectedBoatPreviewRecord(null);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete("boat");
      return nextParams;
    });
  };

  const buildBoatStatementTransactions = (boatDetailRecord) => {
    if (!boatDetailRecord) return [];

    const transactions = [];
    const getPaymentDescription = (bill, payment) => {
      const totalAmount = Number(bill?.total_amount || bill?.balance_due || bill?.amount_due || 0);
      const amountPaid = Number(payment?.amount_paid || 0);
      const balanceAfterPayment = Math.max(0, totalAmount - amountPaid);

      if (balanceAfterPayment <= 0.009) {
        return "Full Payment Received";
      }

      return "Partial Payment Received";
    };

    (boatDetailRecord.bills || []).forEach((bill) => {
      (Array.isArray(bill.line_items) ? bill.line_items : [])
        .filter((item) => ["docking", "banyera", "ticket"].includes(String(item.transaction_type || "").toLowerCase()))
        .forEach((item, index) => {
          const transactionType = String(item.transaction_type || "").toLowerCase();
          const feeLabel =
            transactionType === "ticket"
              ? "Vehicle Ticket Fee"
              : `${normalizeTransactionLabel(transactionType)} Fee`;
          transactions.push({
            transaction_key: `charge-${bill.bill_id}-${transactionType}-${index}`,
            date: bill.date_billed,
            bill_reference: bill.bill_reference,
            type: "Bill",
            reference: "-",
            description: feeLabel,
            charge: Number(item.amount || 0),
            payment: 0,
          });
        });

      (bill.payments || [])
        .slice()
        .sort((a, b) => String(a.payment_date || "").localeCompare(String(b.payment_date || "")))
        .forEach((payment, index) => {
          transactions.push({
            transaction_key: `payment-${bill.bill_id}-${payment.payment_id ?? index}`,
            date: payment.payment_date,
            bill_reference: bill.bill_reference,
            type: "Payment",
            reference: String(
                payment.payment_reference_no ||
                payment.payment_reference ||
                payment.reference_no ||
                payment.reference_number ||
                payment.official_receipt_no ||
                payment.official_receipt_number ||
                payment.or_no ||
                payment.or_number ||
                payment.receipt_no ||
                payment.receipt_number ||
                "-"
            ),
            description: getPaymentDescription(bill, payment),
            charge: 0,
            payment: Number(payment.amount_paid || 0),
          });
        });
    });

    (boatDetailRecord.unbilled_charges || []).forEach((charge) => {
      transactions.push(charge);
    });

    const sortedTransactions = transactions.sort((a, b) => {
      const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
      if (dateCompare !== 0) return dateCompare;
      if (a.type === b.type) return 0;
      if (a.type === "Bill") return -1;
      if (b.type === "Bill") return 1;
      if (a.type === "Unbilled") return -1;
      if (b.type === "Unbilled") return 1;
      return 1;
    });

    let runningBalance = 0;
    return sortedTransactions.map((transaction) => {
      runningBalance += Number(transaction.charge || 0) - Number(transaction.payment || 0);
      return { ...transaction, running_balance: runningBalance };
    });
  };

  const getBoatStatementPeriod = (transactions) => {
    if (!transactions.length) return "-";
    const dates = transactions
      .map((transaction) => String(transaction.date || "").slice(0, 10))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (!dates.length) return "-";
    if (dates[0] === dates[dates.length - 1]) return formatDisplayDate(dates[0]);
    return `${formatDisplayDate(dates[0])} - ${formatDisplayDate(dates[dates.length - 1])}`;
  };

  const openOwnerStatement = async (record) => {
    setSelectedOwnerRecord(record);
    setSoaPdfUrl("");
    setSoaPdfLoading(true);

    try {
      const boatStatements = await Promise.all(
        (record?.boats ?? []).map(async (boat) => {
          const detailData = await queryClient.fetchQuery({
            ...getStatementOfAccountDataQueryOptions({
              boat: String(boat.boat_key ?? boat.boat_id),
              perPage: PAGE_SIZE,
              selectedOnly: true,
            }),
          });
          const detailRecord = detailData?.selectedBoatRecord ?? boat;
          const transactions = buildBoatStatementTransactions(detailRecord);
          return {
            boat: detailRecord,
            transactions,
            periodLabel: getBoatStatementPeriod(transactions),
          };
        }),
      );
      const pdfBytes = await buildOwnerStatementPdf({
        record,
        boatStatements,
      });
      const nextData = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
      const ownerName = String(record?.owner_name || "owner-statement")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const pdfFile = new File([nextData], `${ownerName || "owner-statement"}.pdf`, {
        type: "application/pdf",
      });
      setSoaPdfUrl(URL.createObjectURL(pdfFile));
    } catch (error) {
      console.error("Failed to generate owner statement PDF", error);
      setSoaPdfUrl("");
    } finally {
      setSoaPdfLoading(false);
    }
  };

  const closeOwnerStatement = () => {
    setSoaPdfLoading(false);
    setSelectedOwnerRecord(null);
    setSoaPdfUrl("");
  };

  const selectedBoatTransactions = useMemo(() => {
    return buildBoatStatementTransactions(selectedBoatDetailRecord);
  }, [selectedBoatDetailRecord]);

  const selectedBoatPeriod = useMemo(() => {
    return getBoatStatementPeriod(selectedBoatTransactions);
  }, [selectedBoatTransactions]);
  const overviewCards = useMemo(() => {
    return [
      { title: "Total Billed", value: formatAccountingMoney(soaStats.total_billed), icon: IoCashOutline, tone: "blue" },
      { title: "Total Collected", value: formatAccountingMoney(soaStats.total_collected), icon: IoReceiptOutline, tone: "green" },
      { title: "Total Receivables", value: formatAccountingMoney(soaStats.total_receivables), icon: IoDocumentTextOutline, tone: "amber" },
    ];
  }, [soaStats]);

  const totalPages = Math.max(1, Number(soaMeta.last_page || 1));
  const safePage = Math.min(requestedPage, totalPages);
  const paginatedRecords = filteredBoatRecords;
  const ownerTotalPages = Math.max(1, Number(ownerMeta.last_page || 1));
  const ownerSafePage = Math.min(ownerRequestedPage, ownerTotalPages);
  const ownerPaginatedRecords = ownerRecords;
  const hasSoaResponse = Boolean(data?.meta);
  const isSoaTableLoading = !isError && isLoading && !data;
  const isOwnerTableLoading = !isOwnerStatementError && isOwnerStatementLoading && !ownerStatementData;
  const isActiveStatementLoading = activeSoaTab === "owner-statement" ? isOwnerTableLoading : isSoaTableLoading;
  const hasOverviewStats = Boolean(data?.overviewStats || ownerStatementData?.overviewStats);
  const isPageChromeLoading = isActiveStatementLoading && !hasOverviewStats;
  const breadcrumbLabel = activeSoaTab === "boat-statement" ? "Boat Statement" : "Owner Statement";

  useEffect(() => {
    setRequestedPage((page) => Math.min(page, totalPages));
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setOwnerRequestedPage((page) => Math.min(page, ownerTotalPages));
  }, [ownerTotalPages]);
  
  useEffect(() => {
    if (!selectedBoatDetailRecord) {
      setSoaPdfUrl("");
      setSoaPdfLoading(Boolean(selectedBoatKey));
      return undefined;
    }

    let isActive = true;
    let nextUrl = "";

    const loadPdf = async () => {
      if (isActive) setSoaPdfLoading(true);
      try {
        const pdfBytes = await buildStatementOfAccountPdf({
          record: selectedBoatRecord,
          transactions: selectedBoatTransactions,
          periodLabel: selectedBoatPeriod,
        });

        if (!isActive) return;

        const nextData =
          pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
        const boatName = String(
          selectedBoatRecord?.boat_name || "statement-of-account",
        )
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const pdfFile = new File(
          [nextData],
          `${boatName || "statement-of-account"}.pdf`,
          { type: "application/pdf" },
        );
        nextUrl = URL.createObjectURL(pdfFile);
        setSoaPdfUrl(nextUrl);
      } catch (error) {
        console.error("Failed to generate statement of account PDF", error);
        if (isActive) {
          setSoaPdfUrl("");
        }
      } finally {
        if (isActive) setSoaPdfLoading(false);
      }
    };

    loadPdf();

    return () => {
      isActive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [selectedBoatDetailRecord, selectedBoatKey, selectedBoatPeriod, selectedBoatRecord, selectedBoatTransactions]);

  const statementTableActions = (
    <>
      <div
        className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-4 transition-all"
        style={{ height: 42, width: 300 }}
        onFocus={(event) => {
          event.currentTarget.style.borderColor = "#4096ff";
          event.currentTarget.style.boxShadow = "none";
        }}
        onBlur={(event) => {
          event.currentTarget.style.borderColor = "#e5e7eb";
          event.currentTarget.style.boxShadow = "none";
        }}
      >
        <IoSearchOutline className="flex-shrink-0 text-[17px]" style={{ color: "#1a1f36" }} />
        <input
          value={search}
          onChange={(event) => {
            clearUniversalHighlight();
            setSearch(event.target.value);
          }}
          placeholder={activeSoaTab === "owner-statement" ? "Search for owner name" : "Search for boat name"}
          className="w-full border-none bg-transparent text-[13px] outline-none"
          style={{ fontFamily: FONT, color: "#1a1f36" }}
        />
      </div>
      <TailDropdown
        value={statusFilter}
        onChange={(value) => {
          clearUniversalHighlight();
          setStatusFilter(value);
        }}
        options={STATUS_FILTER_OPTIONS}
      />
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onWidthChange={setContentMargin} />
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        style={{
          marginLeft: sidebarOpen && window.innerWidth >= 1024 ? `${contentMargin}px` : "0px",
          transition: "margin-left 0.3s ease",
        }}
      >
        <Topbar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} onMenuToggle={toggleSidebar} />
        <main className="flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-8">
          <div className="mx-auto w-full max-w-[1440px]">
            <div className="mb-5 flex items-center justify-between">
              <TitlePage title="Statement of Account" subtitle="Track all statement balances, payment progress, and billed transactions in one place." loading={isPageChromeLoading} />
              <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: breadcrumbLabel }]} fontFamily={FONT} loading={isPageChromeLoading} />
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {overviewCards.map((card) => (
                <OverviewCard key={card.title} {...card} loading={isPageChromeLoading} />
              ))}
            </div>

            <Tabs
                    tabs={SOA_TABS}
                    activeKey={activeSoaTab}
                    onTabChange={handleStatementTabChange}
                    fontFamily={FONT}
                    className="mb-5"
                    loading={isPageChromeLoading}
                    rightContent={<Legend items={STATUS_LEGEND} loading={isPageChromeLoading} />}
                  >
                    {activeSoaTab === "owner-statement" ? (
                      <TableCard
                        title="Owner Statement"
                        subtitle="All records of boat statement."
                        loading={isOwnerTableLoading}
                        headerActionsSkeletonCount={3}
                        bodyClassName="overflow-x-auto"
                        footerClassName="flex items-center justify-between"
                        actions={statementTableActions}
                        pagination={{
                          meta: ownerMeta,
                          totalPages: ownerTotalPages,
                          currentPage: ownerSafePage,
                          requestedPage: ownerRequestedPage,
                          isLoading: isOwnerTableLoading,
                          beforePageChange: clearUniversalHighlight,
                          onPageChange: setOwnerRequestedPage,
                        }}
                      >
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse" style={{ minWidth: 900 }}>
                            <thead>
                              <tr>
                                <TH>Owner Name</TH>
                                <TH className="text-right">No. of Boats</TH>
                                <TH className="text-right">No. of Bills</TH>
                                <TH className="text-right">No. of Payments</TH>
                                <TH className="text-right">Total Billed</TH>
                                <TH className="text-right">Total Paid</TH>
                                <TH className="text-right">Balance Due</TH>
                              </tr>
                            </thead>
                            <tbody>
                              {isOwnerTableLoading ? (
                                Array.from({ length: PAGE_SIZE }).map((_, index) => (
                                  <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    {Array.from({ length: 7 }).map((__, column) => (
                                      <td key={column} className="px-4 py-4">
                                        <div className="h-4 rounded bg-slate-100" style={{ width: column === 0 ? 150 : 90 }} />
                                      </td>
                                    ))}
                                  </tr>
                                ))
                              ) : isOwnerStatementError ? (
                                <tr>
                                  <td colSpan={7}>
                                    <div className="flex flex-col items-center justify-center py-14">
                                      <p className="m-0 text-[13px] text-red-500">Unable to load owner statement records.</p>
                                      <button
                                        type="button"
                                        onClick={() => refetchOwnerStatements()}
                                        className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1a1f36]"
                                      >
                                        Retry
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ) : ownerPaginatedRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={7}>
                                    <NoDataFound title={search || statusFilter !== "all" ? "No results found" : "No Data Found"} />
                                  </td>
                                </tr>
                              ) : (
                                ownerPaginatedRecords.map((record, index) => {
                                  const ownerIds = Array.isArray(record.owner_ids) ? record.owner_ids : [];
                                  const isHighlighted =
                                    highlightedOwnerId &&
                                    (String(highlightedOwnerId) === String(record.owner_id ?? record.owner_key) ||
                                      ownerIds.some((ownerId) => String(ownerId) === String(highlightedOwnerId)));

                                  return (
                                  <tr
                                    key={record.owner_key}
                                    onClick={() => openOwnerStatement(record)}
                                    className={`cursor-pointer transition-colors ${
                                      highlightedOwnerId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"
                                    } ${isHighlighted ? "universal-search-highlight" : ""}`.trim()}
                                    style={{ borderBottom: "1px solid #f1f5f9" }}
                                  >
                                    <td className="px-4 py-4">
                                      <Tooltip title="Click Me">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                            style={{ backgroundColor: getStatusColor(record.statement_status), minWidth: 10, minHeight: 10 }}
                                          />
                                          <span className="text-[13px] font-semibold text-[#1a1f36]">{record.owner_name}</span>
                                        </div>
                                      </Tooltip>
                                    </td>
                                    <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">{record.boat_count}</td>
                                    <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">{record.bill_count}</td>
                                    <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">{record.payment_count}</td>
                                    <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">
                                      {Number(record.total_billed || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">
                                      {Number(record.total_paid || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-4 text-right text-[13px] font-semibold text-[#1a1f36]">
                                      {Number(record.balance_due || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </TableCard>
                    ) : (
                    <TableCard
                      title="Boat Statement"
                      subtitle="All records of boat statement."
                      loading={isSoaTableLoading}
                      headerActionsSkeletonCount={3}
                      bodyClassName="overflow-x-auto"
                      footerClassName="flex items-center justify-between"
                      actions={statementTableActions}
                      pagination={{
                        meta: soaMeta,
                        totalPages,
                        currentPage: safePage,
                        requestedPage,
                        isLoading: isSoaTableLoading,
                        beforePageChange: clearUniversalHighlight,
                        onPageChange: setRequestedPage,
                      }}
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ minWidth: 1150 }}>
                      <thead>
                        <tr>
                          <TH>Boat Name</TH>
                          <TH>Boat Owner</TH>
                          <TH>Boat Type</TH>
                          <TH className="text-right">No. of Bills</TH>
                          <TH className="text-right">No. of Payments</TH>
                          <TH className="text-right">Total Billed (₱)</TH>
                          <TH className="text-right">Total Paid (₱)</TH>
                          <TH className="text-right">Balance Due (₱)</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {isSoaTableLoading ? (
                          Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <tr key={index} className="animate-pulse" style={{ borderBottom: "1px solid #f1f5f9" }}>
                              {Array.from({ length: 8 }).map((__, column) => (
                                <td key={column} className="px-4 py-4">
                                  <div className="h-4 rounded bg-slate-100" style={{ width: column <= 2 ? 120 : 90 }} />
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : isError ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="flex flex-col items-center justify-center py-14">
                                <p className="m-0 text-[13px] text-red-500">Unable to load statement records.</p>
                                <button
                                  type="button"
                                  onClick={() => refetch()}
                                  className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1a1f36]"
                                >
                                  Retry
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : paginatedRecords.length === 0 ? (
                          <tr>
                            <td colSpan={8}>
                              <NoDataFound title={search || statusFilter !== "all" ? "No results found" : "No Data Found"} />
                            </td>
                          </tr>
                        ) : (
                          paginatedRecords.map((record, index) => (
                            (() => {
                              const isHighlighted =
                                highlightedBoatId &&
                                String(highlightedBoatId) === String(record.boat_id ?? record.boat_key);
                              return (
                            <tr
                              key={record.boat_key}
                              onClick={() => openStatementOfAccount(record)}
                              className={`cursor-pointer transition-colors ${highlightedBoatId ? "table-row-plain" : index % 2 === 0 ? "table-row-even" : "table-row-odd"} ${isHighlighted ? "universal-search-highlight" : ""}`.trim()}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <td className="px-4 py-4">
                                <Tooltip title="Click Me">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                      style={{ backgroundColor: getStatusColor(record.statement_status), minWidth: 10, minHeight: 10 }}
                                    />
                                    <span className="text-[13px] font-semibold text-[#1a1f36]">{record.boat_name}</span>
                                  </div>
                                </Tooltip>
                              </td>
                              <td className="px-4 py-4 text-[13px] text-slate-700">{record.owner_name}</td>
                              <td className="px-4 py-4 text-[13px] text-slate-700">{record.boat_type}</td>
                              <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">{record.bill_count}</td>
                              <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">{record.payment_count}</td>
                              <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">
                                {Number(record.total_billed || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-4 text-right text-[13px] text-[#1a1f36]">
                                {Number(record.total_paid || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-4 text-right text-[13px] font-semibold text-[#1a1f36]">
                                {Number(record.balance_due || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                              );
                            })()
                          ))
                        )}
                      </tbody>
                        </table>
                      </div>
                    </TableCard>
                    )}
            </Tabs>
          </div>
        </main>
      </div>
      <StatementOfAccountModal
        open={Boolean(selectedBoatKey)}
        record={selectedBoatRecord}
        pdfUrl={soaPdfUrl}
        loading={soaPdfLoading || !selectedBoatIsReady}
        onClose={closeStatementOfAccount}
        title="Boat Statement"
      />
      <StatementOfAccountModal
        open={Boolean(selectedOwnerRecord)}
        record={selectedOwnerRecord}
        pdfUrl={soaPdfUrl}
        loading={soaPdfLoading}
        onClose={closeOwnerStatement}
        title="Owner Statement"
      />
    </div>
  );
};

export default SuperStatementOfAccount;
