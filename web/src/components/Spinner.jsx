import React from "react";
import spinnerMarkup from "../assets/spinner.svg?raw";

const getSizeValue = (size) => {
  if (typeof size === "string") return size;
  if (typeof size !== "number") return "1rem";
  return size <= 8 ? `${size * 0.25}rem` : `${size}px`;
};

const Spinner = ({ size = 4, className = "" }) => (
  <span
    className={`inline-flex flex-shrink-0 animate-spin ${className}`.trim()}
    style={{ width: getSizeValue(size), height: getSizeValue(size) }}
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: spinnerMarkup }}
  />
);

export default Spinner;
