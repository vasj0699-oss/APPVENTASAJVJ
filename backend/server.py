from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Any

# ─── DB ───────────────────────────────────────────────────────────────
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
MODULE_IDS = ["A", "B", "C", "D", "E", "F", "G", "PA", "TA", "TB"]

app = FastAPI(title="AJVJ Hidropónicos API")
api = APIRouter(prefix="/api")

# ─── Auth helpers ─────────────────────────────────────────────────────
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no existe")
    return user

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Requiere rol administrador")
    return user

# ─── Models ───────────────────────────────────────────────────────────
class LoginReq(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "capturista"] = "capturista"

class Company(BaseModel):
    name: str = ""
    rfc: str = ""
    address: str = ""
    phone: str = ""
    logo_url: str = ""

class SignerNames(BaseModel):
    almacen: List[str] = []
    estibador: List[str] = []

class Cycle(BaseModel):
    crop: str
    variety: str = ""
    start_date: str
    end_date: Optional[str] = None
    closed: bool = False

class ModuleCfg(BaseModel):
    id: str
    active_crop: Optional[str] = None
    surface_m2: float = 0
    surface_unit: str = "m2"
    plant_count: int = 0
    cycles: List[Cycle] = []

class CropCatalog(BaseModel):
    id: Optional[str] = None
    name: str
    qualities: List[str] = []
    colors: List[str] = []
    sizes: List[str] = []
    has_color: bool = True

class ClientModel(BaseModel):
    id: Optional[str] = None
    name: str
    rfc: str = ""
    fiscal_address: str = ""
    cp: str = ""
    phone: str = ""
    email: str = ""
    fiscal_regime: str = ""
    credit_limit: float = 0
    credit_days: int = 0
    payments: List[dict] = []

class PaymentIn(BaseModel):
    date: str
    amount: float
    ref: str = ""

class BoxMovementIn(BaseModel):
    client_id: str
    date: str
    type: Literal["ingreso", "egreso"]
    quantity: int
    ref: str = ""
    remision_id: Optional[str] = None

class SignatureBlock(BaseModel):
    name: str = ""
    image: str = ""

class RemisionLine(BaseModel):
    module_id: str
    crop: str
    quality: str
    color: Optional[str] = None
    size: str
    boxes: int
    kg_per_box: float = 19
    price_per_box: float = 0
    subtotal: float = 0

class RemisionIn(BaseModel):
    id: Optional[str] = None
    date: str
    status: Literal["draft", "confirmed"] = "confirmed"
    client_id: str
    client_name: str = ""
    client_rfc: str = ""
    client_address: str = ""
    destination: str = ""
    driver_name: str = ""
    license_plates: str = ""
    folio_cliente: str = ""
    observations: str = ""
    lines: List[RemisionLine]
    signatures: dict = {}

# ─── Startup ──────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("id", unique=True)
    await db.remisiones.create_index("id", unique=True)
    await db.modules.create_index("id", unique=True)
    await db.crop_catalog.create_index("id", unique=True)
    await db.box_movements.create_index("id", unique=True)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@ajvj.mx")
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email,
            "password_hash": hash_pw(admin_pw),
            "name": "Administrador", "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    for mid in MODULE_IDS:
        ex = await db.modules.find_one({"id": mid})
        if not ex:
            await db.modules.insert_one({
                "id": mid, "active_crop": None,
                "surface_m2": 0, "surface_unit": "m2",
                "plant_count": 0, "cycles": [],
            })

    c = await db.company.find_one({"id": "main"})
    if not c:
        await db.company.insert_one({
            "id": "main", "name": "", "rfc": "",
            "address": "", "phone": "", "logo_url": "",
        })

    s = await db.signer_names.find_one({"id": "main"})
    if not s:
        await db.signer_names.insert_one({
            "id": "main", "almacen": [], "estibador": [],
        })

    if not await db.crop_catalog.find_one({"id": "Jitomate"}):
        await db.crop_catalog.insert_one({
            "id": "Jitomate", "name": "Jitomate",
            "qualities": ["1ra", "Arrastre", "Papeles"],
            "colors": ["Verde", "Rayado", "Rojo"],
            "sizes": ["XL", "L", "M", "S", "C"],
            "has_color": True,
        })
    if not await db.crop_catalog.find_one({"id": "Pepino"}):
        await db.crop_catalog.insert_one({
            "id": "Pepino", "name": "Pepino",
            "qualities": ["1ra", "Arrastre", "Papeles"],
            "colors": [],
            "sizes": ["XL", "L", "C"],
            "has_color": False,
        })

