import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { bookings, owners, stations } from "../api/client";

export default function BackofficeDashboard() {
  const [stats, setStats] = useState({
    owners: null,
    stations: null,
    pendingBookings: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const [ownersCount, stationsCount, summary] = await Promise.all([
          owners.ownersCount(),         // -> { total }
          stations.stationsCount(),     // -> { total }
          bookings.bookingsSummary(),    // -> { pending, approved }
        ]);
        setStats({
          owners: ownersCount?.total ?? 0,
          stations: stationsCount?.total ?? 0,
          pendingBookings: summary?.pending ?? 0,
        });
      } catch (e) {
        console.error("Failed to load dashboard stats:", e);
        // keep nulls so UI shows "—"
      }
    })();
  }, []);

  const Stat = ({ label, value, to, icon }) => (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {value ?? "—"}
          </p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-gray-900 text-white">
          {icon}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 scale-x-0 bg-gray-900 transition-transform duration-200 group-hover:scale-x-100" />
    </Link>
  );

  const Arrow = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M12.293 5.293a1 1 0 011.414 1.414L10.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4z" />
    </svg>
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 lg:px-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white/70 p-5 backdrop-blur-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Backoffice</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage owners, stations and schedules.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/owners/new"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Add owner
            </Link>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="EV Owners"
          value={stats.owners}
          to="/owners"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
        <Stat
          label="Stations"
          value={stats.stations}
          to="/stations"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 21h6M12 17v4M6 9l6-6 6 6M6 9v6a6 6 0 006 6 6 6 0 006-6V9" />
            </svg>
          }
        />
        <Stat
          label="Pending approvals"
          value={stats.pendingBookings}
          to="/bookings?status=Pending"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 8v4l3 3M12 3a9 9 0 100 18 9 9 0 000-18z" />
            </svg>
          }
        />
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Owners</h3>
          <p className="mt-1 text-sm text-gray-600">
            Create, update, or deactivate EV owners. NIC is the unique key.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/owners" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
              View all
            </Link>
            <Link to="/owners/new" className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white hover:brightness-95">
              Add owner
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Stations & schedules</h3>
          <p className="mt-1 text-sm text-gray-600">
            Manage stations, opening hours, and capacity. Deactivation is blocked if future bookings exist.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/stations" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
              Manage stations
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">User Management</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>Add user accounts</li>
            <li>Mange user accounts</li>
            <li>Activate/Deactivate user accounts</li>
          </ul>
          <div className="mt-3">
            <Link to="/admin/users" className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 hover:underline">
              Manage users
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M12.293 5.293a1 1 0 011.414 1.414L10.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
