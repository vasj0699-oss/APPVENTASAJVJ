import React, { useEffect, useMemo, useState } from "react";
import api, { formatMXN, formatNum, formatDate, MODULE_IDS } from "../lib/api";
import { Eye, Trash2, Search, Filter, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Historial() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    number: "", client: "", crop: "", quality: "", module: "",
    from: "", to: "", drafts_only: false,
  });

  const load = () => {
    setLoading(true);
    api.get("/remisiones").then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const del = async (r) => {
    if (!window.confirm(`¿Eliminar remisión ${r.number || "borrador"}?`)) return;
    try {
      await api.delete(`/remisiones/${r.id}`);
      toast.success("Remisión eliminada");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  const filtered = useMemo(() => {
    return items.filter((r) => {
      if (filters.drafts_only && r.status !== "draft") return false;
      if (filters.number && !(r.number || "").toLowerCase().includes(filters.number.toLowerCase())) return false;
      if (filters.client && !(r.client_name || "").toLowerCase().includes(filters.client.toLowerCase())) return false;
      if (filters.from && r.date < filters.from) return false;
      if (filters.to && r.date > filters.to) return false;
      if (filters.crop && !r.lines.some((l) => l.crop === filters.crop)) return false;
      if (filters.quality && !r.lines.some((l) => l.quality === filters.quality)) return false;
      if (filters.module && !r.lines.some((l) => l.module_id === filters.module)) return false;
      return true;
    });
  }, [items, filters]);

  return (
    <div className="space-y-6" data-testid="historial-page">
      <div>
        <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Historial</h1>
        <p className="section-sub">{filtered.length} de {items.length} remisiones</p>
      </div>

      <div className="card-surface p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <input placeholder="# Remisión" value={filters.number} onChange={(e) => setFilters({ ...filters, number: e.target.value })}
          data-testid="filter-number" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm col-span-2" />
        <input placeholder="Cliente" value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })}
          data-testid="filter-client" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm col-span-2" />
        <select value={filters.crop} onChange={(e) => setFilters({ ...filters, crop: e.target.value })}
          className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm">
          <option value="">Cultivo</option><option>Jitomate</option><option>Pepino</option>
        </select>
        <select value={filters.quality} onChange={(e) => setFilters({ ...filters, quality: e.target.value })}
          className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm">
          <option value="">Calidad</option><option>1ra</option><option>Arrastre</option><option>Papeles</option>
        </select>
        <select value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })}
          className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm">
          <option value="">Módulo</option>
          {MODULE_IDS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm col-span-1">
          <input type="checkbox" checked={filters.drafts_only} onChange={(e) => setFilters({ ...filters, drafts_only: e.target.checked })}
            data-testid="filter-drafts" className="accent-[#2d4a12]" />
          <span>Borradores</span>
        </label>
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm col-span-2" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm col-span-2" />
      </div>

      {loading && <div className="text-sm text-[#4d5e42]">Cargando…</div>}

      <div className="space-y-4">
        {filtered.map((r) => {
          const modulesUsed = [...new Set(r.lines.map((l) => l.module_id))].join(", ");
          return (
            <div key={r.id} className="card-surface p-5" data-testid={`remision-card-${r.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#deedc0]">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="font-mono text-lg font-bold text-[#2d4a12]">#{r.number || "—"}</div>
                  <div className="text-sm text-[#4d5e42]">{formatDate(r.date)}</div>
                  <div className="text-sm font-medium text-[#16210b]">{r.client_name}</div>
                  <div className="text-xs text-[#4d5e42]">Módulos: {modulesUsed}</div>
                  {r.include_box_control && (
                    <span className="text-[10px] px-2 py-0.5 bg-[#deedc0] text-[#2d4a12] rounded-full font-medium">CAJAS CTRL</span>
                  )}
                  {r.status === "draft" && (
                    <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-semibold">BORRADOR</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => nav(`/pdf/${r.id}`)} data-testid={`view-pdf-${r.id}`}
                    className="bg-white border border-[#2d4a12] text-[#2d4a12] hover:bg-[#2d4a12] hover:text-white rounded-md px-3 py-1.5 text-sm flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Ver PDF
                  </button>
                  {r.status === "draft" && (
                    <button onClick={() => nav(`/remision/${r.id}`)}
                      className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-1.5 text-sm">
                      Editar
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => del(r)} data-testid={`delete-${r.id}`}
                      className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white rounded-md px-3 py-1.5 text-sm flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Eliminar
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#4d5e42]">
                      <th className="text-left px-2 py-1">Módulo</th>
                      <th className="text-left px-2 py-1">Calidad</th>
                      <th className="text-left px-2 py-1">Color</th>
                      <th className="text-left px-2 py-1">Tamaño</th>
                      <th className="text-right px-2 py-1">Cajas</th>
                      <th className="text-right px-2 py-1">Kg/caja</th>
                      <th className="text-right px-2 py-1">Kg</th>
                      <th className="text-right px-2 py-1">$/caja</th>
                      <th className="text-right px-2 py-1">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lines.map((l, i) => (
                      <tr key={i} className="border-t border-[#deedc0]">
                        <td className="px-2 py-1">{l.module_id}</td>
                        <td className="px-2 py-1">{l.quality}</td>
                        <td className="px-2 py-1">{l.color || "N/A"}</td>
                        <td className="px-2 py-1">{l.size}</td>
                        <td className="px-2 py-1 text-right">{l.boxes}</td>
                        <td className="px-2 py-1 text-right">{l.kg_per_box}</td>
                        <td className="px-2 py-1 text-right">{formatNum(l.boxes * l.kg_per_box)}</td>
                        <td className="px-2 py-1 text-right">{formatMXN(l.price_per_box)}</td>
                        <td className="px-2 py-1 text-right font-medium">{formatMXN(l.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {r.empty_box_movement && (
                <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-md p-2 text-amber-800">
                  Cajas vacías: {r.empty_box_movement.type === "delivery" ? "Entrega" : "Devolución"} · {r.empty_box_movement.quantity} · Ref: {r.empty_box_movement.ref}
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-[#deedc0] flex flex-wrap justify-between gap-3 text-sm">
                <div><span className="text-[#4d5e42]">Destino:</span> {r.destination || "—"}</div>
                <div className="flex gap-4">
                  <span><span className="text-[#4d5e42]">Cajas:</span> <strong>{r.totals?.boxes}</strong></span>
                  <span><span className="text-[#4d5e42]">Kg:</span> <strong>{formatNum(r.totals?.total_kg || 0)}</strong></span>
                  <span className="text-lg"><span className="text-[#4d5e42]">Total:</span> <strong className="text-[#2d4a12]">{formatMXN(r.totals?.total_amount || 0)}</strong></span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-[#4d5e42]">No hay remisiones que coincidan</div>
      )}
    </div>
  );
}
