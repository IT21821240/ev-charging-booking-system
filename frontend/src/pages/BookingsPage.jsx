import React, { useEffect, useMemo, useState } from "react";
import { bookings } from "../api/client";
import { useAuth } from "../auth/AuthContext";

/* ---------- time helpers ---------- */
// Convert "YYYY-MM-DDTHH:MM" (local) -> ISO UTC string
function toUtcIso(dtLocalStr) {
  if (!dtLocalStr) return "";
  const local = new Date(dtLocalStr);
  return new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString();
}

// Convert ISO UTC string -> "YYYY-MM-DDTHH:MM" (for <input type="datetime-local">)
function fromUtcIsoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// Clamp to [now, now+7d] in local input format (YYYY-MM-DDTHH:MM)
function clampToAssignmentWindow(dtStr) {
  if (!dtStr) return "";
  const inp = new Date(dtStr);
  if (isNaN(inp)) return "";
  const now = new Date();
  const max = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const clamp = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  if (inp < now) return clamp(now);
  if (inp > max) return clamp(max);
  return dtStr;
}

export default function BookingsPage() {
  const { user } = useAuth(); // Backoffice | StationOperator
  const [form, setForm] = useState({ nic: "", stationId: "", startTime: "", endTime: "" });
  const [bookingId, setBookingId] = useState("");
  const [current, setCurrent] = useState(null);   // latest booking data from server (if fetched)
  const [qrToken, setQrToken] = useState("");
  const [validated, setValidated] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Input min/max (local time window)
  const nowISO = useMemo(() => new Date().toISOString().slice(0, 16), []);
  const maxISO = useMemo(() => {
    const max = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return max.toISOString().slice(0, 16);
  }, []);

  // Try to get the current booking from server when bookingId changes
  useEffect(() => {
    setCurrent(null);
    if (!bookingId) return;
    (async () => {
      try {
        if (typeof bookings.get === "function") {
          const b = await bookings.get(bookingId);
          setCurrent(b);
          // keep form inputs in sync with server values so UI rules are consistent
          if (b?.startTime) setForm((f) => ({ ...f, startTime: fromUtcIsoToLocalInput(b.startTime) }));
          if (b?.endTime) setForm((f) => ({ ...f, endTime: fromUtcIsoToLocalInput(b.endTime) }));
        }
      } catch {
        // ignore if get() not available or fails
      }
    })();
  }, [bookingId]);

  // Use server startTime if we have it; otherwise fall back to form
  function hoursUntilStart() {
    const src =
      current?.startTime
        ? new Date(current.startTime)
        : form.startTime
        ? new Date(form.startTime)
        : null;
    if (!src) return Infinity;
    return (src - new Date()) / (60 * 60 * 1000);
  }
  const isLocked = hoursUntilStart() < 12;

  // Simple client-side validations
  const missingCreate = !form.nic.trim() || !form.stationId.trim() || !form.startTime || !form.endTime;
  const endBeforeStart =
    form.startTime && form.endTime && new Date(form.endTime) <= new Date(form.startTime);

  async function createBooking(e) {
    e.preventDefault();
    setMsg("");
    setValidated(null);
    setQrToken("");
    try {
      setBusy(true);
      const payload = {
        nic: form.nic.trim(),
        stationId: form.stationId.trim(),
        startTime: toUtcIso(form.startTime),
        endTime: toUtcIso(form.endTime),
      };
      const b = await bookings.create(payload);
      const id = b.id || b._id || "";
      setBookingId(id);
      setCurrent(b);
      setMsg("Created.");
    } catch (err) {
      setMsg(err.message || "Failed to create.");
    } finally {
      setBusy(false);
    }
  }

  async function updateBooking() {
    setMsg("");
    setValidated(null);
    try {
      setBusy(true);
      if (!bookingId) throw new Error("Enter a Booking ID.");
      await bookings.update(bookingId, {
        startTime: toUtcIso(form.startTime),
        endTime: toUtcIso(form.endTime),
      });
      setMsg("Updated.");
    } catch (err) {
      setMsg(err.message || "Failed to update.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking() {
    setMsg("");
    setValidated(null);
    setQrToken("");
    try {
      setBusy(true);
      if (!bookingId) throw new Error("Enter a Booking ID.");
      await bookings.cancel(bookingId);
      setMsg("Cancelled.");
    } catch (err) {
      setMsg(err.message || "Failed to cancel.");
    } finally {
      setBusy(false);
    }
  }

  async function approveBooking() {
    setMsg("");
    try {
      setBusy(true);
      if (!bookingId) throw new Error("Enter a Booking ID.");
      const r = await bookings.approve(bookingId);
      const token = r.qrToken || r.token || "";
      setQrToken(token);
      if (token) {
        try {
          await navigator.clipboard.writeText(token);
          setMsg("Approved. QR token copied to clipboard.");
        } catch {
          setMsg("Approved. (Copy failed; token shown below.)");
        }
      } else {
        setMsg("Approved.");
      }
    } catch (err) {
      setMsg(err.message || "Failed to approve.");
    } finally {
      setBusy(false);
    }
  }

  async function validateQr() {
    setMsg("");
    setValidated(null);
    try {
      setBusy(true);
      if (!qrToken.trim()) throw new Error("Enter a QR token.");
      const r = await bookings.validateQr(qrToken.trim());
      setValidated(r); // { id, nic, stationId, startTime, endTime, status }
      setMsg(`Valid for booking ${r.id || r.bookingId || ""}`.trim());
    } catch (err) {
      setMsg(err.message || "Failed to validate QR.");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    setMsg("");
    try {
      setBusy(true);
      if (!bookingId) throw new Error("Enter a Booking ID.");
      await bookings.finalize(bookingId);
      setMsg("✅ Session completed.");
    } catch (err) {
      setMsg(err.message || "Failed to finalize.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Bookings</h2>

      {/* Create */}
      <form onSubmit={createBooking} className="grid gap-2 border p-4 rounded bg-white">
        <input
          className="border p-2 rounded"
          placeholder="Owner NIC"
          value={form.nic}
          onChange={(e) => setForm({ ...form, nic: e.target.value })}
        />
        <input
          className="border p-2 rounded"
          placeholder="Station ID"
          value={form.stationId}
          onChange={(e) => setForm({ ...form, stationId: e.target.value })}
        />

        <label className="text-sm text-gray-600">Start Time (≤ 7 days)</label>
        <input
          className="border p-2 rounded"
          type="datetime-local"
          min={nowISO}
          max={maxISO}
          value={form.startTime}
          onChange={(e) =>
            setForm({ ...form, startTime: clampToAssignmentWindow(e.target.value) })
          }
        />

        <label className="text-sm text-gray-600">End Time (≤ 7 days)</label>
        <input
          className="border p-2 rounded"
          type="datetime-local"
          min={form.startTime || nowISO}
          max={maxISO}
          value={form.endTime}
          onChange={(e) =>
            setForm({ ...form, endTime: clampToAssignmentWindow(e.target.value) })
          }
        />

        {endBeforeStart && (
          <div className="text-sm text-red-600">End time must be after start time.</div>
        )}

        <button
          className="px-3 py-2 bg-gray-900 text-white rounded disabled:opacity-60"
          disabled={busy || missingCreate || endBeforeStart}
        >
          {busy ? "Creating..." : "Create"}
        </button>
      </form>

      {/* Manage existing */}
      <div className="border p-4 rounded bg-white space-y-3">
        <input
          className="border p-2 rounded w-full"
          placeholder="Booking ID"
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
        />

        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Start Time</label>
            <input
              className="border p-2 rounded w-full"
              type="datetime-local"
              min={nowISO}
              max={maxISO}
              value={form.startTime}
              onChange={(e) =>
                setForm({ ...form, startTime: clampToAssignmentWindow(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-600">End Time</label>
            <input
              className="border p-2 rounded w-full"
              type="datetime-local"
              min={form.startTime || nowISO}
              max={maxISO}
              value={form.endTime}
              onChange={(e) =>
                setForm({ ...form, endTime: clampToAssignmentWindow(e.target.value) })
              }
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={updateBooking}
            disabled={busy || !bookingId || isLocked}
            title={isLocked ? "Updates disabled within 12h before start" : ""}
            className={`px-3 py-2 rounded text-white ${
              busy || !bookingId || isLocked ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600"
            }`}
          >
            Update
          </button>

          <button
            onClick={cancelBooking}
            disabled={busy || !bookingId || isLocked}
            title={isLocked ? "Cancellation disabled within 12h before start" : ""}
            className={`px-3 py-2 rounded text-white ${
              busy || !bookingId || isLocked ? "bg-gray-400 cursor-not-allowed" : "bg-red-600"
            }`}
          >
            Cancel
          </button>

          {(user?.role === "Backoffice" || user?.role === "StationOperator") && (
            <>
              <button
                onClick={approveBooking}
                disabled={busy || !bookingId}
                className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-60"
              >
                Approve → QR
              </button>

              <input
                className="border p-2 rounded"
                placeholder="QR Token"
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
              />

              <button
                onClick={validateQr}
                disabled={busy || !qrToken.trim()}
                className="px-3 py-2 bg-indigo-600 text-white rounded disabled:opacity-60"
              >
                Validate QR
              </button>

              <button
                onClick={finalize}
                disabled={busy || !bookingId}
                className="px-3 py-2 bg-slate-800 text-white rounded disabled:opacity-60"
              >
                Finalize
              </button>
            </>
          )}
        </div>

        {/* Show validation summary */}
        {validated && (
          <div className="mt-3 border rounded p-3 bg-gray-50 text-sm">
            <div><b>ID:</b> {validated.id}</div>
            <div><b>NIC:</b> {validated.nic}</div>
            <div><b>Station:</b> {validated.stationId}</div>
            <div><b>Start:</b> {validated.startTime ? new Date(validated.startTime).toLocaleString() : "-"}</div>
            <div><b>End:</b> {validated.endTime ? new Date(validated.endTime).toLocaleString() : "-"}</div>
            <div><b>Status:</b> {validated.status}</div>
          </div>
        )}
      </div>

      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}
