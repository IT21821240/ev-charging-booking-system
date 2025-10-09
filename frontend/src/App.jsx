// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute";
import { AuthProvider, useAuth } from "./auth/AuthContext";

// Backoffice
import BackofficeDashboard from "./pages/BackofficeDashboard";
import OwnersPage from "./pages/OwnersPage";
import StationsPage from "./pages/StationsPage";
import StationSchedulesPage from "./pages/StationSchedulesPage";
import UserPage from "./pages/UsersPage";
import BookingPage from "./pages/BookingsPage";

// Operator
import OperatorDashboard from "./pages/OperatorDashboard";
import OpBookings from "./pages/OpBookings";
import OpStations from "./pages/OpStations";

import LoginPage from "./pages/Login";

function Landing() {
  const { user } = useAuth();
  if (!user?.token) return <Navigate to="/login" replace />;
  if (user.role === "Backoffice") return <Navigate to="/backoffice" replace />;
  if (user.role === "StationOperator") return <Navigate to="/op" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* public */}
          <Route path="/login" element={<LoginPage />} />

          {/* role-aware home */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Landing />
              </ProtectedRoute>
            }
          />

          {/* Backoffice area ONLY */}
          <Route
            path="/backoffice"
            element={
              <ProtectedRoute roles={["Backoffice"]}>
                <BackofficeDashboard />
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
              <ProtectedRoute roles={["Backoffice"]}>
                <StationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stations/:stationId/schedules"
            element={
              <ProtectedRoute roles={["Backoffice"]}>
                <StationSchedulesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute roles={["Backoffice"]}>
                <UserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute roles={["Backoffice"]}>
                <BookingPage />
              </ProtectedRoute>
            }
          />

          {/* Station Operator area ONLY */}
          <Route
            path="/op"
            element={
              <ProtectedRoute roles={["StationOperator"]}>
                <OperatorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/op/bookings"
            element={
              <ProtectedRoute roles={["StationOperator"]}>
                <OpBookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/op/stations"
            element={
              <ProtectedRoute roles={["StationOperator"]}>
                <OpStations />
              </ProtectedRoute>
            }
          />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
