import React, { useEffect, useMemo, useState } from "react";
import { schedules, stations } from "../api/client";
import { useParams, useNavigate } from "react-router-dom";

/* -------- helpers: minutes <-> "HH:MM" -------- */
function hhmmToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minutesToHhmm(min) {
  const h = Math.floor((min || 0) / 60).toString().padStart(2, "0");
  const m = ((min || 0) % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
/* -------- date helpers for inputs -------- */
function dateToInput(d) {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export default function StationSchedulesPage() {
  const { stationId: paramId } = useParams();
  const nav = useNavigate();

  const [stationId, setStationId] = useState(paramId || "");
  const [stationList, setStationList] = useState([]);

  // normalized rows: { id, date: "YYYY-MM-DD", openMinutes, closeMinutes, maxConcurrent }
  const [rows, setRows] = useState([]);

  const today = useMemo(() => new Date(), []);
  const weekAhead = useMemo(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), []);
  const [fromDate, setFromDate] = useState(dateToInput(today));
  const [toDate, setToDate] = useState(dateToInput(weekAhead));

  // create form
  const [form, setForm] = useState({
    date: dateToInput(today),
    open: "08:00",
    close: "18:00",
    maxConcurrent: 1,
  });

  // edit buffer (normalized)
  const [edit, setEdit] = useState(null); // { id, date, openMinutes, closeMinutes, maxConcurrent, _openHHMM, _closeHHMM }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // load stations for dropdown
  useEffect(() => {
    (async () => {
      try {
        const s = await stations.list();
        setStationList(s?.items || s || []);
      } catch (e) {
        setMsg(e.message || "Failed to load stations.");
      }
    })();
  }, []);

  // load schedules when station/range changes
  useEffect(() => {
    if (!stationId) return;
    (async () => {
      setMsg("");
      try {
        const raw = await schedules.list(stationId, { from: fromDate, to: toDate });
        const arr = Array.isArray(raw) ? raw : raw?.items || [];
        // normalize to one shape
        const norm = arr.map(r => {
          const id = r.id ?? r.Id;
          const dateIso = r.date ?? r.Date; // backend might send either
          const date = dateIso ? new Date(dateIso).toISOString().slice(0, 10) : "";
          return {
            id,
            date,
            openMinutes: r.openMinutes ?? r.OpenMinutes ?? 0,
            closeMinutes: r.closeMinutes ?? r.CloseMinutes ?? 0,
            maxConcurrent: r.maxConcurrent ?? r.MaxConcurrent ?? 1,
          };
        });
        setRows(norm);
      } catch (e) {
        setRows([]);
        setMsg(e.message || "Failed to load schedules.");
      }
    })();
  }, [stationId, fromDate, toDate]);

  async function onCreate(e) {
    e.preventDefault();
    if (!stationId) return setMsg("Select a station.");
    const openM = hhmmToMinutes(form.open);
    const closeM = hhmmToMinutes(form.close);
    if (openM >= closeM) return setMsg("Open time must be before close time.");

    setBusy(true); setMsg("");
    try {
      await schedules.create(stationId, {
        date: form.date, // <-- "YYYY-MM-DD"
        openMinutes: openM,
        closeMinutes: closeM,
        maxConcurrent: Number(form.maxConcurrent || 1),
      });
      // reload
      const raw = await schedules.list(stationId, { from: fromDate, to: toDate });
      const arr = Array.isArray(raw) ? raw : raw?.items || [];
      const norm = arr.map(r => ({
        id: r.id ?? r.Id,
        date: (r.date ?? r.Date) ? new Date(r.date ?? r.Date).toISOString().slice(0, 10) : "",
        openMinutes: r.openMinutes ?? r.OpenMinutes ?? 0,
        closeMinutes: r.closeMinutes ?? r.CloseMinutes ?? 0,
        maxConcurrent: r.maxConcurrent ?? r.MaxConcurrent ?? 1,
      }));
      setRows(norm);
      setMsg("Added.");
    } catch (e) {
      setMsg(e.message || "Failed to add.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(e) {
    e.preventDefault();
    if (!edit) return;
    const openM = hhmmToMinutes(edit._openHHMM);
    const closeM = hhmmToMinutes(edit._closeHHMM);
    if (openM >= closeM) return setMsg("Open time must be before close time.");

    setBusy(true); setMsg("");
    try {
      await schedules.update(stationId, edit.id, {
        date: edit.date,            // <-- "YYYY-MM-DD"
        openMinutes: openM,
        closeMinutes: closeM,
        maxConcurrent: Number(edit.maxConcurrent || 1),
      });
      setEdit(null);
      const raw = await schedules.list(stationId, { from: fromDate, to: toDate });
      const arr = Array.isArray(raw) ? raw : raw?.items || [];
      const norm = arr.map(r => ({
        id: r.id ?? r.Id,
        date: (r.date ?? r.Date) ? new Date(r.date ?? r.Date).toISOString().slice(0, 10) : "",
        openMinutes: r.openMinutes ?? r.OpenMinutes ?? 0,
        closeMinutes: r.closeMinutes ?? r.CloseMinutes ?? 0,
        maxConcurrent: r.maxConcurrent ?? r.MaxConcurrent ?? 1,
      }));
      setRows(norm);
      setMsg("Updated.");
    } catch (e) {
      setMsg(e.message || "Failed to update.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Delete this schedule?")) return;
    setBusy(true); setMsg("");
    try {
      await schedules.remove(stationId, id);
      // reload
      const raw = await schedules.list(stationId, { from: fromDate, to: toDate });
      const arr = Array.isArray(raw) ? raw : raw?.items || [];
      const norm = arr.map(r => ({
        id: r.id ?? r.Id,
        date: (r.date ?? r.Date) ? new Date(r.date ?? r.Date).toISOString().slice(0, 10) : "",
        openMinutes: r.openMinutes ?? r.OpenMinutes ?? 0,
        closeMinutes: r.closeMinutes ?? r.CloseMinutes ?? 0,
        maxConcurrent: r.maxConcurrent ?? r.MaxConcurrent ?? 1,
      }));
      setRows(norm);
      setMsg("Deleted.");
    } catch (e) {
      setMsg(e.message || "Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  // // begin editing with normalized row
  // function startEdit(row) {
  //   setEdit({
  //     ...row,
  //     _openHHMM: minutesToHhmm(row.openMinutes),
  //     _closeHHMM: minutesToHhmm(row.closeMinutes),
  //   });
  // }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Station Schedules</h2>

      {/* Station & Range */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm mb-1">Station</label>
          <select
            className="border rounded p-2 min-w-60"
            value={stationId}
            onChange={(e) => {
              const id = e.target.value;
              setStationId(id);
              // neutral route per our router setup
              if (paramId && id !== paramId) nav(`/stations/${id}/schedules`);
            }}
          >
            <option value="">-- select --</option>
            {stationList.map((s) => (
              <option key={s.id || s.Id} value={s.id || s.Id}>
                {s.name || s.Name || s.id || s.Id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">From</label>
          <input
            type="date"
            className="border rounded p-2"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">To</label>
          <input
            type="date"
            className="border rounded p-2"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      {msg && <div className="mb-3 text-sm">{msg}</div>}

      {/* Create */}
      <form onSubmit={onCreate} className="border rounded p-3 bg-white mb-6">
        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <label className="block text-sm mb-1">Date</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Open</label>
            <input
              type="time"
              className="border rounded p-2 w-full"
              value={form.open}
              onChange={(e) => setForm({ ...form, open: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Close</label>
            <input
              type="time"
              className="border rounded p-2 w-full"
              value={form.close}
              onChange={(e) => setForm({ ...form, close: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Max Concurrent</label>
            <input
              type="number" min={1}
              className="border rounded p-2 w-full"
              value={form.maxConcurrent}
              onChange={(e) => setForm({ ...form, maxConcurrent: e.target.value })}
              required
            />
          </div>
          <div className="flex items-end">
            <button
              className="px-4 py-2 bg-black text-white rounded disabled:opacity-60"
              disabled={busy || !stationId}
            >
              {busy ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      </form>

      {/* List & Edit */}
      <div className="overflow-x-auto bg-white border rounded">
        <table className="min-w-full">
          <thead>
            <tr className="text-left border-b">
              <th className="p-3">Date</th>
              <th className="p-3">Open</th>
              <th className="p-3">Close</th>
              <th className="p-3">Max Concurrent</th>
              <th className="p-3 w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = edit && edit.id === r.id;
              return (
                <tr key={r.id} className="border-b">
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="date"
                        className="border rounded p-1"
                        value={edit.date}
                        onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                      />
                    ) : (
                      r.date || "-"
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="time"
                        className="border rounded p-1"
                        value={edit._openHHMM}
                        onChange={(e) => setEdit({ ...edit, _openHHMM: e.target.value })}
                      />
                    ) : (
                      minutesToHhmm(r.openMinutes)
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="time"
                        className="border rounded p-1"
                        value={edit._closeHHMM}
                        onChange={(e) => setEdit({ ...edit, _closeHHMM: e.target.value })}
                      />
                    ) : (
                      minutesToHhmm(r.closeMinutes)
                    )}
                  </td>
                  <td className="p-3">{r.maxConcurrent}</td>
                  <td className="p-3">
                    {isEditing ? (
                      <>
                        <button
                          className="px-3 py-1 bg-green-600 text-white rounded mr-2 disabled:opacity-60"
                          onClick={onSaveEdit}
                          disabled={busy}
                        >
                          Save
                        </button>
                        <button className="px-3 py-1 border rounded" onClick={() => setEdit(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="px-3 py-1 border rounded mr-2"
                          onClick={() =>
                            setEdit({
                              ...r,
                              _openHHMM: minutesToHhmm(r.openMinutes),
                              _closeHHMM: minutesToHhmm(r.closeMinutes),
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="px-3 py-1 bg-red-600 text-white rounded"
                          onClick={() => onDelete(r.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-sm text-gray-500" colSpan={5}>
                  No schedules for this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <div className="mt-3 text-sm">{msg}</div>}
    </div>
  );
}
