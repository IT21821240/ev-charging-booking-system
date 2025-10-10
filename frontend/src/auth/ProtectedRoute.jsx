import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import TopBar from "../components/TopBar";
import Footer from "../components/Footer"; // <-- import your Footer

export default function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();

  if (!user?.token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <TopBar />
      <main className="flex-1">{children}</main>
      <Footer /> {/* <-- added footer here */}
    </div>
  );
}
