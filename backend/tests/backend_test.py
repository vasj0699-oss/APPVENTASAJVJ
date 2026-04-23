"""Backend tests for AJVJ Hidropónicos - covers auth, modules, company, clients, remisiones, dashboard, RBAC."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hidro-entregas.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ajvj.mx"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def operador(admin_h):
    email = f"TEST_op_{uuid.uuid4().hex[:8]}@ajvj.mx"
    r = requests.post(f"{API}/users", headers=admin_h,
                      json={"email": email, "password": "op12345", "name": "TEST Operador", "role": "operador"})
    assert r.status_code == 200, r.text
    tok = requests.post(f"{API}/auth/login", json={"email": email, "password": "op12345"}).json()["token"]
    return {"id": r.json()["id"], "email": email, "headers": {"Authorization": f"Bearer {tok}"}}


# ─── Auth ────────────────────────────────────────────────────────────
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        j = r.json()
        assert "token" in j and isinstance(j["token"], str)
        assert j["user"]["email"] == ADMIN_EMAIL
        assert j["user"]["role"] == "admin"

    def test_login_bad(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, admin_h):
        r = requests.get(f"{API}/auth/me", headers=admin_h)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert "password_hash" not in r.json()

    def test_no_auth_401(self):
        for path in ["/auth/me", "/modules", "/company", "/clients", "/remisiones", "/dashboard/stats"]:
            r = requests.get(f"{API}{path}")
            assert r.status_code == 401, f"{path} -> {r.status_code}"


# ─── Modules ─────────────────────────────────────────────────────────
class TestModules:
    def test_list_modules_order(self, admin_h):
        r = requests.get(f"{API}/modules", headers=admin_h)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert ids == ["A", "B", "C", "D", "E", "F", "G", "PA", "TA", "TB"]

    def test_update_module_admin(self, admin_h):
        body = {"id": "A", "active_crop": "Jitomate", "variety": "Saladette",
                "surface_m2": 1000.0, "surface_unit": "m2", "plant_count": 2500, "cycles": []}
        r = requests.put(f"{API}/modules/A", headers=admin_h, json=body)
        assert r.status_code == 200, r.text
        assert r.json()["surface_m2"] == 1000.0
        g = requests.get(f"{API}/modules", headers=admin_h).json()
        a = [m for m in g if m["id"] == "A"][0]
        assert a["plant_count"] == 2500

    def test_cycles_overlap_400(self, admin_h):
        body = {"id": "B", "active_crop": "Pepino", "variety": "", "surface_m2": 0, "surface_unit": "m2",
                "plant_count": 0, "cycles": [
                    {"crop": "Pepino", "variety": "", "start_date": "2026-01-01", "end_date": "2026-06-01"},
                    {"crop": "Pepino", "variety": "", "start_date": "2026-05-01", "end_date": "2026-10-01"}]}
        r = requests.put(f"{API}/modules/B", headers=admin_h, json=body)
        assert r.status_code == 400

    def test_cycles_max2_400(self, admin_h):
        body = {"id": "C", "cycles": [
            {"crop": "Jitomate", "start_date": "2026-01-01", "end_date": "2026-02-01"},
            {"crop": "Jitomate", "start_date": "2026-03-01", "end_date": "2026-04-01"},
            {"crop": "Jitomate", "start_date": "2026-05-01", "end_date": "2026-06-01"}]}
        r = requests.put(f"{API}/modules/C", headers=admin_h, json=body)
        assert r.status_code == 400


# ─── Company ─────────────────────────────────────────────────────────
class TestCompany:
    def test_get_company(self, admin_h):
        r = requests.get(f"{API}/company", headers=admin_h)
        assert r.status_code == 200
        assert "name" in r.json()

    def test_update_company_admin(self, admin_h):
        body = {"name": "AJVJ TEST", "rfc": "AJVJ123456ABC", "address": "Calle 1",
                "phone": "555-1234", "logo_url": ""}
        r = requests.put(f"{API}/company", headers=admin_h, json=body)
        assert r.status_code == 200
        assert r.json()["name"] == "AJVJ TEST"
        g = requests.get(f"{API}/company", headers=admin_h).json()
        assert g["rfc"] == "AJVJ123456ABC"


# ─── Clients ─────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def test_client(admin_h):
    body = {"name": "TEST Cliente", "rfc": "XAXX010101000", "fiscal_address": "X", "cp": "12345",
            "phone": "", "email": "", "fiscal_regime": "", "credit_limit": 10000, "credit_days": 30}
    r = requests.post(f"{API}/clients", headers=admin_h, json=body)
    assert r.status_code == 200
    return r.json()


class TestClients:
    def test_create_and_get(self, admin_h, test_client):
        assert "id" in test_client
        r = requests.get(f"{API}/clients", headers=admin_h)
        assert any(c["id"] == test_client["id"] for c in r.json())

    def test_update(self, admin_h, test_client):
        body = dict(test_client); body["name"] = "TEST Cliente Updated"
        r = requests.put(f"{API}/clients/{test_client['id']}", headers=admin_h, json=body)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST Cliente Updated"

    def test_payment(self, admin_h, test_client):
        r = requests.post(f"{API}/clients/{test_client['id']}/payments", headers=admin_h,
                          json={"date": "2026-01-10", "amount": 5000, "ref": "T1"})
        assert r.status_code == 200

    def test_box_return(self, admin_h, test_client):
        r = requests.post(f"{API}/clients/{test_client['id']}/empty_box_returns", headers=admin_h,
                          json={"date": "2026-01-10", "quantity": 20, "ref": "R1"})
        assert r.status_code == 200


# ─── Remisiones ──────────────────────────────────────────────────────
def _rem_body(client_id, status="confirmed", boxes=10, price=100, kg=19):
    return {"date": "2026-01-15", "status": status, "client_id": client_id,
            "client_name": "TEST Cliente", "client_rfc": "XAXX010101000",
            "client_address": "X", "destination": "X", "driver_name": "J", "license_plates": "ABC",
            "include_box_control": False, "observations": "",
            "lines": [{"module_id": "A", "crop": "Jitomate", "quality": "1ra", "size": "Grande",
                       "boxes": boxes, "kg_per_box": kg, "price_per_box": price, "subtotal": 0}],
            "warehouse_signature_image": ""}


class TestRemisiones:
    def test_draft_no_number(self, admin_h, test_client):
        r = requests.post(f"{API}/remisiones", headers=admin_h,
                          json=_rem_body(test_client["id"], status="draft"))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("number") is None
        assert j["totals"]["boxes"] == 10
        assert j["totals"]["total_kg"] == 190.0
        assert j["totals"]["total_amount"] == 1000.0
        TestRemisiones._draft_id = j["id"]

    def test_confirmed_gets_year_prefix_and_sequential(self, admin_h, test_client):
        r1 = requests.post(f"{API}/remisiones", headers=admin_h, json=_rem_body(test_client["id"]))
        r2 = requests.post(f"{API}/remisiones", headers=admin_h, json=_rem_body(test_client["id"], boxes=5, price=200))
        assert r1.status_code == 200 and r2.status_code == 200
        n1, n2 = r1.json()["number"], r2.json()["number"]
        assert n1 and n2
        year = "2026"
        assert n1.startswith(f"{year}-") and len(n1.split("-")[1]) == 4
        s1 = int(n1.split("-")[1]); s2 = int(n2.split("-")[1])
        assert s2 == s1 + 1
        assert r2.json()["totals"]["total_amount"] == 1000.0  # 5*200
        TestRemisiones._confirmed_id = r1.json()["id"]

    def test_list(self, admin_h):
        r = requests.get(f"{API}/remisiones", headers=admin_h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_draft_to_confirmed_assigns_number(self, admin_h, test_client):
        draft_id = TestRemisiones._draft_id
        body = _rem_body(test_client["id"], status="confirmed")
        body["id"] = draft_id
        r = requests.put(f"{API}/remisiones/{draft_id}", headers=admin_h, json=body)
        assert r.status_code == 200
        assert r.json().get("number") is not None

    def test_delete_admin_ok(self, admin_h, test_client):
        r = requests.post(f"{API}/remisiones", headers=admin_h, json=_rem_body(test_client["id"]))
        rid = r.json()["id"]
        d = requests.delete(f"{API}/remisiones/{rid}", headers=admin_h)
        assert d.status_code == 200

    def test_delete_operador_403(self, operador, test_client, admin_h):
        r = requests.post(f"{API}/remisiones", headers=admin_h, json=_rem_body(test_client["id"]))
        rid = r.json()["id"]
        d = requests.delete(f"{API}/remisiones/{rid}", headers=operador["headers"])
        assert d.status_code == 403


# ─── Dashboard & Module stats ────────────────────────────────────────
class TestStats:
    def test_dashboard(self, admin_h):
        r = requests.get(f"{API}/dashboard/stats", headers=admin_h)
        assert r.status_code == 200
        j = r.json()
        for k in ["total_amount", "total_kg", "by_crop", "avg_per_crop", "top_clients"]:
            assert k in j
        assert j["total_amount"] > 0

    def test_modules_stats_yield(self, admin_h):
        r = requests.get(f"{API}/modules/stats", headers=admin_h)
        assert r.status_code == 200
        items = r.json()
        a = [m for m in items if m["id"] == "A"][0]
        # module A had surface and plants set earlier
        assert a["kg_per_m2"] is not None
        assert a["kg_per_plant"] is not None


# ─── RBAC ────────────────────────────────────────────────────────────
class TestRBAC:
    def test_operador_forbidden(self, operador):
        h = operador["headers"]
        assert requests.put(f"{API}/company", headers=h,
                            json={"name": "x", "rfc": "", "address": "", "phone": "", "logo_url": ""}).status_code == 403
        assert requests.put(f"{API}/modules/A", headers=h,
                            json={"id": "A", "cycles": []}).status_code == 403
        assert requests.get(f"{API}/users", headers=h).status_code == 403
        assert requests.post(f"{API}/users", headers=h,
                             json={"email": "x@y.z", "password": "p", "name": "n"}).status_code == 403

    def test_operador_can_read(self, operador):
        h = operador["headers"]
        assert requests.get(f"{API}/modules", headers=h).status_code == 200
        assert requests.get(f"{API}/clients", headers=h).status_code == 200
        assert requests.get(f"{API}/dashboard/stats", headers=h).status_code == 200
