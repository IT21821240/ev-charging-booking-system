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
      (Array.isArray(data) ? data : []).forEach(s => {
        seed[s.id] = {
          name: s.name || "",
          type: s.type || "AC",
          totalSlots: Number(s.totalSlots) || 1,
          lat: s.lat ?? "",
          lng: s.lng ?? ""
        };
      });
      setEdits(seed);
    } catch (e) {
      setMsg(e.message || "Failed to load stations.");
    }
  }
  useEffect(() => { load(); }, []);

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
      // Show friendly hint if it’s the active-bookings rule
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
      <h2 className="text-2xl font-semibold">Stations</h2>

      {/* Create */}
      <div className="border p-4 rounded space-y-3 bg-white">
        <div className="font-medium">Create Station</div>
        <form onSubmit={onCreate} className="grid gap-2 md:grid-cols-2">
          <input
            className="border p-2 rounded"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="border p-2 rounded"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="AC">AC</option>
            <option value="DC">DC</option>
          </select>
          <input
            className="border p-2 rounded"
            type="number"
            min={1}
            placeholder="Total Slots"
            value={form.totalSlots}
            onChange={(e) => setForm({ ...form, totalSlots: e.target.value })}
          />
          <input
            className="border p-2 rounded"
            type="number"
            step="any"
            placeholder="Lat (optional)"
            value={form.lat}
            onChange={(e) => setForm({ ...form, lat: e.target.value })}
          />
          <input
            className="border p-2 rounded"
            type="number"
            step="any"
            placeholder="Lng (optional)"
            value={form.lng}
            onChange={(e) => setForm({ ...form, lng: e.target.value })}
          />

          <div className="md:col-span-2">
            <button
              className="px-3 py-2 bg-gray-900 text-white rounded disabled:opacity-60"
              disabled={busy}
            >
              {busy ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>

      {/* List + edit */}
      <div className="border p-4 rounded space-y-3 bg-white">
        <div className="font-medium">All Stations</div>

        {!hasList && <div className="text-sm text-gray-500">No stations yet.</div>}

        <div className="space-y-4">
          {list.map((s) => {
            const e = edits[s.id] || {};
            return (
              <div key={s.id} className="border p-3 rounded space-y-3">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{s.name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    s.isActive ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"
                  }`}>
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs text-gray-500">({s.type})</span>
                  <span className="text-xs text-gray-500">Slots: {s.totalSlots}</span>
                </div>

                <div className="grid md:grid-cols-5 gap-2">
                  <input
                    className="border p-2 rounded"
                    value={e.name ?? ""}
                    onChange={(ev) => onEditChange(s.id, "name", ev.target.value)}
                    placeholder="Name"
                  />
                  <select
                    className="border p-2 rounded"
                    value={e.type ?? "AC"}
                    onChange={(ev) => onEditChange(s.id, "type", ev.target.value)}
                  >
                    <option value="AC">AC</option>
                    <option value="DC">DC</option>
                  </select>
                  <input
                    className="border p-2 rounded"
                    type="number"
                    min={1}
                    value={e.totalSlots ?? 1}
                    onChange={(ev) => onEditChange(s.id, "totalSlots", ev.target.value)}
                    placeholder="Total Slots"
                  />
                  <input
                    className="border p-2 rounded"
                    type="number"
                    step="any"
                    value={e.lat ?? ""}
                    onChange={(ev) => onEditChange(s.id, "lat", ev.target.value)}
                    placeholder="Lat"
                  />
                  <input
                    className="border p-2 rounded"
                    type="number"
                    step="any"
                    value={e.lng ?? ""}
                    onChange={(ev) => onEditChange(s.id, "lng", ev.target.value)}
                    placeholder="Lng"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onUpdate(s.id)}
                    className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
                    disabled={busy}
                  >
                    {busy ? "Saving..." : "Update"}
                  </button>

                  {s.isActive ? (
                    <button
                      onClick={() => onDeactivate(s.id)}
                      className="px-3 py-2 bg-red-600 text-white rounded disabled:opacity-60"
                      disabled={busy}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => onReactivate(s.id)}
                      className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-60"
                      disabled={busy}
                    >
                      Reactivate
                    </button>
                  )}

                  {/* Manage schedules (both roles) */}
                  <Link
                    className="px-3 py-2 bg-indigo-600 text-white rounded"
                    to={`/stations/${s.id}/schedules`}
                  >
                    Manage Schedules
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {msg && <div className="text-sm text-gray-700">{msg}</div>}
    </div>
  );
}
