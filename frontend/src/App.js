import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import AppShell from "./pages/AppShell";
import Dashboard from "./pages/Dashboard";
import NuevaRemision from "./pages/NuevaRemision";
import Historial from "./pages/Historial";
import PorModulo from "./pages/PorModulo";
import Clientes from "./pages/Clientes";
import Configuracion from "./pages/Configuracion";
import Usuarios from "./pages/Usuarios";
import PdfView from "./pages/PdfView";
import CajasVacias from "./pages/CajasVacias";

function Protected({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#4d5e42]">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

function OperadorBlocked() {
  // Operador goes directly to remision creation
  return <Navigate to="/remision" replace />;
}

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pdf/:id" element={<Protected><PdfView /></Protected>} />
        <Route element={<Protected><AppShell /></Protected>}>
          <Route index element={<DashboardOrRedirect />} />
          <Route path="/remision" element={<NuevaRemision />} />
          <Route path="/remision/:id" element={<NuevaRemision />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/modulos" element={<PorModulo />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/cajas" element={<CajasVacias />} />
          <Route path="/configuracion" element={<Protected adminOnly><Configuracion /></Protected>} />
          <Route path="/usuarios" element={<Protected adminOnly><Usuarios /></Protected>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function DashboardOrRedirect() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/remision" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <Router />
      </AuthProvider>
    </div>
  );
}
