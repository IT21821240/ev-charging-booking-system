import React, { useMemo, useState } from "react";
import { bookings } from "../api/client";
import { useAuth } from "../auth/AuthContext";

function clampToAssignmentWindow(dt) {
  // helper to clamp to [now, now+7d]
  const now = new Date();
  const max = new Date(now.getTime() + 7*24*60*60*1000);
  const d = new Date(dt);
  if (isNaN(d)) return "";
  if (d < now) return now.toISOString().slice(0,16);
  if (d > max) return max.toISOString().slice(0,16);
  return d.toISOString().slice(0,16);
}

export default function BookingsPage() {
  const { user } = useAuth(); // Backoffice | StationOperator
  const [form, setForm] = useState({ nic:"", stationId:"", startTime:"", endTime:"" });
  const [bookingId, setBookingId] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [msg, setMsg] = useState("");

  const nowISO = useMemo(()=>new Date().toISOString().slice(0,16), []);
  const maxISO = useMemo(()=>{
    const max = new Date(Date.now() + 7*24*60*60*1000);
    return max.toISOString().slice(0,16);
  }, []);

  function hoursUntilStart() {
    if (!form.startTime) return Infinity;
    const diffMs = new Date(form.startTime) - new Date();
    return diffMs / (60*60*1000);
  }
  const isLocked = hoursUntilStart() < 12; // UI guardrail (server still enforces)

  async function createBooking(e){ e.preventDefault(); setMsg("");
    try {
      const b = await bookings.create(form);
      setBookingId(b.id || b._id || ""); // depending on backend dto
      setMsg("Created");
    } catch(err){ setMsg(err.message); }
  }
  async function updateBooking(){ setMsg("");
    try { await bookings.update(bookingId, { startTime: form.startTime, endTime: form.endTime }); setMsg("Updated"); }
    catch(err){ setMsg(err.message); }
  }
  async function cancelBooking(){ setMsg("");
    try { await bookings.cancel(bookingId); setMsg("Cancelled"); }
    catch(err){ setMsg(err.message); }
  }
  async function approveBooking(){ setMsg("");
    try { const r = await bookings.approve(bookingId); setQrToken(r.qrToken || ""); setMsg("Approved"); }
    catch(err){ setMsg(err.message); }
  }
  async function validateQr(){ setMsg("");
    try { const r = await bookings.validateQr(qrToken); setMsg(`Valid for booking ${r.id || r.bookingId}`); }
    catch(err){ setMsg(err.message); }
  }
  async function finalize(){ setMsg("");
    try { await bookings.finalize(bookingId); setMsg("Finalized"); }
    catch(err){ setMsg(err.message); }
  }

  return (
    <div>
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-semibold">Bookings</h2>

        <form onSubmit={createBooking} className="grid gap-2 border p-4 rounded">
          <input className="border p-2" placeholder="Owner NIC" value={form.nic} onChange={e=>setForm({...form, nic:e.target.value})}/>
          <input className="border p-2" placeholder="Station ID" value={form.stationId} onChange={e=>setForm({...form, stationId:e.target.value})}/>

          {/* Date constraints: now → now + 7 days */}
          <label className="text-sm text-gray-600">Start Time (≤ 7 days)</label>
          <input className="border p-2" type="datetime-local" min={nowISO} max={maxISO}
                 value={form.startTime} onChange={e=>setForm({...form, startTime: clampToAssignmentWindow(e.target.value)})}/>

          <label className="text-sm text-gray-600">End Time (≤ 7 days)</label>
          <input className="border p-2" type="datetime-local" min={form.startTime || nowISO} max={maxISO}
                 value={form.endTime} onChange={e=>setForm({...form, endTime: clampToAssignmentWindow(e.target.value)})}/>

          <button className="px-3 py-2 bg-gray-900 text-white rounded">Create</button>
        </form>

        <div className="border p-4 rounded space-y-3">
          <input className="border p-2" placeholder="Booking ID" value={bookingId} onChange={e=>setBookingId(e.target.value)}/>
          <div className="flex gap-2 flex-wrap">
            <button onClick={updateBooking} disabled={isLocked} title={isLocked ? "Updates disabled < 12h before start" : ""} className={`px-3 py-2 rounded text-white ${isLocked ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600"}`}>Update</button>
            <button onClick={cancelBooking} disabled={isLocked} title={isLocked ? "Cancellation disabled < 12h before start" : ""} className={`px-3 py-2 rounded text-white ${isLocked ? "bg-gray-400 cursor-not-allowed" : "bg-red-600"}`}>Cancel</button>

            {(user?.role === "Backoffice" || user?.role === "StationOperator") && (
              <>
                <button onClick={approveBooking} className="px-3 py-2 bg-green-600 text-white rounded">Approve → QR</button>
                <input className="border p-2" placeholder="QR Token" value={qrToken} onChange={e=>setQrToken(e.target.value)}/>
                <button onClick={validateQr} className="px-3 py-2 bg-indigo-600 text-white rounded">Validate QR</button>
                <button onClick={finalize} className="px-3 py-2 bg-slate-800 text-white rounded">Finalize</button>
              </>
            )}
          </div>
        </div>

        {msg && <div className="text-sm text-gray-700">{msg}</div>}
      </div>
    </div>
  );
}
