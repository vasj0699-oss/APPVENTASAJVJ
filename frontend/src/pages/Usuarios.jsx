import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

export default function Usuarios() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "operador" });
  const [show, setShow] = useState(false);

  const load = () => api.get("/users").then((r) => setUsers(r.data));
  useEffect(load, []);

  const create = async () => {
    if (!form.email || !form.password || !form.name) return toast.error("Completa los campos");
    try {
      await api.post("/users", form);
      toast.success("Usuario creado");
      setForm({ email: "", password: "", name: "", role: "operador" });
      setShow(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  const del = async (u) => {
    if (!window.confirm(`¿Eliminar a ${u.email}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("Usuario eliminado");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  return (
    <div className="space-y-6" data-testid="usuarios-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Usuarios</h1>
          <p className="section-sub">Gestión de accesos y roles</p>
        </div>
        <button onClick={() => setShow(!show)} data-testid="toggle-user-form"
          className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> {show ? "Cerrar" : "Nuevo usuario"}
        </button>
      </div>

      {show && (
        <div className="card-surface p-5 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            data-testid="user-name-input" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            data-testid="user-email-input" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
          <input type="password" placeholder="Contraseña" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            data-testid="user-password-input" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm">
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </select>
          <button onClick={create} data-testid="create-user-button"
            className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 md:col-span-4">
            Crear usuario
          </button>
        </div>
      )}

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f4f8ec]">
            <tr>
              <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-[#4d5e42]">Nombre</th>
              <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-[#4d5e42]">Email</th>
              <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-[#4d5e42]">Rol</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[#deedc0]" data-testid={`user-row-${u.id}`}>
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${u.role === "admin" ? "bg-[#2d4a12] text-white" : "bg-[#deedc0] text-[#2d4a12]"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {u.id !== me.id && (
                    <button onClick={() => del(u)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white rounded-md px-3 py-1 text-xs">
                      <Trash2 className="w-3 h-3 inline" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
