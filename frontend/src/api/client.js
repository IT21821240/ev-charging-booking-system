// src/api/client.js
const API_URL = import.meta.env.VITE_API_URL ?? "";

/** Read JWT from storage (supports both new and old formats) */
function getAuthToken() {
  try {
    const raw = localStorage.getItem("authUser");
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.token) return u.token;
    }
  } catch (e) { console.warn(e); }

  // backward compatibility with old storage scheme
  return localStorage.getItem("token") || null;
}

function authHeaders() {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function api(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // handle empty bodies safely (e.g., 204)
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  if (!res.ok) {
    // surface meaningful message if server provided one
    const msg =
      (json && (json.message || json.error)) ||
      (res.status === 401 ? "Unauthorized" : `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}

// -------- Auth --------
export const login = (email, password) =>
  api("/auth/login", { method: "POST", body: { email, password } });

// -------- Users (admin/backoffice) --------
export const users = {
  create: (body) => api(`/auth/register`, { method: "POST", body }),
  list: () => api(`/auth/users`),
  deactivate: (id) => api(`/auth/${id}/deactivate`, { method: "POST" }),
  reactivate: (id) => api(`/auth/${id}/reactivate`, { method: "POST" }),
};

// -------- Owners (Backoffice) --------
export const owners = {
  get: (nic) => api(`/owners/${nic}`),
  list: ({ page = 1, pageSize = 50, q = "", isActive } = {}) => {
    const params = new URLSearchParams({ page, pageSize, ...(q ? { q } : {}) });
    if (typeof isActive === "boolean") params.set("isActive", String(isActive));
    return api(`/owners?${params.toString()}`);
  },
  create: (body) => api(`/owners`, { method: "POST", body }),
  update: (nic, body) => api(`/owners/${nic}`, { method: "PUT", body }),
  deactivate: (nic) => api(`/owners/${nic}/deactivate`, { method: "POST" }),
  reactivate: (nic) => api(`/owners/${nic}/reactivate`, { method: "POST" }),
};

// -------- Stations (Backoffice / StationOperator) --------
export const stations = {
  list: () => api(`/stations`),
  create: (body) => api(`/stations`, { method: "POST", body }),
  update: (id, body) => api(`/stations/${id}`, { method: "PUT", body }),
  deactivate: (id) => api(`/stations/${id}/deactivate`, { method: "POST" }),
  reactivate: (id) => api(`/stations/${id}/reactivate`, { method: "POST" }),
};

// -------- Bookings (Backoffice / StationOperator) --------
export const bookings = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params);
    const suffix = qs.toString() ? `?${qs}` : "";
    return api(`/bookings${suffix}`);
  },
  create: (body) => api(`/bookings`, { method: "POST", body }),
  update: (id, body) => api(`/bookings/${id}`, { method: "PUT", body }),
  cancel: (id) => api(`/bookings/${id}`, { method: "DELETE" }),
  approve: (id) => api(`/bookings/${id}/approve`, { method: "POST" }),
  validateQr: (token) =>
    api(`/bookings/validate-qr?token=${encodeURIComponent(token)}`),
  finalize: (id) => api(`/bookings/${id}/finalize`, { method: "POST" }),
};
