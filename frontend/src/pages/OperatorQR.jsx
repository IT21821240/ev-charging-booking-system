// src/pages/OperatorQR.jsx
import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { bookings } from "../api/client";

export default function OperatorQR() {
  const videoRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [token, setToken] = useState("");
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    const scanner = new BrowserMultiFormatReader();
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) videoRef.current.srcObject = stream;
        scanner.decodeFromVideoDevice(null, videoRef.current, (result) => {
          const text = result?.getText?.() || "";
          if (text && !busy) validateToken(text);
        });
      } catch {
        setMsg("Camera unavailable. Use manual token entry.");
      }
    })();
    return () => {
      scanner.reset();
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
    };
    // eslint-disable-next-line
  }, []);

  async function validateToken(tk) {
    const toCheck = (tk ?? token).trim();
    if (!toCheck) return;
    setBusy(true); setMsg(""); setBooking(null);
    try {
      const b = await bookings.validateQr(toCheck);
      setBooking(b);
      setToken(toCheck);
    } catch (e) {
      setMsg(e.message || "Invalid or expired QR token.");
    } finally { setBusy(false); }
  }

  async function finalize() {
    if (!booking?.id) return;
    setBusy(true); setMsg("");
    try {
      await bookings.finalize(booking.id);
      setMsg("✅ Session completed.");
      setBooking(null);
      setToken("");
    } catch (e) {
      setMsg(e.message || "Failed to finalize.");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Operator – Scan or Enter QR</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <video ref={videoRef} autoPlay playsInline className="w-full rounded border" />
          <p className="text-sm text-gray-500 mt-2">Allow camera access or use manual entry.</p>
        </div>
        <div>
          <label className="block mb-1 font-medium">Token (manual)</label>
          <input
            className="border rounded w-full p-2 mb-2"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste or type QR token"
          />
          <button
            className="px-4 py-2 bg-black text-white rounded disabled:opacity-60"
            onClick={() => validateToken()}
            disabled={busy}
          >
            {busy ? "Validating..." : "Validate"}
          </button>

          {msg && <p className="mt-3 text-sm">{msg}</p>}

          {booking && (
            <div className="mt-4 border rounded p-3 bg-white">
              <h3 className="font-semibold mb-2">Booking</h3>
              <div className="text-sm space-y-1">
                <div><b>ID:</b> {booking.id}</div>
                <div><b>NIC:</b> {booking.nic}</div>
                <div><b>Station:</b> {booking.stationId}</div>
                <div><b>Start:</b> {new Date(booking.startTime).toLocaleString()}</div>
                <div><b>End:</b> {new Date(booking.endTime).toLocaleString()}</div>
                <div><b>Status:</b> {booking.status}</div>
              </div>
              <button
                className="mt-3 px-4 py-2 bg-green-600 text-white rounded disabled:opacity-60"
                onClick={finalize}
                disabled={busy}
              >
                {busy ? "Finalizing..." : "Finalize Session"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
