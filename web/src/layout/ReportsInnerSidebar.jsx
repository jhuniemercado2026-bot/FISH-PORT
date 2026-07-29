import React from "react";
import {
  IoBoatOutline,
  IoCalendarOutline,
  IoFishOutline,
  IoPeopleOutline,
  IoPricetagOutline,
  IoStatsChartOutline,
  IoTimeOutline,
  IoCarOutline,
  IoMailOutline,
  IoReceiptOutline,
} from "react-icons/io5";
import "typeface-montserrat";

const FONT = "'Montserrat', sans-serif";

export const REPORT_TABS = [
  { key: "revenue", label: "Revenue", icon: IoStatsChartOutline },
  { key: "registered-boats", label: "Registered Boats", icon: IoBoatOutline },
  { key: "owner-info", label: "Owner Info", icon: IoPeopleOutline },
  { key: "docking", label: "Docking", icon: IoBoatOutline },
  { key: "banyera", label: "Banyera", icon: IoFishOutline },
  { key: "fisheries-bfar", label: "Fisheries (BFAR)", icon: IoFishOutline },
  { key: "daily-vehicle-ticket", label: "Daily Vehicle Ticket", icon: IoCarOutline },
  { key: "vehicle-ticket", label: "Annual Vehicle Ticket", icon: IoCarOutline },
  { key: "billing", label: "Billing", icon: IoReceiptOutline },
  { key: "remittance", label: "Remittance", icon: IoMailOutline },
  { key: "fees", label: "Fees", icon: IoPricetagOutline },
];

const ReportsInnerSidebar = ({ activeKey, onChange, tabs = REPORT_TABS }) => {
  return (
    <aside
      className="hide-scrollbar w-full flex-shrink-0 overflow-y-auto overflow-x-hidden bg-white lg:h-full lg:w-[280px] lg:self-stretch"
      style={{
        borderRight: "1px solid #e5e7eb",
        fontFamily: FONT,
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div className="px-3 py-4">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeKey === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange?.(key)}
              className="mb-1 flex w-full items-center gap-3 border-l-4 px-4 py-2.5 text-left transition-all duration-150 last:mb-0 hover:bg-[#eaf2ff]"
              style={{
                backgroundColor: isActive ? "#eaf2ff" : "#ffffff",
                color: isActive ? "#2563eb" : "#1a1f36",
                borderLeftColor: isActive ? "#2563eb" : "transparent",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: isActive ? "#dbeafe" : "#f8fafc",
                }}
              >
                <Icon className="text-lg" />
              </div>
              <div className="min-w-0">
                <p className="m-0 text-sm">{label}</p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default ReportsInnerSidebar;
