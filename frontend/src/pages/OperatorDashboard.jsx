// src/pages/OperatorDashboard.jsx
import React, { useEffect, useState } from "react";
import { bookings } from "../api/client";

export default function OperatorDashboard() {
  const [counts, setCounts] = useState({ pending: 0, approved: 0 });
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setErr("");
      setLoading(true);

      // counts -> /api/bookings/op/summary  { pending, approved }
      // pending list -> /api/bookings/pending
      const [summary, pendingList] = await Promise.all([
        bookings.bookingsSummary(),
        bookings.listPending()
      ]);

      setCounts({
        pending: Number(summary?.pending ?? 0),
        approved: Number(summary?.approved ?? 0)
      });

      // backend returns an array; keep fallback safe
      setPending(Array.isArray(pendingList) ? pendingList : pendingList?.items || []);
    } catch (e) {
      setErr(e.message || "Failed to load operator dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // auto-refresh every 30s
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Operator Dashboard</h2>
        <button onClick={load} className="px-3 py-2 border rounded">Refresh</button>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Tiles (status-only, no time windows) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Pending approvals" value={counts.pending} />
        <Tile label="Approved (not finished)" value={counts.approved} />
        {/* If you later add time-based APIs, add tiles here */}
      </div>

      {/* Pending list */}
      <div className="border rounded bg-white">
        <div className="border-b px-4 py-2 text-sm font-semibold">Pending approvals</div>
        <div className="divide-y">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No pending bookings.</div>
          ) : (
            pending.map((b) => (
              <div key={b.id || b._id} className="px-4 py-3 text-sm flex items-center justify-between">
                <div>
                  {/* Minimal details (no raw IDs/NIC if you don’t want to show them) */}
                  <div className="text-gray-900 font-medium">
                    {b.startTime ? new Date(b.startTime).toLocaleString() : "-"}
                    {" "}→{" "}
                    {b.endTime ? new Date(b.endTime).toLocaleString() : "-"}
                  </div>
                  <div className="text-gray-600">Status: {b.status || "Pending"}</div>
                </div>
                {/* Deep-link to approvals page or your list page */}
                <a
                  href={`/bookings`} // or `/bookings?bookingId=${encodeURIComponent(b.id || b._id)}`
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded"
                >
                  Review
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
