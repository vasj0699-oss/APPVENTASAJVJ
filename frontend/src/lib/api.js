import axios from "axios";
import * as XLSX from "xlsx";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ajvj_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("ajvj_token");
      localStorage.removeItem("ajvj_user");
      if (!window.location.pathname.endsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;

export const formatMXN = (v) =>
  (Number(v) || 0).toLocaleString("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2,
  });

export const formatNum = (v, d = 2) =>
  (Number(v) || 0).toLocaleString("es-MX", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

export const formatDate = (s) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
  } catch { return s; }
};

export const MODULE_IDS = ["A", "B", "C", "D", "E", "F", "G", "PA", "TA", "TB"];

export const exportToExcel = (rows, sheetName, filename) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
};
