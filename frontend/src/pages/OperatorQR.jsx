// src/pages/OperatorQR.jsx
import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { bookings } from "../api/client";

export default function OperatorQR() {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const lastScanRef = useRef(""); // prevent repeated validations of same token

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [token, setToken] = useState("");
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    const scanner = new BrowserMultiFormatReader();
    scannerRef.current = scanner;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;

        scanner.decodeFromVideoDevice(null, videoRef.current, (result) => {
          if (!result) return;
          const text = result?.getText?.() || "";
          if (!text) return;

          // throttle duplicate frames of the same token
          if (busy) return;
          if (lastScanRef.current === text) return;
          lastScanRef.current = text;

          validateToken(text);
        });
      } catch {
        setMsg("Camera unavailable. Use manual token entry.");
      }
    })();

    return () => {
      try { scanner.reset(); } catch {console.warn("Failed to stop scanner"); }
      const stream = videoRef.current?.srcObject;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function normalizeBooking(b) {
    if (!b) return null;
    return {
      id: b.id || b.bookingId || "",
      ownerNic: b.ownerNic || b.nic || "",
      stationId: b.stationId || "",
      startUtc: b.startUtc || b.startTime || null,
      endUtc: b.endUtc || b.endTime || null,
      status: b.status || "",
      raw: b,
    };
  }

  async function validateToken(tk) {
    const toCheck = (tk ?? token).trim();
    if (!toCheck) return;
    setBusy(true);
    setMsg("");
    setBooking(null);
    try {
      const b = await bookings.validateQr(toCheck); // POST /bookings/scan/validate { token }
      const nb = normalizeBooking(b);
      if (!nb?.id) throw new Error("Invalid response from server.");
      setBooking(nb);
      setToken(toCheck);
      setMsg(`Valid for booking ${nb.id}`);
    } catch (e) {
      setMsg(e.message || "Invalid or expired QR token.");
      lastScanRef.current = ""; // allow retry on error
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!booking?.id) return;
    setBusy(true);
    setMsg("");
    try {
      await bookings.finalize(booking.id); // POST /bookings/{id}/finalize
      setMsg("✅ Session completed.");
      setBooking(null);
      setToken("");
      lastScanRef.current = "";
    } catch (e) {
      setMsg(e.message || "Failed to finalize.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Operator – Scan or Enter QR</h2>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <video ref={videoRef} autoPlay playsInline className="w-full rounded border" />
          <p className="text-sm text-gray-500 mt-2">
            Allow camera access or use manual entry.
          </p>
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
                <div><b>NIC:</b> {booking.ownerNic || "-"}</div>
                <div><b>Station:</b> {booking.stationId || "-"}</div>
                <div>
                  <b>Start:</b>{" "}
                  {booking.startUtc ? new Date(booking.startUtc).toLocaleString() : "-"}
                </div>
                <div>
                  <b>End:</b>{" "}
                  {booking.endUtc ? new Date(booking.endUtc).toLocaleString() : "-"}
                </div>
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
