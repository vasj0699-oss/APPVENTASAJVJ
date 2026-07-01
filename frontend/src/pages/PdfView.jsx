import React, { useEffect, useRef, useState } from "react";
import api, { formatMXN, formatNum, formatDate } from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download, Save, Pencil, X } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

const SIZE_ORDER = ["XL", "L", "M", "S", "C", "O"];
const sizeIndex = (s) => { const i = SIZE_ORDER.indexOf(s); return i === -1 ? 99 : i; };

function groupLines(lines) {
  const byCultivo = {};
  for (const l of lines) {
    const cultivo = l.crop || "—";
    const color = l.color || "N/A";
    const size = l.size || "—";
    if (!byCultivo[cultivo]) byCultivo[cultivo] = {};
    if (!byCultivo[cultivo][color]) byCultivo[cultivo][color] = {};
    if (!byCultivo[cultivo][color][size]) byCultivo[cultivo][color][size] = [];
    byCultivo[cultivo][color][size].push(l);
  }
  const cultivosSorted = Object.keys(byCultivo).sort();
  return cultivosSorted.map((cultivo) => {
    const colorMap = byCultivo[cultivo];
    const colorsSorted = Object.keys(colorMap).sort();
    const colorGroups = colorsSorted.map((color) => {
      const sizeMap = colorMap[color];
      const sizesSorted = Object.keys(sizeMap).sort((a, b) => sizeIndex(a) - sizeIndex(b));
      const sizeGroups = sizesSorted.map((size) => {
        const rawLines = sizeMap[size];
        const sorted = [...rawLines].sort((a, b) => {
          if (a.quality === "1ra" && b.quality !== "1ra") return -1;
          if (a.quality !== "1ra" && b.quality === "1ra") return 1;
          return (a.quality || "").localeCompare(b.quality || "");
        });
        const subtotalBoxes = sorted.reduce((s, l) => s + (Number(l.boxes) || 0), 0);
        const subtotalKg = sorted.reduce((s, l) => s + (Number(l.boxes) || 0) * (Number(l.kg_per_box) || 0), 0);
        const subtotalAmount = sorted.reduce((s, l) => s + (Number(l.boxes) || 0) * (Number(l.price_per_box) || 0), 0);
        return { size, lines: sorted, subtotalBoxes, subtotalKg, subtotalAmount };
      });
      const colorBoxes = sizeGroups.reduce((s, g) => s + g.subtotalBoxes, 0);
      const colorKg = sizeGroups.reduce((s, g) => s + g.subtotalKg, 0);
      const colorAmount = sizeGroups.reduce((s, g) => s + g.subtotalAmount, 0);
      return { color, sizeGroups, colorBoxes, colorKg, colorAmount };
    });
    const cultivoBoxes = colorGroups.reduce((s, g) => s + g.colorBoxes, 0);
    const cultivoKg = colorGroups.reduce((s, g) => s + g.colorKg, 0);
    const cultivoAmount = colorGroups.reduce((s, g) => s + g.colorAmount, 0);
    return { cultivo, colorGroups, cultivoBoxes, cultivoKg, cultivoAmount };
  });
}

