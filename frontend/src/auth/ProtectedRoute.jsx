import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import TopBar from "../components/TopBar";

export default function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user?.token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      {children}
    </div>
  );
}
