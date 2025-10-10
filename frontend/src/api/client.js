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

async function apiMultipart(path, { method = "POST", formData }) {
  const res = await fetch(API_URL + path, {
    method,
    headers: { ...authHeaders() },   // no 'Content-Type' here
    body: formData
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || "Request failed";
    throw new Error(msg);
  }
  return json;
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
  deactivate: (id) => api(`/auth/${encodeURIComponent(id)}/deactivate`, { method: "POST" }),
 reactivate: (id) => api(`/auth/${encodeURIComponent(id)}/reactivate`, { method: "POST" }),
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
  ownersCount:  (isActive) =>
    api(`/owners/count${typeof isActive === "boolean" ? `?isActive=${isActive}` : ""}`),
};

// -------- Stations (Backoffice / StationOperator) --------
export const stations = {
  list: () => api(`/stations`),
  mine: () => api(`/stations/mine`), 
  create: ({ name, type, totalSlots, lat, lng, file }) => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("type", type);
    fd.append("totalSlots", String(totalSlots ?? 1));
    if (lat != null && lat !== "") fd.append("lat", String(lat));
    if (lng != null && lng !== "") fd.append("lng", String(lng));
    if (file) fd.append("file", file); // IFormFile? in backend
    return apiMultipart(`/stations`, { method: "POST", formData: fd });
  },
  update: (id, body) => api(`/stations/${id}`, { method: "PUT", body }),
  updateImage(id, file) {
  const fd = new FormData();
  fd.append("file", file);
  return apiMultipart(`/stations/${encodeURIComponent(id)}/image`, {
    method: "PUT",
    formData: fd,
  });
},
  deactivate: (id) => api(`/stations/${id}/deactivate`, { method: "POST" }),
  reactivate: (id) => api(`/stations/${id}/reactivate`, { method: "POST" }),
  get: (id) => api(`/stations/${encodeURIComponent(id)}`),
  stationsCount:(isActive) =>
    api(`/stations/count${typeof isActive === "boolean" ? `?isActive=${isActive}` : ""}`),
};

// -------- Bookings (Backoffice / StationOperator / Owner) --------
export const bookings = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params);
    const suffix = qs.toString() ? `?${qs}` : "";
    return api(`/bookings${suffix}`);
  },
  listPending: () => api(`/bookings/pending`),   // <-- Added
  create: (body) => api(`/bookings`, { method: "POST", body }),
  update: (id, body) => api(`/bookings/${id}`, { method: "PUT", body }),
  cancel: (id) => api(`/bookings/${id}`, { method: "DELETE" }),
  approve: (id) => api(`/bookings/${id}/approve`, { method: "POST" }),
  validateQr: (token) =>
    api(`/bookings/scan/validate`, {               // <-- Fixed
      method: "POST",
      body: { token }
    }),
  finalize: (id) => api(`/bookings/${id}/finalize`, { method: "POST" }),
  get: (id) => api(`/bookings/${encodeURIComponent(id)}`),
  listApproved: () => api('/bookings/approved'),
  listCompleted: () => api('/bookings/completed'),
  bookingsSummary: () => api('/bookings/op/summary'), 
  operatorCounts: () => api(`/bookings/operator/counts`),
  operatorPending: (tz = "Asia/Colombo") => api(`/bookings/operator/pending?tz=${encodeURIComponent(tz)}`),
  operatorApproved: (tz = "Asia/Colombo") => api(`/bookings/operator/approved?tz=${encodeURIComponent(tz)}`),
};

export const schedules = {
  list: (stationId, { from, to }) =>
    api(
      `/stations/${encodeURIComponent(stationId)}/schedules?` +
      new URLSearchParams({ from, to }).toString()
    ),
   create: (stationId, body) =>
    api(`/stations/${encodeURIComponent(stationId)}/schedules`, {
      method: "POST",
      // include both casings to satisfy any [Required] on StationId
      body: { StationId: stationId, stationId, ...body },
    }),
   update: (stationId, scheduleId, body) =>
    api(`/schedules/${encodeURIComponent(scheduleId)}`, {
      method: "PUT",
      // harmless if backend ignores it; avoids 400 if model requires it
      body: { StationId: stationId, stationId, ...body },
    }),
  remove: (_stationId, scheduleId) =>
    api(`/schedules/${encodeURIComponent(scheduleId)}`, { method: "DELETE" }),
};

export const stationOps = {
  list: (stationId) =>
    api(`/stations/${encodeURIComponent(stationId)}/operators`),

  add: (stationId, userId) =>
    api(`/stations/${encodeURIComponent(stationId)}/operators/${encodeURIComponent(userId)}`, {
      method: "POST",
    }),

  remove: (stationId, userId) =>
    api(`/stations/${encodeURIComponent(stationId)}/operators/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),
  searchCandidates(stationId, { q = "", page = 1, pageSize = 20 } = {}) {
    const qs = new URLSearchParams({ ...(q ? { q } : {}), page, pageSize });
    return api(`/stations/${encodeURIComponent(stationId)}/operators/candidates?${qs.toString()}`);
  },
};

export const stationSlots = {
  list: (stationId, { date, minutesPerSlot = 30 }) =>
    api(
      `/stations/${encodeURIComponent(stationId)}/slots?` +
      new URLSearchParams({ date, minutesPerSlot }).toString()
    ),
};




