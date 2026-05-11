import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { formatMXN, formatNum } from "../lib/api";
import { Plus, Trash2, Save, Eraser, Eye, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";
import { useNavigate, useParams } from "react-router-dom";

const DRAFT_KEY = "ajvj_draft_remision";

export default function NuevaRemision() {
  const { id: editId } = useParams();
  const nav = useNavigate();
  const sigRefs = { chofer: useRef(null), almacen: useRef(null), estibador: useRef(null) };

  const [modules, setModules] = useState([]);
  const [clients, setClients] = useState([]);
  const [crops, setCrops] = useState([]);
  const [signers, setSigners] = useState({ almacen: [], estibador: [] });
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const cropMap = useMemo(() => Object.fromEntries(crops.map((c) => [c.id, c])), [crops]);
  const moduleMap = useMemo(() => Object.fromEntries(modules.map((m) => [m.id, m])), [modules]);

  const newLine = (mid) => {
    const mod = moduleMap[mid] || modules[0];
    const cropId = mod?.active_crop || crops[0]?.id || "Jitomate";
    const cropDef = cropMap[cropId] || {};
    return {
      module_id: mod?.id || "A",
      crop: cropId,
      quality: cropDef.qualities?.[0] || "1ra",
      color: cropDef.has_color ? (cropDef.colors?.[0] || "") : null,
      size: cropDef.sizes?.[0] || "L",
      boxes: 0,
      kg_per_box: 19,
      price_per_box: 0,
    };
  };

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    client_id: "", client_name: "", client_rfc: "", client_address: "",
    destination: "", driver_name: "", license_plates: "",
    folio_cliente: "", observations: "",
    lines: [],
    signatures: { chofer: { name: "", image: "" }, almacen: { name: "", image: "" }, estibador: { name: "", image: "" } },
  });

  useEffect(() => {
    Promise.all([
      api.get("/modules"), api.get("/clients"),
      api.get("/catalog/crops"), api.get("/signer_names"),
    ]).then(([m, c, cr, s]) => {
      setModules(m.data);
      setClients(c.data);
      setCrops(cr.data);
      setSigners({ almacen: s.data.almacen || [], estibador: s.data.estibador || [] });
    });
  }, []);

  // Initialize lines once modules and crops are loaded (only if creating new)
  useEffect(() => {
    if (!editId && modules.length && crops.length && form.lines.length === 0) {
      setForm((f) => ({ ...f, lines: [newLineDefault()] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, crops, editId]);

  const newLineDefault = () => {
    const m = modules[0];
    const cropId = m?.active_crop || crops[0]?.id || "Jitomate";
    const cropDef = crops.find((c) => c.id === cropId) || {};
    return {
      module_id: m?.id || "A",
      crop: cropId,
      quality: cropDef.qualities?.[0] || "1ra",
      color: cropDef.has_color ? (cropDef.colors?.[0] || "") : null,
      size: cropDef.sizes?.[0] || "L",
      boxes: 0, kg_per_box: 19, price_per_box: 0,
    };
  };

  // Load edit data or draft
  useEffect(() => {
    if (editId) {
      api.get(`/remisiones/${editId}`).then((r) => {
        const d = r.data;
        setForm({
          ...d,
          signatures: d.signatures || { chofer: { name: "", image: "" }, almacen: { name: "", image: "" }, estibador: { name: "", image: "" } },
        });
      });
    } else {
      if (localStorage.getItem(DRAFT_KEY)) setHasDraft(true);
    }
  }, [editId]);

  const loadDraft = () => {
    const d = localStorage.getItem(DRAFT_KEY);
    if (d) { setForm(JSON.parse(d)); setHasDraft(false); toast.success("Borrador cargado"); }
  };
  const discardDraft = () => { localStorage.removeItem(DRAFT_KEY); setHasDraft(false); };

  const onModuleChange = (i, mid) => {
    const mod = moduleMap[mid];
    const cropId = mod?.active_crop || crops[0]?.id;
    const cropDef = cropMap[cropId] || {};
    const lines = [...form.lines];
    lines[i] = {
      ...lines[i],
      module_id: mid,
      crop: cropId || lines[i].crop,
      quality: cropDef.qualities?.[0] || lines[i].quality,
      color: cropDef.has_color ? (cropDef.colors?.[0] || "") : null,
      size: cropDef.sizes?.[0] || lines[i].size,
    };
    setForm({ ...form, lines });
  };

  const updateLine = (i, key, value) => {
    const lines = [...form.lines];
    lines[i] = { ...lines[i], [key]: value };
    setForm({ ...form, lines });
  };

  const addLine = () => setForm({ ...form, lines: [...form.lines, newLineDefault()] });
  const removeLine = (i) => {
    if (form.lines.length === 1) return;
    setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });
  };

  const totals = form.lines.reduce(
    (acc, l) => {
      const b = Number(l.boxes) || 0, k = Number(l.kg_per_box) || 0, p = Number(l.price_per_box) || 0;
      acc.boxes += b; acc.kg += b * k; acc.amount += b * p; return acc;
    },
    { boxes: 0, kg: 0, amount: 0 }
  );

  const pickClient = (c) => {
    setForm({ ...form, client_id: c.id, client_name: c.name, client_rfc: c.rfc, client_address: c.fiscal_address });
    setClientSearch(c.name);
    setShowClientDrop(false);
  };

  const clearSignature = (role) => sigRefs[role].current?.clear();

  const collectSignatures = () => {
    const out = { ...form.signatures };
    for (const role of ["chofer", "almacen", "estibador"]) {
      const ref = sigRefs[role].current;
      if (ref && !ref.isEmpty()) {
        out[role] = { ...(out[role] || {}), image: ref.toDataURL("image/png") };
      }
    }
    // Auto-fill chofer name if blank
    if (!out.chofer.name && form.driver_name) out.chofer.name = form.driver_name;
    return out;
  };

  const save = async (status) => {
    if (!form.client_id) { toast.error("Selecciona un cliente"); return; }
    if (form.lines.length === 0 || form.lines.some((l) => !l.boxes || !l.price_per_box)) {
      toast.error("Todas las líneas deben tener cajas y precio");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, status, signatures: collectSignatures() };
      const res = editId
        ? await api.put(`/remisiones/${editId}`, payload)
        : await api.post("/remisiones", payload);
      toast.success(status === "confirmed" ? `Remisión ${res.data.number} guardada` : "Borrador guardado");
      localStorage.removeItem(DRAFT_KEY);
      setSavedId(res.data.id);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const clearForm = () => {
    if (!window.confirm("¿Limpiar formulario?")) return;
    setForm({
      date: new Date().toISOString().slice(0, 10),
      client_id: "", client_name: "", client_rfc: "", client_address: "",
      destination: "", driver_name: "", license_plates: "",
      folio_cliente: "", observations: "",
      lines: [newLineDefault()],
      signatures: { chofer: { name: "", image: "" }, almacen: { name: "", image: "" }, estibador: { name: "", image: "" } },
    });
    Object.values(sigRefs).forEach((r) => r.current?.clear());
    setSavedId(null); setClientSearch("");
  };

  const saveDraftLocal = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    toast.success("Guardado en este navegador");
  };

  const filteredClients = clientSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  return (
    <div className="space-y-6" data-testid="nueva-remision-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">
            {editId ? "Editar Remisión" : "Nueva Remisión"}
          </h1>
          <p className="section-sub">El número se asigna al confirmar (formato {new Date().getFullYear()}-XXXX)</p>
        </div>
        <button onClick={saveDraftLocal} data-testid="save-draft-local-button" className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-2 text-sm font-medium">
          Guardar en borrador local
        </button>
      </div>

      {hasDraft && (
        <div className="card-surface p-4 flex items-center justify-between bg-[#fffbeb] border-[#fde68a]">
          <div className="flex items-center gap-2 text-sm text-[#92400e]">
            <AlertCircle className="w-4 h-4" /> Hay un borrador local guardado
          </div>
          <div className="flex gap-2">
            <button onClick={loadDraft} className="bg-[#2d4a12] text-white px-3 py-1.5 rounded-md text-sm">Continuar</button>
            <button onClick={discardDraft} className="bg-white border border-[#deedc0] text-[#4d5e42] px-3 py-1.5 rounded-md text-sm">Descartar</button>
          </div>
        </div>
      )}

      <div className="card-surface p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Fecha</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            data-testid="remision-date-input"
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div className="md:col-span-2 relative">
          <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Cliente</label>
          <input
            value={clientSearch || form.client_name}
            onChange={(e) => { setClientSearch(e.target.value); setShowClientDrop(true); }}
            onFocus={() => setShowClientDrop(true)}
            placeholder="Buscar cliente…"
            data-testid="remision-client-input"
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
          {showClientDrop && filteredClients.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-[#deedc0] rounded-md shadow-lg max-h-60 overflow-auto">
              {filteredClients.slice(0, 20).map((c) => (
                <button key={c.id} onClick={() => pickClient(c)}
                  className="w-full text-left px-3 py-2 hover:bg-[#f4f8ec] text-sm border-b border-[#deedc0] last:border-0">
                  <div className="font-medium text-[#16210b]">{c.name}</div>
                  <div className="text-xs text-[#4d5e42]">{c.rfc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">RFC</label>
          <input value={form.client_rfc} readOnly className="mt-1 w-full border border-[#deedc0] rounded-md bg-[#f4f8ec] px-3 py-2 text-sm" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Domicilio fiscal</label>
          <input value={form.client_address} readOnly className="mt-1 w-full border border-[#deedc0] rounded-md bg-[#f4f8ec] px-3 py-2 text-sm" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Destino de la carga</label>
          <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })}
            placeholder="Mercado de abasto, bodega…"
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Folio de cliente</label>
          <input value={form.folio_cliente} onChange={(e) => setForm({ ...form, folio_cliente: e.target.value })}
            data-testid="folio-cliente-input"
            placeholder="Folio asignado por el cliente"
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Chofer</label>
          <input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Placas</label>
          <input value={form.license_plates} onChange={(e) => setForm({ ...form, license_plates: e.target.value })}
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="card-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#16210b]">Líneas de producto</h3>
          <button onClick={addLine} data-testid="add-line-button" className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-3 py-2 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Agregar línea
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f4f8ec] border-b border-[#deedc0]">
                <th className="px-2 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Módulo</th>
                <th className="px-2 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Cultivo</th>
                <th className="px-2 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Calidad</th>
                <th className="px-2 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Color</th>
                <th className="px-2 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Tamaño</th>
                <th className="px-2 py-2 text-right text-xs uppercase tracking-wider text-[#4d5e42]">Cajas</th>
                <th className="px-2 py-2 text-right text-xs uppercase tracking-wider text-[#4d5e42]">Kg/caja</th>
                <th className="px-2 py-2 text-right text-xs uppercase tracking-wider text-[#4d5e42]">$/caja</th>
                <th className="px-2 py-2 text-right text-xs uppercase tracking-wider text-[#4d5e42]">Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => {
                const cropDef = cropMap[l.crop] || { qualities: [], colors: [], sizes: [], has_color: false };
                const subtotal = (Number(l.boxes) || 0) * (Number(l.price_per_box) || 0);
                return (
                  <tr key={i} className="border-b border-[#deedc0]" data-testid={`line-row-${i}`}>
                    <td className="px-1 py-2">
                      <select value={l.module_id} onChange={(e) => onModuleChange(i, e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                        {modules.map((m) => <option key={m.id} value={m.id}>{m.id}{m.active_crop ? ` · ${m.active_crop}` : ""}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      <input value={l.crop} readOnly className="border border-[#deedc0] rounded px-2 py-1.5 bg-[#f4f8ec] text-sm w-full text-[#2d4a12] font-medium" title="Se hereda del módulo" />
                    </td>
                    <td className="px-1 py-2">
                      <select value={l.quality} onChange={(e) => updateLine(i, "quality", e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                        {cropDef.qualities.map((q) => <option key={q}>{q}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      {cropDef.has_color && cropDef.colors.length ? (
                        <select value={l.color || ""} onChange={(e) => updateLine(i, "color", e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                          {cropDef.colors.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      ) : <span className="text-[#4d5e42] text-xs">N/A</span>}
                    </td>
                    <td className="px-1 py-2">
                      <select value={l.size} onChange={(e) => updateLine(i, "size", e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                        {cropDef.sizes.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-2"><input type="number" value={l.boxes} onChange={(e) => updateLine(i, "boxes", Number(e.target.value))} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-20 text-right" /></td>
                    <td className="px-1 py-2"><input type="number" step="0.01" value={l.kg_per_box} onChange={(e) => updateLine(i, "kg_per_box", Number(e.target.value))} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-20 text-right" /></td>
                    <td className="px-1 py-2"><input type="number" step="0.01" value={l.price_per_box} onChange={(e) => updateLine(i, "price_per_box", Number(e.target.value))} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-24 text-right" /></td>
                    <td className="px-1 py-2 text-right font-semibold text-[#2d4a12]">{formatMXN(subtotal)}</td>
                    <td className="px-1 py-2">
                      <button onClick={() => removeLine(i)} className="text-red-600 hover:bg-red-50 p-1.5 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end flex-wrap gap-6 bg-[#deedc0]/40 rounded-lg p-4">
          <div className="text-sm"><span className="text-[#4d5e42]">Cajas:</span> <span className="font-semibold text-[#16210b]">{totals.boxes}</span></div>
          <div className="text-sm"><span className="text-[#4d5e42]">Kg:</span> <span className="font-semibold text-[#16210b]">{formatNum(totals.kg)}</span></div>
          <div className="text-base"><span className="text-[#4d5e42]">Total:</span> <span className="font-bold text-[#2d4a12] text-xl">{formatMXN(totals.amount)}</span></div>
        </div>
      </div>

      {/* Signatures */}
      <div className="card-surface p-5">
        <h3 className="text-lg font-semibold text-[#16210b] mb-3">Firmas</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SignatureBlock role="chofer" label="CHOFER" form={form} setForm={setForm} sigRef={sigRefs.chofer} clear={() => clearSignature("chofer")} hint="Nombre toma por defecto el chofer arriba" suggestions={[]} autoName={form.driver_name} />
          <SignatureBlock role="almacen" label="ALMACÉN" form={form} setForm={setForm} sigRef={sigRefs.almacen} clear={() => clearSignature("almacen")} suggestions={signers.almacen} />
          <SignatureBlock role="estibador" label="ESTIBADOR" form={form} setForm={setForm} sigRef={sigRefs.estibador} clear={() => clearSignature("estibador")} suggestions={signers.estibador} />
        </div>
      </div>

      <div className="card-surface p-5">
        <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Observaciones</label>
        <textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })}
          rows={3} className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button onClick={() => save("confirmed")} disabled={saving} data-testid="save-confirmed-button"
          className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-5 py-2.5 font-medium flex items-center gap-2 disabled:opacity-60">
          <Save className="w-4 h-4" /> Guardar remisión
        </button>
        <button onClick={() => save("draft")} disabled={saving} data-testid="save-draft-button"
          className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-5 py-2.5 font-medium flex items-center gap-2">
          <Save className="w-4 h-4" /> Guardar borrador
        </button>
        <button onClick={clearForm} className="bg-white border border-[#deedc0] text-[#4d5e42] hover:bg-[#f4f8ec] rounded-md px-5 py-2.5">
          Limpiar
        </button>
        {savedId && (
          <button onClick={() => nav(`/pdf/${savedId}`)} data-testid="view-pdf-button"
            className="bg-white border-2 border-[#2d4a12] text-[#2d4a12] hover:bg-[#2d4a12] hover:text-white rounded-md px-5 py-2.5 font-medium flex items-center gap-2">
            <Eye className="w-4 h-4" /> Ver / Imprimir PDF
          </button>
        )}
      </div>
    </div>
  );
}

function SignatureBlock({ role, label, form, setForm, sigRef, clear, suggestions = [], hint, autoName }) {
  const updateName = (v) => setForm({ ...form, signatures: { ...form.signatures, [role]: { ...(form.signatures[role] || {}), name: v } } });
  const displayName = form.signatures[role]?.name || autoName || "";
  return (
    <div className="border border-[#deedc0] rounded-lg p-4">
      <div className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42] mb-2">{label}</div>
      {suggestions.length > 0 ? (
        <select value={displayName} onChange={(e) => updateName(e.target.value)}
          data-testid={`signature-name-${role}`}
          className="w-full border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm mb-2">
          <option value="">— Seleccionar —</option>
          {suggestions.map((s) => <option key={s}>{s}</option>)}
          <option value="__other__">Otro (escribir)…</option>
        </select>
      ) : null}
      {(displayName === "__other__" || (suggestions.length === 0)) && (
        <input value={displayName === "__other__" ? "" : displayName} onChange={(e) => updateName(e.target.value)}
          placeholder="Nombre"
          className="w-full border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm mb-2" />
      )}
      {hint && <div className="text-[10px] text-[#4d5e42] mb-2">{hint}</div>}
      <SignatureCanvas ref={sigRef} canvasProps={{ className: "sig-canvas", "data-testid": `signature-${role}` }} penColor="#2d4a12" />
      {form.signatures[role]?.image && (
        <div className="mt-2 text-[10px] text-[#4d5e42]">✓ Firma guardada anteriormente</div>
      )}
      <button onClick={clear} className="mt-2 text-xs text-[#4d5e42] hover:text-[#2d4a12] flex items-center gap-1">
        <Eraser className="w-3 h-3" /> Limpiar firma
      </button>
    </div>
  );
}
