import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";
import { Leaf, LogIn } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Bienvenido");
      nav("/");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Error al iniciar sesión";
      toast.error(typeof msg === "string" ? msg : "Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left side - form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#f4f8ec]">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-10">
            <div className="ajvj-logo">AJVJ<br/>HIDRO</div>
            <div>
              <div className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">AJVJ Hidropónicos</div>
              <div className="text-lg font-semibold text-[#16210b]">Sistema de Remisiones</div>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b] mb-2">
            Bienvenido de vuelta
          </h1>
          <p className="text-sm text-[#4d5e42] mb-8">
            Inicia sesión para gestionar remisiones, módulos y clientes.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Correo</label>
              <input
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ajvj.mx"
                className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2.5 text-sm text-[#16210b] focus:outline-none focus:ring-2 focus:ring-[#6a9e35] focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Contraseña</label>
              <input
                data-testid="login-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2.5 text-sm text-[#16210b] focus:outline-none focus:ring-2 focus:ring-[#6a9e35] focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              data-testid="login-submit-button"
              disabled={loading}
              className="w-full bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" strokeWidth={1.8} />
              {loading ? "Iniciando..." : "Iniciar sesión"}
            </button>
          </form>

          <div className="mt-8 p-4 rounded-lg bg-[#deedc0]/50 border border-[#deedc0] text-xs text-[#4d5e42]">
          </div>
        </div>
      </div>

      {/* Right side - image */}
      <div
        className="hidden lg:block flex-1 bg-cover bg-center relative"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1753651840149-84c67b46cc54?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwzfHxoeWRyb3BvbmljJTIwZ3JlZW5ob3VzZSUyMHRvbWF0b3xlbnwwfHx8fDE3NzY5Nzk2NDh8MA&ixlib=rb-4.1.0&q=85')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#2d4a12]/60 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <Leaf className="w-10 h-10 mb-4 opacity-80" strokeWidth={1.5} />
          <p className="text-2xl font-semibold leading-snug">
            Gestión inteligente para producción hidropónica
          </p>
          <p className="mt-2 text-sm text-white/80">
            Jitomate y pepino de calidad, con trazabilidad de cada remisión.
          </p>
        </div>
      </div>
    </div>
  );
}
