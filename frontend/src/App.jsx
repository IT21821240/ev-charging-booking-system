import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

import Login from "./pages/Login";
import BackofficeDashboard from "./pages/BackofficeDashboard";
import OperatorDashboard from "./pages/OperatorDashboard";
import OwnersPage from "./pages/OwnersPage";
import StationsPage from "./pages/StationsPage";
import BookingsPage from "./pages/BookingsPage";
import UsersPage from "./pages/UsersPage";
import OperatorQR from "./pages/OperatorQR";
import StationSchedulesPage from "./pages/StationSchedulesPage";
import { useAuth } from "./auth/AuthContext";

function RoleLanding() {
  const { user } = useAuth();
  if (!user?.token) return <Navigate to="/login" replace />;
  if (user.role === "Backoffice") return <Navigate to="/backoffice" replace />;
  if (user.role === "StationOperator") return <Navigate to="/operator" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleLanding />} />

          {/* Backoffice-only */}
          <Route
            path="/backoffice"
            element={
              <ProtectedRoute roles={["Backoffice"]}>
                <BackofficeDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute roles={["Backoffice"]}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/owners"
            element={
              <ProtectedRoute roles={["Backoffice"]}>
                <OwnersPage />
              </ProtectedRoute>
            }
          />

          {/* Operator-only */}
          <Route
            path="/operator"
            element={
              <ProtectedRoute roles={["StationOperator"]}>
                <OperatorDashboard />
              </ProtectedRoute>
            }
          />

          {/* Shared: Backoffice + StationOperator */}
          <Route
            path="/stations"
            element={
              <ProtectedRoute roles={["Backoffice", "StationOperator"]}>
                <StationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute roles={["Backoffice", "StationOperator"]}>
                <BookingsPage />
              </ProtectedRoute>
            }
          />
          {/* Schedules: allow BOTH roles, and use a neutral path */}
          <Route
            path="/stations/:stationId/schedules"
            element={
              <ProtectedRoute roles={["Backoffice", "StationOperator"]}>
                <StationSchedulesPage />
              </ProtectedRoute>
            }
          />

          {/* QR page: allow both roles (optional) */}
          <Route
            path="/operator/qr"
            element={
              <ProtectedRoute roles={["Backoffice", "StationOperator"]}>
                <OperatorQR />
              </ProtectedRoute>
            }
          />

          {/* catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