# ─── Auth ─────────────────────────────────────────────────────────────
@api.post("/auth/login")
async def login(body: LoginReq):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = make_token(user["id"], user["email"], user["role"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout():
    return {"ok": True}

# ─── Users ────────────────────────────────────────────────────────────
@api.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)

@api.post("/users")
async def create_user(body: UserCreate, _: dict = Depends(require_admin)):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email ya registrado")
    uid = str(uuid.uuid4())
    await db.users.insert_one({
        "id": uid, "email": body.email.lower(),
        "password_hash": hash_pw(body.password),
        "name": body.name, "role": body.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": uid, "email": body.email.lower(), "name": body.name, "role": body.role}

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(400, "No puedes eliminarte a ti mismo")
    res = await db.users.delete_one({"id": user_id})
    if not res.deleted_count:
        raise HTTPException(404, "Usuario no encontrado")
    return {"ok": True}

# ─── Company & Signer names ───────────────────────────────────────────
@api.get("/company")
async def get_company(_: dict = Depends(get_current_user)):
    c = await db.company.find_one({"id": "main"}, {"_id": 0})
    return c or {"id": "main", "name": "", "rfc": "", "address": "", "phone": "", "logo_url": ""}

@api.put("/company")
async def update_company(body: Company, _: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = "main"
    await db.company.update_one({"id": "main"}, {"$set": doc}, upsert=True)
    return doc

@api.get("/signer_names")
async def get_signers(_: dict = Depends(get_current_user)):
    s = await db.signer_names.find_one({"id": "main"}, {"_id": 0})
    return s or {"id": "main", "almacen": [], "estibador": []}

@api.put("/signer_names")
async def update_signers(body: SignerNames, _: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = "main"
    await db.signer_names.update_one({"id": "main"}, {"$set": doc}, upsert=True)
    return doc

# ─── Crop catalog ─────────────────────────────────────────────────────
@api.get("/catalog/crops")
async def list_crops(_: dict = Depends(get_current_user)):
    return await db.crop_catalog.find({}, {"_id": 0}).to_list(100)

@api.post("/catalog/crops")
async def create_crop(body: CropCatalog, _: dict = Depends(require_admin)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nombre requerido")
    if await db.crop_catalog.find_one({"id": name}):
        raise HTTPException(400, "Cultivo ya existe")
    doc = body.model_dump()
    doc["id"] = name
    doc["name"] = name
    await db.crop_catalog.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/catalog/crops/{crop_id}")
async def update_crop(crop_id: str, body: CropCatalog, _: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = crop_id
    doc["name"] = crop_id
    await db.crop_catalog.update_one({"id": crop_id}, {"$set": doc}, upsert=True)
    return doc

@api.delete("/catalog/crops/{crop_id}")
async def delete_crop(crop_id: str, _: dict = Depends(require_admin)):
    used = await db.modules.find_one({"active_crop": crop_id})
    if used:
        raise HTTPException(400, "No se puede eliminar: cultivo en uso en algún módulo")
    await db.crop_catalog.delete_one({"id": crop_id})
    return {"ok": True}

# ─── Modules ──────────────────────────────────────────────────────────
@api.get("/modules")
async def list_modules(_: dict = Depends(get_current_user)):
    mods = await db.modules.find({}, {"_id": 0}).to_list(100)
    order = {m: i for i, m in enumerate(MODULE_IDS)}
    mods.sort(key=lambda x: order.get(x["id"], 999))
    return mods

@api.put("/modules/{mid}")
async def update_module(mid: str, body: ModuleCfg, _: dict = Depends(require_admin)):
    if mid not in MODULE_IDS:
        raise HTTPException(400, "Módulo inválido")
    doc = body.model_dump()
    doc["id"] = mid
    cycles = doc.get("cycles", [])
    if len(cycles) > 2:
        raise HTTPException(400, "Máximo 2 ciclos por módulo")
    if len(cycles) == 2 and all(c.get("end_date") for c in cycles):
        c1, c2 = cycles[0], cycles[1]
        if not (c1["end_date"] <= c2["start_date"] or c2["end_date"] <= c1["start_date"]):
            raise HTTPException(400, "Los ciclos no pueden traslaparse")
    open_cycles = [c for c in cycles if not c.get("closed")]
    if open_cycles:
        doc["active_crop"] = open_cycles[-1]["crop"]
    await db.modules.update_one({"id": mid}, {"$set": doc}, upsert=True)
    return doc

class CloseCycleReq(BaseModel):
    cycle_index: int
    end_date: str

@api.post("/modules/{mid}/close_cycle")
async def close_cycle(mid: str, body: CloseCycleReq, _: dict = Depends(require_admin)):
    m = await db.modules.find_one({"id": mid})
    if not m:
        raise HTTPException(404, "Módulo no encontrado")
    cycles = m.get("cycles", [])
    if body.cycle_index < 0 or body.cycle_index >= len(cycles):
        raise HTTPException(400, "Índice de ciclo inválido")
    cycles[body.cycle_index]["end_date"] = body.end_date
    cycles[body.cycle_index]["closed"] = True
    open_cycles = [c for c in cycles if not c.get("closed")]
    active_crop = open_cycles[-1]["crop"] if open_cycles else None
    await db.modules.update_one({"id": mid}, {"$set": {"cycles": cycles, "active_crop": active_crop}})
    return {"ok": True}

# ─── Clients ──────────────────────────────────────────────────────────
@api.get("/clients")
async def list_clients(_: dict = Depends(get_current_user)):
    return await db.clients.find({}, {"_id": 0}).to_list(1000)

@api.post("/clients")
async def create_client(body: ClientModel, _: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = doc.get("id") or str(uuid.uuid4())
    doc.setdefault("payments", [])
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/clients/{cid}")
async def update_client(cid: str, body: ClientModel, _: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = cid
    await db.clients.update_one({"id": cid}, {"$set": doc}, upsert=True)
    return doc

@api.delete("/clients/{cid}")
async def delete_client(cid: str, _: dict = Depends(require_admin)):
    await db.clients.delete_one({"id": cid})
    return {"ok": True}

@api.post("/clients/{cid}/payments")
async def add_payment(cid: str, body: PaymentIn, _: dict = Depends(require_admin)):
    p = body.model_dump()
    await db.clients.update_one({"id": cid}, {"$push": {"payments": p}})
    return p

# ─── Box movements ────────────────────────────────────────────────────
@api.get("/box_movements")
async def list_box_movements(client_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q = {}
    if client_id:
        q["client_id"] = client_id
    return await db.box_movements.find(q, {"_id": 0}).sort("date", -1).to_list(2000)

@api.post("/box_movements")
async def create_box_movement(body: BoxMovementIn, _: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.box_movements.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/box_movements/{mid}")
async def delete_box_movement(mid: str, _: dict = Depends(require_admin)):
    await db.box_movements.delete_one({"id": mid})
    return {"ok": True}

# ─── Remisiones ──────────────────────────────────────────────────────
def _compute_totals(lines):
    total_boxes = 0
    total_kg = 0.0
    total_amount = 0.0
    for ln in lines:
        ln["subtotal"] = round(ln["boxes"] * ln["price_per_box"], 2)
        total_boxes += ln["boxes"]
        total_kg += ln["boxes"] * ln["kg_per_box"]
        total_amount += ln["subtotal"]
    return {"boxes": total_boxes, "total_kg": round(total_kg, 2), "total_amount": round(total_amount, 2)}

async def _next_number() -> str:
    year = datetime.now(timezone.utc).year
    counter = await db.counters.find_one_and_update(
        {"id": f"remision_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    if not counter or "seq" not in counter:
        counter = await db.counters.find_one({"id": f"remision_{year}"})
    return f"{year}-{counter['seq']:04d}"

async def _auto_egreso_for_confirmed(rem_id: str, client_id: str, date: str, boxes: int):
    if boxes <= 0:
        return
    await db.box_movements.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "date": date,
        "type": "egreso",
        "quantity": boxes,
        "ref": f"Remisión {rem_id[:8]}",
        "remision_id": rem_id,
        "auto": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

@api.get("/remisiones")
async def list_remisiones(_: dict = Depends(get_current_user)):
    return await db.remisiones.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)

@api.get("/remisiones/{rid}")
async def get_remision(rid: str, _: dict = Depends(get_current_user)):
    r = await db.remisiones.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "No encontrada")
    return r

def _require_can_edit_remision(user, existing):
    if user["role"] == "admin":
        return
    if user["role"] == "capturista":
        if existing and existing.get("status") != "draft":
            raise HTTPException(403, "Solo se pueden editar borradores")
        return
    raise HTTPException(403, "Sin permiso")

@api.post("/remisiones")
async def create_remision(body: RemisionIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = doc.get("id") or str(uuid.uuid4())
    lines = doc["lines"]
    for ln in lines:
        ln["subtotal"] = round(ln["boxes"] * ln["price_per_box"], 2)
    doc["lines"] = lines
    doc["totals"] = _compute_totals(lines)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    doc["created_by"] = user["id"]
    doc["edit_history"] = []

    if doc["status"] == "confirmed":
        doc["number"] = await _next_number()
        await _auto_egreso_for_confirmed(doc["id"], doc["client_id"], doc["date"], doc["totals"]["boxes"])
    else:
        doc["number"] = None

    await db.remisiones.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/remisiones/{rid}")
async def update_remision(rid: str, body: RemisionIn, user: dict = Depends(get_current_user)):
    existing = await db.remisiones.find_one({"id": rid})
    if not existing:
        raise HTTPException(404, "No encontrada")
    _require_can_edit_remision(user, existing)
    if existing.get("status") == "cancelled":
        raise HTTPException(400, "No se puede editar una remisión cancelada")

    doc = body.model_dump()
    doc["id"] = rid
    lines = doc["lines"]
    for ln in lines:
        ln["subtotal"] = round(ln["boxes"] * ln["price_per_box"], 2)
    doc["totals"] = _compute_totals(lines)
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_at"] = existing.get("created_at", doc["updated_at"])
    doc["created_by"] = existing.get("created_by")
    doc["edit_history"] = existing.get("edit_history", [])

    was_confirmed = existing.get("status") == "confirmed"
    will_be_confirmed = doc["status"] == "confirmed"

    if existing.get("number"):
        doc["number"] = existing["number"]
    elif will_be_confirmed:
        doc["number"] = await _next_number()
    else:
        doc["number"] = None

    # ─── Registrar edición si ya estaba confirmada ────────────────────
    if was_confirmed:
        now = datetime.now(timezone.utc).isoformat()
        doc["edited_at"] = now
        doc["edited_by"] = user["id"]
        doc["edit_history"].append({
            "edited_at": now,
            "edited_by": user["id"],
            "edited_by_name": user.get("name", ""),
        })

    await db.remisiones.update_one({"id": rid}, {"$set": doc})

    # Si pasa de borrador a confirmada, crear egreso automático
    if not was_confirmed and will_be_confirmed:
        await _auto_egreso_for_confirmed(rid, doc["client_id"], doc["date"], doc["totals"]["boxes"])

    doc.pop("_id", None)
    return doc

@api.get("/remisiones/{rid}/edit_history")
async def get_edit_history(rid: str, _: dict = Depends(require_admin)):
    r = await db.remisiones.find_one({"id": rid}, {"_id": 0, "edit_history": 1})
    if not r:
        raise HTTPException(404, "No encontrada")
    return r.get("edit_history", [])

@api.post("/remisiones/{rid}/cancel")
async def cancel_remision(rid: str, _: dict = Depends(require_admin)):
    existing = await db.remisiones.find_one({"id": rid})
    if not existing:
        raise HTTPException(404, "No encontrada")
    await db.remisiones.update_one(
        {"id": rid},
        {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.box_movements.delete_many({"remision_id": rid, "auto": True})
    return {"ok": True}

@api.delete("/remisiones/{rid}")
async def delete_remision(rid: str, _: dict = Depends(require_admin)):
    existing = await db.remisiones.find_one({"id": rid})
    if not existing:
        raise HTTPException(404, "No encontrada")
    if existing.get("status") == "confirmed":
        raise HTTPException(400, "Confirmadas se cancelan, no se eliminan")
    await db.remisiones.delete_one({"id": rid})
    return {"ok": True}

# ─── Client account ───────────────────────────────────────────────────
async def _compute_client_box_balance(client_id: str) -> dict:
    movs = await db.box_movements.find({"client_id": client_id}, {"_id": 0}).to_list(5000)
    ingresos = sum(m["quantity"] for m in movs if m["type"] == "ingreso")
    egresos = sum(m["quantity"] for m in movs if m["type"] == "egreso")
    return {"ingresos": ingresos, "egresos": egresos, "balance": ingresos - egresos, "movements": movs}

@api.get("/clients/{cid}/account")
async def client_account(cid: str, _: dict = Depends(get_current_user)):
    c = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    rems = await db.remisiones.find(
        {"client_id": cid, "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).sort("date", -1).to_list(2000)
    confirmed = [r for r in rems if r.get("status") == "confirmed"]
    facturado = sum(r.get("totals", {}).get("total_amount", 0) for r in confirmed)
    pagado = sum(p.get("amount", 0) for p in c.get("payments", []))
    boxes = await _compute_client_box_balance(cid)
    return {
        "client": c,
        "remisiones": rems,
        "facturado": round(facturado, 2),
        "pagado": round(pagado, 2),
        "saldo": round(facturado - pagado, 2),
        "boxes": boxes,
    }

# ─── Dashboard ────────────────────────────────────────────────────────
@api.get("/dashboard/stats")
async def dashboard_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    module: Optional[str] = None,
    crop: Optional[str] = None,
    quality: Optional[str] = None,
    size: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    q = {"status": "confirmed"}
    if date_from:
        q.setdefault("date", {})["$gte"] = date_from
    if date_to:
        q.setdefault("date", {})["$lte"] = date_to
    rems = await db.remisiones.find(q, {"_id": 0}).to_list(5000)
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)

    def line_matches(ln):
        if module and ln.get("module_id") != module: return False
        if crop and ln.get("crop") != crop: return False
        if quality and ln.get("quality") != quality: return False
        if size and ln.get("size") != size: return False
        return True

    total_amount = 0.0
    total_kg = 0.0
    total_boxes = 0
    by_crop = {}
    by_quality_kg = {}
    by_module_amount = {}
    by_size_kg = {}
    monthly = {}
    per_client = {}
    filtered_rem_ids = set()

    for r in rems:
        rem_lines = [ln for ln in r.get("lines", []) if line_matches(ln)]
        if not rem_lines:
            continue
        filtered_rem_ids.add(r.get("id"))
        rem_amt = sum(ln["boxes"] * ln["price_per_box"] for ln in rem_lines)
        rem_kg = sum(ln["boxes"] * ln["kg_per_box"] for ln in rem_lines)
        rem_boxes = sum(ln["boxes"] for ln in rem_lines)
        total_amount += rem_amt
        total_kg += rem_kg
        total_boxes += rem_boxes
        mkey = (r.get("date", "") or "")[:7]
        monthly[mkey] = monthly.get(mkey, 0) + rem_amt
        cid = r.get("client_id")
        if cid:
            per_client[cid] = per_client.get(cid, 0) + rem_amt
        for ln in rem_lines:
            c = ln.get("crop") or "—"
            by_crop.setdefault(c, {"amount": 0, "kg": 0})
            by_crop[c]["amount"] += ln["boxes"] * ln["price_per_box"]
            by_crop[c]["kg"] += ln["boxes"] * ln["kg_per_box"]
            by_quality_kg[ln.get("quality", "")] = by_quality_kg.get(ln.get("quality", ""), 0) + ln["boxes"] * ln["kg_per_box"]
            by_module_amount[ln.get("module_id", "")] = by_module_amount.get(ln.get("module_id", ""), 0) + ln["boxes"] * ln["price_per_box"]
            by_size_kg[ln.get("size", "")] = by_size_kg.get(ln.get("size", ""), 0) + ln["boxes"] * ln["kg_per_box"]

    total_paid = sum(sum(p.get("amount", 0) for p in c.get("payments", [])) for c in clients)
    outstanding = total_amount - total_paid
    avg_per_crop = {c: (v["amount"] / v["kg"] if v["kg"] else 0) for c, v in by_crop.items()}
    client_name_map = {c["id"]: c["name"] for c in clients}
    top = sorted(per_client.items(), key=lambda x: x[1], reverse=True)[:5]
    top_clients_list = [
        {"name": client_name_map.get(cid, "—"), "amount": amt,
         "percent": (amt / total_amount * 100) if total_amount else 0}
        for cid, amt in top
    ]

    return {
        "total_amount": round(total_amount, 2),
        "total_kg": round(total_kg, 2),
        "total_boxes": total_boxes,
        "num_remisiones": len(filtered_rem_ids),
        "avg_price_per_box": round(total_amount / total_boxes, 2) if total_boxes else 0,
        "avg_price_per_kg": round(total_amount / total_kg, 2) if total_kg else 0,
        "outstanding": round(outstanding, 2),
        "total_paid": round(total_paid, 2),
        "by_crop": by_crop,
        "avg_per_crop": avg_per_crop,
        "by_quality_kg": by_quality_kg,
        "by_module_amount": by_module_amount,
        "by_size_kg": by_size_kg,
        "monthly": monthly,
        "top_clients": top_clients_list,
    }

@api.get("/modules/stats")
async def module_stats(_: dict = Depends(get_current_user)):
    rems = await db.remisiones.find({"status": "confirmed"}, {"_id": 0}).to_list(5000)
    mods = await db.modules.find({}, {"_id": 0}).to_list(100)
    stats = {m["id"]: {"module": m, "revenue": 0, "kg": 0, "boxes": 0} for m in mods}
    grand = 0
    for r in rems:
        for ln in r.get("lines", []):
            mid = ln.get("module_id")
            if mid not in stats:
                continue
            amt = ln["boxes"] * ln["price_per_box"]
            kg = ln["boxes"] * ln["kg_per_box"]
            stats[mid]["revenue"] += amt
            stats[mid]["kg"] += kg
            stats[mid]["boxes"] += ln["boxes"]
            grand += amt
    out = []
    order = {m: i for i, m in enumerate(MODULE_IDS)}
    for mid, s in stats.items():
        sur = s["module"].get("surface_m2", 0)
        pl = s["module"].get("plant_count", 0)
        out.append({
            "id": mid, "module": s["module"],
            "revenue": round(s["revenue"], 2),
            "kg": round(s["kg"], 2),
            "boxes": s["boxes"],
            "avg_per_box": round(s["revenue"] / s["boxes"], 2) if s["boxes"] else 0,
            "avg_per_kg": round(s["revenue"] / s["kg"], 2) if s["kg"] else 0,
            "percent_total": round(s["revenue"] / grand * 100, 2) if grand else 0,
            "kg_per_m2": round(s["kg"] / sur, 2) if sur else None,
            "boxes_per_m2": round(s["boxes"] / sur, 2) if sur else None,
            "kg_per_plant": round(s["kg"] / pl, 2) if pl else None,
        })
    out.sort(key=lambda x: order.get(x["id"], 999))
    return out

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)

@app.on_event("shutdown")
async def shutdown():
    client.close()
