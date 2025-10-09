// src/pages/OperatorStations.jsx
import React, { useEffect, useMemo, useState } from "react";
import { stations, stationSlots, schedules } from "../api/client";

// Small helpers
const cls = (...xs) => xs.filter(Boolean).join(" ");
const toDateInput = (d) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);

// time <-> minutes converters for schedule form
const hhmmToMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const minutesToHhmm = (mins) => {
  const h = Math.floor((mins || 0) / 60);
  const m = (mins || 0) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// Treat 401/403 as “silent” (don’t show as banner)
const isAuthish = (msg = "") =>
  /unauthorized|forbidden|401|403/i.test(String(msg));

export default function OperatorStations() {
  const [mine, setMine] = useState([]);
  const [sel, setSel] = useState("");
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [mps, setMps] = useState(60);
  const [slotData, setSlotData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // ---- schedule state ----
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleErr, setScheduleErr] = useState("");
  const [scheduleForDay, setScheduleForDay] = useState(null); // null = none
  const [form, setForm] = useState({ open: "08:00", close: "20:00", maxConcurrent: 1 });
  const [saving, setSaving] = useState(false);

  // load operator's stations
  useEffect(() => {
    (async () => {
      try {
        const res = await stations.mine();
        const arr = Array.isArray(res) ? res : res?.items || [];
        setMine(arr);
        if (!sel && arr.length) setSel(arr[0].id || arr[0].Id);
      } catch (e) {
        setMsg(e.message || "Failed to load your stations.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSlots() {
    if (!sel) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await stationSlots.list(sel, {
        date,
        minutesPerSlot: Number(mps) || 60,
      });
      setSlotData(res);
    } catch (e) {
      setSlotData(null);
      // Don’t show raw auth errors
      if (isAuthish(e.message)) console.warn(e);
      else setMsg(e.message || "Failed to load slots.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (sel) loadSlots();
  }, [sel, date, mps]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStation = useMemo(
    () => mine.find((s) => (s.id || s.Id) === sel),
    [mine, sel]
  );

  // ---------------- SCHEDULE DATA (for selected date) ----------------
  async function loadScheduleForDay() {
    if (!sel || !date) return;
    setScheduleLoading(true);
    setScheduleErr("");
    try {
      const list = await schedules.list(sel, { from: date, to: date });
      const found =
        (Array.isArray(list) ? list : []).find((s) => {
          const d = new Date(s.date || s.Date);
          return d.toISOString().slice(0, 10) === date;
        }) || null;

      setScheduleForDay(found);

      // seed form with either existing or defaults
      if (found) {
        setForm({
          open: minutesToHhmm(found.openMinutes),
          close: minutesToHhmm(found.closeMinutes),
          maxConcurrent: Number(found.maxConcurrent || 1),
        });
      } else {
        setForm({
          open: "08:00",
          close: "20:00",
          maxConcurrent: Math.max(
            1,
            Number(selectedStation?.totalSlots || selectedStation?.TotalSlots || 1)
          ),
        });
      }
    } catch (e) {
      if (isAuthish(e.message)) {
        console.warn(e);
        setScheduleForDay(null);
      } else {
        setScheduleErr(e.message || "Failed to load schedule.");
        setScheduleForDay(null);
      }
    } finally {
      setScheduleLoading(false);
    }
  }

  useEffect(() => {
    loadScheduleForDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, date]);

  async function onSaveSchedule() {
    if (!sel || !date) return;
    const openMinutes = hhmmToMinutes(form.open);
    const closeMinutes = hhmmToMinutes(form.close);
    const maxConcurrent = Number(form.maxConcurrent || 1);

    if (closeMinutes <= openMinutes)
      return setScheduleErr("Close time must be after open time.");

    setSaving(true);
    setScheduleErr("");

    try {
      if (scheduleForDay?.id || scheduleForDay?._id) {
        const id = scheduleForDay.id || scheduleForDay._id;
        await schedules.update(sel, id, {
          date,
          openMinutes,
          closeMinutes,
          maxConcurrent,
        });
      } else {
        await schedules.create(sel, {
          date,
          openMinutes,
          closeMinutes,
          maxConcurrent,
        });
      }
      await Promise.all([loadScheduleForDay(), loadSlots()]);
    } catch (e) {
      if (isAuthish(e.message)) console.warn(e);
      else setScheduleErr(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteSchedule() {
    if (!scheduleForDay) return;
    if (!window.confirm("Delete this schedule for the day?")) return;

    setSaving(true);
    setScheduleErr("");

    try {
      const id = scheduleForDay.id || scheduleForDay._id;
      await schedules.remove(sel, id);
      await Promise.all([loadScheduleForDay(), loadSlots()]);
    } catch (e) {
      if (isAuthish(e.message)) console.warn(e);
      else setScheduleErr(e.message || "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">My Stations</h2>
          <p className="text-sm text-gray-500">
            View availability & manage schedules for your assigned stations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="inline-block h-3 w-3 rounded bg-emerald-400/70 ring-1 ring-emerald-300" />
            Free
            <span className="inline-block h-3 w-3 rounded bg-amber-300/60 ring-1 ring-amber-300 ml-3" />
            Limited
            <span className="inline-block h-3 w-3 rounded bg-rose-300/60 ring-1 ring-rose-300 ml-3" />
            Full
          </div>
        </div>
      </header>

      {msg && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {msg}
        </div>
      )}

      {/* Station pills */}
      <section className="rounded-lg border bg-white p-3">
        {mine.length === 0 ? (
          <div className="text-sm text-gray-500">No stations assigned.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mine.map((s) => {
              const id = s.id || s.Id;
              const active = id === sel;
              return (
                <button
                  key={id}
                  onClick={() => setSel(id)}
                  className={cls(
                    "group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  )}
                >
                  {s.imageUrl && (
                    <img
                      src={s.imageUrl}
                      alt=""
                      className={cls(
                        "h-6 w-6 rounded object-cover ring-1",
                        active ? "ring-white/20" : "ring-gray-200"
                      )}
                    />
                  )}
                  <span className="truncate max-w-[14rem]">{s.name || s.Name}</span>
                  <span
                    className={cls(
                      "ml-1 text-[10px] uppercase tracking-wide",
                      active ? "text-white/70" : "text-gray-500"
                    )}
                  >
                    {s.type || s.Type}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Station details card */}
      {selectedStation && (
        <section className="rounded-lg border bg-white p-4">
          <div className="flex items-start gap-4">
            {selectedStation.imageUrl && (
              <img
                src={selectedStation.imageUrl}
                alt={`${selectedStation.name || "Station"} image`}
                className="h-24 w-24 rounded object-cover ring-1 ring-gray-200"
              />
            )}
            <div className="flex-1">
              <div className="text-base font-semibold">
                {selectedStation.name || selectedStation.Name}{" "}
                <span className="ml-2 text-xs uppercase text-gray-500">
                  {selectedStation.type || selectedStation.Type}
                </span>
              </div>
              <div className="mt-1 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  Total sockets:{" "}
                  <b className="tabular-nums">
                    {selectedStation.totalSlots ?? selectedStation.TotalSlots ?? "-"}
                  </b>
                </div>
                <div>
                  Status:{" "}
                  <span
                    className={cls(
                      "rounded-full px-2 py-0.5 text-xs ring-1",
                      selectedStation.isActive
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-gray-100 text-gray-700 ring-gray-300"
                    )}
                  >
                    {selectedStation.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div>
                  Lat: <span className="tabular-nums">
                    {selectedStation.lat ?? selectedStation.Lat ?? "—"}
                  </span>
                </div>
                <div>
                  Lng: <span className="tabular-nums">
                    {selectedStation.lng ?? selectedStation.Lng ?? "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Filters bar (for slots) */}
      <section className="rounded-lg border bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Date</label>
            <input
              type="date"
              className="h-10 rounded border border-gray-300 px-3"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Minutes / slot</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={15}
                max={120}
                step={15}
                value={mps}
                onChange={(e) => setMps(e.target.value)}
                className="w-52"
              />
              <span className="text-sm tabular-nums">{mps}m</span>
            </div>
          </div>
          <button
            onClick={loadSlots}
            disabled={busy}
            className="h-10 rounded bg-gray-900 px-4 text-white disabled:opacity-60"
          >
            {busy ? "Loading…" : "Refresh"}
          </button>

          {selectedStation && (
            <div className="ml-auto text-sm text-gray-600">
              <span className="font-medium">
                {selectedStation.name || selectedStation.Name}
              </span>
              <span className="mx-2">•</span>
              Total sockets:{" "}
              <span className="tabular-nums">
                {selectedStation.totalSlots ?? selectedStation.TotalSlots ?? "-"}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Slots (availability heat) */}
      <section className="rounded-lg border bg-white p-4">
        {slotData ? (
          <>
            <div className="mb-3 text-sm text-gray-600">
              Interval: <b>{slotData.minutesPerSlot} min</b> &nbsp;·&nbsp; Max concurrent:{" "}
              <b className="tabular-nums">{slotData.maxConcurrent}</b>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {slotData.slots.map((sl, i) => {
                const start = new Date(sl.startLocal);
                const end = new Date(sl.endLocal);
                const range = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

                const ratio = sl.available / slotData.maxConcurrent;
                const tone =
                  sl.available <= 0
                    ? "bg-rose-100 ring-rose-200"
                    : ratio <= 0.34
                    ? "bg-amber-100 ring-amber-200"
                    : "bg-emerald-100 ring-emerald-200";

                return (
                  <div key={i} className={cls("rounded-lg ring-1 p-3", tone)}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{range}</div>
                      <span
                        className={cls(
                          "rounded-full px-2 py-0.5 text-xs ring-1",
                          sl.available <= 0
                            ? "ring-rose-300 text-rose-700 bg-white/60"
                            : "ring-emerald-300 text-emerald-800 bg-white/60"
                        )}
                      >
                        {sl.available <= 0 ? "Full" : "Open"}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">
                      Available: <b className="tabular-nums">{sl.available}</b> / {slotData.maxConcurrent}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500">No slots for the selected date.</div>
        )}
      </section>

      {/* Schedule manager (selected date) */}
      <section className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Schedule for {date} (local)</h3>
          {scheduleLoading && <span className="text-xs text-gray-500">Loading…</span>}
        </div>

        {scheduleErr && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {scheduleErr}
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-600">Open</label>
            <input
              type="time"
              value={form.open}
              onChange={(e) => setForm((f) => ({ ...f, open: e.target.value }))}
              className="h-10 w-full rounded border border-gray-300 px-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Close</label>
            <input
              type="time"
              value={form.close}
              onChange={(e) => setForm((f) => ({ ...f, close: e.target.value }))}
              className="h-10 w-full rounded border border-gray-300 px-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Max concurrent</label>
            <input
              type="number"
              min={1}
              value={form.maxConcurrent}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxConcurrent: Number(e.target.value || 1) }))
              }
              className="h-10 w-full rounded border border-gray-300 px-3"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            className="h-10 rounded bg-gray-900 px-4 text-white disabled:opacity-60"
            onClick={onSaveSchedule}
            disabled={saving}
          >
            {saving ? "Saving…" : scheduleForDay ? "Update schedule" : "Create schedule"}
          </button>

          {scheduleForDay && (
            <button
              className="h-10 rounded border px-4 text-sm hover:bg-white disabled:opacity-60"
              onClick={onDeleteSchedule}
              disabled={saving}
            >
              Delete schedule
            </button>
          )}
        </div>

        {scheduleForDay && (
          <div className="mt-3 text-xs text-gray-500">
            Existing schedule id: <code>{scheduleForDay.id || scheduleForDay._id}</code>
          </div>
        )}
      </section>
    </div>
  );
}
