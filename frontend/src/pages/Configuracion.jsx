import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { Save } from "lucide-react";
import { toast } from "sonner";

export default function Configuracion() {
  const [company, setCompany] = useState({ name: "", rfc: "", address: "", phone: "", logo_url: "" });
  const [modules, setModules] = useState([]);

  const load = () => {
    api.get("/company").then((r) => setCompany(r.data));
    api.get("/modules").then((r) => setModules(r.data));
  };
  useEffect(load, []);

  const saveCompany = async () => {
    try {
      await api.put("/company", company);
      toast.success("Empresa guardada");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  const updateMod = (i, key, value) => {
    const arr = [...modules];
    arr[i] = { ...arr[i], [key]: value };
    setModules(arr);
  };

  const saveModule = async (m) => {
    try {
      await api.put(`/modules/${m.id}`, m);
      toast.success(`Módulo ${m.id} guardado`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  return (
    <div className="space-y-6" data-testid="config-page">
      <div>
        <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Configuración</h1>
        <p className="section-sub">Datos de empresa y módulos de producción</p>
      </div>

      <div className="card-surface p-5">
        <h3 className="text-lg font-semibold text-[#16210b] mb-4">Datos de empresa</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Razón social" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })}
            data-testid="company-name-input" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
          <input placeholder="RFC" value={company.rfc} onChange={(e) => setCompany({ ...company, rfc: e.target.value.toUpperCase() })}
            data-testid="company-rfc-input" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
          <input placeholder="Dirección" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })}
            className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm md:col-span-2" />
          <input placeholder="Teléfono" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })}
            className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <button onClick={saveCompany} data-testid="save-company-button"
          className="mt-4 bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
          <Save className="w-4 h-4" /> Guardar empresa
        </button>
      </div>

      <div className="card-surface p-5">
        <h3 className="text-lg font-semibold text-[#16210b] mb-4">Módulos de producción</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f4f8ec]">
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Módulo</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Cultivo</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Variedad</th>
                <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-[#4d5e42]">Superficie</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Unidad</th>
                <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-[#4d5e42]">Plantas</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m, i) => (
                <tr key={m.id} className="border-t border-[#deedc0]" data-testid={`module-row-${m.id}`}>
                  <td className="px-3 py-2 font-bold text-[#2d4a12]">{m.id}</td>
                  <td className="px-3 py-2">
                    <select value={m.active_crop || ""} onChange={(e) => updateMod(i, "active_crop", e.target.value || null)}
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm">
                      <option value="">—</option><option>Jitomate</option><option>Pepino</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input value={m.variety} onChange={(e) => updateMod(i, "variety", e.target.value)}
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={m.surface_m2} onChange={(e) => updateMod(i, "surface_m2", Number(e.target.value))}
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-24 text-right" />
                  </td>
                  <td className="px-3 py-2">
                    <select value={m.surface_unit} onChange={(e) => updateMod(i, "surface_unit", e.target.value)}
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm">
                      <option value="m2">m²</option><option value="ha">ha</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={m.plant_count} onChange={(e) => updateMod(i, "plant_count", Number(e.target.value))}
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-24 text-right" />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => saveModule(m)} data-testid={`save-mod-${m.id}`}
                      className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-3 py-1.5 text-xs flex items-center gap-1">
                      <Save className="w-3 h-3" /> Guardar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
