// src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthCtx = createContext(null);
const LS_KEY = "authUser";

// Back-compat: read either the single 'authUser' object or the old 3-key format
function readUserFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.token && parsed?.role ? parsed : null;
    }
  } catch (e) {
    console.warn("Failed to parse authUser from localStorage", e);
  }

  // OLD format fallback: token/role/username as separate keys
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username");
  if (token && role) {
    const migrated = { token, role, username: username || "", email: null, nic: null };
    localStorage.setItem(LS_KEY, JSON.stringify(migrated));
    // clean old keys to avoid confusion
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    return migrated;
  }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readUserFromStorage());

  // Accept both email and username for compatibility
  const signIn = ({ token, role, email = null, username = null, nic = null }) => {
    const u = { token, role, email, username, nic };
    localStorage.setItem(LS_KEY, JSON.stringify(u));
    setUser(u);
  };

  const signOut = () => {
    localStorage.removeItem(LS_KEY);
    setUser(null);
  };

  // Keep state in sync across tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || e.key === LS_KEY) {
        setUser(readUserFromStorage());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthCtx);
