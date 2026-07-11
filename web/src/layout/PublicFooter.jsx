import React from "react";
import { Link, useLocation } from "react-router-dom";
import { IoCallOutline, IoLocationOutline, IoMailOutline } from "react-icons/io5";

const PublicFooter = () => {
  const location = useLocation();
  const hiddenPaths = ["/login"];

  if (hiddenPaths.includes(location.pathname)) {
    return null;
  }

  return (
    <footer className="bg-[#071224] text-white">
      <div className="mx-auto grid max-w-[1600px] gap-10 px-5 py-14 md:grid-cols-[1.3fr_0.8fr_1fr] md:px-8">
        {/* Brand and mission group */}
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.24em] text-[#2563eb]">
            Opol Fish Port
          </p>
          <p className="m-0 mt-4 max-w-xl text-[14px] leading-7 text-slate-300">
            Built to support registration, inspection, docking, ticketing, reporting, and billing for efficient coastal operations in Opol.
          </p>
        </div>

        {/* Navigation group */}
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.24em] text-[#2563eb]">
            Navigation
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <Link to="/" className="text-[14px] text-slate-300 no-underline hover:text-white">Home</Link>
            <Link to="/about" className="text-[14px] text-slate-300 no-underline hover:text-white">About</Link>
            <Link to="/contact" className="text-[14px] text-slate-300 no-underline hover:text-white">Contact</Link>
          </div>
        </div>

        {/* Contact group */}
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.24em] text-[#2563eb]">
            Reach Us
          </p>
          <div className="mt-4 space-y-4 text-[14px] text-slate-300">
            <div className="flex items-start gap-3">
              <IoLocationOutline className="mt-0.5 text-[18px] text-blue-300" />
              <span>Zone 1, Luyong Bonbon, Opol, Misamis Oriental, Philippines</span>
            </div>
            <div className="flex items-center gap-3">
              <IoMailOutline className="text-[18px] text-blue-300" />
              <span>headofmeeo_opol@gmail.com</span>
            </div>
            <div className="flex items-center gap-3">
              <IoCallOutline className="text-[18px] text-blue-300" />
              <span>+63 908 123 4567</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 ">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-5 py-5 text-[12px] text-slate-400 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="m-0">© 2026 Fish Port Management System. All rights reserved.</p>
          <p className="m-0">Developed by Jhunie Mercado, Ronmar Ely Cablinga, Eliza May Pairat, & Cydel Mae Penaso.</p>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
