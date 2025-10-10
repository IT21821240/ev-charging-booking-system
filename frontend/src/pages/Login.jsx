import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const { signIn } = useAuth();
  const nav = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const res = await login(email, password); // { token, role, email, ... }
      if (res.role === "EVOwner") {
        setErr("EV Owners must use the mobile app to sign in.");
        return;
      }
      signIn({ token: res.token, role: res.role, email: res.email });
      nav(res.role === "Backoffice" ? "/backoffice" : "/operator");
    } catch (e) {
      setErr(e.message || "Login failed");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-6 rounded shadow"
      >
        <h2 className="text-xl font-semibold mb-4">Sign in</h2>
        {err && <div className="text-red-600 text-sm mb-3">{err}</div>}

        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          className="w-full border rounded px-3 py-2 mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="block text-sm mb-1">Password</label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2 mb-5"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="w-full bg-gray-900 text-white py-2 rounded">
          Sign in
        </button>
      </form>
    </div>
  );
}
