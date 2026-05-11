import React, { useEffect, useState } from "react";
import api, { formatMXN, formatNum } from "../lib/api";
import { Plus, Save, Trash2, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

export default function PorModulo() {
  const { isAdmin } = useAuth();
  const [modules, setModules] = useState([]);
  const [stats, setStats] = useState([]);
  const [crops, setCrops] = useState([]);

  const load = () => {
    api.get("/modules").then((r) => setModules(r.data));
    api.get("/modules/stats").then((r) => setStats(r.data));
    api.get("/catalog/crops").then((r) => setCrops(r.data));
  };
  useEffect(load, []);

  const addCycle = (mid) => {
    setModules(modules.map((m) =>
      m.id === mid
        ? { ...m, cycles: [...(m.cycles || []), { crop: crops[0]?.id || "Jitomate", variety: "", start_date: new Date().toISOString().slice(0,10), end_date: null, closed: false }] }
        : m
    ));
  };
  const updateCycle = (mid, idx, key, value) => {
    setModules(modules.map((m) => {
      if (m.id !== mid) return m;
      const cycles = [...m.cycles];
      cycles[idx] = { ...cycles[idx], [key]: value };
      return { ...m, cycles };
    }));
  };
  const removeCycle = (mid, idx) => {
    setModules(modules.map((m) => m.id === mid ? { ...m, cycles: m.cycles.filter((_, i) => i !== idx) } : m));
  };
  const saveModule = async (m) => {
    try {
      await api.put(`/modules/${m.id}`, m);
      toast.success(`Módulo ${m.id} guardado`);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };
  const closeCycle = async (mid, idx) => {
    const end_date = window.prompt("Fecha de cierre (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!end_date) return;
    try {
      await api.post(`/modules/${mid}/close_cycle`, { cycle_index: idx, end_date });
      toast.success("Ciclo cerrado");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };

  return (
    <div className="space-y-6" data-testid="por-modulo-page">
      <div>
        <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Por Módulo</h1>
        <p className="section-sub">Ciclos de producción y rendimiento</p>
      </div>

      {isAdmin && (
        <div className="card-surface p-5">
          <h3 className="text-lg font-semibold text-[#16210b] mb-4">Ciclos de producción</h3>
          <p className="text-xs text-[#4d5e42] mb-4">La fecha de cierre se guarda al hacer clic en "Cerrar ciclo". El cultivo activo del módulo se deriva del ciclo abierto más reciente.</p>
          <div className="space-y-4">
            {modules.map((m) => (
              <div key={m.id} className="border border-[#deedc0] rounded-lg p-4" data-testid={`cycles-module-${m.id}`}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-[#2d4a12] text-white flex items-center justify-center font-bold">{m.id}</div>
                    <div>
                      <div className="text-sm text-[#4d5e42]">{(m.cycles || []).length} / 2 ciclos</div>
                      <div className="text-xs text-[#4d5e42]">Activo: <strong className="text-[#2d4a12]">{m.active_crop || "—"}</strong></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {(m.cycles || []).length < 2 && (
                      <button onClick={() => addCycle(m.id)} className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-1.5 text-sm flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Ciclo
                      </button>
                    )}
                    <button onClick={() => saveModule(m)} data-testid={`save-module-${m.id}`}
                      className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-3 py-1.5 text-sm flex items-center gap-1">
                      <Save className="w-3 h-3" /> Guardar
                    </button>
                  </div>
                </div>
                {(m.cycles || []).map((c, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 items-center">
                    <select value={c.crop} onChange={(e) => updateCycle(m.id, i, "crop", e.target.value)}
                      disabled={c.closed}
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm disabled:bg-[#f4f8ec]">
                      {crops.map((cr) => <option key={cr.id}>{cr.id}</option>)}
                    </select>
                    <input placeholder="Variedad" value={c.variety} onChange={(e) => updateCycle(m.id, i, "variety", e.target.value)}
                      disabled={c.closed}
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm disabled:bg-[#f4f8ec]" />
                    <input type="date" value={c.start_date} onChange={(e) => updateCycle(m.id, i, "start_date", e.target.value)}
                      disabled={c.closed}
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm disabled:bg-[#f4f8ec]" />
                    <input type="date" value={c.end_date || ""} disabled
                      placeholder="al cerrar"
                      className="border border-[#deedc0] rounded px-2 py-1.5 bg-[#f4f8ec] text-sm text-[#4d5e42]" />
                    {!c.closed ? (
                      <button onClick={() => closeCycle(m.id, i)}
                        className="bg-amber-100 text-amber-800 hover:bg-amber-600 hover:text-white rounded-md px-3 py-1.5 text-xs flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Cerrar ciclo
                      </button>
                    ) : (
                      <span className="text-xs text-[#4d5e42] flex items-center gap-1"><Lock className="w-3 h-3" /> Cerrado {c.end_date}</span>
                    )}
                    <button onClick={() => removeCycle(m.id, i)} disabled={c.closed} className="text-red-600 hover:bg-red-50 rounded px-2 py-1.5 text-sm disabled:text-gray-300">
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => {
          const m = s.module;
          return (
            <div key={s.id} className="card-surface p-5" data-testid={`module-stat-${s.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-md bg-[#2d4a12] text-white flex items-center justify-center text-lg font-bold">{s.id}</div>
                  <div>
                    <div className="text-sm font-semibold text-[#16210b]">Módulo {s.id}</div>
                    <div className="text-xs text-[#4d5e42]">{m.active_crop || "Sin cultivo activo"}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-[#2d4a12]">{s.percent_total}%</div>
                  <div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">del total</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(m.cycles || []).map((c, i) => (
                  <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${c.closed ? "bg-gray-200 text-gray-600 line-through" : "bg-[#deedc0] text-[#2d4a12]"}`}>
                    {c.crop} · {c.variety || "—"}{c.closed ? ` (cerrado)` : ""}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Ingresos</div><div className="font-semibold">{formatMXN(s.revenue)}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Kg</div><div className="font-semibold">{formatNum(s.kg, 0)}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Cajas</div><div className="font-semibold">{s.boxes}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">$/caja prom</div><div className="font-semibold">{formatMXN(s.avg_per_box)}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">$/kg prom</div><div className="font-semibold">{formatMXN(s.avg_per_kg)}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Superficie</div><div className="font-semibold">{m.surface_m2 ? `${m.surface_m2} m²` : "—"}</div></div>
              </div>
              {(s.kg_per_m2 !== null || s.boxes_per_m2 !== null || s.kg_per_plant !== null) && (
                <div className="mt-3 bg-[#deedc0]/40 rounded-md p-3 grid grid-cols-3 gap-1 text-xs text-[#2d4a12]">
                  <div className="text-center"><div className="font-bold text-base">{s.kg_per_m2 ?? "—"}</div><div>kg/m²</div></div>
                  <div className="text-center"><div className="font-bold text-base">{s.boxes_per_m2 ?? "—"}</div><div>cajas/m²</div></div>
                  <div className="text-center"><div className="font-bold text-base">{s.kg_per_plant ?? "—"}</div><div>kg/planta</div></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
