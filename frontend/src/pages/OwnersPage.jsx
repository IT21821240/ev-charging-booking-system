import React, { useEffect, useState } from "react";
import { owners } from "../api/client";

const NIC_RX = /^(?:\d{9}[VvXx]|\d{12})$/;              // <-- 9 digits + V/X or 12 digits
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;          // simple email check
const PHONE_RX = /^[0-9+\-()\s]{6,}$/;                  // loose phone check

export default function OwnersPage() {
  // tabs: 'browse' | 'create' | 'details'
  const [tab, setTab] = useState("browse");

  // list & filters
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [isActive, setIsActive] = useState(""); // "", "true", "false"
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // detail
  const [owner, setOwner] = useState(null);
  const [msg, setMsg] = useState("");

  // create form
  const [form, setForm] = useState({ nic: "", name: "", email: "", phone: "" });

  // debounce search
  const debouncedQ = useDebounce(q, 300);

  useEffect(() => {
    (async () => {
      try {
        const res = await owners.list({
          page,
          pageSize,
          q: debouncedQ.trim(),
          isActive: isActive === "" ? undefined : isActive === "true",
        });

        // ---- normalize shape (isActive vs active) ----
        const items = (res.items || res || []).map(r => ({
          ...r,
          isActive: r.isActive ?? r.active ?? false,
        }));
        const totalCount = res.total ?? (Array.isArray(res) ? res.length : 0);

        setRows(items);
        setTotal(totalCount);
      } catch (e) {
        setMsg(e.message || "Failed to load owners");
        setRows([]);
        setTotal(0);
      }
    })();
  }, [page, pageSize, debouncedQ, isActive]);

  async function loadOwner(nic) {
    setMsg("");
    try {
      const o = await owners.get(nic.trim());
      setOwner({
        ...o,
        isActive: o.isActive ?? o.active ?? false,   // <-- normalize detail too
      });
      setTab("details");
    } catch (e) {
      setOwner(null);
      setMsg(e.message || "Failed to load owner");
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    setMsg("");

    // ---- trim + validate ----
    const payload = {
      nic: form.nic.trim(),
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };
    if (!NIC_RX.test(payload.nic)) {
      setMsg("Invalid NIC format (use 9 digits + V/X or 12 digits).");
      return;
    }
    if (!payload.name) {
      setMsg("Name is required.");
      return;
    }
    if (payload.email && !EMAIL_RX.test(payload.email)) {
      setMsg("Invalid email.");
      return;
    }
    if (payload.phone && !PHONE_RX.test(payload.phone)) {
      setMsg("Invalid phone.");
      return;
    }

    try {
      const res = await owners.create(payload);
      const createdNic = res?.nic || res?.owner?.nic || payload.nic;
      await loadOwner(createdNic);
      setForm({ nic: "", name: "", email: "", phone: "" });
      setMsg("Owner created");
      setPage(1); // refresh list on next browse
    } catch (err) {
      setMsg(err.message || "Create failed");
    }
  }

  async function onUpdate() {
    if (!owner) return;
    setMsg("");

    // ---- basic validation on update ----
    const upd = {
      name: (owner.name || "").trim(),
      email: (owner.email || "").trim(),
      phone: (owner.phone || "").trim(),
    };
    if (!upd.name) {
      setMsg("Name is required.");
      return;
    }
    if (upd.email && !EMAIL_RX.test(upd.email)) {
      setMsg("Invalid email.");
      return;
    }
    if (upd.phone && !PHONE_RX.test(upd.phone)) {
      setMsg("Invalid phone.");
      return;
    }

    try {
      await owners.update(owner.nic, upd);
      setMsg("Owner updated");
    } catch (err) {
      setMsg(err.message || "Update failed");
    }
  }

  async function onDeactivate() {
    if (!owner) return;
    setMsg("");
    try {
      await owners.deactivate(owner.nic);
      setOwner({ ...owner, isActive: false });
      setMsg("Owner deactivated");
    } catch (err) {
      setMsg(err.message || "Deactivate failed");
    }
  }

  async function onReactivate() {
    if (!owner) return;
    setMsg("");
    try {
      await owners.reactivate(owner.nic);
      setOwner({ ...owner, isActive: true });
      setMsg("Owner reactivated");
    } catch (err) {
      setMsg(err.message || "Reactivate failed");
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white/70 p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">EV Owners</h2>
            <p className="mt-1 text-sm text-gray-600">
              Create, search, and manage EV owner records. NIC is the unique key.
            </p>
          </div>
          {/* Tabs */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {["browse", "create", "details"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  "px-3 py-1.5 text-sm font-medium rounded-md transition",
                  tab === t ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100",
                ].join(" ")}
                disabled={t === "details" && !owner}
                title={t === "details" && !owner ? "Select an owner first" : ""}
              >
                {t === "browse" ? "Browse" : t === "create" ? "Create" : "Details"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Browse / Create */}
        <div className="lg:col-span-7 space-y-6">
          {tab === "browse" && (
            <>
              {/* Filters */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                  <div>
                    <label className="block text-sm mb-1 text-gray-700">Search</label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                      placeholder="Search NIC, name, email, phone"
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1 text-gray-700">Status</label>
                    <select
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                      value={isActive}
                      onChange={(e) => {
                        setIsActive(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All</option>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                  <div className="sm:justify-self-end">
                    <span className="text-sm text-gray-500">
                      Results: <span className="font-medium text-gray-900">{total}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* List */}
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="hidden bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600 sm:grid sm:grid-cols-12">
                  <div className="col-span-4">Name / NIC</div>
                  <div className="col-span-4">Contact</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                <ul className="divide-y">
                  {rows.map((r) => (
                    <li key={r.nic} className="px-4 py-3 sm:grid sm:grid-cols-12 sm:items-center">
                      <div className="sm:col-span-4">
                        <div className="font-medium text-gray-900">{r.name || "—"}</div>
                        <div className="text-sm text-gray-600">{r.nic}</div>
                      </div>
                      <div className="mt-1 text-sm text-gray-700 sm:col-span-4 sm:mt-0">
                        {r.email || "—"} {r.phone ? <span className="text-gray-400">·</span> : ""}{" "}
                        {r.phone || ""}
                      </div>
                      <div className="mt-2 sm:mt-0 sm:col-span-2">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600",
                          ].join(" ")}
                        >
                          {r.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="mt-2 flex sm:mt-0 sm:col-span-2 sm:justify-end">
                        <button
                          onClick={() => loadOwner(r.nic)}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 hover:bg-gray-50"
                          title="Open details"
                        >
                          View
                        </button>
                      </div>
                    </li>
                  ))}
                  {rows.length === 0 && (
                    <li className="px-4 py-6 text-sm text-gray-500">No results</li>
                  )}
                </ul>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                  <span>
                    Page <b>{page}</b> / {pages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      disabled={page >= pages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "create" && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">Create owner</h3>
              <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  placeholder="NIC *"
                  value={form.nic}
                  onChange={(e) => setForm({ ...form, nic: e.target.value.trim() })}
                  required
                />
                <input
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  placeholder="Name *"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
                <input
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <input
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                <div className="sm:col-span-2 mt-1 flex justify-end gap-2">
                  <button
                    type="reset"
                    onClick={() => setForm({ nic: "", name: "", email: "", phone: "" })}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Clear
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:brightness-95"
                  >
                    Create
                  </button>
                </div>
                {/* inline guidance */}
                <div className="sm:col-span-2 text-xs text-gray-500">
                  NIC formats accepted: <code>#########V</code>/<code>#########X</code> or <code>############</code>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Right: Details */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Owner details</h3>
              {owner && (
                <span
                  className={[
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    owner.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600",
                  ].join(" ")}
                >
                  {owner.isActive ? "Active" : "Inactive"}
                </span>
              )}
            </div>

            {owner ? (
              <div className="mt-3">
                <div className="text-xs text-gray-600">NIC</div>
                <div className="mb-2 text-sm font-medium text-gray-900">{owner.nic}</div>

                <div className="grid grid-cols-1 gap-3">
                  <input
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                    placeholder="Name"
                    value={owner.name || ""}
                    onChange={(e) => setOwner({ ...owner, name: e.target.value })}
                  />
                  <input
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                    placeholder="Email"
                    value={owner.email || ""}
                    onChange={(e) => setOwner({ ...owner, email: e.target.value })}
                  />
                  <input
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                    placeholder="Phone"
                    value={owner.phone || ""}
                    onChange={(e) => setOwner({ ...owner, phone: e.target.value })}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={onUpdate}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:brightness-95"
                  >
                    Update
                  </button>
                  {owner.isActive ? (
                    <button
                      onClick={onDeactivate}
                      className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:brightness-95"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={onReactivate}
                      className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:brightness-95"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-500">Select an owner from Browse to view/edit.</div>
            )}
          </div>
        </div>
      </div>

      {/* tiny toast/status */}
      {msg && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow">
            {msg}
          </div>
        </div>
      )}
    </div>
  );
}

// tiny debounce hook (unchanged)
function useDebounce(value, delay) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
