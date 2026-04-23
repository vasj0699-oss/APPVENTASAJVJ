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
from typing import List, Optional, Literal

# ─── DB ───────────────────────────────────────────────────────────────
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ─── Constants ────────────────────────────────────────────────────────
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
    role: Literal["admin", "operador"] = "operador"

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str

class Company(BaseModel):
    name: str = ""
    rfc: str = ""
    address: str = ""
    phone: str = ""
    logo_url: str = ""

class Cycle(BaseModel):
    crop: Literal["Jitomate", "Pepino"]
    variety: str = ""
    start_date: str
    end_date: str

class ModuleCfg(BaseModel):
    id: str
    active_crop: Optional[str] = None
    variety: str = ""
    surface_m2: float = 0
    surface_unit: str = "m2"
    plant_count: int = 0
    cycles: List[Cycle] = []

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
    empty_box_returns: List[dict] = []

class PaymentIn(BaseModel):
    date: str
    amount: float
    ref: str = ""

class BoxReturnIn(BaseModel):
    date: str
    quantity: int
    ref: str = ""

class RemisionLine(BaseModel):
    module_id: str
    crop: Literal["Jitomate", "Pepino"]
    quality: Literal["1ra", "Arrastre", "Papeles"]
    color: Optional[str] = None
    size: str
    boxes: int
    kg_per_box: float = 19
    price_per_box: float
    subtotal: float = 0

class EmptyBoxMove(BaseModel):
    type: Literal["delivery", "return"]
    quantity: int
    ref: str = ""

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
    include_box_control: bool = False
    observations: str = ""
    lines: List[RemisionLine]
    empty_box_movement: Optional[EmptyBoxMove] = None
    warehouse_signature_image: str = ""

# ─── Startup ──────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("id", unique=True)
    await db.remisiones.create_index("id", unique=True)
    await db.remisiones.create_index("number")
    await db.modules.create_index("id", unique=True)

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@ajvj.mx")
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_pw(admin_pw),
            "name": "Administrador",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Seed modules
    for mid in MODULE_IDS:
        existing = await db.modules.find_one({"id": mid})
        if not existing:
            await db.modules.insert_one({
                "id": mid, "active_crop": None, "variety": "",
                "surface_m2": 0, "surface_unit": "m2",
                "plant_count": 0, "cycles": [],
            })

    # Seed company (empty)
    c = await db.company.find_one({"id": "main"})
    if not c:
        await db.company.insert_one({
            "id": "main", "name": "", "rfc": "",
            "address": "", "phone": "", "logo_url": "",
        })

# ─── Auth endpoints ───────────────────────────────────────────────────
@api.post("/auth/login")
async def login(body: LoginReq):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = make_token(user["id"], user["email"], user["role"])
    return {
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]},
    }

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout():
    return {"ok": True}

