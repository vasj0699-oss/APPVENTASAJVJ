import React, { useEffect, useState } from "react";
import api, { formatMXN, formatNum, formatDate } from "../lib/api";
import { Plus, Save, Trash2, ChevronDown, ChevronUp, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

const emptyClient = () => ({
  name: "", rfc: "", fiscal_address: "", cp: "", phone: "", email: "",
  fiscal_regime: "", credit_limit: 0, credit_days: 0,
  payments: [], empty_box_returns: [],
});

export default function Clientes() {
  const { isAdmin } = useAuth();
  const [clients, setClients] = useState([]);
  const [remisiones, setRemisiones] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyClient());
  const [parseText, setParseText] = useState("");
  const [expandedClient, setExpandedClient] = useState(null);

  const load = () => {
    api.get("/clients").then((r) => setClients(r.data));
    api.get("/remisiones").then((r) => setRemisiones(r.data));
  };
  useEffect(load, []);

  const parseConstancia = () => {
    const t = parseText;
    const rfc = t.match(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/);
    const nombreM = t.match(/Nombre[^:]*:\s*([^\n]+)/i);
    const domM = t.match(/Domicilio[^:]*:\s*([^\n]+)/i);
    const cpM = t.match(/C\.?P\.?\s*:?\s*(\d{5})/i);
    const regM = t.match(/R[eé]gimen[^:]*:\s*([^\n]+)/i);
    setForm({
      ...form,
      rfc: rfc ? rfc[0] : form.rfc,
      name: nombreM ? nombreM[1].trim() : form.name,
      fiscal_address: domM ? domM[1].trim() : form.fiscal_address,
      cp: cpM ? cpM[1] : form.cp,
      fiscal_regime: regM ? regM[1].trim() : form.fiscal_regime,
    });
    toast.success("Datos extraídos");
  };

  const save = async () => {
    if (!form.name) return toast.error("Nombre requerido");
    try {
      if (editing) {
        await api.put(`/clients/${editing}`, form);
      } else {
        await api.post("/clients", form);
      }
      toast.success("Cliente guardado");
      setShowForm(false); setEditing(null); setForm(emptyClient()); setParseText("");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  const editClient = (c) => {
    setForm({ ...emptyClient(), ...c });
    setEditing(c.id);
    setShowForm(true);
  };

  const delClient = async (c) => {
    if (!window.confirm(`¿Eliminar cliente ${c.name}?`)) return;
    await api.delete(`/clients/${c.id}`);
    load();
  };

  // Compute per-client stats
  const clientStats = (c) => {
    const cRems = remisiones.filter((r) => r.client_id === c.id && r.status === "confirmed");
    const facturado = cRems.reduce((a, r) => a + (r.totals?.total_amount || 0), 0);
    const pagado = (c.payments || []).reduce((a, p) => a + (p.amount || 0), 0);
    const saldo = facturado - pagado;
    const cajasEntregadas =
      cRems.filter((r) => r.include_box_control).reduce((a, r) => a + (r.totals?.boxes || 0), 0) +
      cRems.reduce((a, r) => a + (r.empty_box_movement?.type === "delivery" ? r.empty_box_movement.quantity : 0), 0);
    const cajasDevueltas =
      cRems.reduce((a, r) => a + (r.empty_box_movement?.type === "return" ? r.empty_box_movement.quantity : 0), 0) +
      (c.empty_box_returns || []).reduce((a, p) => a + (p.quantity || 0), 0);
    const saldoCajas = cajasEntregadas - cajasDevueltas;
    return { facturado, pagado, saldo, cajasEntregadas, cajasDevueltas, saldoCajas, remisiones: cRems };
  };

  return (
    <div className="space-y-6" data-testid="clientes-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Clientes</h1>
          <p className="section-sub">{clients.length} clientes registrados</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm(emptyClient()); }}
          data-testid="toggle-client-form"
          className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> {showForm ? "Cerrar" : "Nuevo cliente"}
        </button>
      </div>

      {showForm && (
        <div className="card-surface p-5" data-testid="client-form">
          <h3 className="text-lg font-semibold text-[#16210b] mb-4">{editing ? "Editar cliente" : "Nuevo cliente"}</h3>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Pegar texto de constancia fiscal (opcional)</label>
            <div className="flex gap-2 mt-1">
              <textarea rows={3} value={parseText} onChange={(e) => setParseText(e.target.value)}
                className="flex-1 border border-[#deedc0] rounded-md bg-white px-3 py-2 text-xs" />
              <button onClick={parseConstancia} className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 text-sm">
                Extraer
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="Nombre / Razón social" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="client-name-input" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm md:col-span-2" />
            <input placeholder="RFC" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
              data-testid="client-rfc-input" className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            <input placeholder="Domicilio fiscal" value={form.fiscal_address} onChange={(e) => setForm({ ...form, fiscal_address: e.target.value })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm md:col-span-2" />
            <input placeholder="C.P." value={form.cp} onChange={(e) => setForm({ ...form, cp: e.target.value })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            <input placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            <input placeholder="Régimen fiscal" value={form.fiscal_regime} onChange={(e) => setForm({ ...form, fiscal_regime: e.target.value })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            <input type="number" placeholder="Límite de crédito ($)" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            <input type="number" placeholder="Días de crédito" value={form.credit_days} onChange={(e) => setForm({ ...form, credit_days: Number(e.target.value) })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
          </div>
          <button onClick={save} data-testid="save-client-button"
            className="mt-4 bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      )}

      <div className="space-y-4">
        {clients.map((c) => {
          const s = clientStats(c);
          const creditPct = c.credit_limit ? Math.min(100, (s.saldo / c.credit_limit) * 100) : 0;
          const isExp = expandedClient === c.id;
          return (
            <div key={c.id} className="card-surface p-5" data-testid={`client-card-${c.id}`}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#16210b]">{c.name}</h3>
                  <div className="text-xs text-[#4d5e42] mt-0.5">{c.rfc} · {c.phone} · {c.email}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => editClient(c)} className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-1.5 text-sm">Editar</button>
                  {isAdmin && (
                    <button onClick={() => delClient(c)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white rounded-md px-3 py-1.5 text-sm">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Facturado</div><div className="font-semibold">{formatMXN(s.facturado)}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Pagado</div><div className="font-semibold">{formatMXN(s.pagado)}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Saldo</div><div className={`font-semibold ${s.saldo > 0 ? "text-red-600" : ""}`}>{formatMXN(s.saldo)}</div></div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Crédito {formatMXN(c.credit_limit)}</div>
                  <div className="h-2 mt-1 bg-[#deedc0] rounded-full overflow-hidden">
                    <div className={`h-full ${creditPct > 90 ? "bg-red-500" : "bg-[#4d7a20]"}`} style={{ width: `${creditPct}%` }} />
                  </div>
                </div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Cajas entregadas</div><div className="font-semibold">{s.cajasEntregadas}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Saldo cajas</div><div className={`font-semibold ${s.saldoCajas > 0 ? "text-orange-600" : ""}`}>{s.saldoCajas}</div></div>
              </div>

              <button onClick={() => setExpandedClient(isExp ? null : c.id)}
                className="mt-3 text-sm text-[#2d4a12] hover:text-[#3d6518] flex items-center gap-1">
                {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {isExp ? "Ocultar detalle" : "Ver detalle"}
              </button>

              {isExp && (
                <div className="mt-4 pt-4 border-t border-[#deedc0] space-y-4">
                  <ClientExtras client={c} stats={s} onChange={load} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {clients.length === 0 && (
        <div className="card-surface p-12 text-center text-[#4d5e42]">Aún no hay clientes. Crea el primero.</div>
      )}
    </div>
  );
}

function ClientExtras({ client, stats, onChange }) {
  const [payForm, setPayForm] = useState({ date: new Date().toISOString().slice(0,10), amount: 0, ref: "" });
  const [boxForm, setBoxForm] = useState({ date: new Date().toISOString().slice(0,10), quantity: 0, ref: "" });

  const addPayment = async () => {
    if (!payForm.amount) return;
    await api.post(`/clients/${client.id}/payments`, payForm);
    toast.success("Pago registrado");
    setPayForm({ date: new Date().toISOString().slice(0,10), amount: 0, ref: "" });
    onChange();
  };
  const addBox = async () => {
    if (!boxForm.quantity) return;
    await api.post(`/clients/${client.id}/empty_box_returns`, boxForm);
    toast.success("Devolución registrada");
    setBoxForm({ date: new Date().toISOString().slice(0,10), quantity: 0, ref: "" });
    onChange();
  };

  return (
    <>
      <div>
        <h4 className="font-semibold text-[#16210b] mb-2">Remisiones</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#4d5e42]">
              <tr><th className="text-left px-2 py-1">#</th><th className="text-left px-2 py-1">Fecha</th><th className="text-right px-2 py-1">Importe</th><th className="text-left px-2 py-1">Estado</th></tr>
            </thead>
            <tbody>
              {stats.remisiones.map((r) => (
                <tr key={r.id} className="border-t border-[#deedc0]">
                  <td className="px-2 py-1 font-mono">{r.number}</td>
                  <td className="px-2 py-1">{formatDate(r.date)}</td>
                  <td className="px-2 py-1 text-right">{formatMXN(r.totals?.total_amount || 0)}</td>
                  <td className="px-2 py-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${stats.saldo > 0 ? "bg-amber-100 text-amber-800" : "bg-[#deedc0] text-[#2d4a12]"}`}>
                      {stats.saldo > 0 ? "En crédito" : "Pagado"}
                    </span>
                  </td>
                </tr>
              ))}
              {stats.remisiones.length === 0 && <tr><td colSpan={4} className="text-center py-3 text-[#4d5e42]">Sin remisiones</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[#deedc0] rounded-lg p-3">
          <div className="font-semibold text-sm mb-2">+ Pago</div>
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
            <input type="number" placeholder="Monto" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
            <input placeholder="Ref" value={payForm.ref} onChange={(e) => setPayForm({ ...payForm, ref: e.target.value })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
          </div>
          <button onClick={addPayment} className="mt-2 bg-[#2d4a12] text-white rounded-md px-3 py-1.5 text-xs">Registrar pago</button>
          <div className="mt-3 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-[#4d5e42] mb-1">Últimos pagos</div>
            {(client.payments || []).slice(-5).reverse().map((p, i) => (
              <div key={i} className="flex justify-between border-t border-[#deedc0] py-1">
                <span>{formatDate(p.date)} · {p.ref || "—"}</span><span className="font-medium">{formatMXN(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-[#deedc0] rounded-lg p-3">
          <div className="font-semibold text-sm mb-2">+ Devolución de cajas</div>
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={boxForm.date} onChange={(e) => setBoxForm({ ...boxForm, date: e.target.value })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
            <input type="number" placeholder="Cantidad" value={boxForm.quantity} onChange={(e) => setBoxForm({ ...boxForm, quantity: Number(e.target.value) })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
            <input placeholder="Ref" value={boxForm.ref} onChange={(e) => setBoxForm({ ...boxForm, ref: e.target.value })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
          </div>
          <button onClick={addBox} className="mt-2 bg-[#2d4a12] text-white rounded-md px-3 py-1.5 text-xs">Registrar devolución</button>
          <div className="mt-3 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-[#4d5e42] mb-1">Últimas devoluciones</div>
            {(client.empty_box_returns || []).slice(-5).reverse().map((p, i) => (
              <div key={i} className="flex justify-between border-t border-[#deedc0] py-1">
                <span>{formatDate(p.date)} · {p.ref || "—"}</span><span className="font-medium">{p.quantity} cajas</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
