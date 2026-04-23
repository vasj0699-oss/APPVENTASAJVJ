import React, { useEffect, useRef, useState } from "react";
import api, { formatMXN, formatNum, SIZES_JITOMATE, SIZES_PEPINO, COLORS_JITOMATE, QUALITIES, CROPS } from "../lib/api";
import { Plus, Trash2, Save, FileDown, Eraser, Eye, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";
import { useNavigate, useParams } from "react-router-dom";

const DRAFT_KEY = "ajvj_draft_remision";

const emptyLine = () => ({
  module_id: "A",
  crop: "Jitomate",
  quality: "1ra",
  color: "Rojo",
  size: "L",
  boxes: 0,
  kg_per_box: 19,
  price_per_box: 0,
});

export default function NuevaRemision() {
  const { id: editId } = useParams();
  const nav = useNavigate();
  const sigRef = useRef(null);

  const [modules, setModules] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    client_id: "", client_name: "", client_rfc: "", client_address: "",
    destination: "", driver_name: "", license_plates: "",
    include_box_control: false, observations: "",
    lines: [emptyLine()],
    empty_box_movement: null,
    warehouse_signature_image: "",
  });

  // Load modules + clients
  useEffect(() => {
    api.get("/modules").then((r) => setModules(r.data));
    api.get("/clients").then((r) => setClients(r.data));
  }, []);

  // Load edit or draft
  useEffect(() => {
    if (editId) {
      api.get(`/remisiones/${editId}`).then((r) => {
        setForm({
          ...r.data,
          empty_box_movement: r.data.empty_box_movement || null,
        });
        if (r.data.warehouse_signature_image && sigRef.current) {
          // Can't restore into canvas easily; keep base64 in state
        }
      });
    } else {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) setHasDraft(true);
    }
  }, [editId]);

  const loadDraft = () => {
    const d = localStorage.getItem(DRAFT_KEY);
    if (d) {
      setForm(JSON.parse(d));
      setHasDraft(false);
      toast.success("Borrador cargado");
    }
  };
  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
  };

  const updateLine = (i, key, value) => {
    const lines = [...form.lines];
    lines[i] = { ...lines[i], [key]: value };
    if (key === "crop") {
      if (value === "Pepino") {
        lines[i].color = null;
        if (!SIZES_PEPINO.includes(lines[i].size)) lines[i].size = "L";
      } else {
        if (!lines[i].color) lines[i].color = "Rojo";
      }
    }
    setForm({ ...form, lines });
  };

  const addLine = () => setForm({ ...form, lines: [...form.lines, emptyLine()] });
  const removeLine = (i) => {
    if (form.lines.length === 1) return;
    setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });
  };

  const totals = form.lines.reduce(
    (acc, l) => {
      const boxes = Number(l.boxes) || 0;
      const kgpb = Number(l.kg_per_box) || 0;
      const ppb = Number(l.price_per_box) || 0;
      acc.boxes += boxes;
      acc.kg += boxes * kgpb;
      acc.amount += boxes * ppb;
      return acc;
    },
    { boxes: 0, kg: 0, amount: 0 }
  );

  const pickClient = (c) => {
    setForm({
      ...form,
      client_id: c.id, client_name: c.name, client_rfc: c.rfc,
      client_address: c.fiscal_address,
    });
    setClientSearch(c.name);
    setShowClientDrop(false);
  };

  const clearSignature = () => sigRef.current?.clear();

  const save = async (status) => {
    if (!form.client_id) { toast.error("Selecciona un cliente"); return; }
    if (form.lines.some((l) => !l.boxes || !l.price_per_box)) {
      toast.error("Todas las líneas deben tener cajas y precio");
      return;
    }
    setSaving(true);
    try {
      let sig = form.warehouse_signature_image;
      if (sigRef.current && !sigRef.current.isEmpty()) {
        sig = sigRef.current.toDataURL("image/png");
      }
      const payload = {
        ...form,
        status,
        warehouse_signature_image: sig,
      };
      let res;
      if (editId) {
        res = await api.put(`/remisiones/${editId}`, payload);
      } else {
        res = await api.post("/remisiones", payload);
      }
      toast.success(status === "confirmed" ? `Remisión ${res.data.number} guardada` : "Borrador guardado");
      localStorage.removeItem(DRAFT_KEY);
      setSavedId(res.data.id);
      if (status === "confirmed" && !editId) {
        // keep user on page so they can click Ver PDF
      }
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
      include_box_control: false, observations: "",
      lines: [emptyLine()], empty_box_movement: null,
      warehouse_signature_image: "",
    });
    clearSignature();
    setSavedId(null);
    setClientSearch("");
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
          <p className="section-sub">El número se asigna al confirmar</p>
        </div>
        <button onClick={saveDraftLocal} data-testid="save-draft-local-button" className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-2 text-sm font-medium transition-colors">
          Guardar en borrador local
        </button>
      </div>

      {hasDraft && (
        <div className="card-surface p-4 flex items-center justify-between bg-[#fffbeb] border-[#fde68a]" data-testid="draft-banner">
          <div className="flex items-center gap-2 text-sm text-[#92400e]">
            <AlertCircle className="w-4 h-4" /> Hay un borrador local guardado
          </div>
          <div className="flex gap-2">
            <button onClick={loadDraft} className="bg-[#2d4a12] text-white px-3 py-1.5 rounded-md text-sm">Continuar</button>
            <button onClick={discardDraft} className="bg-white border border-[#deedc0] text-[#4d5e42] px-3 py-1.5 rounded-md text-sm">Descartar</button>
          </div>
        </div>
      )}

      {/* Client / meta */}
      <div className="card-surface p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Fecha</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            data-testid="remision-date-input"
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div className="md:col-span-2 relative">
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Cliente</label>
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
                <button key={c.id} onClick={() => pickClient(c)} data-testid={`client-option-${c.id}`}
                  className="w-full text-left px-3 py-2 hover:bg-[#f4f8ec] text-sm border-b border-[#deedc0] last:border-0">
                  <div className="font-medium text-[#16210b]">{c.name}</div>
                  <div className="text-xs text-[#4d5e42]">{c.rfc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">RFC</label>
          <input value={form.client_rfc} readOnly className="mt-1 w-full border border-[#deedc0] rounded-md bg-[#f4f8ec] px-3 py-2 text-sm text-[#4d5e42]" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Domicilio fiscal</label>
          <input value={form.client_address} readOnly className="mt-1 w-full border border-[#deedc0] rounded-md bg-[#f4f8ec] px-3 py-2 text-sm text-[#4d5e42]" />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Destino de la carga</label>
          <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })}
            data-testid="remision-destination-input"
            placeholder="Mercado de abasto, bodega, etc."
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Chofer</label>
          <input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
            data-testid="remision-driver-input"
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Placas</label>
          <input value={form.license_plates} onChange={(e) => setForm({ ...form, license_plates: e.target.value })}
            data-testid="remision-plates-input"
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-[#16210b]">
            <input type="checkbox" checked={form.include_box_control}
              onChange={(e) => setForm({ ...form, include_box_control: e.target.checked })}
              data-testid="remision-box-control-checkbox"
              className="w-4 h-4 accent-[#2d4a12]" />
            Registrar en control de cajas vacías
          </label>
        </div>
      </div>

      {/* Lines */}
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
                const sizes = l.crop === "Pepino" ? SIZES_PEPINO : SIZES_JITOMATE;
                const subtotal = (Number(l.boxes) || 0) * (Number(l.price_per_box) || 0);
                return (
                  <tr key={i} className="border-b border-[#deedc0]" data-testid={`line-row-${i}`}>
                    <td className="px-1 py-2">
                      <select value={l.module_id} onChange={(e) => updateLine(i, "module_id", e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                        {modules.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      <select value={l.crop} onChange={(e) => updateLine(i, "crop", e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                        {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      <select value={l.quality} onChange={(e) => updateLine(i, "quality", e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                        {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      {l.crop === "Jitomate" ? (
                        <select value={l.color || ""} onChange={(e) => updateLine(i, "color", e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                          {COLORS_JITOMATE.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : <span className="text-[#4d5e42] text-xs">N/A</span>}
                    </td>
                    <td className="px-1 py-2">
                      <select value={l.size} onChange={(e) => updateLine(i, "size", e.target.value)} className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-full">
                        {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      <input type="number" value={l.boxes} onChange={(e) => updateLine(i, "boxes", Number(e.target.value))}
                        className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-20 text-right" />
                    </td>
                    <td className="px-1 py-2">
                      <input type="number" step="0.01" value={l.kg_per_box} onChange={(e) => updateLine(i, "kg_per_box", Number(e.target.value))}
                        className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-20 text-right" />
                    </td>
                    <td className="px-1 py-2">
                      <input type="number" step="0.01" value={l.price_per_box} onChange={(e) => updateLine(i, "price_per_box", Number(e.target.value))}
                        className="border border-[#deedc0] rounded px-2 py-1.5 bg-white text-sm w-24 text-right" />
                    </td>
                    <td className="px-1 py-2 text-right font-semibold text-[#2d4a12]">{formatMXN(subtotal)}</td>
                    <td className="px-1 py-2">
                      <button onClick={() => removeLine(i)} data-testid={`remove-line-${i}`} className="text-red-600 hover:bg-red-50 p-1.5 rounded">
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
          <div className="text-base"><span className="text-[#4d5e42]">Total:</span> <span className="font-bold text-[#2d4a12] text-xl" data-testid="total-amount">{formatMXN(totals.amount)}</span></div>
        </div>
      </div>

      {/* Empty boxes movement */}
      <div className="card-surface p-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.empty_box_movement}
            onChange={(e) => setForm({ ...form, empty_box_movement: e.target.checked ? { type: "delivery", quantity: 0, ref: "" } : null })}
            data-testid="empty-box-toggle"
            className="w-4 h-4 accent-[#2d4a12]" />
          <span className="font-medium text-[#16210b]">Movimiento de cajas vacías</span>
        </label>
        {form.empty_box_movement && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <select value={form.empty_box_movement.type}
              onChange={(e) => setForm({ ...form, empty_box_movement: { ...form.empty_box_movement, type: e.target.value } })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm">
              <option value="delivery">Entrega al cliente</option>
              <option value="return">Devolución del cliente</option>
            </select>
            <input type="number" placeholder="Cantidad" value={form.empty_box_movement.quantity}
              onChange={(e) => setForm({ ...form, empty_box_movement: { ...form.empty_box_movement, quantity: Number(e.target.value) } })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            <input placeholder="Referencia" value={form.empty_box_movement.ref}
              onChange={(e) => setForm({ ...form, empty_box_movement: { ...form.empty_box_movement, ref: e.target.value } })}
              className="border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
          </div>
        )}
      </div>

      {/* Observations + Signature */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card-surface p-5">
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Observaciones</label>
          <textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })}
            rows={5} data-testid="remision-observations"
            className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
        </div>
        <div className="card-surface p-5">
          <label className="text-xs tracking-[0.2em] uppercase font-semibold text-[#4d5e42]">Firma de almacén</label>
          <div className="mt-2">
            <SignatureCanvas ref={sigRef} canvasProps={{ className: "sig-canvas", "data-testid": "signature-canvas" }} penColor="#2d4a12" />
          </div>
          <button onClick={clearSignature} className="mt-2 text-xs text-[#4d5e42] hover:text-[#2d4a12] flex items-center gap-1">
            <Eraser className="w-3 h-3" /> Limpiar firma
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button onClick={() => save("confirmed")} disabled={saving} data-testid="save-confirmed-button"
          className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-5 py-2.5 font-medium flex items-center gap-2 disabled:opacity-60">
          <Save className="w-4 h-4" /> Guardar remisión
        </button>
        <button onClick={() => save("draft")} disabled={saving} data-testid="save-draft-button"
          className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-5 py-2.5 font-medium flex items-center gap-2">
          <Save className="w-4 h-4" /> Guardar borrador
        </button>
        <button onClick={clearForm} data-testid="clear-form-button"
          className="bg-white border border-[#deedc0] text-[#4d5e42] hover:bg-[#f4f8ec] rounded-md px-5 py-2.5">
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
