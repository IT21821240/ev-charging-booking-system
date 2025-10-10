import React, { useEffect, useState } from "react";
import { users as usersApi } from "../api/client";

export default function UsersPage() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "Backoffice",
  });
  const [msg, setMsg] = useState("");
  const [list, setList] = useState([]);

  const VISIBLE_ROLES = new Set(["Backoffice", "StationOperator"]);

  async function load() {
    try {
      if (usersApi.list) {
        const u = await usersApi.list();
        // Only keep Backoffice or StationOperator in UI
        const filtered = (u || []).filter((x) => VISIBLE_ROLES.has(x?.role));
        setList(filtered);
      }
    } catch (e) {
      console.error("Failed to load users", e);
    }
  }
  useEffect(() => { load(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    setMsg("");
    try {
      if (!["Backoffice", "StationOperator"].includes(form.role)) {
        throw new Error("Invalid role. Choose Backoffice or StationOperator.");
      }
      if (!form.email?.trim()) {
        throw new Error("Email is required.");
      }
      await usersApi.create({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      setMsg("User created.");
      setForm({ email: "", password: "", role: "Backoffice" });
      load();
    } catch (e) {
      setMsg(e.message || "Failed to create user");
    }
  }

  // Defensive filter at render too (in case load() gets reused elsewhere)
  const visibleList = (list || []).filter((u) => VISIBLE_ROLES.has(u?.role));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-center">User Management</h1>
      <p className="text-sm text-gray-600 text-center">
        Backoffice can create web users with roles <b>Backoffice</b> or <b>Station Operator</b>.
      </p>

      {/* Centered form */}
      <form
        onSubmit={onCreate}
        className="border rounded p-4 grid gap-3 max-w-lg mx-auto bg-white"
      >
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            type="email"
            className="border rounded px-3 py-2 w-full"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Password</label>
          <input
            type="password"
            className="border rounded px-3 py-2 w-full"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Role</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="Backoffice">Backoffice</option>
            <option value="StationOperator">Station Operator</option>
          </select>
        </div>
        <button className="bg-gray-900 text-white px-4 py-2 rounded">Create User</button>
        {msg && <div className="text-sm text-gray-700">{msg}</div>}
      </form>

      {visibleList.length > 0 && (
        <div className="border rounded p-4 max-w-5xl mx-auto bg-white">
          <div className="font-medium mb-2">Existing Users</div>
          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleList.map((u) => (
                  <tr key={u.id || u._id} className="border-b">
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">{u.role}</td>
                    <td className="py-2 pr-4">{u.isActive ? "Active" : "Inactive"}</td>
                    <td className="py-2">
                      {usersApi.deactivate && usersApi.reactivate && (
                        <div className="flex gap-2">
                          {u.isActive ? (
                            <button
                              onClick={async () => { await usersApi.deactivate(u.id || u._id); load(); }}
                              className="px-3 py-1 rounded bg-red-600 text-white"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={async () => { await usersApi.reactivate(u.id || u._id); load(); }}
                              className="px-3 py-1 rounded bg-green-600 text-white"
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500">
                      No Backoffice or StationOperator users to display.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <br></br>
    </div>
  );
}
