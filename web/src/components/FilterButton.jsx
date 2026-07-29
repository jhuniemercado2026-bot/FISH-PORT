import React from "react";
import { IoChevronDownOutline } from "react-icons/io5";
import FilterSelect from "./FilterSelect";

const FILTER_BUTTON_STYLE_ID = "filter-button-styles";

const FILTER_BUTTON_STYLES = `
.filter-button-select,
.filter-button-select *,
.universal-filter-select.filter-button-select,
.universal-filter-select.filter-button-select * {
  box-shadow: none !important;
}

.universal-filter-select.filter-button-select.ant-select-focused .ant-select-selector,
.universal-filter-select.filter-button-select.ant-select-open .ant-select-selector,
.universal-filter-select.filter-button-select:not(.ant-select-disabled):hover .ant-select-selector,
.universal-filter-select.filter-button-select:not(.ant-select-disabled):active .ant-select-selector,
.filter-button-select.ant-select-focused .ant-select-selector,
.filter-button-select.ant-select-open .ant-select-selector,
.filter-button-select:not(.ant-select-disabled):hover .ant-select-selector,
.filter-button-select:not(.ant-select-disabled):active .ant-select-selector {
  border-color: #4096ff !important;
  border-width: 1px !important;
  box-shadow: none !important;
  outline: none !important;
}

.universal-filter-select.filter-button-select .ant-select-selector,
.filter-button-select .ant-select-selector {
  box-shadow: none !important;
  outline: none !important;
}

.universal-filter-select-dropdown.filter-button-dropdown,
.filter-button-dropdown {
  box-shadow: none !important;
}
`;

const ensureFilterButtonStyles = () => {
  if (typeof document === "undefined") return;
  const existingStyle = document.getElementById(FILTER_BUTTON_STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = FILTER_BUTTON_STYLES;
    document.head.appendChild(existingStyle);
    return;
  }

  const style = document.createElement("style");
  style.id = FILTER_BUTTON_STYLE_ID;
  style.textContent = FILTER_BUTTON_STYLES;
  document.head.appendChild(style);
};

const FilterButton = ({
  value,
  onChange,
  options,
  height = 42,
  width = 150,
  minWidth,
  className = "",
  onDropdownVisibleChange,
  onOpenChange,
  suffixIcon,
  popupClassName,
  ...props
}) => {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    ensureFilterButtonStyles();
  });

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
    onDropdownVisibleChange?.(nextOpen);
  };

  return (
    <FilterSelect
      value={value}
      onChange={onChange}
      options={options}
      height={height}
      width={minWidth ?? width}
      className={["filter-button-select", className].filter(Boolean).join(" ")}
      popupClassName={["filter-button-dropdown", popupClassName].filter(Boolean).join(" ")}
      onOpenChange={handleOpenChange}
      suffixIcon={
        suffixIcon ?? (
          <IoChevronDownOutline
            className={`text-[14px] text-slate-500 transition-transform duration-200 ease-out ${open ? "rotate-180" : "rotate-0"}`}
          />
        )
      }
      {...props}
    />
  );
};

export default FilterButton;
