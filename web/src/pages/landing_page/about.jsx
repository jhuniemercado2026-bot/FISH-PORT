import React from "react";
import {
  IoBoatOutline,
  IoCheckmarkCircleOutline,
  IoClipboardOutline,
  IoLocationOutline,
  IoMailOutline,
  IoCarOutline,
} from "react-icons/io5";
import PublicHeader from "../../layout/PublicHeader";
import PublicFooter from "../../layout/PublicFooter";

const PILLAR_CARDS = [
  {
    icon: IoBoatOutline,
    title: "Boat Management",
    desc: "Registers and monitors boats operating within the fish port, keeping boat information organized and up to date.",
  },
  {
    icon: IoClipboardOutline,
    title: "Banyera Inspection",
    desc: "Records and manages banyera inspections for arriving boats, ensuring inspection details are properly documented.",
  },
  {
    icon: IoLocationOutline,
    title: "Docking Monitoring",
    desc: "Tracks daily docking activities of boats at the fish port, providing organized records for port management.",
  },
  {
    icon: IoCarOutline,
    title: "Vehicle Ticket Management",
    desc: "Manages vehicle entry tickets within the fish port, monitoring access, ticket status, and transaction records.",
  },
];

const AboutPage = () => {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <main>

        {/* ── SECTION 1: HERO — port1 background image ─────────── */}
        <section className="relative overflow-hidden py-32 px-6 text-center text-white">

          {/* Background image */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/images/port1.png')" }}
          />

          {/* Dark overlay */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(26, 31, 54, 0.88)" }}
          />

          {/* Radial accents */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 18% 22%, rgba(59,130,246,0.15), transparent 32%), radial-gradient(circle at 82% 16%, rgba(96,165,250,0.10), transparent 26%)",
            }}
          />

          {/* Content */}
          <div className="relative">
            <h1 className="m-0 text-[42px] font-black leading-tight md:text-[54px]">
              About Opol Fish Port
            </h1>
            <p className="m-0 mt-5 mx-auto max-w-2xl text-[15px] leading-8 text-slate-300">
              Serving the fishing community of{" "}
              <span className="font-bold text-white">Luyong Bonbon, Opol, Misamis Oriental</span>{" "}
              with a centralized digital system for efficient, transparent, and
              accountable fish port operations.
            </p>
          </div>
        </section>

        {/* ── SECTION 2: IMAGE LEFT + TEXT RIGHT ───────────────── */}
        <section className="bg-white">
          <div className="mx-auto max-w-[1600px] px-8 py-20 md:px-16 md:py-28">
            <div className="grid gap-14 lg:grid-cols-2 lg:items-center">

              {/* Logo grid — 1 top, 2 bottom */}
              <div className="flex flex-col gap-4">
                {/* Top logo — full width rectangle */}
                <div
                  className="w-full h-[200px] rounded-[24px] bg-white border border-slate-200 flex items-center justify-center p-4"
                  style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.07)" }}
                >
                  <img
                    src="/images/opol_logo.png"
                    alt="Opol Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>

                {/* Bottom row — 2 logos side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div
                    className="h-[200px] rounded-[24px] bg-white border border-slate-200 flex items-center justify-center p-2"
                    style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.07)" }}
                  >
                    <img
                      src="/images/meeo_logo.png"
                      alt="MEEO Logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div
                    className="h-[200px] rounded-[24px] bg-white border border-slate-200 flex items-center justify-center p-2"
                    style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.07)" }}
                  >
                    <img
                      src="/images/system_logo.png"
                      alt="Fish Port Logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Text */}
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Our Background
                </p>
                <h2 className="m-0 mt-3 text-[36px] font-black leading-tight text-[#1a1f36]">
                  MEEO – Opol Fish Port
                </h2>
                <p className="m-0 mt-5 text-[15px] leading-[1.9] text-slate-600">
                  The{" "}
                  <span className="font-semibold text-[#1a1f36]">
                    Municipal Economic and Enterprise Office (MEEO)
                  </span>{" "}
                  of Opol oversees the Opol Fish Port located in Luyong Bonbon, Opol,
                  Misamis Oriental. It is committed to ensuring organized,
                  compliant, and transparent port operations that support the
                  local fishing industry and community.
                </p>
                <p className="m-0 mt-4 text-[15px] leading-[1.9] text-slate-600">
                  MEEO Opol works closely with Port Coordinators and Inspectors
                  to maintain accurate records, enforce regulatory compliance,
                  and deliver accountable fish port services for the benefit of
                  fishers and the public.
                </p>

             
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 3: WHY BUILT — centered heading + 4 cards ── */}
        <section className="bg-[#f8fafc]">
          <div className="mx-auto max-w-[1600px] px-8 py-20 md:px-16 md:py-28">

            {/* Centered heading */}
            <div className="text-center mb-12">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Purpose
              </p>
              <h2 className="m-0 mt-3 text-[34px] font-black text-[#0f172a]">
                Why This System Was Built
              </h2>
              <p className="mx-auto m-0 mt-4 max-w-2xl text-[15px] leading-7 text-slate-500">
                The Fish Port Management System was created to support MEEO–Opol's
                mission by digitizing boat registration, banyera inspection, docking
                monitoring, and vehicle ticket management. It addresses manual
                recordkeeping, untracked transactions, and lack of operational
                accountability.
              </p>
            </div>

            {/* 4 icon cards */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PILLAR_CARDS.map((card) => (
                <div
                  key={card.title}
                  className="flex flex-col items-center text-center rounded-[24px] border border-slate-200 bg-white p-8"
                  style={{ boxShadow: "0 6px 20px rgba(15,23,42,0.06)" }}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 mb-5">
                    <card.icon className="text-[26px] text-[#1d4ed8]" />
                  </div>
                  <h3 className="m-0 text-[17px] font-bold text-[#0f172a]">{card.title}</h3>
                  <p className="m-0 mt-3 text-[13px] leading-[1.8] text-slate-500">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

  

      </main>

      <PublicFooter />
    </div>
  );
};

export default AboutPage;
