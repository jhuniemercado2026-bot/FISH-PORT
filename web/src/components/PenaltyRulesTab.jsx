import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tooltip } from "antd";
import { IoAddOutline, IoCreateOutline, IoSearchOutline } from "react-icons/io5";
import api from "../api/axios";
import TableCard from "./TableCard";
import FilterButton from "./FilterButton";
import NoDataFound from "./NoDataFound";
import Modal, { ModalFieldError, ModalTextInput } from "./Modal";
import DatePicker from "./DatePicker";
import EndDatePicker from "./EndDatePicker";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { syncPenaltySettings } from "../utils/penaltySettingsSync";
import { togglePenaltyRule, usePenaltyToggleStore } from "../store/penaltyToggleStore";
import { readPenaltyTableState, writePenaltyTableState } from "../utils/settingsSession";

const STATUSES = [{ value: "all", label: "All Status" }, { value: "on", label: "On" }, { value: "off", label: "Off" }];
const dateLabel = (value) => {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "-";
};
const money = (value) => Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RuleToggle = ({ rule, busy, onToggle }) => (
  <button type="button" role="switch" aria-label={`Penalty ${rule.name}`} aria-checked={rule.is_active} disabled={busy} onClick={onToggle}
    className="relative flex h-10 w-[132px] cursor-pointer items-center rounded-full border p-1 transition-all disabled:cursor-not-allowed disabled:opacity-60"
    style={{ borderColor: rule.is_active ? "#86efac" : "#fca5a5", backgroundColor: rule.is_active ? "#f0fdf4" : "#fef2f2" }}>
    <span className="absolute inset-y-1 flex w-[60px] items-center justify-center rounded-full text-[12px] font-semibold text-white transition-all"
      style={{ left: rule.is_active ? "6px" : "calc(100% - 66px)", backgroundColor: rule.is_active ? "#16a34a" : "#dc2626" }}>{rule.is_active ? "ON" : "OFF"}</span>
    <span className="flex w-full items-center justify-between px-3.5 text-[11px] font-semibold tracking-[0.12em]">
      <span style={{ color: rule.is_active ? "#16a34a" : "#94a3b8" }}>ON</span><span style={{ color: rule.is_active ? "#94a3b8" : "#dc2626" }}>OFF</span>
    </span>
  </button>
);

