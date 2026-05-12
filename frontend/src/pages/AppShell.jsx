import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  LayoutDashboard, FileText, History, Boxes, Users, Settings, LogOut, UserCog, Package,
} from "lucide-react";
import { Toaster } from "sonner";

export default function AppShell() {
  const { user, logout, isAdmin } = useAuth();
  const nav = useNavigate();

  const handleLogout = () => { logout(); nav("/login"); };

  // Capturista has limited access (no dashboard/modulos stats access etc.)
  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard", end: true, adminOnly: true },
    { to: "/remision", icon: FileText, label: "Nueva Remisión", testid: "nav-nueva-remision" },
    { to: "/historial", icon: History, label: "Historial", testid: "nav-historial" },
    { to: "/modulos", icon: Boxes, label: "Por Módulo", testid: "nav-modulos", adminOnly: true },
    { to: "/clientes", icon: Users, label: "Clientes", testid: "nav-clientes" },
    { to: "/cajas", icon: Package, label: "Cajas vacías", testid: "nav-cajas" },
    { to: "/configuracion", icon: Settings, label: "Configuración", testid: "nav-config", adminOnly: true },
    { to: "/usuarios", icon: UserCog, label: "Usuarios", testid: "nav-users", adminOnly: true },
  ];

  const visibleNav = navItems.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-[#f4f8ec]" data-testid="app-shell">
      <Toaster position="top-right" richColors />
      <header className="sticky top-0 z-50 bg-[#f4f8ec]/90 backdrop-blur-xl border-b border-[#deedc0] px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="ajvj-logo">AJVJ<br/>HIDRO</div>
          <div className="hidden md:block">
            <div className="text-[10px] tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">AJVJ Hidropónicos</div>
            <div className="text-sm font-semibold text-[#16210b]">Sistema de Remisiones</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-[#16210b]" data-testid="header-user-name">{user?.name}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">{user?.role}</div>
          </div>
          <button onClick={handleLogout} data-testid="logout-button"
            className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-2 transition-colors flex items-center gap-2 text-sm font-medium">
            <LogOut className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <div className="flex">
        <aside className="w-56 shrink-0 hidden lg:block border-r border-[#deedc0] min-h-[calc(100vh-65px)] p-4 bg-white/40">
          <nav className="space-y-1">
            {visibleNav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} data-testid={n.testid}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <n.icon className="w-4 h-4" strokeWidth={1.8} />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#deedc0] px-2 py-2 flex gap-1 overflow-x-auto">
          {visibleNav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={`${n.testid}-mobile`}
              className={({ isActive }) => `flex-shrink-0 flex flex-col items-center gap-1 px-3 py-1.5 rounded text-[10px] ${isActive ? "bg-[#2d4a12] text-white" : "text-[#4d5e42]"}`}>
              <n.icon className="w-4 h-4" strokeWidth={1.8} />
              {n.label.split(" ")[0]}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 p-4 md:p-8 pb-24 lg:pb-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
