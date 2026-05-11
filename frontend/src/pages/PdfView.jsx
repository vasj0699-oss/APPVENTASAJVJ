import React, { useEffect, useRef, useState } from "react";
import api, { formatMXN, formatNum, formatDate } from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function PdfView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [rem, setRem] = useState(null);
  const [company, setCompany] = useState({});
  const [stats, setStats] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    api.get(`/remisiones/${id}`).then((r) => setRem(r.data));
    api.get("/company").then((r) => setCompany(r.data));
    api.get("/dashboard/stats").then((r) => setStats(r.data));
  }, [id]);

  const download = async () => {
    if (!ref.current) return;
    const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(img, "PNG", 0, 0, w, h);
    pdf.save(`remision-${rem.number || rem.id.slice(0, 6)}.pdf`);
  };

  if (!rem) return <div className="p-8">Cargando…</div>;
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
              <div style={{ fontSize: 9, marginTop: 4, opacity: 0.9 }}>Precio prom/kg — Jitomate: {formatMXN(avgJito)} · Pepino: {formatMXN(avgPepi)}</div>
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

          <table className="pdf-table">
            <thead>
              <tr>
                <th>Módulo</th><th>Cultivo</th><th>Calidad</th><th>Color</th><th>Tamaño</th>
                <th style={{ textAlign: "right" }}>Cajas</th>
                <th style={{ textAlign: "right" }}>Kg/caja</th>
                <th style={{ textAlign: "right" }}>Total kg</th>
                <th style={{ textAlign: "right" }}>$/caja</th>
                <th style={{ textAlign: "right" }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rem.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.module_id}</td><td>{l.crop}</td><td>{l.quality}</td><td>{l.color || "N/A"}</td><td>{l.size}</td>
                  <td style={{ textAlign: "right" }}>{l.boxes}</td>
                  <td style={{ textAlign: "right" }}>{l.kg_per_box}</td>
                  <td style={{ textAlign: "right" }}>{formatNum(l.boxes * l.kg_per_box)}</td>
                  <td style={{ textAlign: "right" }}>{formatMXN(l.price_per_box)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMXN(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pdf-totals">
            <div>Cajas: <strong>{rem.totals?.boxes}</strong></div>
            <div>Total kg: <strong>{formatNum(rem.totals?.total_kg || 0)}</strong></div>
            <div style={{ fontSize: 13 }}>IMPORTE TOTAL: <strong>{formatMXN(rem.totals?.total_amount || 0)}</strong></div>
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
      </div>
    </div>
  );
}

function SigBox({ label, sig, fallbackName }) {
  const name = sig?.name || fallbackName || "";
  return (
    <div className="pdf-sign-box" style={{ position: "relative" }}>
      {sig?.image && (
        <img src={sig.image} alt="firma" style={{ maxWidth: "100%", maxHeight: 60, objectFit: "contain", margin: "auto" }} />
      )}
      <div>
        {name && <div style={{ fontSize: 8, color: "#16210b", fontWeight: 600 }}>{name}</div>}
        <div>{label}</div>
      </div>
    </div>
  );
}
