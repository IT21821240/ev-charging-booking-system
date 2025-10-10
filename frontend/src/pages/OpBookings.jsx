// src/pages/OpBookings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { bookings, api, stations as stationsApi } from "../api/client";

const TZ = "Asia/Colombo";

export default function OpBookings() {
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [completed, setCompleted] = useState([]);

  const [stationNames, setStationNames] = useState({}); // { stationId: name }
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // UI state for collapsible groups
  const [openStations, setOpenStations] = useState(() => new Set()); // expanded station ids per section combined

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setMsg("");
    setLoading(true);
    try {
      // get operator's stations -> name map
      const stationsRes =
        typeof stationsApi?.mine === "function"
          ? await stationsApi.mine()
          : await api("/stations/mine");

      const stations = Array.isArray(stationsRes)
        ? stationsRes
        : stationsRes?.items || [];

      const nameMap = {};
      for (const s of stations) {
        const id = s.id || s.Id;
        const name = s.name || s.Name || "";
        if (id) nameMap[id] = name;
      }
      setStationNames(nameMap);

      // bookings (operator-scoped)
      const [p, a, c] = await Promise.all([
        bookings.operatorPending(TZ),
        bookings.operatorApproved(TZ),
        api(`/bookings/operator/completed?tz=${encodeURIComponent(TZ)}`),
      ]);

      setPending(Array.isArray(p) ? p : []);
      setApproved(Array.isArray(a) ? a : []);
      setCompleted(Array.isArray(c) ? c : []);

      // expand all stations on first load for quick overview
      const allIds = new Set(
        [...p, ...a, ...c]
          .map((b) => b.stationId)
          .filter(Boolean)
      );
      setOpenStations(allIds);
    } catch (e) {
      setMsg(e.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }

  async function onApprove(b) {
    try {
      const id = b.id || b._id;
      if (!id) throw new Error("Missing booking id.");
      await bookings.approve(id);
      await load();
      setMsg("Booking approved.");
    } catch (e) {
      setMsg(String(e?.message || "Approval failed."));
    }
  }

  // ---- time helpers (accept Local / Utc / plain fields) ----
  const pick = (obj, base) =>
    obj?.[`${base}Local`] ?? obj?.[base] ?? obj?.[`${base}Utc`];
  const asDate = (v) => (v instanceof Date ? v : new Date(v));
  const fmt = (v) =>
    !v
      ? "-"
      : asDate(v).toLocaleString("en-LK", {
          timeZone: TZ,
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });

  const dayKey = (dateLike) =>
    asDate(dateLike).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

  // ----------- grouping helpers -----------
  function groupByStation(list) {
    // stationId -> { stationId, stationName, items: [...] }
    const map = new Map();
    for (const b of list) {
      const id = b.stationId || "-";
      if (!map.has(id)) {
        map.set(id, {
          stationId: id,
          stationName: b.stationName || stationNames[id] || "-",
          items: [],
        });
      }
      map.get(id).items.push(b);
    }
    // sort items by start time asc
    for (const g of map.values()) {
      g.items.sort(
        (a, z) =>
          asDate(pick(a, "startTime")) - asDate(pick(z, "startTime"))
      );
    }
    // array sorted by station name
    return [...map.values()].sort((a, z) =>
      (a.stationName || "").localeCompare(z.stationName || "")
    );
  }

  function groupByDay(items) {
    // returns [ [dayLabel, items[]], ... ]
    const map = new Map();
    for (const b of items) {
      const k = dayKey(pick(b, "startTime"));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(b);
    }
    return [...map.entries()].sort(([a], [z]) => (a < z ? -1 : 1));
  }

  // memoized groups
  const pendingByStation = useMemo(
    () => groupByStation(pending),
    [pending, stationNames]
  );
  const approvedByStation = useMemo(
    () => groupByStation(approved),
    [approved, stationNames]
  );
  const completedByStation = useMemo(
    () => groupByStation(completed),
    [completed, stationNames]
  );

  // expand/collapse helpers
  const toggleStation = (stationId) =>
    setOpenStations((s) => {
      const next = new Set(s);
      next.has(stationId) ? next.delete(stationId) : next.add(stationId);
      return next;
    });

  const setAllOpen = (open) => {
    if (open) {
      const ids = new Set([
        ...pendingByStation.map((g) => g.stationId),
        ...approvedByStation.map((g) => g.stationId),
        ...completedByStation.map((g) => g.stationId),
      ]);
      setOpenStations(ids);
    } else {
      setOpenStations(new Set());
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Operator Bookings
        </h2>
        <div className="flex items-center gap-2">
          <button
            className="h-9 rounded border px-3 text-sm hover:bg-white"
            onClick={() => setAllOpen(true)}
          >
            Expand all
          </button>
          <button
            className="h-9 rounded border px-3 text-sm hover:bg-white"
            onClick={() => setAllOpen(false)}
          >
            Collapse all
          </button>
          <button
            className="h-9 rounded border px-3 hover:bg-white disabled:opacity-60"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {msg && (
        <div className="rounded border bg-amber-50 text-amber-900 px-3 py-2 text-sm">
          {msg}
        </div>
      )}

      {/* Pending */}
      <Section title="Pending approval">
        {pendingByStation.length === 0 ? (
          <Empty text="No pending bookings for your stations." />
        ) : (
          <div className="space-y-3">
            {pendingByStation.map((group) => (
              <StationBlock
                key={"p-" + group.stationId}
                group={group}
                open={openStations.has(group.stationId)}
                onToggle={() => toggleStation(group.stationId)}
                renderItem={(b) => (
                  <Row
                    nic={b.nic}
                    station={group.stationName}
                    start={fmt(pick(b, "startTime"))}
                    end={fmt(pick(b, "endTime"))}
                    right={
                      <button
                        className="h-8 rounded bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                        onClick={() => onApprove(b)}
                      >
                        Approve
                      </button>
                    }
                  />
                )}
                groupByDay={groupByDay}
                fmtDayLabel={(d) =>
                  new Date(d + "T00:00:00").toLocaleDateString("en-LK", {
                    timeZone: TZ,
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "2-digit",
                  })
                }
              />
            ))}
          </div>
        )}
      </Section>

      {/* Approved */}
      <Section title="Approved">
        {approvedByStation.length === 0 ? (
          <Empty text="No approved bookings." />
        ) : (
          <div className="space-y-3">
            {approvedByStation.map((group) => (
              <StationBlock
                key={"a-" + group.stationId}
                group={group}
                open={openStations.has(group.stationId)}
                onToggle={() => toggleStation(group.stationId)}
                renderItem={(b) => (
                  <Row
                    nic={b.nic}
                    station={group.stationName}
                    start={fmt(pick(b, "startTime"))}
                    end={fmt(pick(b, "endTime"))}
                  />
                )}
                groupByDay={groupByDay}
                fmtDayLabel={(d) =>
                  new Date(d + "T00:00:00").toLocaleDateString("en-LK", {
                    timeZone: TZ,
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "2-digit",
                  })
                }
              />
            ))}
          </div>
        )}
      </Section>

      {/* Completed */}
      <Section title="Completed">
        {completedByStation.length === 0 ? (
          <Empty text="No completed sessions." />
        ) : (
          <div className="space-y-3">
            {completedByStation.map((group) => (
              <StationBlock
                key={"c-" + group.stationId}
                group={group}
                open={openStations.has(group.stationId)}
                onToggle={() => toggleStation(group.stationId)}
                renderItem={(b) => (
                  <Row
                    nic={b.nic}
                    station={group.stationName}
                    start={fmt(pick(b, "startTime"))}
                    end={fmt(pick(b, "endTime"))}
                  />
                )}
                groupByDay={groupByDay}
                fmtDayLabel={(d) =>
                  new Date(d + "T00:00:00").toLocaleDateString("en-LK", {
                    timeZone: TZ,
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "2-digit",
                  })
                }
              />
            ))}
          </div>
        )}
      </Section>

      <div className="text-xs text-gray-500">Times shown in {TZ}.</div>
    </div>
  );
}

/* ---------- presentational bits ---------- */
function Section({ title, children }) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function StationBlock({
  group, // { stationId, stationName, items: [...] }
  open,
  onToggle,
  renderItem, // (b) => JSX
  groupByDay,
  fmtDayLabel,
}) {
  const dayBuckets = useMemo(() => groupByDay(group.items), [group, groupByDay]);
  const total = group.items.length;

  return (
    <div className="rounded border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <div className="text-sm font-medium text-gray-900">
          {group.stationName || "-"}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 ring-1 ring-gray-200">
            {total} booking{total !== 1 ? "s" : ""}
          </span>
          <span className="text-gray-400">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t">
          {dayBuckets.map(([day, items]) => (
            <div key={day} className="px-3 py-2">
              <div className="mb-1 text-xs font-semibold text-gray-600">
                {fmtDayLabel(day)}{" "}
                <span className="ml-1 text-[10px] text-gray-400">
                  ({items.length})
                </span>
              </div>
              <div className="space-y-2">
                {items.map((b, i) => (
                  <div key={(b.id || b._id || i) + "-row"}>{renderItem(b)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ nic, station, start, end, right }) {
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2 text-sm bg-white">
      <div>
        <div className="font-medium text-gray-900">
          {start} → {end}
        </div>
        <div className="text-gray-600">
          NIC: {nic || "-"} &middot; Station: {station || "-"}
        </div>
      </div>
      {right ? <div className="ml-3">{right}</div> : null}
    </div>
  );
}

function Empty({ text }) {
  return <div className="text-sm text-gray-500">{text}</div>;
}
