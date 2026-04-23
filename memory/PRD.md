# AJVJ Hidropónicos — Sistema de Remisiones (PRD)

## Problema original
Full-stack agricultural production management web app for **AJVJ Hidropónicos SPR de RI de CV** — a hydroponic farm in Mexico that grows **jitomate** (tomato) and **pepino** (cucumber). The app manages delivery notes (remisiones), clients with fiscal data + payments + empty box tracking, production modules with cycles and yield metrics, and generates branded PDF remisiones.

## User choices (2026-02-24)
- **Auth**: Email/password JWT with 2 roles — `admin` (full) and `operador` (only create/edit remisiones)
- **PDF**: Real PDF via `jsPDF` + `html2canvas`
- **Modules**: 10 modules pre-seeded empty (A, B, C, D, E, F, G, PA, TA, TB)
- **Company**: Blank initial data, configured via Configuración tab
- **Remisión numbering**: Year-prefixed (e.g. `2026-0001`)
- **Initial admin**: `admin@ajvj.mx` / `admin123`

## Personas
1. **Administrador** — manages users, company config, modules, clients, deletes remisiones, sees dashboard
2. **Operador** — creates/edits remisiones, views historial, reads clients + modules + dashboard

## Core requirements (static)
- Brand: dark olive green `#2d4a12` + cream `#f4f8ec` palette, Work Sans + IBM Plex Sans
- MXN currency formatting, es-MX date formatting
- Mobile-friendly responsive layout
- Auto-sequential remisión numbers with year prefix
- Auto totals calculation (boxes, kg, amount) per line and in totals row
- Digital signature canvas for warehouse sign (saved as base64)
- PDF export with dark-green gradient header, client/transport/products boxes, totals bar, 3 signature areas
- Color field only for Jitomate; sizes differ per crop (XL/L/M/S/C jitomate; XL/L/C pepino)
- Max 2 production cycles per module, non-overlapping
- Credit balance: facturado − pagado; empty box balance from movements

## Completed — 2026-02-24 (MVP v1)
### Backend (FastAPI + MongoDB)
- JWT auth with `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`
- Admin seed on startup (admin@ajvj.mx)
- Modules seeded (10) + company doc init
- CRUD: `/api/users` (admin), `/api/company`, `/api/modules`, `/api/clients`, `/api/remisiones`
- Payments + empty box returns endpoints per client
- Year-prefix auto numbering via `counters` collection
- Dashboard aggregates at `/api/dashboard/stats`
- Per-module stats with yield metrics at `/api/modules/stats`
- Role-based access enforced (admin vs operador) — 100% backend tests pass (24/24)

### Frontend (React + Tailwind + Recharts)
- Login page (split layout with greenhouse imagery)
- AppShell with sidebar nav + mobile bottom nav + header + logout
- Dashboard: 6 KPI cards + monthly revenue bar + crop donut + quality/module/size charts + top 5 clients progress bars
- Nueva Remisión: client autocomplete, destino, chofer/placas, dynamic line-items table, empty box movement, signature canvas (react-signature-canvas), local-draft banner, save confirmed/draft, "Ver PDF" action
- Historial: filters (number, client, crop, quality, module, date range, drafts-only), rich remisión cards with inline lines table, Ver PDF / Eliminar (admin), Editar (drafts)
- Por Módulo: cycle editor (admin only), stats grid per module with yield (kg/m², cajas/m², kg/planta)
- Clientes: constancia-fiscal text parser, CRUD form, per-client KPI row (facturado/pagado/saldo/crédito/cajas), expandable detail with remisiones list + pagos + devoluciones
- Configuración (admin): company form + modules editor
- Usuarios (admin): create/delete users with role selection
- PDF view: branded page with dark-green gradient header, html2canvas + jsPDF download, print support

## Backlog (prioritized)
### P1
- [ ] Global search across remisiones/clientes
- [ ] Export Excel/CSV of historial
- [ ] Recover saved draft when editing an existing draft remisión (preserve signature restore)
- [ ] Password change endpoint + UI for users

### P2
- [ ] Brute-force lockout on login (5-fail, 15-min)
- [ ] Audit log of changes
- [ ] Bulk import of clients (CSV)
- [ ] Email remisión as PDF attachment

### Nice-to-have
- [ ] Mobile-first PWA / offline drafts
- [ ] Multi-organization support
- [ ] Charts: weekly yield trend, price/kg evolution

## Test credentials
See `/app/memory/test_credentials.md`
