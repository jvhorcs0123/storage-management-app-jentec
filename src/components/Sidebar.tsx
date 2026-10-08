"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const iconBase =
  "h-5 w-5 flex-none text-slate-200 transition-colors group-hover:text-white";

const HomeIcon = <svg viewBox="0 0 24 24" className={iconBase} fill="none">
  <path
    d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
</svg>;

const BoxIcon = <svg viewBox="0 0 24 24" className={iconBase} fill="none">
  <path
    d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
  <path
    d="M12 21v-9M4 7.5l8 4.5 8-4.5"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
</svg>;

const TruckIcon = <svg viewBox="0 0 24 24" className={iconBase} fill="none">
  <path
    d="M3 6h11v9H3V6Zm11 4h3.5L21 14v1h-7v-5Z"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
  <circle cx="7.5" cy="18" r="1.8" stroke="currentColor" strokeWidth="1.6" />
  <circle cx="17.5" cy="18" r="1.8" stroke="currentColor" strokeWidth="1.6" />
</svg>;

const InboundIcon = <svg viewBox="0 0 24 24" className={iconBase} fill="none">
  <path
    d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
  <path
    d="M12 4v11m0 0 4-4m-4 4-4-4"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
</svg>;

const SettingsIcon =<svg viewBox="0 0 24 24" className={iconBase} fill="none">
  <path
    d="m12 8.2 2.3-1.3 2.2 1.3.1 2.6 2.3 1.3-1.2 2.3-2.6-.1-1.3 2.3-2.3-1.2-1.3-2.3-2.6.1-1.2-2.3 2.3-1.3.1-2.6 2.2-1.3L12 8.2Z"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
  />
  <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.5" />
</svg>;

const LogoutIcon = <svg viewBox="0 0 24 24" className={iconBase} fill="none">
  <path
    d="M13 5h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-5"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
  <path
    d="M8 17 4 12l4-5"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
  <path
    d="M4 12h10"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  />
</svg>;

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
  onLogoutRequested,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onLogoutRequested?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = useMemo<NavItem[]>(
    () => [
      { label: "Homepage", href: "/", icon: HomeIcon },
      { label: "Products", href: "/products", icon: BoxIcon },
      { label: "Inbound", href: "/inbound", icon: InboundIcon },
      { label: "Outbound", href: "/deliveries", icon: TruckIcon },
      { label: "Settings", href: "/settings", icon: SettingsIcon },
    ],
    [],
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          onClick={onMobileClose}
          className="fixed inset-0 z-30 bg-slate-950/50 md:hidden"
          aria-label="Close navigation"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex min-h-screen flex-col bg-slate-950 text-slate-100 transition-all duration-300 md:static md:translate-x-0 ${
          collapsed ? "w-16" : "w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
      <div
        className={`flex items-center border-b border-slate-800 px-3 py-4 ${
          collapsed ? "justify-center" : "justify-between"
        }`}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
            <Image
              src="/branding_logo.png"
              alt="Jentec Logo"
              width={50}
              height={50}
              className="h-10 w-10 rounded-sm"
            />
            Storage
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-md border border-slate-800 p-2 text-slate-300 transition hover:border-slate-700 hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-transform ${
              collapsed ? "rotate-180" : ""
            }`}
            fill="none"
          >
            <path
              d="M15 6 9 12l6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-3 py-5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
            >
              {item.icon}
              <span
                className={`whitespace-nowrap transition-all ${
                  collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-slate-800 px-3 py-4">
        <button
          type="button"
          onClick={() => onLogoutRequested?.()}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900 hover:text-white"
        >
          {LogoutIcon}
          <span
            className={`whitespace-nowrap transition-all ${
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            }`}
          >
            Logout
          </span>
        </button>
      </div>
      </aside>
    </>
  );
}
