// src/components/TopBar.jsx
import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function TopBar() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  // build nav items by role
  const items = [];
  if (user?.role === "Backoffice") {
    items.push(
      { to: "/backoffice", label: "Dashboard" },
      { to: "/owners", label: "Owners" },
      { to: "/stations", label: "Stations" },
      { to: "/bookings", label: "Bookings" },
      { to: "/admin/users", label: "Admin" }
    );
  } else if (user?.role === "StationOperator") {
    items.push(
      { to: "/operator", label: "Dashboard" },
      { to: "/stations", label: "Stations" },
      { to: "/bookings", label: "Bookings" }
    );
  }

  function doSignOut() {
    setUserOpen(false);
    signOut();
    nav("/login", { replace: true });
  }

  const linkBase =
    "relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition";
  const linkClass = ({ isActive }) =>
    [
      linkBase,
      isActive ? "text-gray-900" : "",
      // underline indicator
      "after:absolute after:left-2 after:right-2 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition-all",
      isActive
        ? "after:bg-gray-900 after:opacity-100"
        : "after:opacity-0 hover:after:opacity-50 hover:after:bg-gray-300",
    ].join(" ");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Brand */}
          <button
            onClick={() =>
              nav(
                user ? (user.role === "Backoffice" ? "/backoffice" : "/operator") : "/"
              )
            }
            className="group flex items-center gap-2 rounded px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            aria-label="Go to dashboard"
          >
            <div className="grid h-7 w-12 place-items-center rounded-md bg-gray-900 text-white text-[11px] font-semibold">
              Plug It
            </div>
            <span className="text-sm font-semibold tracking-tight text-gray-900">
              Admin
            </span>
          </button>

          {/* Center nav (desktop) */}
          <nav className="hidden md:flex md:items-center md:gap-1">
            {items.map((it) => (
              <NavLink key={it.to} to={it.to} className={linkClass}>
                {it.label}
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1">
            {/* Mobile menu button */}
            {items.length > 0 && (
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                aria-label="Toggle navigation"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((v) => !v)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-gray-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  {mobileOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
                    />
                  )}
                </svg>
              </button>
            )}

            {/* User chip */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserOpen((v) => !v)}
                  className="group flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                  aria-haspopup="menu"
                  aria-expanded={userOpen}
                >
                  <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-semibold leading-none text-white">
                    {user.role}
                  </span>
                  <span className="hidden max-w-[12rem] truncate text-sm text-gray-700 sm:inline">
                    {user.email ?? "signed in"}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 text-gray-500 transition ${userOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.17l3.71-2.94a.75.75 0 1 1 .94 1.16l-4.24 3.37a.75.75 0 0 1-.94 0L5.21 8.39a.75.75 0 0 1 .02-1.18z" />
                  </svg>
                </button>

                {userOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
                  >
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-medium text-gray-900">{user.email ?? "—"}</p>
                      <p className="text-xs text-gray-500">
                        {user.nic ? `NIC: ${user.nic}` : "Staff account"}
                      </p>
                    </div>
                    <div className="border-t border-gray-100" />
                    <button
                      onClick={doSignOut}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      role="menuitem"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => nav("/login")}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:brightness-95"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav (collapsible) */}
      {items.length > 0 && (
        <div
          className={`md:hidden transition-[max-height,opacity] duration-200 ease-out ${
            mobileOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
          } overflow-hidden border-t border-gray-200 bg-white`}
        >
          <nav className="mx-auto max-w-7xl px-3 py-2 sm:px-4 lg:px-6">
            <div className="flex flex-col gap-1 py-1">
              {items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={({ isActive }) =>
                    [
                      "rounded-md px-3 py-2 text-sm font-medium",
                      isActive
                        ? "bg-gray-900 text-white"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                    ].join(" ")
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  {it.label}
                </NavLink>
              ))}
              {user && (
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    doSignOut();
                  }}
                  className="mt-1 w-full rounded-md bg-gray-900 px-3 py-2 text-left text-sm font-medium text-white"
                >
                  Sign out
                </button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
