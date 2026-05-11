import React, { useEffect, useState } from "react";
import api, { formatMXN, formatDate, exportToExcel } from "../lib/api";
import { Save, Trash2, ChevronDown, ChevronUp, UserPlus, FileSpreadsheet, Package, PackageMinus, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

const emptyClient = () => ({
  name: "", rfc: "", fiscal_address: "", cp: "", phone: "", email: "",
  fiscal_regime: "", credit_limit: 0, credit_days: 0,
  payments: [],
});

export default function Clientes() {
  const { isAdmin } = useAuth();
  const [clients, setClients] = useState([]);
  const [accounts, setAccounts] = useState({}); // client_id -> account state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyClient());
  const [parseText, setParseText] = useState("");
  const [expanded, setExpanded] = useState(null);

  const loadAll = async () => {
    const r = await api.get("/clients");
    setClients(r.data);
    const accs = {};
    await Promise.all(r.data.map(async (c) => {
      const a = await api.get(`/clients/${c.id}/account`);
      accs[c.id] = a.data;
    }));
    setAccounts(accs);
  };
  useEffect(() => { loadAll(); }, []);

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
      if (editing) await api.put(`/clients/${editing}`, form);
      else await api.post("/clients", form);
      toast.success("Cliente guardado");
      setShowForm(false); setEditing(null); setForm(emptyClient()); setParseText("");
      loadAll();
    } catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };

  const editClient = (c) => { setForm({ ...emptyClient(), ...c }); setEditing(c.id); setShowForm(true); };
  const delClient = async (c) => {
    if (!window.confirm(`¿Eliminar cliente ${c.name}?`)) return;
    await api.delete(`/clients/${c.id}`);
    loadAll();
  };

  const exportAccountXlsx = async (c) => {
    const a = accounts[c.id];
    if (!a) return;
    const rows = a.remisiones.map((r) => ({
      Folio: r.number || "BORRADOR",
      Estado: r.status,
      Fecha: r.date,
      "Folio cliente": r.folio_cliente || "",
      Destino: r.destination || "",
      Cajas: r.totals?.boxes || 0,
      "Total kg": r.totals?.total_kg || 0,
      Importe: r.totals?.total_amount || 0,
    }));
    rows.push({});
    rows.push({ Folio: "RESUMEN" });
    rows.push({ Folio: "Facturado", Importe: a.facturado });
    rows.push({ Folio: "Pagado", Importe: a.pagado });
    rows.push({ Folio: "Saldo", Importe: a.saldo });
    rows.push({ Folio: "Cajas ingresadas", Cajas: a.boxes.ingresos });
    rows.push({ Folio: "Cajas egresadas", Cajas: a.boxes.egresos });
    rows.push({ Folio: "Saldo cajas", Cajas: a.boxes.balance });
    exportToExcel(rows, "EstadoCuenta", `estado-cuenta-${c.name.replace(/\s+/g, "_")}.xlsx`);
    toast.success("Excel descargado");
  };

  return (
    <div className="space-y-6" data-testid="clientes-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Clientes</h1>
          <p className="section-sub">{clients.length} clientes registrados</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm(emptyClient()); }}
            data-testid="toggle-client-form"
            className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> {showForm ? "Cerrar" : "Nuevo cliente"}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <div className="card-surface p-5" data-testid="client-form">
          <h3 className="text-lg font-semibold text-[#16210b] mb-4">{editing ? "Editar cliente" : "Nuevo cliente"}</h3>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Pegar texto de constancia fiscal (opcional)</label>
            <div className="flex gap-2 mt-1">
              <textarea rows={3} value={parseText} onChange={(e) => setParseText(e.target.value)} className="flex-1 border border-[#deedc0] rounded-md bg-white px-3 py-2 text-xs" />
              <button onClick={parseConstancia} className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 text-sm">Extraer</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Labeled label="Nombre / Razón social" colSpan="md:col-span-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="client-name-input" className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            </Labeled>
            <Labeled label="RFC">
              <input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} data-testid="client-rfc-input" className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            </Labeled>
            <Labeled label="Domicilio fiscal" colSpan="md:col-span-2">
              <input value={form.fiscal_address} onChange={(e) => setForm({ ...form, fiscal_address: e.target.value })} className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            </Labeled>
            <Labeled label="C.P."><input value={form.cp} onChange={(e) => setForm({ ...form, cp: e.target.value })} className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" /></Labeled>
            <Labeled label="Teléfono"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" /></Labeled>
            <Labeled label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" /></Labeled>
            <Labeled label="Régimen fiscal"><input value={form.fiscal_regime} onChange={(e) => setForm({ ...form, fiscal_regime: e.target.value })} className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" /></Labeled>
            <Labeled label="Límite de crédito ($)"><input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })} data-testid="client-credit-limit-input" className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" /></Labeled>
            <Labeled label="Días de crédito"><input type="number" value={form.credit_days} onChange={(e) => setForm({ ...form, credit_days: Number(e.target.value) })} data-testid="client-credit-days-input" className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" /></Labeled>
          </div>
          <button onClick={save} data-testid="save-client-button" className="mt-4 bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      )}

      <div className="space-y-4">
        {clients.map((c) => {
          const a = accounts[c.id];
          if (!a) return null;
          const creditPct = c.credit_limit ? Math.min(100, (a.saldo / c.credit_limit) * 100) : 0;
          return (
            <div key={c.id} className="card-surface p-5" data-testid={`client-card-${c.id}`}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#16210b]">{c.name}</h3>
                  <div className="text-xs text-[#4d5e42] mt-0.5">{c.rfc} · {c.phone} · {c.email}</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => exportAccountXlsx(c)} className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-1.5 text-sm flex items-center gap-1">
                    <FileSpreadsheet className="w-3 h-3" /> Estado cuenta
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => editClient(c)} className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-1.5 text-sm">Editar</button>
                      <button onClick={() => delClient(c)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white rounded-md px-3 py-1.5 text-sm">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Facturado</div><div className="font-semibold">{formatMXN(a.facturado)}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Pagado</div><div className="font-semibold">{formatMXN(a.pagado)}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Saldo</div><div className={`font-semibold ${a.saldo > 0 ? "text-red-600" : ""}`}>{formatMXN(a.saldo)}</div></div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Crédito {formatMXN(c.credit_limit)}</div>
                  <div className="h-2 mt-1 bg-[#deedc0] rounded-full overflow-hidden">
                    <div className={`h-full ${creditPct > 90 ? "bg-red-500" : "bg-[#4d7a20]"}`} style={{ width: `${Math.max(0, creditPct)}%` }} />
                  </div>
                </div>
                <div title="Cliente entrega → ingreso. Remisión → egreso">
                  <div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Cajas (ingresos / egresos)</div>
                  <div className="font-semibold">{a.boxes.ingresos} / {a.boxes.egresos}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#4d5e42]">Saldo cajas</div>
                  <div className={`font-semibold ${a.boxes.balance < 0 ? "text-red-600" : a.boxes.balance > 0 ? "text-[#2d4a12]" : ""}`}>
                    {a.boxes.balance} {a.boxes.balance < 0 ? "(nos deben)" : a.boxes.balance > 0 ? "(a favor)" : ""}
                  </div>
                </div>
              </div>

              <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                className="mt-3 text-sm text-[#2d4a12] hover:text-[#3d6518] flex items-center gap-1">
                {expanded === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {expanded === c.id ? "Ocultar detalle" : "Ver detalle / Agregar pago o cajas"}
              </button>

              {expanded === c.id && (
                <div className="mt-4 pt-4 border-t border-[#deedc0] space-y-5">
                  <Detalle client={c} account={a} isAdmin={isAdmin} onChange={loadAll} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {clients.length === 0 && (
        <div className="card-surface p-12 text-center text-[#4d5e42]">Aún no hay clientes.</div>
      )}
    </div>
  );
}

function Labeled({ label, children, colSpan = "" }) {
  return (
    <div className={colSpan}>
      <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42] block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Detalle({ client, account, isAdmin, onChange }) {
  const [pay, setPay] = useState({ date: new Date().toISOString().slice(0, 10), amount: 0, ref: "" });
  const [box, setBox] = useState({ date: new Date().toISOString().slice(0, 10), type: "ingreso", quantity: 0, ref: "" });

  const addPayment = async () => {
    if (!pay.amount) return;
    await api.post(`/clients/${client.id}/payments`, pay);
    toast.success("Pago registrado");
    setPay({ date: new Date().toISOString().slice(0, 10), amount: 0, ref: "" });
    onChange();
  };
  const addBox = async () => {
    if (!box.quantity) return;
    await api.post("/box_movements", { ...box, client_id: client.id });
    toast.success("Movimiento registrado");
    setBox({ date: new Date().toISOString().slice(0, 10), type: "ingreso", quantity: 0, ref: "" });
    onChange();
  };

  return (
    <>
      <div>
        <h4 className="font-semibold text-[#16210b] mb-2">Remisiones</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#4d5e42]">
              <tr><th className="text-left px-2 py-1">#</th><th className="text-left px-2 py-1">Fecha</th><th className="text-left px-2 py-1">Folio cliente</th><th className="text-right px-2 py-1">Importe</th><th className="text-left px-2 py-1">Estado</th></tr>
            </thead>
            <tbody>
              {account.remisiones.map((r) => (
                <tr key={r.id} className="border-t border-[#deedc0]">
                  <td className={`px-2 py-1 font-mono ${r.status === "cancelled" ? "line-through text-gray-400" : ""}`}>{r.number || "BORRADOR"}</td>
                  <td className="px-2 py-1">{formatDate(r.date)}</td>
                  <td className="px-2 py-1">{r.folio_cliente || "—"}</td>
                  <td className="px-2 py-1 text-right">{formatMXN(r.totals?.total_amount || 0)}</td>
                  <td className="px-2 py-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      r.status === "cancelled" ? "bg-red-100 text-red-800" :
                      r.status === "draft" ? "bg-amber-100 text-amber-800" :
                      account.saldo > 0 ? "bg-amber-100 text-amber-800" : "bg-[#deedc0] text-[#2d4a12]"
                    }`}>
                      {r.status === "cancelled" ? "Cancelada" : r.status === "draft" ? "Borrador" : account.saldo > 0 ? "En crédito" : "Pagado"}
                    </span>
                  </td>
                </tr>
              ))}
              {account.remisiones.length === 0 && <tr><td colSpan={5} className="text-center py-3 text-[#4d5e42]">Sin remisiones</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isAdmin && (
          <div className="border border-[#deedc0] rounded-lg p-3">
            <div className="font-semibold text-sm mb-2 flex items-center gap-2"><Package className="w-4 h-4" /> + Pago</div>
            <div className="grid grid-cols-3 gap-2">
              <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
              <input type="number" placeholder="Monto" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
              <input placeholder="Ref" value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
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
        )}

        <div className="border border-[#deedc0] rounded-lg p-3">
          <div className="font-semibold text-sm mb-2 flex items-center gap-2"><PackagePlus className="w-4 h-4" /> + Movimiento de cajas vacías</div>
          <div className="grid grid-cols-4 gap-2">
            <input type="date" value={box.date} onChange={(e) => setBox({ ...box, date: e.target.value })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
            <select value={box.type} onChange={(e) => setBox({ ...box, type: e.target.value })} data-testid="box-movement-type" className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white">
              <option value="ingreso">Ingreso (cliente entrega)</option>
              <option value="egreso">Egreso (le regresamos)</option>
            </select>
            <input type="number" placeholder="Cantidad" value={box.quantity} onChange={(e) => setBox({ ...box, quantity: Number(e.target.value) })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
            <input placeholder="Ref" value={box.ref} onChange={(e) => setBox({ ...box, ref: e.target.value })} className="border border-[#deedc0] rounded px-2 py-1.5 text-xs bg-white" />
          </div>
          <button onClick={addBox} data-testid="add-box-movement-button"
            className="mt-2 bg-[#2d4a12] text-white rounded-md px-3 py-1.5 text-xs">Registrar movimiento</button>
          <div className="mt-3 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-[#4d5e42] mb-1">Últimos movimientos</div>
            {account.boxes.movements.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between border-t border-[#deedc0] py-1 items-center">
                <span className="flex items-center gap-1">
                  {m.type === "ingreso" ? <PackagePlus className="w-3 h-3 text-[#2d4a12]" /> : <PackageMinus className="w-3 h-3 text-amber-700" />}
                  {formatDate(m.date)} · {m.ref || "—"}
                  {m.auto && <span className="text-[9px] text-[#4d5e42]">(auto)</span>}
                </span>
                <span className={`font-medium ${m.type === "ingreso" ? "text-[#2d4a12]" : "text-amber-700"}`}>
                  {m.type === "ingreso" ? "+" : "-"}{m.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