# ─── Users (admin only) ───────────────────────────────────────────────
@api.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api.post("/users")
async def create_user(body: UserCreate, _: dict = Depends(require_admin)):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")
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
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    res = await db.users.delete_one({"id": user_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True}

# ─── Company ──────────────────────────────────────────────────────────
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
    # Validate cycles: max 2, non-overlapping
    cycles = doc.get("cycles", [])
    if len(cycles) > 2:
        raise HTTPException(400, "Máximo 2 ciclos por módulo")
    if len(cycles) == 2:
        c1, c2 = cycles[0], cycles[1]
        if not (c1["end_date"] <= c2["start_date"] or c2["end_date"] <= c1["start_date"]):
            raise HTTPException(400, "Los ciclos no pueden traslaparse")
    await db.modules.update_one({"id": mid}, {"$set": doc}, upsert=True)
    return doc

# ─── Clients ──────────────────────────────────────────────────────────
@api.get("/clients")
async def list_clients(_: dict = Depends(get_current_user)):
    return await db.clients.find({}, {"_id": 0}).to_list(1000)

@api.post("/clients")
async def create_client(body: ClientModel, _: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = doc.get("id") or str(uuid.uuid4())
    doc.setdefault("payments", [])
    doc.setdefault("empty_box_returns", [])
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/clients/{cid}")
async def update_client(cid: str, body: ClientModel, _: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = cid
    await db.clients.update_one({"id": cid}, {"$set": doc}, upsert=True)
    return doc

@api.delete("/clients/{cid}")
async def delete_client(cid: str, _: dict = Depends(require_admin)):
    await db.clients.delete_one({"id": cid})
    return {"ok": True}

@api.post("/clients/{cid}/payments")
async def add_payment(cid: str, body: PaymentIn, _: dict = Depends(get_current_user)):
    p = body.model_dump()
    await db.clients.update_one({"id": cid}, {"$push": {"payments": p}})
    return p

@api.post("/clients/{cid}/empty_box_returns")
async def add_box_return(cid: str, body: BoxReturnIn, _: dict = Depends(get_current_user)):
    p = body.model_dump()
    await db.clients.update_one({"id": cid}, {"$push": {"empty_box_returns": p}})
    return p

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
    return {
        "boxes": total_boxes,
        "total_kg": round(total_kg, 2),
        "total_amount": round(total_amount, 2),
    }

async def _next_number() -> str:
    year = datetime.now(timezone.utc).year
    counter = await db.counters.find_one_and_update(
        {"id": f"remision_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    # motor returns existing if upsert; handle both
    if not counter or "seq" not in counter:
        counter = await db.counters.find_one({"id": f"remision_{year}"})
    seq = counter["seq"]
    return f"{year}-{seq:04d}"

@api.get("/remisiones")
async def list_remisiones(_: dict = Depends(get_current_user)):
    items = await db.remisiones.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items

@api.get("/remisiones/{rid}")
async def get_remision(rid: str, _: dict = Depends(get_current_user)):
    r = await db.remisiones.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "No encontrada")
    return r

@api.post("/remisiones")
async def create_remision(body: RemisionIn, _: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = doc.get("id") or str(uuid.uuid4())
    lines = [ln for ln in doc["lines"]]
    for ln in lines:
        ln["subtotal"] = round(ln["boxes"] * ln["price_per_box"], 2)
    doc["lines"] = lines
    doc["totals"] = _compute_totals(lines)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]

    if doc["status"] == "confirmed":
        doc["number"] = await _next_number()
    else:
        doc["number"] = None

    await db.remisiones.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/remisiones/{rid}")
async def update_remision(rid: str, body: RemisionIn, _: dict = Depends(get_current_user)):
    existing = await db.remisiones.find_one({"id": rid})
    if not existing:
        raise HTTPException(404, "No encontrada")
    doc = body.model_dump()
    doc["id"] = rid
    lines = doc["lines"]
    for ln in lines:
        ln["subtotal"] = round(ln["boxes"] * ln["price_per_box"], 2)
    doc["totals"] = _compute_totals(lines)
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_at"] = existing.get("created_at", doc["updated_at"])

    # Number assignment: keep existing number, or assign when transitioning draft->confirmed
    if existing.get("number"):
        doc["number"] = existing["number"]
    elif doc["status"] == "confirmed":
        doc["number"] = await _next_number()
    else:
        doc["number"] = None

    await db.remisiones.update_one({"id": rid}, {"$set": doc})
    doc.pop("_id", None)
    return doc

@api.delete("/remisiones/{rid}")
async def delete_remision(rid: str, _: dict = Depends(require_admin)):
    res = await db.remisiones.delete_one({"id": rid})
    if not res.deleted_count:
        raise HTTPException(404, "No encontrada")
    return {"ok": True}

# ─── Dashboard stats ─────────────────────────────────────────────────
@api.get("/dashboard/stats")
async def dashboard_stats(_: dict = Depends(get_current_user)):
    rems = await db.remisiones.find(
        {"status": "confirmed"}, {"_id": 0}
    ).to_list(5000)
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)

    total_amount = 0.0
    total_kg = 0.0
    total_boxes = 0
    by_crop = {"Jitomate": {"amount": 0, "kg": 0}, "Pepino": {"amount": 0, "kg": 0}}
    by_quality_kg = {}
    by_module_amount = {}
    by_size_kg = {}
    monthly = {}  # yyyy-mm -> amount
    per_client = {}

    for r in rems:
        amt = r.get("totals", {}).get("total_amount", 0)
        kg = r.get("totals", {}).get("total_kg", 0)
        bx = r.get("totals", {}).get("boxes", 0)
        total_amount += amt
        total_kg += kg
        total_boxes += bx

        date = r.get("date", "")[:7]  # yyyy-mm
        monthly[date] = monthly.get(date, 0) + amt

        cid = r.get("client_id")
        if cid:
            per_client[cid] = per_client.get(cid, 0) + amt

        for ln in r.get("lines", []):
            crop = ln.get("crop")
            boxes = ln.get("boxes", 0)
            lkg = boxes * ln.get("kg_per_box", 0)
            lamt = boxes * ln.get("price_per_box", 0)
            if crop in by_crop:
                by_crop[crop]["amount"] += lamt
                by_crop[crop]["kg"] += lkg
            q = ln.get("quality", "")
            by_quality_kg[q] = by_quality_kg.get(q, 0) + lkg
            m = ln.get("module_id", "")
            by_module_amount[m] = by_module_amount.get(m, 0) + lamt
            s = ln.get("size", "")
            by_size_kg[s] = by_size_kg.get(s, 0) + lkg

    # Outstanding balance
    total_paid = sum(sum(p.get("amount", 0) for p in c.get("payments", [])) for c in clients)
    outstanding = total_amount - total_paid

    # Avg price/kg per crop
    avg_per_crop = {}
    for crop, v in by_crop.items():
        avg_per_crop[crop] = (v["amount"] / v["kg"]) if v["kg"] else 0

    # Top 5 clients
    client_name_map = {c["id"]: c["name"] for c in clients}
    top_clients = sorted(per_client.items(), key=lambda x: x[1], reverse=True)[:5]
    top_clients_list = [
        {"name": client_name_map.get(cid, "—"), "amount": amt,
         "percent": (amt / total_amount * 100) if total_amount else 0}
        for cid, amt in top_clients
    ]

    return {
        "total_amount": round(total_amount, 2),
        "total_kg": round(total_kg, 2),
        "total_boxes": total_boxes,
        "num_remisiones": len(rems),
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

# ─── Module stats ─────────────────────────────────────────────────────
@api.get("/modules/stats")
async def module_stats(_: dict = Depends(get_current_user)):
    rems = await db.remisiones.find(
        {"status": "confirmed"}, {"_id": 0}
    ).to_list(5000)
    mods = await db.modules.find({}, {"_id": 0}).to_list(100)

    stats = {}
    for m in mods:
        stats[m["id"]] = {
            "module": m,
            "revenue": 0, "kg": 0, "boxes": 0,
        }
    grand_total = 0
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
            grand_total += amt

    out = []
    order = {m: i for i, m in enumerate(MODULE_IDS)}
    for mid, s in stats.items():
        surface = s["module"].get("surface_m2", 0)
        plants = s["module"].get("plant_count", 0)
        out.append({
            "id": mid,
            "module": s["module"],
            "revenue": round(s["revenue"], 2),
            "kg": round(s["kg"], 2),
            "boxes": s["boxes"],
            "avg_per_box": round(s["revenue"] / s["boxes"], 2) if s["boxes"] else 0,
            "avg_per_kg": round(s["revenue"] / s["kg"], 2) if s["kg"] else 0,
            "percent_total": round((s["revenue"] / grand_total * 100), 2) if grand_total else 0,
            "kg_per_m2": round(s["kg"] / surface, 2) if surface else None,
            "boxes_per_m2": round(s["boxes"] / surface, 2) if surface else None,
            "kg_per_plant": round(s["kg"] / plants, 2) if plants else None,
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
