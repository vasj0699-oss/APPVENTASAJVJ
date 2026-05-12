import React, { useEffect, useState } from "react";
import api, { formatDate } from "../lib/api";
import { Package, PackagePlus, PackageMinus, Search } from "lucide-react";
import { toast } from "sonner";

export default function CajasVacias() {
  const [clients, setClients] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [recent, setRecent] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "ingreso", quantity: 0, ref: "",
  });

  const load = async () => {
    const r = await api.get("/clients");
    setClients(r.data);
    const accs = {};
    await Promise.all(r.data.map(async (c) => {
      const a = await api.get(`/clients/${c.id}/account`);
      accs[c.id] = a.data;
    }));
    setAccounts(accs);
    // recent movements (last 20 across all clients)
    const movs = await api.get("/box_movements");
    setRecent(movs.data.slice(0, 20));
  };
  useEffect(() => { load(); }, []);

  const submit = async (cid) => {
    if (!form.quantity) return toast.error("Cantidad requerida");
    try {
      await api.post("/box_movements", { ...form, client_id: cid });
      toast.success("Movimiento registrado");
      setForm({ date: new Date().toISOString().slice(0, 10), type: "ingreso", quantity: 0, ref: "" });
      setExpandedId(null);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const filtered = clients.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  // Sort by clients that owe boxes first (most negative balance)
  filtered.sort((a, b) => {
    const ba = accounts[a.id]?.boxes?.balance || 0;
    const bb = accounts[b.id]?.boxes?.balance || 0;
    return ba - bb;
  });

  return (
    <div className="space-y-6" data-testid="cajas-vacias-page">
      <div>
        <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Cajas vacías</h1>
        <p className="section-sub">Gestión rápida de movimientos por cliente</p>
      </div>

      <div className="card-surface p-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-[#4d5e42]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente…"
            data-testid="cajas-search"
            className="flex-1 border-0 bg-transparent text-sm focus:outline-none" />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((c) => {
          const a = accounts[c.id];
          if (!a) return null;
          const bal = a.boxes.balance;
          const isExp = expandedId === c.id;
          return (
            <div key={c.id} className="card-surface p-4" data-testid={`cajas-client-${c.id}`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-md flex items-center justify-center ${bal < 0 ? "bg-red-100 text-red-700" : bal > 0 ? "bg-[#deedc0] text-[#2d4a12]" : "bg-gray-100 text-gray-500"}`}>
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-[#16210b]">{c.name}</div>
                    <div className="text-xs text-[#4d5e42]">
                      Ingresos: {a.boxes.ingresos} · Egresos: {a.boxes.egresos}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Saldo cajas</div>
                    <div className={`text-xl font-bold ${bal < 0 ? "text-red-600" : bal > 0 ? "text-[#2d4a12]" : "text-gray-500"}`}>
                      {bal} {bal < 0 ? "(nos deben)" : bal > 0 ? "(a favor)" : ""}
                    </div>
                  </div>
                  <button onClick={() => { setExpandedId(isExp ? null : c.id); setForm({ ...form, type: "ingreso" }); }}
                    data-testid={`toggle-move-${c.id}`}
                    className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-3 py-2 text-sm flex items-center gap-1">
                    <PackagePlus className="w-4 h-4" /> Movimiento
                  </button>
                </div>
              </div>

              {isExp && (
                <div className="mt-4 pt-4 border-t border-[#deedc0]">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                      data-testid={`move-type-${c.id}`}
                      className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm">
                      <option value="ingreso">Ingreso (cliente entrega)</option>
                      <option value="egreso">Egreso (le regresamos)</option>
                    </select>
                    <input type="number" placeholder="Cantidad" value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                      data-testid={`move-qty-${c.id}`}
                      className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
                    <input placeholder="Referencia" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })}
                      className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
                    <button onClick={() => submit(c.id)} data-testid={`save-move-${c.id}`}
                      className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 text-sm">
                      Registrar
                    </button>
                  </div>

                  <div className="mt-3 text-xs">
                    <div className="text-[10px] uppercase tracking-widest text-[#4d5e42] mb-1">Últimos movimientos</div>
                    {a.boxes.movements.slice(0, 5).map((m, i) => (
                      <div key={i} className="flex justify-between border-t border-[#deedc0] py-1">
                        <span className="flex items-center gap-1">
                          {m.type === "ingreso" ? <PackagePlus className="w-3 h-3 text-[#2d4a12]" /> : <PackageMinus className="w-3 h-3 text-amber-700" />}
                          {formatDate(m.date)} · {m.ref || "—"} {m.auto && <span className="text-[9px] text-[#4d5e42]">(auto)</span>}
                        </span>
                        <span className={`font-medium ${m.type === "ingreso" ? "text-[#2d4a12]" : "text-amber-700"}`}>
                          {m.type === "ingreso" ? "+" : "-"}{m.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <div className="card-surface p-5">
          <h3 className="text-lg font-semibold text-[#16210b] mb-3">Últimos movimientos (todos los clientes)</h3>
          <div className="space-y-1 text-sm">
            {recent.map((m, i) => (
              <div key={i} className="flex items-center justify-between border-b border-[#deedc0] py-2 last:border-0">
                <div className="flex items-center gap-2">
                  {m.type === "ingreso" ? <PackagePlus className="w-4 h-4 text-[#2d4a12]" /> : <PackageMinus className="w-4 h-4 text-amber-700" />}
                  <div>
                    <div className="font-medium">{clientName(m.client_id)}</div>
                    <div className="text-xs text-[#4d5e42]">{formatDate(m.date)} · {m.ref || "—"} {m.auto && <span>(auto)</span>}</div>
                  </div>
                </div>
                <span className={`font-semibold ${m.type === "ingreso" ? "text-[#2d4a12]" : "text-amber-700"}`}>
                  {m.type === "ingreso" ? "+" : "-"}{m.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
