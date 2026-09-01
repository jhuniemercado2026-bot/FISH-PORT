import React, { useEffect } from "react";
import { Select } from "antd";
import Spinner from "./Spinner";
import "typeface-montserrat";

const FONT = "'Montserrat', sans-serif";
const FILTER_SELECT_STYLE_ID = "universal-filter-select-styles";

const FILTER_SELECT_STYLES = `
.universal-filter-select .ant-select-selector {
  border-radius: 10px !important;
  border-color: #e5e7eb !important;
  box-shadow: none !important;
  min-height: 42px !important;
  height: 42px !important;
  padding: 0 12px !important;
  font-family: ${FONT} !important;
  font-size: 13px !important;
}

.universal-filter-select.ant-select-focused .ant-select-selector,
.universal-filter-select.ant-select-open .ant-select-selector {
  border-color: #4096ff !important;
  box-shadow: 0 0 0 2px rgba(64, 150, 255, 0.2) !important;
}

.universal-filter-select .ant-select-selection-item,
.universal-filter-select .ant-select-selection-placeholder,
.universal-filter-select .ant-select-selection-search-input {
  font-family: ${FONT} !important;
  font-size: 13px !important;
}

.universal-filter-select .ant-select-selection-item {
  font-weight: 400 !important;
  line-height: 40px !important;
}

.universal-filter-select .ant-select-selection-placeholder {
  font-weight: 400 !important;
  line-height: 40px !important;
}

.universal-filter-select.ant-select-disabled .ant-select-selector {
  background: #ffffff !important;
  border-color: #e5e7eb !important;
  box-shadow: none !important;
  cursor: not-allowed !important;
}

.universal-filter-select.ant-select-disabled .ant-select-selection-item,
.universal-filter-select.ant-select-disabled .ant-select-selection-placeholder,
.universal-filter-select.ant-select-disabled .ant-select-arrow {
  color: #64748b !important;
  opacity: 1 !important;
}

.universal-filter-select.annual-fee-readonly .ant-select-selector {
  background: #f1f5f9 !important;
  border-color: #e2e8f0 !important;
  box-shadow: none !important;
}

.universal-filter-select.annual-fee-readonly .ant-select-selection-item,
.universal-filter-select.annual-fee-readonly .ant-select-selection-placeholder {
  color: #64748b !important;
}

.universal-filter-select-dropdown {
  border-radius: 10px !important;
  overflow: hidden !important;
  border: 1px solid #e5e7eb !important;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.13) !important;
  padding: 0 !important;
}

.universal-filter-select-dropdown .ant-select-item {
  border-radius: 0 !important;
  padding: 8px 12px !important;
  font-family: ${FONT} !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: #1a1f36 !important;
}

.universal-filter-select-dropdown .ant-select-item-option-selected {
  background-color: #1a1f36 !important;
  color: #ffffff !important;
  font-weight: 400 !important;
}

.universal-filter-select-dropdown.report-user-filter-dropdown .ant-select-item {
  min-height: 54px !important;
  display: flex !important;
  align-items: center !important;
}

.universal-filter-select-dropdown.report-user-filter-dropdown .ant-select-item-option-selected .report-user-option-name,
.universal-filter-select-dropdown.report-user-filter-dropdown .ant-select-item-option-selected .report-user-option-role {
  color: #ffffff !important;
}
`;

const ensureFilterSelectStyles = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(FILTER_SELECT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = FILTER_SELECT_STYLE_ID;
  style.textContent = FILTER_SELECT_STYLES;
  document.head.appendChild(style);
};

const FilterSelect = ({
  width = 150,
  height = 42,
  style,
  getPopupContainer,
  className,
  popupClassName,
  dropdownAlign,
  allowClear = false,
  onChange,
  onInputKeyDown,
  value,
  showSearch,
  loading = false,
  ...props
}) => {
  useEffect(() => {
    ensureFilterSelectStyles();
  }, []);

  const handleInputKeyDown = (event) => {
    if (
      event.key === "Backspace" &&
      showSearch &&
      value != null &&
      String(value) !== "" &&
      String(event.target?.value || "") === ""
    ) {
      event.preventDefault();
      onChange?.(undefined);
    }

    onInputKeyDown?.(event);
  };

  const { notFoundContent, ...restProps } = props;

  return (
    <Select
      className={["universal-filter-select", className].filter(Boolean).join(" ")}
      popupClassName={["universal-filter-select-dropdown", popupClassName].filter(Boolean).join(" ")}
      getPopupContainer={getPopupContainer ?? ((triggerNode) => (typeof document !== "undefined" ? document.body : triggerNode.parentElement))}
      placement="bottomLeft"
      dropdownAlign={{ overflow: { adjustX: false, adjustY: false } }}
      style={{
        width,
        height,
        borderRadius: 10,
        ...style,
      }}
      allowClear={allowClear}
      notFoundContent={
        loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 12 }}>
            <Spinner size={5} />
          </div>
        ) : (
          notFoundContent
        )
      }
      onInputKeyDown={handleInputKeyDown}
      onChange={onChange}
      value={value}
      showSearch={showSearch}
      {...restProps}
    />
  );
};

export default FilterSelect;
