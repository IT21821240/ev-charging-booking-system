import React, { useEffect, useState } from "react";
import { bookings } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function BookingsPage() {
  const { user } = useAuth(); // Backoffice | StationOperator
  const role = user?.role;

  const [pendingList, setPendingList] = useState([]);
  const [approvedList, setApprovedList] = useState([]);
  const [completedList, setCompletedList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // ---- Loaders ----
  async function loadPending() {
    try { setPendingList(await bookings.listPending()); }
    catch (e) { setMsg(e.message || "Failed to load pending."); }
  }
  async function loadApproved() {
    try { setApprovedList(await bookings.listApproved()); } // all approved (no time filter)
    catch (e) { setMsg(e.message || "Failed to load approved."); }
  }
  async function loadCompleted() {
    try { setCompletedList(await bookings.listCompleted()); }
    catch (e) { setMsg(e.message || "Failed to load completed."); }
  }

  async function refreshAll() {
    setMsg(""); setBusy(true);
    try { await Promise.all([loadPending(), loadApproved(), loadCompleted()]); }
    finally { setBusy(false); }
  }

  // ---- Actions ----
  async function approveBooking(id) {
    setMsg(""); setBusy(true);
    try {
      await bookings.approve(id);                 // backend returns { message }, not a QR
      setMsg(`Approved booking ${id}.`);
      await refreshAll();
    } catch (e) {
      setMsg(e.message || "Failed to approve.");
    } finally { setBusy(false); }
  }

  async function finalizeBooking(id) {
    setMsg(""); setBusy(true);
    try {
      await bookings.finalize(id);
      setMsg(`Finalized booking ${id}.`);
      await refreshAll();
    } catch (e) {
      setMsg(e.message || "Failed to finalize.");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (role === "Backoffice" || role === "StationOperator") {
      refreshAll();
    }
  }, [role]);

  // ---- Row renderer ----
  function Row({ b, children }) {
    return (
      <div className="border p-2 rounded bg-gray-50 flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <div><b>Start:</b> {new Date(b.startTime).toLocaleString()}</div>
          <div><b>End:</b> {new Date(b.endTime).toLocaleString()}</div>
          <div><b>Status:</b> {b.status}</div>
        </div>
        <div className="flex gap-2 mt-2 md:mt-0">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Bookings</h2>

      {/* Pending */}
      <section className="border p-4 rounded bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Pending</h3>
          <button
            onClick={loadPending}
            disabled={busy}
            className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        {pendingList.length === 0 && <div className="text-sm text-gray-600">No pending bookings.</div>}
        <div className="space-y-2">
          {pendingList.map(b => (
            <Row key={b.id} b={b}>
              {/* Only allow Approve on Pending */}
              {b.status === "Pending" && (
                <button
                  onClick={() => approveBooking(b.id)}
                  className="px-3 py-1 bg-green-600 text-white rounded"
                >
                  Approve
                </button>
              )}
            </Row>
          ))}
        </div>
      </section>

      {/* Approved */}
      <section className="border p-4 rounded bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Approved</h3>
          <button
            onClick={loadApproved}
            disabled={busy}
            className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        {approvedList.length === 0 && <div className="text-sm text-gray-600">No approved bookings.</div>}
        <div className="space-y-2">
          {approvedList.map(b => (
            <Row key={b.id} b={b}>
              {/* Only allow Finalize on Approved */}
              {b.status === "Approved" && (
                <button
                  onClick={() => finalizeBooking(b.id)}
                  className="px-3 py-1 bg-slate-800 text-white rounded"
                >
                  Finalize
                </button>
              )}
            </Row>
          ))}
        </div>
      </section>

      {/* Completed */}
      <section className="border p-4 rounded bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Completed</h3>
          <button
            onClick={loadCompleted}
            disabled={busy}
            className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        {completedList.length === 0 && <div className="text-sm text-gray-600">No completed bookings.</div>}
        <div className="space-y-2">
          {completedList.map(b => (
            <Row key={b.id} b={b} />
          ))}
        </div>
      </section>

      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}
