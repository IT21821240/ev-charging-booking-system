import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { stations, stationOps } from "../api/client";

export default function StationsPage() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // create form (with image + preview)
  const [form, setForm] = useState({
    name: "",
    type: "AC",
    totalSlots: 1,
    lat: "",
    lng: "",
    file: null,
    preview: null,
  });

  // per-station edit + image buffers
  const [edits, setEdits] = useState({});
  const [editFile, setEditFile] = useState({}); // { [stationId]: File|null }

  // operators
  const [opsForStation, setOpsForStation] = useState({}); // { [stationId]: [{id,email,isActive}] }
  const [opPickerOpen, setOpPickerOpen] = useState({}); // { [stationId]: bool }
  const [opPickerQuery, setOpPickerQuery] = useState({}); // { [stationId]: string }
  const [opPickerPage, setOpPickerPage] = useState({}); // { [stationId]: number }
  const [opPickerData, setOpPickerData] = useState({}); // { [stationId]: { items, total, page, pageSize } }
  const [opPickerSelected, setOpPickerSelected] = useState({}); // { [stationId]: Set<userId> }

  async function load() {
    setMsg("");
    try {
      const data = await stations.list();
      const arr = Array.isArray(data) ? data : [];
      setList(arr);

      const seed = {};
      arr.forEach((s) => {
        seed[s.id] = {
          name: s.name || "",
          type: s.type || "AC",
          totalSlots: Number(s.totalSlots) || 1,
          lat: s.lat ?? "",
          lng: s.lng ?? "",
        };
      });
      setEdits(seed);

      const opsLists = {};
      await Promise.all(
        arr.map(async (s) => {
          try {
            opsLists[s.id] = await stationOps.list(s.id);
          } catch {
            opsLists[s.id] = [];
          }
        })
      );
      setOpsForStation(opsLists);
    } catch (e) {
      setMsg(e.message || "Failed to load stations.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Debounced candidates fetch for any open picker
  useEffect(() => {
    const timers = [];
    Object.entries(opPickerOpen).forEach(([stationId, open]) => {
      if (!open) return;
      const q = opPickerQuery[stationId] ?? "";
      const page = opPickerPage[stationId] ?? 1;

      const t = setTimeout(async () => {
        try {
          const res = await stationOps.searchCandidates(stationId, {
            q,
            page,
            pageSize: 10,
          });
          setOpPickerData((p) => ({ ...p, [stationId]: res }));
        } catch {
          setOpPickerData((p) => ({
            ...p,
            [stationId]: { items: [], total: 0, page: 1, pageSize: 10 },
          }));
        }
      }, 250);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [opPickerOpen, opPickerQuery, opPickerPage]);

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
  function onCreateFileChange(ev) {
    const f = ev.target.files?.[0] || null;
    setForm((prev) => ({
      ...prev,
      file: f,
      preview: f ? URL.createObjectURL(f) : null,
    }));
  }

  async function onCreate(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const name = form.name.trim();
      if (!name) throw new Error("Name is required.");

      await stations.create({
        name,
        type: form.type,
        totalSlots: toPosInt(form.totalSlots, 1),
        lat: toNumOrNull(form.lat),
        lng: toNumOrNull(form.lng),
        file: form.file, // png/jpg accepted by backend
      });

      setForm({
        name: "",
        type: "AC",
        totalSlots: 1,
        lat: "",
        lng: "",
        file: null,
        preview: null,
      });
      await load();
      setMsg("Created.");
    } catch (err) {
      setMsg(err.message || "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- inline edit ---------- */
  function onEditChange(id, field, value) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
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
        isActive: list.find((x) => x.id === id)?.isActive ?? true,
      };
      if (!payload.name) throw new Error("Name is required.");

      await stations.update(id, payload);

      // upload replacement image if selected
      const f = editFile[id];
      if (f) await stations.updateImage(id, f);

      await load();
      setMsg("Updated.");
    } catch (err) {
      setMsg(err.message || "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- activate/deactivate ---------- */
  async function onDeactivate(id) {
    setMsg("");
    setBusy(true);
    try {
      await stations.deactivate(id);
      await load();
      setMsg("Deactivated.");
    } catch (err) {
      const em = String(err.message || "");
      setMsg(
        em.includes("booking") || em.includes("409")
          ? em || "Cannot deactivate: active future bookings exist."
          : em || "Deactivation failed."
      );
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

  /* ---------- operators ---------- */
  function onPickNewImage(id, ev) {
    const f = ev.target.files?.[0] || null;
    setEditFile((prev) => ({ ...prev, [id]: f }));
  }

  async function refreshOps(stationId) {
    try {
      const ops = await stationOps.list(stationId);
      setOpsForStation((prev) => ({ ...prev, [stationId]: ops || [] }));
    } catch {
      setOpsForStation((prev) => ({ ...prev, [stationId]: [] }));
    }
  }

  async function removeOperator(stationId, userId) {
    setBusy(true);
    try {
      await stationOps.remove(stationId, userId);
      await refreshOps(stationId);
      setMsg("Operator removed.");
    } catch (err) {
      setMsg(err.message || "Remove operator failed.");
    } finally {
      setBusy(false);
    }
  }

  const hasList = useMemo(() => list && list.length > 0, [list]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl md:max-w-5xl mx-auto">
      <header className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Stations</h2>
      </header>

      {msg && (
        <div
          role="status"
          className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
        >
          {msg}
        </div>
      )}

      {/* Create */}
      <section className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">Create Station</h3>
        </div>
        <form onSubmit={onCreate} className="p-4" encType="multipart/form-data">
          <fieldset
            className="grid gap-3 sm:gap-4 md:grid-cols-2"
            disabled={busy}
            aria-busy={busy}
          >
            <Field
              id="create-name"
              label="Name *"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="e.g., Main Street Charger"
            />
            <Select
              id="create-type"
              label="Type"
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
              options={[
                { value: "AC", label: "AC" },
                { value: "DC", label: "DC" },
              ]}
            />
            <NumberField
              id="create-slots"
              label="Total Slots"
              min={1}
              value={form.totalSlots}
              onChange={(v) => setForm({ ...form, totalSlots: v })}
            />
            <NumberField
              id="create-lat"
              label="Latitude (optional)"
              step="any"
              value={form.lat}
              onChange={(v) => setForm({ ...form, lat: v })}
            />
            <NumberField
              id="create-lng"
              label="Longitude (optional)"
              step="any"
              value={form.lng}
              onChange={(v) => setForm({ ...form, lng: v })}
            />
            <div className="flex flex-col gap-1 md:col-span-2">
              <label htmlFor="create-file" className="text-sm text-gray-700">
                Image (png/jpg)
              </label>
              <input
                id="create-file"
                type="file"
                accept="image/*"
                onChange={onCreateFileChange}
                className="text-sm"
              />
              {form.preview && (
                <img
                  src={form.preview}
                  alt="Preview"
                  className="mt-2 h-24 w-24 rounded object-cover border"
                />
              )}
            </div>
            <div className="md:col-span-2">
              <button
                className="inline-flex h-10 items-center justify-center rounded bg-gray-900 px-4 text-white hover:bg-black disabled:opacity-60"
                disabled={busy}
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      {/* List + edit */}
      <section className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">All Stations</h3>
        </div>

        {!hasList && (
          <div className="p-6 text-sm text-gray-600">
            No stations yet. Use{" "}
            <span className="font-medium">Create Station</span> above to add
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
            const ops = opsForStation[id] || [];

            return (
              <div key={id} className="p-4 sm:p-5 space-y-4">
                {/* Header */}
                <div className="mb-1 flex flex-wrap items-center gap-3">
                  {s.imageUrl && (
                    <img
                      src={s.imageUrl}
                      alt={`${s.name} thumbnail`}
                      className="h-12 w-12 rounded object-cover border"
                    />
                  )}
                  <div className="text-base font-medium">{s.name}</div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${statusClasses}`}
                  >
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs text-gray-500">({s.type})</span>
                  <span className="text-xs text-gray-500">
                    Slots: {s.totalSlots}
                  </span>
                </div>

                {/* Edit fields */}
                <div className="grid gap-3 sm:gap-4 md:grid-cols-5">
                  <Field
                    id={`${id}-name`}
                    label="Name"
                    value={e.name ?? ""}
                    onChange={(v) => onEditChange(id, "name", v)}
                  />
                  <Select
                    id={`${id}-type`}
                    label="Type"
                    value={e.type ?? "AC"}
                    onChange={(v) => onEditChange(id, "type", v)}
                    options={[
                      { value: "AC", label: "AC" },
                      { value: "DC", label: "DC" },
                    ]}
                  />
                  <NumberField
                    id={`${id}-slots`}
                    label="Total Slots"
                    min={1}
                    value={e.totalSlots ?? 1}
                    onChange={(v) => onEditChange(id, "totalSlots", v)}
                  />

                  <NumberField
                    id={`${id}-lat`}
                    label="Latitude"
                    step="any"
                    value={e.lat ?? ""}
                    onChange={(v) => onEditChange(id, "lat", v)}
                  />
                  <NumberField
                    id={`${id}-lng`}
                    label="Longitude"
                    step="any"
                    value={e.lng ?? ""}
                    onChange={(v) => onEditChange(id, "lng", v)}
                  />
                </div>

                {/* Replace image */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-gray-700">Replace Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(ev) => onPickNewImage(id, ev)}
                    className="text-sm"
                  />
                </div>

                {/* Actions */}
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    onClick={() => onUpdate(id)}
                    className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-3 text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={busy}
                    title="Save changes"
                  >
                    {busy ? "Saving…" : "Update"}
                  </button>

                  {s.isActive ? (
                    <button
                      onClick={() => onDeactivate(id)}
                      className="inline-flex h-9 items-center justify-center rounded bg-red-600 px-3 text-white hover:bg-red-700 disabled:opacity-60"
                      disabled={busy}
                      title="Deactivate station"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => onReactivate(id)}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-3 text-white hover:bg-emerald-700 disabled:opacity-60"
                      disabled={busy}
                      title="Reactivate station"
                    >
                      Reactivate
                    </button>
                  )}

                  <Link
                    className="inline-flex h-9 items-center justify-center rounded bg-indigo-600 px-3 text-white hover:bg-indigo-700"
                    to={`/stations/${s.id}/schedules`}
                    title="Manage schedules"
                  >
                    Manage Schedules
                  </Link>
                </div>

                {/* Operators */}
                <div className="rounded border bg-gray-50 p-3">
                  <div className="mb-2 text-sm font-semibold">
                    Operators for this station
                  </div>

                  <div className="mb-2 flex flex-wrap gap-2">
                    {ops.length === 0 && (
                      <div className="text-sm text-gray-600">
                        No operators yet.
                      </div>
                    )}
                    {ops.map((op) => (
                      <span
                        key={op.id}
                        className="inline-flex items-center gap-2 rounded bg-white px-2 py-1 text-xs ring-1 ring-gray-200"
                      >
                        <span>{op.email}</span>
                        <button
                          type="button"
                          className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white"
                          onClick={() => removeOperator(id, op.id)}
                        >
                          remove
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="h-9 rounded bg-gray-900 px-3 text-sm text-white hover:bg-black"
                      onClick={() => {
                        setOpPickerOpen((p) => ({ ...p, [id]: true }));
                        setOpPickerQuery((p) => ({ ...p, [id]: "" }));
                        setOpPickerPage((p) => ({ ...p, [id]: 1 }));
                        setOpPickerSelected((p) => ({ ...p, [id]: new Set() }));
                      }}
                    >
                      Add operators
                    </button>
                    <button
                      type="button"
                      className="h-9 rounded border px-3 text-sm hover:bg-white"
                      onClick={() => refreshOps(id)}
                    >
                      Refresh list
                    </button>
                  </div>

                  {/* Modal: candidates */}
                  {opPickerOpen[id] && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                      <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg max-h-[80vh] overflow-y-auto">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-semibold">
                            Add operators to: {s.name}
                          </div>
                          <button
                            className="text-sm underline"
                            onClick={() =>
                              setOpPickerOpen((p) => ({ ...p, [id]: false }))
                            }
                          >
                            Close
                          </button>
                        </div>

                        <div className="mb-3 flex gap-2">
                          <input
                            className="h-9 flex-1 rounded border border-gray-300 px-2 text-sm"
                            placeholder="Search by email"
                            value={opPickerQuery[id] ?? ""}
                            onChange={(e) =>
                              setOpPickerQuery((p) => ({
                                ...p,
                                [id]: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="max-h-64 overflow-auto rounded border">
                          {(opPickerData[id]?.items ?? []).map((u) => {
                            const selected = opPickerSelected[id]?.has(u.id);
                            return (
                              <label
                                key={u.id}
                                className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                              >
                                <span className="truncate">{u.email}</span>
                                <input
                                  type="checkbox"
                                  checked={!!selected}
                                  onChange={(e) => {
                                    setOpPickerSelected((p) => {
                                      const set = new Set(p[id] ?? []);
                                      if (e.target.checked) set.add(u.id);
                                      else set.delete(u.id);
                                      return { ...p, [id]: set };
                                    });
                                  }}
                                />
                              </label>
                            );
                          })}
                          {(opPickerData[id]?.total ?? 0) === 0 && (
                            <div className="px-3 py-4 text-sm text-gray-500">
                              No matching operators.
                            </div>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                          <div>Total: {opPickerData[id]?.total ?? 0}</div>
                          <div className="flex items-center gap-2">
                            <button
                              className="rounded border px-2 py-1 disabled:opacity-50"
                              disabled={(opPickerPage[id] ?? 1) <= 1}
                              onClick={() =>
                                setOpPickerPage((p) => ({
                                  ...p,
                                  [id]: (p[id] ?? 1) - 1,
                                }))
                              }
                            >
                              Prev
                            </button>
                            <div>Page {opPickerData[id]?.page ?? 1}</div>
                            <button
                              className="rounded border px-2 py-1 disabled:opacity-50"
                              disabled={(() => {
                                const d = opPickerData[id];
                                if (!d) return true;
                                const pages = Math.ceil(d.total / d.pageSize);
                                return d.page >= pages;
                              })()}
                              onClick={() =>
                                setOpPickerPage((p) => ({
                                  ...p,
                                  [id]: (p[id] ?? 1) + 1,
                                }))
                              }
                            >
                              Next
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            className="h-9 rounded border px-3 text-sm"
                            onClick={() =>
                              setOpPickerOpen((p) => ({ ...p, [id]: false }))
                            }
                          >
                            Cancel
                          </button>
                          <button
                            className="h-9 rounded bg-indigo-600 px-3 text-sm text-white hover:bg-indigo-700"
                            onClick={async () => {
                              const ids = Array.from(opPickerSelected[id] ?? []);
                              if (ids.length === 0) return;
                              try {
                                await Promise.all(
                                  ids.map((uid) => stationOps.add(id, uid))
                                );
                                await refreshOps(id);
                                setMsg(`Added ${ids.length} operator(s)`);
                                setOpPickerOpen((p) => ({ ...p, [id]: false }));
                              } catch (e) {
                                setMsg(e.message || "Failed to add operators.");
                              }
                            }}
                          >
                            Add selected
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* Presentational helpers */
function Field({ id, label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-gray-700">
        {label}
      </label>
      <input
        id={id}
        className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
function NumberField({ id, label, value, onChange, min, step }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function Select({ id, label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-gray-700">
        {label}
      </label>
      <select
        id={id}
        className="h-10 rounded border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
