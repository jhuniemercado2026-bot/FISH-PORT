import React from "react";

const STATUS_STYLES = {
  active: { label: "Active", text: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e" },
  enabled: { label: "Enabled", text: "#059669", bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" },
  docked: { label: "Docked", text: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
  paid: { label: "Paid", text: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e" },
  coordinator: { label: "Coordinator", text: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
  head: { label: "Head of MEEO", text: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", dot: "#8b5cf6" },
  inspector: { label: "Inspector", text: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e" },
  expired: { label: "Expired", text: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" },
  disabled: { label: "Disabled", text: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" },
  deactivated: { label: "Deactivated", text: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" },
  departed: { label: "Departed", text: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" },
  suspended: { label: "Suspended", text: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  under_repair: { label: "Under Repair", text: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", dot: "#8b5cf6" },
  pending: { label: "Pending", text: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  partial: { label: "Partial", text: "#c2410c", bg: "#fff7ed", border: "#fed7aa", dot: "#f97316" },
  overdue: { label: "Overdue", text: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" },
  info: { label: "Info", text: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
  warning: { label: "Warning", text: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  critical: { label: "Critical", text: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" },
};

// Reusable admin status badge that matches the rounded pill style across screens.
const StatusPill = ({ status, label, className = "" }) => {
  const key = String(status || "").toLowerCase();
  const tone = STATUS_STYLES[key] || {
    label: label || (status ? String(status).replace(/_/g, " ") : "Unknown"),
    text: "#475569",
    bg: "#f8fafc",
    border: "#cbd5e1",
    dot: "#94a3b8",
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${className}`.trim()}
      style={{ color: tone.text, backgroundColor: tone.bg, border: `1px solid ${tone.border}` }}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: tone.dot }}
      />
      {label || tone.label}
    </span>
  );
};

export default StatusPill;
