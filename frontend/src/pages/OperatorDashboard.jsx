// src/pages/OperatorDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { bookings } from "../api/client";

export default function OperatorDashboard() {
  const [counts, setCounts] = useState({ pending: 0, approved: 0 });
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    load(); // manual refresh only
  }, []);

  async function load() {
    try {
      setErr("");
      setLoading(true);

      const [c, p] = await Promise.all([
        bookings.operatorCounts(),
        bookings.operatorPending(),
      ]);

      setCounts({
        pending: Number(c?.pending ?? 0),
        approved: Number(c?.approved ?? 0),
      });
      setPending(Array.isArray(p) ? p : []);
    } catch (e) {
      setErr(e.message || "Failed to load operator dashboard");
    } finally {
      setLoading(false);
    }
  }

  // --- helpers ---
  const asDate = (v) => (v instanceof Date ? v : new Date(v));
  // you said startTime/endTime are already local wall times
  const start = (b) => b?.startTime ?? b?.startTimeLocal ?? b?.startTimeUtc;
  const end   = (b) => b?.endTime   ?? b?.endTimeLocal   ?? b?.endTimeUtc;
  const fmt   = (v) => (!v ? "-" : asDate(v).toLocaleString()); // show as browser-local

  // --- derived stats ---
  const now = new Date();
  const todayKey = now.toLocaleDateString("en-CA");

  const nextUp = useMemo(() => {
    const sorted = [...pending]
      .filter((b) => start(b))
      .sort((a, z) => asDate(start(a)) - asDate(start(z)));
    return sorted.find((b) => asDate(start(b)) >= now) || null;
  }, [pending]);

  const todayPending = useMemo(
    () =>
      pending.filter((b) => {
        const s = start(b);
        if (!s) return false;
        return asDate(s).toLocaleDateString("en-CA") === todayKey;
      }).length,
    [pending, todayKey]
  );

  const upcomingPending = useMemo(
    () => pending.filter((b) => start(b) && asDate(start(b)) >= now).length,
    [pending]
  );

  const uniqueStations = useMemo(
    () => new Set(pending.map((b) => b.stationId || b.stationID || b.StationId)).size,
    [pending]
  );

  const uniqueDrivers = useMemo(
    () => new Set(pending.map((b) => (b.nic || b.NIC || "").toLowerCase())).size,
    [pending]
  );

  // progress for "nextUp" slot
  const nextProgress = useMemo(() => {
    if (!nextUp) return { pct: 0, state: "idle" };
    const s = asDate(start(nextUp));
    const e = asDate(end(nextUp));
    const n = now.getTime();
    const total = e.getTime() - s.getTime();
    if (n < s.getTime()) return { pct: 0, state: "not-started" };
    if (n >= e.getTime()) return { pct: 100, state: "finished" };
    const pct = Math.max(0, Math.min(100, ((n - s.getTime()) / total) * 100));
    return { pct, state: "running" };
  }, [nextUp]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Operator Dashboard</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date().toLocaleString()} • Asia/Colombo (local)
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-white disabled:opacity-60"
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-500" />
              Refreshing…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-70">
                <path fill="currentColor" d="M12 6V3L8 7l4 4V8a4 4 0 1 1-4 4H6a6 6 0 1 0 6-6z"/>
              </svg>
              Refresh
            </>
          )}
        </button>
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Pending approvals"
          value={counts.pending}
          accent="from-amber-400 to-amber-600"
          icon={<ClockIcon />}
        />
        <Kpi
          title="Approved (not finished)"
          value={counts.approved}
          accent="from-emerald-400 to-emerald-600"
          icon={<ShieldIcon />}
        />
        <Kpi
          title="Pending today"
          value={todayPending}
          accent="from-indigo-400 to-indigo-600"
          icon={<CalendarIcon />}
        />
        <Kpi
          title="Upcoming (from now)"
          value={upcomingPending}
          accent="from-violet-400 to-violet-600"
          icon={<ArrowIcon />}
        />
      </div>

      {/* At-a-glance row */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Next session */}
        <div className="rounded-xl border bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <div className="text-sm font-semibold">Next session</div>
            <Badge tone={nextProgress.state}>
              {nextProgress.state === "running"
                ? "In progress"
                : nextProgress.state === "not-started"
                ? "Not started"
                : nextProgress.state === "finished"
                ? "Finished"
                : "—"}
            </Badge>
          </div>

          <div className="p-4 space-y-3">
            {!nextUp ? (
              <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
                No upcoming pending bookings.
              </div>
            ) : (
              <>
                <div className="text-sm">
                  <div className="text-gray-900 font-medium">
                    {fmt(start(nextUp))} &nbsp;→&nbsp; {fmt(end(nextUp))}
                  </div>
                  <div className="mt-1 text-gray-600">
                    NIC: <span className="font-medium">{nextUp.nic || "-"}</span>
                    <span className="mx-2">•</span>
                    Station: <span className="font-medium">{nextUp.stationId || "-"}</span>
                    <span className="mx-2">•</span>
                    Status: <span className="font-medium">{nextUp.status || "Pending"}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2">
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-[width] duration-500"
                      style={{ width: `${nextProgress.pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {nextProgress.state === "running" && (
                      <>~{Math.round(nextProgress.pct)}% elapsed</>
                    )}
                    {nextProgress.state === "not-started" && <>Starts soon</>}
                    {nextProgress.state === "finished" && <>Ended</>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Queue insights */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-2.5 text-sm font-semibold">Queue insights</div>
          <div className="p-4 space-y-3 text-sm">
            <Insight label="Stations with pending" value={uniqueStations} />
            <Insight label="Unique drivers in queue" value={uniqueDrivers} />
            <div className="pt-1 text-xs text-gray-500">
              Times shown as local (Asia/Colombo).
            </div>
          </div>
        </div>
      </section>

      {/* Skeletons when loading first time */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
    </div>
  );
}

/* ========== Presentational components ========== */

function Kpi({ title, value, accent, icon }) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-10 blur-2xl pointer-events-none"
           style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))` }}
           data-theme-gradient={accent} />
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white shadow-sm`}>
        {icon}
      </div>
      <div className="mt-3 text-sm text-gray-600">{title}</div>
      <div className="mt-0.5 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function Insight({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function Badge({ children, tone = "idle" }) {
  const cls =
    tone === "running"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "not-started"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : tone === "finished"
      ? "bg-gray-100 text-gray-700 ring-gray-300"
      : "bg-white text-gray-600 ring-gray-200";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border bg-white p-4">
      <div className="h-4 w-28 rounded bg-gray-200" />
      <div className="mt-3 h-7 w-20 rounded bg-gray-200" />
      <div className="mt-4 h-2 w-full rounded bg-gray-200" />
      <div className="mt-2 h-2 w-3/4 rounded bg-gray-200" />
    </div>
  );
}

/* --- tiny icons (pure SVG) --- */
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="currentColor" d="M12 1.75A10.25 10.25 0 1 0 22.25 12 10.262 10.262 0 0 0 12 1.75Zm.75 5.75h-1.5v5.06l4.36 2.52.75-1.3-3.61-2.09Z"/>
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="currentColor" d="M12 2 4.5 5v6.5C4.5 16.98 7.47 20.74 12 22c4.53-1.26 7.5-5.02 7.5-10.5V5L12 2Z"/>
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v16H4V4h3V2Zm13 6H4v12h16V8Z"/>
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="currentColor" d="M4 11h12.17l-4.59-4.59L13 5l7 7-7 7-1.41-1.41L16.17 13H4v-2Z"/>
    </svg>
  );
}
