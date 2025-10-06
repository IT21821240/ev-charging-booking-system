import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { stations } from "../api/client";

export default function StationsPage() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Create form state
  const [form, setForm] = useState({ name: "", type: "AC", totalSlots: 1, lat: "", lng: "" });

  // Per-station edit buffer: { [id]: { name, type, totalSlots, lat, lng } }
  const [edits, setEdits] = useState({});

  async function load() {
    setMsg("");
    try {
      const data = await stations.list();
      setList(Array.isArray(data) ? data : []);
      // Seed edit buffer for visible list
      const seed = {};
      (Array.isArray(data) ? data : []).forEach((s) => {
        seed[s.id] = {
          name: s.name || "",
          type: s.type || "AC",
          totalSlots: Number(s.totalSlots) || 1,
          lat: s.lat ?? "",
          lng: s.lng ?? "",
        };
      });
      setEdits(seed);
    } catch (e) {
      setMsg(e.message || "Failed to load stations.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  /* ---------- helpers ---------- */
  const toNumOrNull = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const toPosInt = (v, fallback = 1) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };

  /* ---------- create ---------- */
  async function onCreate(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        totalSlots: toPosInt(form.totalSlots, 1),
        lat: toNumOrNull(form.lat),
        lng: toNumOrNull(form.lng),
      };
      if (!payload.name) throw new Error("Name is required.");
      await stations.create(payload);
      setForm({ name: "", type: "AC", totalSlots: 1, lat: "", lng: "" });
      await load();
      setMsg("Created.");
    } catch (err) {
      setMsg(err.message || "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- inline editing ---------- */
  function onEditChange(id, field, value) {
    setEdits((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: field === "totalSlots" ? value : value, // keep raw; coerce on save
      },
    }));
  }

  async function onUpdate(id) {
    setMsg("");
    setBusy(true);
    try {
      const e = edits[id];
      if (!e) return;
      const payload = {
        name: (e.name || "").trim(),
        type: e.type || "AC",
        totalSlots: toPosInt(e.totalSlots, 1),
        lat: toNumOrNull(e.lat),
        lng: toNumOrNull(e.lng),
      };
      if (!payload.name) throw new Error("Name is required.");
      await stations.update(id, payload);
      await load();
      setMsg("Updated.");
    } catch (err) {
      setMsg(err.message || "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate(id) {
    setMsg("");
    setBusy(true);
    try {
      await stations.deactivate(id);
      await load();
      setMsg("Deactivated.");
    } catch (err) {
      const em = String(err.message || "");
      if (em.includes("booking") || em.includes("Booking") || em.includes("409")) {
        setMsg(em || "Cannot deactivate: active future bookings exist.");
      } else {
        setMsg(em || "Deactivation failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onReactivate(id) {
    setMsg("");
    setBusy(true);
    try {
      await stations.reactivate(id);
      await load();
      setMsg("Reactivated.");
    } catch (err) {
      setMsg(err.message || "Reactivation failed.");
    } finally {
      setBusy(false);
    }
  }

  const hasList = useMemo(() => list && list.length > 0, [list]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Stations</h2>
      </header>

      {/* message bar */}
      {msg && (
        <div
          role="status"
          className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
        >
          {msg}
        </div>
      )}

      {/* Create */}
      <section className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">Create Station</h3>
        </div>
        <form onSubmit={onCreate} className="p-4">
          <fieldset className="grid gap-3 md:grid-cols-2" disabled={busy} aria-busy={busy}>
            <div className="flex flex-col gap-1">
              <label htmlFor="create-name" className="text-sm text-gray-700">
                Name<span className="text-red-500">*</span>
              </label>
              <input
                id="create-name"
                className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., Main Street Charger"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="create-type" className="text-sm text-gray-700">
                Type
              </label>
              <select
                id="create-type"
                className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="AC">AC</option>
                <option value="DC">DC</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="create-slots" className="text-sm text-gray-700">
                Total Slots
              </label>
              <input
                id="create-slots"
                className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                type="number"
                min={1}
                placeholder="1"
                value={form.totalSlots}
                onChange={(e) => setForm({ ...form, totalSlots: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="create-lat" className="text-sm text-gray-700">
                Latitude (optional)
              </label>
              <input
                id="create-lat"
                className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                type="number"
                step="any"
                placeholder="e.g., 6.9271"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1 md:col-span-2 md:max-w-sm">
              <label htmlFor="create-lng" className="text-sm text-gray-700">
                Longitude (optional)
              </label>
              <input
                id="create-lng"
                className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                type="number"
                step="any"
                placeholder="e.g., 79.8612"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <button
                className="inline-flex h-10 items-center justify-center rounded bg-gray-900 px-4 text-white shadow hover:bg-black disabled:opacity-60"
                disabled={busy}
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      {/* List + edit */}
      <section className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">All Stations</h3>
        </div>

        {!hasList && (
          <div className="p-6 text-sm text-gray-600">
            No stations yet. Use <span className="font-medium">Create Station</span> above to add
            your first station.
          </div>
        )}

        <div className="divide-y">
          {list.map((s) => {
            const e = edits[s.id] || {};
            const id = s.id;
            const statusClasses = s.isActive
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
              : "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";
            return (
              <div key={id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="text-base font-medium">{s.name}</div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${statusClasses}`}>
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs text-gray-500">({s.type})</span>
                  <span className="text-xs text-gray-500">Slots: {s.totalSlots}</span>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-name`} className="text-sm text-gray-700">
                      Name
                    </label>
                    <input
                      id={`${id}-name`}
                      className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={e.name ?? ""}
                      onChange={(ev) => onEditChange(id, "name", ev.target.value)}
                      placeholder="Name"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-type`} className="text-sm text-gray-700">
                      Type
                    </label>
                    <select
                      id={`${id}-type`}
                      className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={e.type ?? "AC"}
                      onChange={(ev) => onEditChange(id, "type", ev.target.value)}
                    >
                      <option value="AC">AC</option>
                      <option value="DC">DC</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-slots`} className="text-sm text-gray-700">
                      Total Slots
                    </label>
                    <input
                      id={`${id}-slots`}
                      className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                      type="number"
                      min={1}
                      value={e.totalSlots ?? 1}
                      onChange={(ev) => onEditChange(id, "totalSlots", ev.target.value)}
                      placeholder="Total Slots"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-lat`} className="text-sm text-gray-700">
                      Latitude
                    </label>
                    <input
                      id={`${id}-lat`}
                      className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                      type="number"
                      step="any"
                      value={e.lat ?? ""}
                      onChange={(ev) => onEditChange(id, "lat", ev.target.value)}
                      placeholder="Lat"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-lng`} className="text-sm text-gray-700">
                      Longitude
                    </label>
                    <input
                      id={`${id}-lng`}
                      className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                      type="number"
                      step="any"
                      value={e.lng ?? ""}
                      onChange={(ev) => onEditChange(id, "lng", ev.target.value)}
                      placeholder="Lng"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onUpdate(id)}
                    className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-3 text-white shadow hover:bg-blue-700 disabled:opacity-60"
                    disabled={busy}
                    title="Save changes"
                    aria-busy={busy}
                  >
                    {busy ? "Saving…" : "Update"}
                  </button>

                  {s.isActive ? (
                    <button
                      onClick={() => onDeactivate(id)}
                      className="inline-flex h-9 items-center justify-center rounded bg-red-600 px-3 text-white shadow hover:bg-red-700 disabled:opacity-60"
                      disabled={busy}
                      title="Deactivate station"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => onReactivate(id)}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-3 text-white shadow hover:bg-emerald-700 disabled:opacity-60"
                      disabled={busy}
                      title="Reactivate station"
                    >
                      Reactivate
                    </button>
                  )}

                  <Link
                    className="inline-flex h-9 items-center justify-center rounded bg-indigo-600 px-3 text-white shadow hover:bg-indigo-700"
                    to={`/stations/${s.id}/schedules`}
                    title="Manage schedules for this station"
                  >
                    Manage Schedules
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