export default function PenaltyRulesTab({ showToast }) {
  const queryClient = useQueryClient();
  const [savedTableState] = useState(readPenaltyTableState);
  const [search, setSearch] = useState(savedTableState.search);
  const [status, setStatus] = useState(savedTableState.status);
  const [page, setPage] = useState(savedTableState.page);
  useEffect(() => { writePenaltyTableState({ search, status, page }); }, [search, status, page]);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const toggleOperation = usePenaltyToggleStore((state) => state.operation);
  const toggling = toggleOperation?.status === "running";
  const debouncedSearch = useDebouncedValue(search, 300);
  const query = useQuery({
    queryKey: ["bill-penalty-rules", { search: debouncedSearch, status, page }],
    queryFn: async () => (await api.get("/settings/bill-penalty/rules", { params: { search: debouncedSearch, status, page, per_page: 10 } })).data,
    placeholderData: (previous) => previous, staleTime: 0, refetchInterval: 60000,
  });
  const rows = query.data?.data ?? [];
  const meta = query.data?.meta ?? { total: 0, current_page: 1, last_page: 1, from: null, to: null };
  useEffect(() => { if (query.data && !query.isPlaceholderData && page > meta.last_page) setPage(Math.max(1, meta.last_page)); }, [query.data, query.isPlaceholderData, page, meta.last_page]);
  const openEditor = (rule = {}) => {
    setErrors({}); setEditor(rule);
    setForm({ name: rule.name || "", amount: rule.amount || "", interval_value: String(rule.interval_value ?? 1), interval_unit: rule.interval_unit || "months",
      effective_from: rule.effective_from || query.data?.today || "", effective_to: rule.effective_to || "", is_active: rule.is_active ?? true });
  };
  const submit = async (values, rule = editor) => {
    setBusy(true); setErrors({});
    try {
      const response = rule?.id ? await api.patch(`/settings/bill-penalty/rules/${rule.id}`, values) : await api.post("/settings/bill-penalty/rules", values);
      const state = (await api.get("/settings/bill-penalty/state")).data.data;
      await syncPenaltySettings(queryClient, state);
      setEditor(null);
      showToast("success", "Penalty Updated", response.data.message);
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error.response?.data?.errors || {}).map(([key, messages]) => [key, messages[0]])));
      showToast("error", "Unable to Save Penalty", error.response?.data?.message || "Please try again.");
    } finally { setBusy(false); }
  };
  const saveForm = () => {
    const next = {};
    if (!form.name?.trim()) next.name = "Enter a penalty name.";
    if (!/^\d+(\.\d{1,2})?$/.test(form.amount) || Number(form.amount) <= 0 || Number(form.amount) > 9999999999.99) next.amount = "Enter a positive peso amount with up to two decimal places.";
    if (!Number.isInteger(Number(form.interval_value)) || Number(form.interval_value) < 1 || Number(form.interval_value) > 36500) next.interval_value = "Enter a whole number from 1 to 36,500.";
    if (!form.effective_from) next.effective_from = "Select the effective start date.";
    if (form.effective_to && form.effective_to < form.effective_from) next.effective_to = "The end date must be on or after the start date.";
    setErrors(next);
    if (!Object.keys(next).length) void submit({ ...form, name: form.name.trim(), amount: Number(form.amount), interval_value: Number(form.interval_value), effective_to: form.effective_to || null });
  };
  const lockedTerms = Boolean(editor?.has_assessments);
  return <>
    <TableCard title="Penalty Records" subtitle="Manage dated boat bill penalty rules and turn each record on or off."
      loading={query.isLoading} headerActionsSkeletonCount={3} bodyClassName="overflow-x-auto" footerClassName="flex items-center justify-between"
      pagination={{ meta, total: meta.total, totalPages: meta.last_page, currentPage: meta.current_page, requestedPage: page, isLoading: query.isFetching, onPageChange: setPage }}
      actions={<>
        <div className="flex h-[42px] w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-4 focus-within:border-[#4096ff] sm:w-[280px]">
          <IoSearchOutline className="shrink-0 text-[17px] text-[#1a1f36]" /><input type="search" aria-label="Search penalty records" placeholder="Search penalty name" value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="w-full border-none bg-transparent text-[13px] outline-none" />
        </div>
        <FilterButton width={160} value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={STATUSES} aria-label="Filter penalty status" />
        <button type="button" onClick={() => openEditor()} disabled={toggling} className="flex h-[42px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-[#1a1f36] px-4 text-[13px] font-semibold text-white hover:bg-[#2d3561] disabled:cursor-not-allowed disabled:opacity-60"><IoAddOutline /> Add Penalty</button>
      </>}>
      <table className="w-full min-w-[1020px] border-collapse text-left">
        <thead><tr>{["Penalty Name", "Amount (₱)", "Every", "Effectivity", "On / Off", "Action"].map((label, index) => <th key={label} className={`whitespace-nowrap border-b-2 border-slate-200 px-4 py-3 font-semibold ${[1, 5].includes(index) ? "text-right" : "text-left"}`}>{label}</th>)}</tr></thead>
        <tbody>{query.isLoading ? Array.from({ length: 10 }, (_, row) => <tr key={row}>{Array.from({ length: 6 }, (_, col) => <td key={col} className="px-4 py-4"><div className="h-3 w-24 animate-pulse rounded bg-slate-100" /></td>)}</tr>)
          : query.isError ? <tr><td colSpan={6} className="px-6 py-10 text-center text-[13px] text-red-600">Unable to load penalty records. <button type="button" onClick={() => query.refetch()} className="cursor-pointer underline">Try again</button></td></tr>
          : !rows.length ? <tr><td colSpan={6}><NoDataFound title="No penalty records found" description="Add a penalty record or change your search and status filter." /></td></tr>
          : rows.map((rule, index) => <tr key={rule.id} className={`border-b border-slate-100 text-[13px] text-[#1a1f36] ${index % 2 === 0 ? "table-row-even" : "table-row-odd"}`}>
            <td className="px-4 py-3 font-medium">{rule.name}</td><td className="px-4 py-3 text-right tabular-nums">{money(rule.amount)}</td>
            <td className="whitespace-nowrap px-4 py-3">{rule.interval_value} {Number(rule.interval_value) === 1 ? rule.interval_unit.replace(/s$/, "") : rule.interval_unit}</td>
            <td className="whitespace-nowrap px-4 py-3">{dateLabel(rule.effective_from)}{rule.effective_to ? ` – ${dateLabel(rule.effective_to)}` : " onward"}</td>
            <td className="px-4 py-3"><RuleToggle rule={toggling && toggleOperation.ruleId === rule.id ? { ...rule, is_active: toggleOperation.target } : rule} busy={busy || toggling} onToggle={() => void togglePenaltyRule(queryClient, rule)} /></td>
            <td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-2"><Tooltip title="Edit"><button type="button" aria-label={`Edit ${rule.name}`} onClick={() => openEditor(rule)} disabled={busy || toggling} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border bg-white transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-60" style={{ borderColor: busy || toggling ? undefined : "#1a1f36" }}><IoCreateOutline style={{ fontSize: "15px", color: busy || toggling ? "#94a3b8" : "#1a1f36" }} /></button></Tooltip></div></td>
          </tr>)}</tbody>
      </table>
    </TableCard>
    {editor && <Modal title={editor.id ? "Edit Penalty" : "Add Penalty"} onClose={() => { if (!busy) setEditor(null); }} onSave={saveForm} saving={busy} maxWidth="620px">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <ModalTextInput containerClassName="sm:col-span-2" label="Penalty Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} error={errors.name} placeholder="Enter the penalty name" maxLength={100} />
        <ModalTextInput label="Amount (₱)" type="number" inputClassName="penalty-number-input" min="0.01" max="9999999999.99" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} error={errors.amount} placeholder="0.00" disabled={lockedTerms} />
        <ModalTextInput label="Every (Months)" type="number" inputClassName="penalty-number-input" min="1" max="36500" value={form.interval_value} onChange={(event) => setForm({ ...form, interval_value: event.target.value })} error={errors.interval_value} disabled={lockedTerms} />
        <div className="col-span-full min-w-0"><p className="m-0 mb-2 text-[11px] font-semibold uppercase text-slate-500">Effective From</p><DatePicker value={form.effective_from} onChange={(_, value) => setForm({ ...form, effective_from: value })} placeholder="Select effective from date" containerClassName="w-full max-w-none" inputClassName="!w-full" options={{ useFiscalYearDefault: false, disableCurrentYearClamp: true }} /></div>
        <div className="col-span-full min-w-0"><p className="m-0 mb-2 text-[11px] font-semibold uppercase text-slate-500">Effective To (Optional)</p><EndDatePicker value={form.effective_to || undefined} onChange={(_, value) => setForm({ ...form, effective_to: value })} placeholder="No end date" containerClassName="w-full max-w-none" inputClassName="!w-full" /><ModalFieldError message={errors.effective_from} /><ModalFieldError message={errors.effective_to} /></div>
      </div>
    </Modal>}
  </>;
}
