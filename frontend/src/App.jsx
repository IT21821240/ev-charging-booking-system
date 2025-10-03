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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

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
            path="/operator"
            element={
              <ProtectedRoute roles={["StationOperator"]}>
                <OperatorDashboard />
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

          {/* moved inside <Routes> */}
          <Route
            path="/operator/qr"
            element={
              <ProtectedRoute roles={["StationOperator"]}>
                <OperatorQR />
              </ProtectedRoute>
            }
          />

          <Route
            path="/backoffice/stations/:stationId/schedules"
            element={
              <ProtectedRoute roles={["Backoffice"]}>
                <StationSchedulesPage />
              </ProtectedRoute>
            }
          />

          {/* catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
