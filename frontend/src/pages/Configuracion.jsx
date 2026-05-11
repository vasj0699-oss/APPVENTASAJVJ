import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { Save, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { id: "empresa", label: "Empresa" },
  { id: "catalogos", label: "Catálogos de cultivos" },
  { id: "firmantes", label: "Firmantes" },
  { id: "modulos", label: "Módulos" },
];

export default function Configuracion() {
  const [tab, setTab] = useState("empresa");
  const [company, setCompany] = useState({ name: "", rfc: "", address: "", phone: "", logo_url: "" });
  const [modules, setModules] = useState([]);
  const [crops, setCrops] = useState([]);
  const [signers, setSigners] = useState({ almacen: [], estibador: [] });
  const [newCrop, setNewCrop] = useState("");
  const [newAlmacen, setNewAlmacen] = useState("");
  const [newEstibador, setNewEstibador] = useState("");

  const load = () => {
    api.get("/company").then((r) => setCompany(r.data));
    api.get("/modules").then((r) => setModules(r.data));
    api.get("/catalog/crops").then((r) => setCrops(r.data));
    api.get("/signer_names").then((r) => setSigners({ almacen: r.data.almacen || [], estibador: r.data.estibador || [] }));
  };
  useEffect(load, []);

  const saveCompany = async () => {
    try { await api.put("/company", company); toast.success("Empresa guardada"); }
    catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };

  const updateMod = (i, key, value) => {
    const arr = [...modules]; arr[i] = { ...arr[i], [key]: value }; setModules(arr);
  };
  const saveModule = async (m) => {
    try { await api.put(`/modules/${m.id}`, m); toast.success(`Módulo ${m.id} guardado`); }
    catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };

  const addCrop = async () => {
    if (!newCrop.trim()) return;
    try {
      await api.post("/catalog/crops", {
        name: newCrop.trim(), qualities: ["1ra"], colors: [], sizes: ["L"], has_color: false,
      });
      toast.success("Cultivo agregado");
      setNewCrop("");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };
  const saveCrop = async (c) => {
    try { await api.put(`/catalog/crops/${c.id}`, c); toast.success(`Catálogo ${c.id} guardado`); }
    catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };
  const delCrop = async (c) => {
    if (!window.confirm(`¿Eliminar cultivo "${c.id}"?`)) return;
    try { await api.delete(`/catalog/crops/${c.id}`); toast.success("Eliminado"); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };
  const updateCropField = (idx, key, value) => {
    const arr = [...crops]; arr[idx] = { ...arr[idx], [key]: value }; setCrops(arr);
  };
  const addCropItem = (idx, key, value) => {
    if (!value.trim()) return;
    const arr = [...crops];
    arr[idx][key] = [...(arr[idx][key] || []), value.trim()];
    setCrops(arr);
  };
  const removeCropItem = (idx, key, i) => {
    const arr = [...crops];
    arr[idx][key] = arr[idx][key].filter((_, j) => j !== i);
    setCrops(arr);
  };

  const saveSigners = async () => {
    try { await api.put("/signer_names", signers); toast.success("Firmantes guardados"); }
    catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };

  return (
    <div className="space-y-6" data-testid="config-page">
      <div>
        <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Configuración</h1>
        <p className="section-sub">Empresa, catálogos y firmantes</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#deedc0]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            data-testid={`config-tab-${t.id}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-[#2d4a12] text-[#2d4a12]" : "border-transparent text-[#4d5e42] hover:text-[#2d4a12]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "empresa" && (
        <div className="card-surface p-5">
          <h3 className="text-lg font-semibold text-[#16210b] mb-4">Datos de empresa</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Razón social</label>
              <input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })}
                data-testid="company-name-input" className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">RFC</label>
              <input value={company.rfc} onChange={(e) => setCompany({ ...company, rfc: e.target.value.toUpperCase() })}
                data-testid="company-rfc-input" className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Dirección</label>
              <input value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })}
                className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Teléfono</label>
              <input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                className="mt-1 w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
            </div>
          </div>
          <button onClick={saveCompany} data-testid="save-company-button"
            className="mt-4 bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
            <Save className="w-4 h-4" /> Guardar empresa
          </button>
        </div>
      )}

      {tab === "catalogos" && (
        <div className="space-y-4">
          <div className="card-surface p-5">
            <h3 className="text-lg font-semibold text-[#16210b] mb-3">Agregar nuevo cultivo</h3>
            <div className="flex gap-2">
              <input value={newCrop} onChange={(e) => setNewCrop(e.target.value)}
                placeholder="Ej: Pimiento, Lechuga…"
                data-testid="new-crop-input"
                className="flex-1 border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
              <button onClick={addCrop} data-testid="add-crop-button"
                className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Agregar
              </button>
            </div>
          </div>

          {crops.map((c, i) => (
            <div key={c.id} className="card-surface p-5" data-testid={`crop-card-${c.id}`}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-[#16210b]">{c.name}</h3>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={c.has_color}
                      onChange={(e) => updateCropField(i, "has_color", e.target.checked)}
                      className="accent-[#2d4a12]" />
                    Usa color
                  </label>
                  <button onClick={() => saveCrop(c)} data-testid={`save-crop-${c.id}`}
                    className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-3 py-1.5 text-sm flex items-center gap-1">
                    <Save className="w-3 h-3" /> Guardar
                  </button>
                  <button onClick={() => delCrop(c)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white rounded-md px-3 py-1.5 text-sm">
                    <Trash2 className="w-3 h-3 inline" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ChipList label="Calidades" items={c.qualities} onAdd={(v) => addCropItem(i, "qualities", v)} onRemove={(j) => removeCropItem(i, "qualities", j)} testid={`crop-${c.id}-qualities`} />
                {c.has_color && (
                  <ChipList label="Colores" items={c.colors} onAdd={(v) => addCropItem(i, "colors", v)} onRemove={(j) => removeCropItem(i, "colors", j)} testid={`crop-${c.id}-colors`} />
                )}
                <ChipList label="Tamaños" items={c.sizes} onAdd={(v) => addCropItem(i, "sizes", v)} onRemove={(j) => removeCropItem(i, "sizes", j)} testid={`crop-${c.id}-sizes`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "firmantes" && (
        <div className="card-surface p-5">
          <h3 className="text-lg font-semibold text-[#16210b] mb-3">Personas pre-guardadas</h3>
          <p className="text-xs text-[#4d5e42] mb-4">Aparecerán como sugerencias al llenar la remisión. También se permite escribir "Otro" libre.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Almacén</label>
              <div className="flex gap-2 mt-1">
                <input value={newAlmacen} onChange={(e) => setNewAlmacen(e.target.value)}
                  data-testid="signer-almacen-input"
                  placeholder="Nombre"
                  className="flex-1 border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
                <button onClick={() => { if (newAlmacen.trim()) { setSigners({ ...signers, almacen: [...signers.almacen, newAlmacen.trim()] }); setNewAlmacen(""); } }}
                  className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-2 text-sm">+ Agregar</button>
              </div>
              <div className="mt-2 space-y-1">
                {signers.almacen.map((n, j) => (
                  <div key={j} className="flex items-center justify-between bg-[#f4f8ec] rounded px-3 py-1.5 text-sm">
                    {n}
                    <button onClick={() => setSigners({ ...signers, almacen: signers.almacen.filter((_, k) => k !== j) })}><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">Estibador</label>
              <div className="flex gap-2 mt-1">
                <input value={newEstibador} onChange={(e) => setNewEstibador(e.target.value)}
                  data-testid="signer-estibador-input"
                  placeholder="Nombre"
                  className="flex-1 border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" />
                <button onClick={() => { if (newEstibador.trim()) { setSigners({ ...signers, estibador: [...signers.estibador, newEstibador.trim()] }); setNewEstibador(""); } }}
                  className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded-md px-3 py-2 text-sm">+ Agregar</button>
              </div>
              <div className="mt-2 space-y-1">
                {signers.estibador.map((n, j) => (
                  <div key={j} className="flex items-center justify-between bg-[#f4f8ec] rounded px-3 py-1.5 text-sm">
                    {n}
                    <button onClick={() => setSigners({ ...signers, estibador: signers.estibador.filter((_, k) => k !== j) })}><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button onClick={saveSigners} data-testid="save-signers-button"
            className="mt-4 bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
            <Save className="w-4 h-4" /> Guardar firmantes
          </button>
        </div>
      )}

      {tab === "modulos" && (
        <div className="card-surface p-5">
          <h3 className="text-lg font-semibold text-[#16210b] mb-3">Superficie y plantas por módulo</h3>
          <p className="text-xs text-[#4d5e42] mb-4">El cultivo y variedad se gestionan desde "Por Módulo" mediante ciclos.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f4f8ec]">
                  <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Módulo</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-[#4d5e42]">Superficie</th>
                  <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4d5e42]">Unidad</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-[#4d5e42]">Plantas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m, i) => (
                  <tr key={m.id} className="border-t border-[#deedc0]" data-testid={`module-row-${m.id}`}>
                    <td className="px-3 py-2 font-bold text-[#2d4a12]">{m.id}</td>
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
      )}
    </div>
  );
}

function ChipList({ label, items, onAdd, onRemove, testid }) {
  const [val, setVal] = useState("");
  return (
    <div>
      <label className="text-xs uppercase tracking-widest font-semibold text-[#4d5e42]">{label}</label>
      <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
        {(items || []).map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-[#deedc0] text-[#2d4a12] rounded-full px-2 py-1 text-xs">
            {it}
            <button onClick={() => onRemove(i)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input value={val} onChange={(e) => setVal(e.target.value)}
          data-testid={`${testid}-input`}
          onKeyDown={(e) => { if (e.key === "Enter") { onAdd(val); setVal(""); } }}
          className="flex-1 border border-[#deedc0] rounded px-2 py-1 bg-white text-xs" />
        <button onClick={() => { onAdd(val); setVal(""); }}
          className="bg-[#deedc0] text-[#2d4a12] hover:bg-[#8fc050] hover:text-white rounded px-2 text-xs">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
