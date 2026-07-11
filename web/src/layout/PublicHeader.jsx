import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { IoCloseOutline, IoMenuOutline } from "react-icons/io5";
import "typeface-montserrat";

const LOGO_SRC = "/images/opol_fish_port.png";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "About", path: "/about" },
  { label: "Contact", path: "/contact" },
];

const PublicHeader = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isActive = (path) => {
    if (path === "/" || path === "/home") {
      return location.pathname === "/" || location.pathname === "/home" || location.pathname === "/login";
    }

    return location.pathname === path;
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="relative mx-auto flex w-full max-w-[1600px] items-center justify-between px-8 py-4 md:px-16">
        <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
          <img
            src={LOGO_SRC}
            alt="Opol Fish Port Logo"
            className="h-12 w-12 object-contain"
          />
          <div className="leading-none">
            <p
              className="m-0 text-[25px] font-bold tracking-tight uppercase"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              <span style={{ color: "#1a1f36" }}>Opol Fish</span>{" "}
              <span style={{ color: "#2563eb" }}>Port</span>
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`rounded-md px-4 py-2.5 text-[14px] no-underline transition-colors duration-150 ${
                isActive(link.path)
                  ? "bg-[#0a162b] text-white"
                  : "text-[#1a1f36] hover:bg-slate-100"
              }`}
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 md:hidden"
          aria-label="Toggle navigation"
        >
          {menuOpen
            ? <IoCloseOutline className="text-[22px]" />
            : <IoMenuOutline className="text-[22px]" />}
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-200 bg-white px-6 py-4 md:hidden">
          <div className="space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-xl px-4 py-3 text-[14px] font-semibold no-underline transition-colors ${
                  isActive(link.path)
                    ? "bg-[#eff6ff] text-[#1d4ed8]"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};

export default PublicHeader;