export default function PdfView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isCapturista = user?.role === "capturista";
  const isAdmin = user?.role === "admin";
  const [rem, setRem] = useState(null);
  const [company, setCompany] = useState({});
  const [stats, setStats] = useState(null);
  const [editingObs, setEditingObs] = useState(false);
  const [obsValue, setObsValue] = useState("");
  const [savingObs, setSavingObs] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    api.get(`/remisiones/${id}`).then((r) => { setRem(r.data); setObsValue(r.data.observations || ""); });
    api.get("/company").then((r) => setCompany(r.data));
    if (!isCapturista) { api.get("/dashboard/stats").then((r) => setStats(r.data)); }
  }, [id, isCapturista]);

  const saveObservations = async () => {
    setSavingObs(true);
    try {
      const updated = { ...rem, observations: obsValue };
      await api.put(`/remisiones/${id}`, updated);
      setRem(updated);
      setEditingObs(false);
      toast.success("Observaciones actualizadas");
    } catch { toast.error("Error al guardar observaciones"); }
    finally { setSavingObs(false); }
  };

  const download = async () => {
    if (!ref.current) return;
    const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(img, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(img, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(`remision-${rem.number || rem.id.slice(0, 6)}${isCapturista ? "-comprobante" : ""}.pdf`);
  };

  if (!rem) return <div className="p-8">Cargando…</div>;
  const grouped = groupLines(rem.lines || []);
  const avgJito = stats?.avg_per_crop?.Jitomate || 0;
  const avgPepi = stats?.avg_per_crop?.Pepino || 0;
  const sigs = rem.signatures || {};

  return (
    <div className="bg-[#f4f8ec] min-h-screen p-4 md:p-8" data-testid="pdf-view-page">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between mb-4 flex-wrap gap-3">
          <button onClick={() => nav(-1)} className="bg-white border border-[#deedc0] text-[#2d4a12] hover:bg-[#deedc0] rounded-md px-4 py-2 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="bg-white border border-[#2d4a12] text-[#2d4a12] hover:bg-[#2d4a12] hover:text-white rounded-md px-4 py-2 flex items-center gap-2">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button onClick={download} data-testid="download-pdf-button" className="bg-[#2d4a12] text-white hover:bg-[#3d6518] rounded-md px-4 py-2 flex items-center gap-2">
              <Download className="w-4 h-4" /> Descargar PDF
            </button>
          </div>
        </div>

        <div ref={ref} className="pdf-page shadow-lg mx-auto" data-testid="pdf-content">
          <div className="pdf-header">
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{company.name || "AJVJ Hidropónicos"}</div>
              <div style={{ fontSize: 9, marginTop: 4, opacity: 0.9 }}>{company.address || "—"}</div>
              <div style={{ fontSize: 9, opacity: 0.9 }}>Tel: {company.phone || "—"} · RFC: {company.rfc || "—"}</div>
              {!isCapturista && <div style={{ fontSize: 9, marginTop: 4, opacity: 0.9 }}>Precio prom/kg — Jitomate: {formatMXN(avgJito)} · Pepino: {formatMXN(avgPepi)}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>REMISIÓN</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{rem.number || "BORRADOR"}</div>
              <div style={{ fontSize: 10, marginTop: 4 }}>{formatDate(rem.date)}</div>
              {rem.folio_cliente && <div style={{ fontSize: 9, marginTop: 4, opacity: 0.9 }}>Folio cliente: {rem.folio_cliente}</div>}
            </div>
          </div>

          <div className="pdf-section client">
            <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 2, color: "#4d5e42" }}>Cliente</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#16210b", marginTop: 2 }}>{rem.client_name}</div>
            <div style={{ fontSize: 9, color: "#4d5e42" }}>RFC: {rem.client_rfc || "—"}</div>
            <div style={{ fontSize: 9, color: "#4d5e42" }}>{rem.client_address || "—"}</div>
          </div>

          <div className="pdf-section transport">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 10 }}>
              <div><div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 2, color: "#4d5e42" }}>Destino</div><div style={{ fontWeight: 600 }}>{rem.destination || "—"}</div></div>
              <div><div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 2, color: "#4d5e42" }}>Chofer</div><div style={{ fontWeight: 600 }}>{rem.driver_name || "—"}</div></div>
              <div><div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 2, color: "#4d5e42" }}>Placas</div><div style={{ fontWeight: 600 }}>{rem.license_plates || "—"}</div></div>
            </div>
          </div>

          <table className="pdf-table" style={{ fontSize: 10 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Módulo</th>
                <th style={{ textAlign: "left" }}>Calidad</th>
                <th style={{ textAlign: "right" }}>Cajas</th>
                <th style={{ textAlign: "right" }}>Kg/caja</th>
                <th style={{ textAlign: "right" }}>Total kg</th>
                {!isCapturista && <><th style={{ textAlign: "right" }}>$/caja</th><th style={{ textAlign: "right" }}>Subtotal</th></>}
              </tr>
            </thead>
            <tbody>
              {grouped.map((cultivoGroup) => (
                <React.Fragment key={cultivoGroup.cultivo}>
                  <tr style={{ background: "#C0DD97" }}>
                    <td colSpan={isCapturista ? 5 : 7} style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11, color: "#27500A", letterSpacing: "0.03em" }}>
                      {cultivoGroup.cultivo.toUpperCase()}
                    </td>
                  </tr>
                  {cultivoGroup.colorGroups.map((colorGroup) =>
                    colorGroup.sizeGroups.map((sizeGroup) => (
                      <React.Fragment key={`${colorGroup.color}-${sizeGroup.size}`}>
                        <tr style={{ background: "#EAF3DE", borderTop: "0.5px solid #C0DD97" }}>
                          <td colSpan={isCapturista ? 5 : 7} style={{ padding: "4px 8px 4px 14px", fontSize: 10, color: "#3B6D11", fontWeight: 500 }}>
                            {colorGroup.color === "N/A" ? "—" : colorGroup.color} · {sizeGroup.size}
                          </td>
                        </tr>
                        {sizeGroup.lines.map((l, li) => (
                          <tr key={li} style={{ borderTop: "0.5px solid #deedc0" }}>
                            <td style={{ paddingLeft: 20 }}>{l.module_id}</td>
                            <td>{l.quality}</td>
                            <td style={{ textAlign: "right" }}>{l.boxes}</td>
                            <td style={{ textAlign: "right" }}>{l.kg_per_box}</td>
                            <td style={{ textAlign: "right" }}>{formatNum(l.boxes * l.kg_per_box)}</td>
                            {!isCapturista && <><td style={{ textAlign: "right" }}>{formatMXN(l.price_per_box)}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{formatMXN(l.boxes * l.price_per_box)}</td></>}
                          </tr>
                        ))}
                        <tr style={{ background: "#d4edaa", borderTop: "0.5px solid #b8d980" }}>
                          <td colSpan={2} style={{ padding: "3px 8px 3px 14px", fontSize: 9, color: "#27500A", fontStyle: "italic" }}>
                            Subtotal {colorGroup.color === "N/A" ? "—" : colorGroup.color} · {sizeGroup.size}
                          </td>
                          <td style={{ textAlign: "right", color: "#27500A", fontWeight: 600, fontSize: 9 }}>{sizeGroup.subtotalBoxes}</td>
                          <td />
                          <td style={{ textAlign: "right", color: "#27500A", fontWeight: 600, fontSize: 9 }}>{formatNum(sizeGroup.subtotalKg)}</td>
                          {!isCapturista && <><td /><td style={{ textAlign: "right", color: "#27500A", fontWeight: 600, fontSize: 9 }}>{formatMXN(sizeGroup.subtotalAmount)}</td></>}
                        </tr>
                      </React.Fragment>
                    ))
                  )}
                  <tr style={{ background: "#97C459", borderTop: "0.5px solid #639922" }}>
                    <td colSpan={2} style={{ padding: "5px 8px", fontSize: 10, color: "#173404", fontWeight: 600 }}>Total {cultivoGroup.cultivo}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "#173404", fontSize: 10 }}>{cultivoGroup.cultivoBoxes}</td>
                    <td />
                    <td style={{ textAlign: "right", fontWeight: 600, color: "#173404", fontSize: 10 }}>{formatNum(cultivoGroup.cultivoKg)}</td>
                    {!isCapturista && <><td /><td style={{ textAlign: "right", fontWeight: 600, color: "#173404", fontSize: 10 }}>{formatMXN(cultivoGroup.cultivoAmount)}</td></>}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>

          <div className="pdf-totals">
            <div>Cajas: <strong>{rem.totals?.boxes}</strong></div>
            <div>Total kg: <strong>{formatNum(rem.totals?.total_kg || 0)}</strong></div>
            {!isCapturista && <div style={{ fontSize: 13 }}>IMPORTE TOTAL: <strong>{formatMXN(rem.totals?.total_amount || 0)}</strong></div>}
          </div>

          {rem.observations && (
            <div style={{ marginTop: 12, fontSize: 9, fontStyle: "italic", color: "#4d5e42", padding: "8px 12px", background: "#f4f8ec", borderRadius: 6 }}>
              <strong>Observaciones:</strong> {rem.observations}
            </div>
          )}

          <div className="pdf-signatures">
            <SigBox label="CHOFER" sig={sigs.chofer} fallbackName={rem.driver_name} />
            <SigBox label="ALMACÉN" sig={sigs.almacen} />
            <SigBox label="ESTIBADOR" sig={sigs.estibador} />
          </div>
        </div>

        {isAdmin && (
          <div className="mt-4 card-surface p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#2d4a12]">Observaciones</span>
              {!editingObs ? (
                <button onClick={() => setEditingObs(true)} className="flex items-center gap-1 text-xs text-[#2d4a12] hover:bg-[#deedc0] px-2 py-1 rounded">
                  <Pencil className="w-3 h-3" /> Editar
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={saveObservations} disabled={savingObs} className="flex items-center gap-1 text-xs bg-[#2d4a12] text-white px-2 py-1 rounded disabled:opacity-60">
                    <Save className="w-3 h-3" /> {savingObs ? "Guardando…" : "Guardar"}
                  </button>
                  <button onClick={() => { setEditingObs(false); setObsValue(rem.observations || ""); }} className="flex items-center gap-1 text-xs border border-[#deedc0] text-[#4d5e42] px-2 py-1 rounded">
                    <X className="w-3 h-3" /> Cancelar
                  </button>
                </div>
              )}
            </div>
            {editingObs ? (
              <textarea value={obsValue} onChange={(e) => setObsValue(e.target.value)} rows={3} className="w-full border border-[#deedc0] rounded-md bg-white px-3 py-2 text-sm" placeholder="Escribe las observaciones aquí…" />
            ) : (
              <p className="text-sm text-[#4d5e42]">{rem.observations || <span className="italic opacity-60">Sin observaciones</span>}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SigBox({ label, sig, fallbackName }) {
  const name = sig?.name || fallbackName || "";
  return (
    <div className="pdf-sign-box" style={{ position: "relative" }}>
      {sig?.image && <img src={sig.image} alt="firma" style={{ maxWidth: "100%", maxHeight: 60, objectFit: "contain", margin: "auto" }} />}
      <div>
        {name && <div style={{ fontSize: 8, color: "#16210b", fontWeight: 600 }}>{name}</div>}
        <div>{label}</div>
      </div>
    </div>
  );
}
