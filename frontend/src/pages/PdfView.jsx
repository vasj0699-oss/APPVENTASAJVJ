import React, { useEffect, useRef, useState } from "react";
import api, { formatMXN, formatNum, formatDate } from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download, Save, Pencil, X } from "lucide-react";
import jsPDF from "jspdf";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

// ─── Orden de tamaños ────────────────────────────────────────────────
const SIZE_ORDER = ["XL", "L", "M", "S", "C", "O"];
const sizeIndex = (s) => { const i = SIZE_ORDER.indexOf(s); return i === -1 ? 99 : i; };

// ─── Lógica de agrupación ────────────────────────────────────────────
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

// ─── Componente principal ────────────────────────────────────────────
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

  // ─── Generación PDF con jsPDF ─────────────────────────────────────
  const download = () => {
    if (!rem) return;
    const grouped = groupLines(rem.lines || []);
    const avgJito = stats?.avg_per_crop?.Jitomate || 0;
    const avgPepi = stats?.avg_per_crop?.Pepino || 0;
    const sigs = rem.signatures || {};

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const ML = 10; // margin left
    const MR = 10; // margin right
    const MT = 10; // margin top pages 2+
    const MB = 10; // margin bottom
    const CW = W - ML - MR; // content width
    let y = 0;

    // ─── Colores ─────────────────────────────────────────────────────
    const C = {
      headerBg:    [75, 88, 40],
      headerText:  [255, 255, 255],
      headerSub:   [200, 220, 170],
      clientBg:    [250, 253, 245],
      transBg:     [244, 248, 236],
      border:      [222, 237, 192],
      tableBg:     [43, 74, 18],
      cultivoBg:   [192, 221, 151],
      cultivoText: [39, 80, 10],
      sectionBg:   [234, 243, 222],
      sectionText: [59, 109, 17],
      rowBg:       [255, 255, 255],
      rowLine:     [222, 237, 192],
      subtotalBg:  [212, 237, 170],
      subtotalText:[39, 80, 10],
      totalBg:     [151, 196, 89],
      totalText:   [23, 52, 4],
      grandBg:     [43, 74, 18],
      grandText:   [255, 255, 255],
      obsBg:       [244, 248, 236],
      obsText:     [77, 94, 66],
      textDark:    [22, 33, 11],
      textMid:     [77, 94, 66],
    };

    // ─── Helpers ─────────────────────────────────────────────────────
    const fr = (x, ry, w, h, color) => {
      pdf.setFillColor(...color);
      pdf.rect(x, ry, w, h, "F");
    };
    const dr = (x, ry, w, h, color) => {
      pdf.setDrawColor(...color);
      pdf.rect(x, ry, w, h, "S");
    };
    const line = (x1, y1, x2, y2, color = C.rowLine) => {
      pdf.setDrawColor(...color);
      pdf.line(x1, y1, x2, y2);
    };
    const txt = (str, x, ry, { size = 9, color = C.textDark, bold = false, align = "left", italic = false } = {}) => {
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      pdf.setFont("helvetica", bold ? "bold" : italic ? "italic" : "normal");
      pdf.text(String(str ?? ""), x, ry, { align });
    };

    // Columnas tabla
    const isC = isCapturista;
    const cols = {
      mod:   { x: ML,      w: 16 },
      cal:   { x: ML + 16, w: 22 },
      cajas: { x: ML + 38, w: 20 },
      kgc:   { x: ML + 58, w: 18 },
      tkg:   { x: ML + 76, w: 24 },
      prc:   { x: ML + 100, w: isC ? 0 : 24 },
      sub:   { x: ML + 124, w: isC ? 0 : 26 },
    };
    const tableW = isC ? 100 : 150;
    const tableRight = ML + tableW;

    // Verificar espacio / nueva página
    const needY = (needed, extra = 0) => {
      if (y + needed > H - MB - extra) {
        pdf.addPage();
        y = MT;
        return true;
      }
      return false;
    };

    // ─── CABECERA DOCUMENTO (solo página 1) ───────────────────────────
    const drawDocHeader = () => {
      fr(0, 0, W, 30, C.headerBg);
      txt(company.name || "AJVJ Hidropónicos", ML, 8, { size: 12, color: C.headerText, bold: true });
      txt(company.address || "—", ML, 13, { size: 8, color: C.headerSub });
      txt(`Tel: ${company.phone || "—"} · RFC: ${company.rfc || "—"}`, ML, 17, { size: 8, color: C.headerSub });
      if (!isC) txt(`Precio prom/kg — Jitomate: ${formatMXN(avgJito)} · Pepino: ${formatMXN(avgPepi)}`, ML, 21.5, { size: 8, color: C.headerSub });
      txt("REMISIÓN", W - MR, 8, { size: 14, color: C.headerText, bold: true, align: "right" });
      txt(rem.number || "BORRADOR", W - MR, 18, { size: 18, color: C.headerText, bold: true, align: "right" });
      txt(formatDate(rem.date), W - MR, 24, { size: 9, color: C.headerSub, align: "right" });
      y = 33;

      // Cliente
      fr(ML, y, CW, 18, C.clientBg);
      dr(ML, y, CW, 18, C.border);
      txt("CLIENTE", ML + 3, y + 5, { size: 7, color: C.textMid });
      txt(rem.client_name || "—", ML + 3, y + 10, { size: 11, color: C.textDark, bold: true });
      txt(`RFC: ${rem.client_rfc || "—"}`, ML + 3, y + 14, { size: 8, color: C.textMid });
      txt(rem.client_address || "—", ML + 3, y + 18, { size: 8, color: C.textMid });
      y += 22;

      // Transporte
      fr(ML, y, CW, 12, C.transBg);
      dr(ML, y, CW, 12, C.border);
      const c3 = CW / 3;
      txt("DESTINO", ML + 3, y + 4, { size: 7, color: C.textMid });
      txt(rem.destination || "—", ML + 3, y + 9.5, { size: 9, bold: true });
      txt("CHOFER", ML + c3 + 3, y + 4, { size: 7, color: C.textMid });
      txt(rem.driver_name || "—", ML + c3 + 3, y + 9.5, { size: 9, bold: true });
      txt("PLACAS", ML + c3 * 2 + 3, y + 4, { size: 7, color: C.textMid });
      txt(rem.license_plates || "—", ML + c3 * 2 + 3, y + 9.5, { size: 9, bold: true });
      y += 16;
    };

    // ─── CABECERA TABLA ───────────────────────────────────────────────
    const drawTableHeader = () => {
      fr(ML, y, tableW, 7, C.tableBg);
      txt("Módulo",   cols.mod.x + 2,  y + 5, { size: 8, color: C.headerText, bold: true });
      txt("Calidad",  cols.cal.x + 2,  y + 5, { size: 8, color: C.headerText, bold: true });
      txt("Cajas",    cols.cajas.x + cols.cajas.w - 2, y + 5, { size: 8, color: C.headerText, bold: true, align: "right" });
      txt("Kg/caja",  cols.kgc.x + cols.kgc.w - 2, y + 5, { size: 8, color: C.headerText, bold: true, align: "right" });
      txt("Total kg", cols.tkg.x + cols.tkg.w - 2, y + 5, { size: 8, color: C.headerText, bold: true, align: "right" });
      if (!isC) {
        txt("$/caja",   cols.prc.x + cols.prc.w - 2, y + 5, { size: 8, color: C.headerText, bold: true, align: "right" });
        txt("Subtotal", tableRight - 2, y + 5, { size: 8, color: C.headerText, bold: true, align: "right" });
      }
      y += 7;
    };

    // ─── CONTEXTO PARA REPETIR EN NUEVA PÁGINA ───────────────────────
    let ctxCultivo = null;
    let ctxColorSize = null;

    const redrawContextOnNewPage = () => {
      drawTableHeader();
      if (ctxCultivo) {
        fr(ML, y, tableW, 6, C.cultivoBg);
        txt(`↳ ${ctxCultivo.toUpperCase()} (continúa)`, ML + 3, y + 4.5, { size: 9, color: C.cultivoText, bold: true });
        y += 6;
      }
      if (ctxColorSize) {
        fr(ML, y, tableW, 5.5, C.sectionBg);
        txt(`  ↳ ${ctxColorSize} (continúa)`, ML + 8, y + 4, { size: 8.5, color: C.sectionText });
        y += 5.5;
      }
    };

    const checkSpace = (needed) => {
      if (needY(needed)) {
        redrawContextOnNewPage();
      }
    };

    // ─── DIBUJAR ENCABEZADO CULTIVO ───────────────────────────────────
    const drawCultivo = (cultivo) => {
      checkSpace(6);
      fr(ML, y, tableW, 6, C.cultivoBg);
      txt(cultivo.toUpperCase(), ML + 3, y + 4.5, { size: 10, color: C.cultivoText, bold: true });
      y += 6;
      ctxCultivo = cultivo;
      ctxColorSize = null;
    };

    // ─── DIBUJAR ENCABEZADO COLOR·TAMAÑO ─────────────────────────────
    const drawColorSize = (label) => {
      checkSpace(5.5);
      fr(ML, y, tableW, 5.5, C.sectionBg);
      txt(label, ML + 8, y + 4, { size: 8.5, color: C.sectionText });
      y += 5.5;
      ctxColorSize = label;
    };

    // ─── DIBUJAR FILA DE DATOS ────────────────────────────────────────
    const drawDataRow = (l) => {
      checkSpace(5.5);
      fr(ML, y, tableW, 5.5, C.rowBg);
      line(ML, y + 5.5, tableRight, y + 5.5);
      txt(l.module_id,                           cols.mod.x + 12,             y + 4, { size: 8 });
      txt(l.quality,                             cols.cal.x + 2,              y + 4, { size: 8 });
      txt(String(l.boxes),                       cols.cajas.x + cols.cajas.w - 2, y + 4, { size: 8, align: "right" });
      txt(String(l.kg_per_box),                  cols.kgc.x + cols.kgc.w - 2,    y + 4, { size: 8, align: "right" });
      txt(formatNum(l.boxes * l.kg_per_box),     cols.tkg.x + cols.tkg.w - 2,    y + 4, { size: 8, align: "right" });
      if (!isC) {
        txt(formatMXN(l.price_per_box),          cols.prc.x + cols.prc.w - 2, y + 4, { size: 8, align: "right" });
        txt(formatMXN(l.boxes * l.price_per_box),tableRight - 2,              y + 4, { size: 8, bold: true, align: "right" });
      }
      y += 5.5;
    };

    // ─── DIBUJAR SUBTOTAL ─────────────────────────────────────────────
    const drawSubtotal = (label, boxes, kg, amount) => {
      checkSpace(5.5);
      fr(ML, y, tableW, 5.5, C.subtotalBg);
      txt(label, ML + 8, y + 4, { size: 8, color: C.subtotalText, italic: true });
      txt(String(boxes), cols.cajas.x + cols.cajas.w - 2, y + 4, { size: 8, color: C.subtotalText, bold: true, align: "right" });
      txt(formatNum(kg), cols.tkg.x + cols.tkg.w - 2, y + 4, { size: 8, color: C.subtotalText, bold: true, align: "right" });
      if (!isC) txt(formatMXN(amount), tableRight - 2, y + 4, { size: 8, color: C.subtotalText, bold: true, align: "right" });
      y += 5.5;
    };

    // ─── DIBUJAR TOTAL CULTIVO ────────────────────────────────────────
    const drawCultivoTotal = (cultivo, boxes, kg, amount) => {
      checkSpace(7);
      fr(ML, y, tableW, 7, C.totalBg);
      txt(`Total ${cultivo}`, ML + 3, y + 5, { size: 9, color: C.totalText, bold: true });
      txt(String(boxes), cols.cajas.x + cols.cajas.w - 2, y + 5, { size: 9, color: C.totalText, bold: true, align: "right" });
      txt(formatNum(kg), cols.tkg.x + cols.tkg.w - 2, y + 5, { size: 9, color: C.totalText, bold: true, align: "right" });
      if (!isC) txt(formatMXN(amount), tableRight - 2, y + 5, { size: 9, color: C.totalText, bold: true, align: "right" });
      y += 7;
      ctxColorSize = null;
    };

    // ─── RENDERIZAR DOCUMENTO ─────────────────────────────────────────
    drawDocHeader();
    drawTableHeader();

    for (const cultivoGroup of grouped) {
      drawCultivo(cultivoGroup.cultivo);
      for (const colorGroup of cultivoGroup.colorGroups) {
        for (const sizeGroup of colorGroup.sizeGroups) {
          const label = `${colorGroup.color === "N/A" ? "—" : colorGroup.color} · ${sizeGroup.size}`;
          drawColorSize(label);
          for (const l of sizeGroup.lines) drawDataRow(l);
          drawSubtotal(`Subtotal ${label}`, sizeGroup.subtotalBoxes, sizeGroup.subtotalKg, sizeGroup.subtotalAmount);
        }
      }
      drawCultivoTotal(cultivoGroup.cultivo, cultivoGroup.cultivoBoxes, cultivoGroup.cultivoKg, cultivoGroup.cultivoAmount);
    }

    // ─── TOTALES GENERALES ────────────────────────────────────────────
    checkSpace(10);
    fr(ML, y, tableW, 10, C.grandBg);
    txt("Cajas:", ML + 3, y + 6.5, { size: 9, color: C.grandText });
    txt(String(rem.totals?.boxes || 0), ML + 18, y + 6.5, { size: 9, color: C.grandText, bold: true });
    txt("Total kg:", ML + tableW / 3, y + 6.5, { size: 9, color: C.grandText });
    txt(formatNum(rem.totals?.total_kg || 0), ML + tableW / 3 + 22, y + 6.5, { size: 9, color: C.grandText, bold: true });
    if (!isC) {
      txt("IMPORTE TOTAL:", ML + tableW * 2 / 3, y + 6.5, { size: 9, color: C.grandText });
      txt(formatMXN(rem.totals?.total_amount || 0), tableRight - 2, y + 6.5, { size: 10, color: C.grandText, bold: true, align: "right" });
    }
    y += 14;

    // ─── OBSERVACIONES ────────────────────────────────────────────────
    if (rem.observations) {
      checkSpace(10);
      fr(ML, y, tableW, 10, C.obsBg);
      txt(`Observaciones: ${rem.observations}`, ML + 3, y + 6.5, { size: 8, color: C.obsText, italic: true });
      y += 14;
    }

    // ─── FIRMAS ───────────────────────────────────────────────────────
    checkSpace(38);
    y += 6;
    const sigW = tableW / 3;
    const sigRows = [
      { key: "chofer",    label: "CHOFER",    fallback: rem.driver_name },
      { key: "almacen",   label: "ALMACÉN",   fallback: "" },
      { key: "estibador", label: "ESTIBADOR", fallback: "" },
    ];
    for (let i = 0; i < 3; i++) {
      const sx = ML + sigW * i;
      const { key, label, fallback } = sigRows[i];
      const sig = sigs[key];
      const sigName = sig?.name || fallback || "";
      if (sig?.image) {
        try { pdf.addImage(sig.image, "PNG", sx + 4, y, sigW - 8, 18, "", "FAST"); } catch (e) {}
      }
      pdf.setDrawColor(80, 80, 80);
      pdf.line(sx + 4, y + 20, sx + sigW - 4, y + 20);
      if (sigName) txt(sigName, sx + sigW / 2, y + 25, { size: 8, bold: true, align: "center" });
      txt(label, sx + sigW / 2, y + 30, { size: 8, color: C.textMid, align: "center" });
    }

    pdf.save(`remision-${rem.number || rem.id.slice(0, 6)}${isC ? "-comprobante" : ""}.pdf`);
  };

  if (!rem) return <div className="p-8">Cargando…</div>;
  const grouped = groupLines(rem.lines || []);
  const sigs = rem.signatures || {};

  return (
    <div className="bg-[#f4f8ec] min-h-screen p-4 md:p-8" data-testid="pdf-view-page">
      <div className="max-w-4xl mx-auto">

        {/* Botones */}
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

        {/* Vista previa en pantalla */}
        <div ref={ref} className="pdf-page shadow-lg mx-auto" data-testid="pdf-content">
          <div className="pdf-header">
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{company.name || "AJVJ Hidropónicos"}</div>
              <div style={{ fontSize: 9, marginTop: 4, opacity: 0.9 }}>{company.address || "—"}</div>
              <div style={{ fontSize: 9, opacity: 0.9 }}>Tel: {company.phone || "—"} · RFC: {company.rfc || "—"}</div>
              {!isCapturista && <div style={{ fontSize: 9, marginTop: 4, opacity: 0.9 }}>Precio prom/kg — Jitomate: {formatMXN(stats?.avg_per_crop?.Jitomate || 0)} · Pepino: {formatMXN(stats?.avg_per_crop?.Pepino || 0)}</div>}
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
                    <td colSpan={isCapturista ? 5 : 7} style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11, color: "#27500A" }}>{cultivoGroup.cultivo.toUpperCase()}</td>
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

        {/* Editor observaciones — solo admin */}
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
