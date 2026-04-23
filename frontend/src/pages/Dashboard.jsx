import React, { useEffect, useState } from "react";
import api, { formatMXN, formatNum } from "../lib/api";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { TrendingUp, Wallet, Package, Scale, FileText, DollarSign } from "lucide-react";

const COLORS_CROPS = { Jitomate: "#c2410c", Pepino: "#6a9e35" };
const QUALITY_COLORS = ["#2d4a12", "#6a9e35", "#8fc050"];
const MODULE_COLORS = ["#2d4a12", "#3d6518", "#4d7a20", "#6a9e35", "#8fc050", "#a8cf70", "#c0d994", "#deedc0", "#3d6518", "#4d7a20"];

const MONTH_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function Kpi({ label, value, sub, icon: Icon, color = "#2d4a12", testid }) {
  return (
    <div className="kpi-card" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div className="kpi-label">{label}</div>
        {Icon && (
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: `${color}18`, color }}>
            <Icon className="w-4 h-4" strokeWidth={1.8} />
          </div>
        )}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/stats")
      .then((r) => setStats(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[#4d5e42]">Cargando…</div>;
  if (!stats) return <div>Error al cargar</div>;

  const monthlyData = (() => {
    const now = new Date();
    const arr = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      arr.push({ month: MONTH_ES[d.getMonth()], value: stats.monthly[key] || 0 });
    }
    return arr;
  })();

  const cropData = Object.entries(stats.by_crop).map(([k, v]) => ({ name: k, value: v.amount }));
  const qualityData = Object.entries(stats.by_quality_kg).map(([k, v]) => ({ name: k, value: v }));
  const moduleData = Object.entries(stats.by_module_amount).map(([k, v]) => ({ module: k, value: v }));
  const sizeData = Object.entries(stats.by_size_kg).map(([k, v]) => ({ size: k, kg: v }));

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-3xl md:text-4xl tracking-tight font-semibold text-[#16210b]">Dashboard</h1>
        <p className="section-sub">Resumen de operaciones y producción</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi testid="kpi-revenue" label="Ingresos" value={formatMXN(stats.total_amount)} icon={DollarSign} sub={`${stats.num_remisiones} remisiones`} />
        <Kpi testid="kpi-outstanding" label="Saldo pendiente" value={formatMXN(stats.outstanding)} icon={Wallet} color="#c2410c" sub={`Pagado ${formatMXN(stats.total_paid)}`} />
        <Kpi testid="kpi-kg" label="Kg totales" value={formatNum(stats.total_kg, 0)} icon={Scale} color="#4d7a20" sub={`${stats.total_boxes} cajas`} />
        <Kpi testid="kpi-avg-box" label="$/caja prom" value={formatMXN(stats.avg_price_per_box)} icon={Package} color="#6a9e35" />
        <Kpi testid="kpi-avg-jito" label="$/kg Jitomate" value={formatMXN(stats.avg_per_crop.Jitomate || 0)} icon={TrendingUp} color="#c2410c" />
        <Kpi testid="kpi-avg-pepi" label="$/kg Pepino" value={formatMXN(stats.avg_per_crop.Pepino || 0)} icon={TrendingUp} color="#6a9e35" />
      </div>

      {/* Row 1: Monthly + Crop donut */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        <div className="card-surface p-5 lg:col-span-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-[#16210b]">Ingresos mensuales</h3>
              <p className="text-xs text-[#4d5e42]">Últimos 12 meses</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#deedc0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#4d5e42" }} />
              <YAxis tick={{ fontSize: 11, fill: "#4d5e42" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatMXN(v)} contentStyle={{ background: "#fff", border: "1px solid #deedc0", borderRadius: 8 }} />
              <Bar dataKey="value" fill="#4d7a20" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-surface p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold text-[#16210b] mb-1">Ingresos por cultivo</h3>
          <p className="text-xs text-[#4d5e42] mb-3">Distribución</p>
          {cropData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={cropData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {cropData.map((d, i) => <Cell key={i} fill={COLORS_CROPS[d.name]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatMXN(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-sm text-[#4d5e42]">Sin datos aún</div>
          )}
        </div>
      </div>

      {/* Row 2: Quality + Module + Size */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        <div className="card-surface p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold text-[#16210b] mb-3">Kg por calidad</h3>
          {qualityData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={qualityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80}>
                  {qualityData.map((d, i) => <Cell key={i} fill={QUALITY_COLORS[i % 3]} />)}
                </Pie>
                <Tooltip formatter={(v) => `${formatNum(v, 0)} kg`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-52 flex items-center justify-center text-sm text-[#4d5e42]">Sin datos</div>}
        </div>

        <div className="card-surface p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold text-[#16210b] mb-3">Ingresos por módulo</h3>
          {moduleData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={moduleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#deedc0" />
                <XAxis dataKey="module" tick={{ fontSize: 11, fill: "#4d5e42" }} />
                <YAxis tick={{ fontSize: 10, fill: "#4d5e42" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatMXN(v)} />
                <Bar dataKey="value" fill="#2d4a12" radius={[4, 4, 0, 0]}>
                  {moduleData.map((d, i) => <Cell key={i} fill={MODULE_COLORS[i % MODULE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-52 flex items-center justify-center text-sm text-[#4d5e42]">Sin datos</div>}
        </div>

        <div className="card-surface p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold text-[#16210b] mb-3">Kg por tamaño</h3>
          {sizeData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sizeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#deedc0" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#4d5e42" }} />
                <YAxis dataKey="size" type="category" tick={{ fontSize: 11, fill: "#4d5e42" }} width={40} />
                <Tooltip formatter={(v) => `${formatNum(v, 0)} kg`} />
                <Bar dataKey="kg" fill="#6a9e35" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-52 flex items-center justify-center text-sm text-[#4d5e42]">Sin datos</div>}
        </div>
      </div>

      {/* Top clients */}
      <div className="card-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#16210b]">Top 5 clientes</h3>
          <span className="text-xs text-[#4d5e42]">Por ingresos</span>
        </div>
        {stats.top_clients.length === 0 && (
          <div className="py-8 text-center text-sm text-[#4d5e42]">Aún no hay remisiones confirmadas</div>
        )}
        <div className="space-y-3">
          {stats.top_clients.map((c, i) => (
            <div key={i} data-testid={`top-client-${i}`}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-[#16210b]">{i + 1}. {c.name}</span>
                <span className="text-[#4d5e42]">{formatMXN(c.amount)} · {c.percent.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-[#deedc0] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#2d4a12] to-[#8fc050]" style={{ width: `${Math.min(c.percent, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
