import React, { useEffect, useRef } from "react";
import {
  IoCallOutline,
  IoLocationOutline,
  IoMailOutline,
  IoTimeOutline,
} from "react-icons/io5";
import PublicHeader from "../../layout/PublicHeader";
import PublicFooter from "../../layout/PublicFooter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Opol Municipal Fish Port (actual dock area)
const FISH_PORT_LAT = 8.5276;
const FISH_PORT_LNG = 124.5722;

const CONTACT_ITEMS = [
  {
    icon: IoLocationOutline,
    label: "Address",
    value: "Zone 1, Luyong Bonbon, Opol, Misamis Oriental, Philippines",
  },
  {
    icon: IoMailOutline,
    label: "Email Support",
    value: "headofmeeo_opol@gmail.com",
  },
  {
    icon: IoCallOutline,
    label: "Hotline",
    value: "+63 908 123 4567",
  },
  {
    icon: IoTimeOutline,
    label: "Operational Hours",
    value: "24/7 Port Operations · Port Coordinator Office 8:00 AM – 5:00 PM",
  },
];

// Fix for default Leaflet marker icons in JavaScript
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const MapSection = () => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    // Initialize map
    const map = L.map(mapContainer.current).setView(
      [FISH_PORT_LAT, FISH_PORT_LNG],
      15,
    );

    // Add tile layer (OpenStreetMap)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Add custom marker
    const customIcon = L.divIcon({
      className: "custom-marker",
      html: `
        <div style="
          width: 44px;
          height: 44px;
          background: #1a1f36;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 4px 16px rgba(26,31,54,0.35);
          cursor: pointer;
          position: relative;
        ">
          <div style="
            width: 12px;
            height: 12px;
            background: white;
            border-radius: 50%;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
          "></div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 44],
      popupAnchor: [0, -44],
    });

    const marker = L.marker([FISH_PORT_LAT, FISH_PORT_LNG], {
      icon: customIcon,
    })
      .bindPopup(
        `
        <div style="font-family:sans-serif;padding:4px 2px">
          <strong style="font-size:13px;color:#1a1f36">Opol Fish Port</strong><br/>
          <span style="font-size:12px;color:#64748b">Luyong Bonbon, Opol, Misamis Oriental</span>
        </div>
      `,
      )
      .addTo(map);

    markerRef.current = marker;
    mapRef.current = map;

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapContainer}
      className="w-full rounded-[24px] overflow-hidden"
      style={{ height: "480px", boxShadow: "0 8px 32px rgba(15,23,42,0.10)" }}
    />
  );
};

const ContactPage = () => {
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
              Contact Us
            </h1>
            <p className="m-0 mt-5 mx-auto max-w-2xl text-[15px] leading-8 text-slate-300">
              Reach the port operations team at{" "}
              <span className="font-bold text-white">
                Zone 1, Luyong Bonbon, Opol, Misamis Oriental
              </span>{" "}
              for inquiries, registration concerns, and operational
              coordination.
            </p>
          </div>
        </section>

        {/* ── SECTION 2: CONTACT INFO LEFT + FORM RIGHT ────────── */}
        <section className="bg-white">
          <div className="mx-auto max-w-[1600px] px-8 py-20 md:px-16 md:py-28">
            <div className="grid gap-14 lg:grid-cols-2 lg:items-start">
              {/* Left — contact info */}
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Get in Touch
                </p>
                <h2 className="m-0 mt-3 text-[36px] font-black leading-tight text-[#1a1f36]">
                  Port Contact Information
                </h2>
                <p className="m-0 mt-5 text-[15px] leading-[1.9] text-slate-600">
                  Use this page for public questions, registration concerns,
                  support requests, or operational coordination with the Opol
                  Fish Port team.
                </p>

                <div className="mt-10 space-y-6">
                  {CONTACT_ITEMS.map((item) => (
                    <div key={item.label} className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
                        <item.icon className="text-[20px] text-[#1d4ed8]" />
                      </div>
                      <div>
                        <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          {item.label}
                        </p>
                        <p className="m-0 mt-1 text-[15px] leading-7 text-[#1a1f36]">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — inquiry form */}
              <div
                className="rounded-[28px] border bg-white p-10"
                style={{
                  borderColor: "#b2b2b2",
                  boxShadow: "0 8px 24px rgba(15,23,42,0.07)",
                }}
              >
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Send a Message
                </p>
                <h2 className="m-0 mt-3 text-[28px] font-black text-[#0f172a]">
                  Inquiry Form
                </h2>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  <input
                    className="rounded-xl border border-slate-200 px-4 py-3 text-[14px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]"
                    placeholder="Full Name"
                  />
                  <input
                    className="rounded-xl border border-slate-200 px-4 py-3 text-[14px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]"
                    placeholder="Email Address"
                  />
                </div>
                <input
                  className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-[14px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]"
                  placeholder="Subject"
                />
                <textarea
                  className="mt-4 min-h-[180px] w-full rounded-xl border border-slate-200 px-4 py-3 text-[14px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] resize-none"
                  placeholder="Your message"
                />
                <div className="mt-5 flex justify-end">
                  <button className="rounded-lg bg-[#1a1f36] px-6 py-3 text-[14px] font-normal text-white transition hover:bg-[#0f172a]">
                    Send Inquiry
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 3: MAP — Opol Fish Port location ─────────── */}
        <section className="bg-[#f8fafc]">
          <div className="mx-auto max-w-[1600px] px-8 py-20 md:px-16 md:py-28">
            {/* Centered heading */}
            <div className="text-center mb-12">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Location
              </p>
              <h2 className="m-0 mt-3 text-[34px] font-black text-[#0f172a]">
                Find Us at Opol Fish Port
              </h2>
              <p className="mx-auto m-0 mt-4 max-w-lg text-[15px] leading-7 text-slate-500">
                Located at Luyong Bonbon, Opol, Misamis Oriental — the central
                hub for fish port operations in the municipality.
              </p>
            </div>

            <MapSection />
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

export default ContactPage;
