const VisitorPill = ({ className = "" }) => (
  <span
    className={`inline-flex flex-shrink-0 items-center rounded-[6px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-normal ${className}`.trim()}
    style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
  >
    Visitor
  </span>
);

export default VisitorPill;
