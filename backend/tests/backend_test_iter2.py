"""Backend tests for AJVJ Hidropónicos Iteration 2.

Covers:
- Role rename operador -> capturista (422 on 'operador', 200 on 'capturista')
- Capturista RBAC (allowed/denied endpoints)
- Crop catalog CRUD + delete-when-in-use guard
- Signer names round-trip
- Module cycles: open cycle (no end_date), close_cycle endpoint, overlap rules
- Remisiones auto-egreso, soft-delete (cancel) drops auto-egreso, draft delete vs confirmed
- folio_cliente + signatures dict round-trip
- box_movements standalone (ingreso/egreso, list filter by client)
- /clients/{cid}/account: cancelled excluded, boxes balance
- /dashboard/stats with filters (date_from/date_to/module/crop/quality/size)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ajvj.mx"
ADMIN_PASSWORD = "admin123"


# ─── Fixtures ────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def admin_h():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def capturista(admin_h):
    email = f"TEST_cap_{uuid.uuid4().hex[:8]}@ajvj.mx"
    r = requests.post(f"{API}/users", headers=admin_h,
                      json={"email": email, "password": "cap12345", "name": "TEST Capturista", "role": "capturista"})
    assert r.status_code == 200, r.text
    tok = requests.post(f"{API}/auth/login", json={"email": email, "password": "cap12345"}).json()["token"]
    return {"id": r.json()["id"], "email": email, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="session")
def test_client(admin_h):
    r = requests.post(f"{API}/clients", headers=admin_h, json={
        "name": f"TEST_Cliente_iter2_{uuid.uuid4().hex[:6]}",
        "rfc": "XAXX010101000",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _line(module_id="A", crop="Jitomate", quality="1ra", color="Rojo",
          size="L", boxes=10, kg_per_box=19, price_per_box=200):
    return {"module_id": module_id, "crop": crop, "quality": quality, "color": color,
            "size": size, "boxes": boxes, "kg_per_box": kg_per_box, "price_per_box": price_per_box}


# ─── Auth basic ──────────────────────────────────────────────────────
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("token"), str) and len(j["token"]) > 0
        assert j["user"]["role"] == "admin"


# ─── Role rename (operador -> capturista) ────────────────────────────
class TestRoleRename:
    def test_create_capturista_ok(self, admin_h):
        email = f"TEST_cap_rn_{uuid.uuid4().hex[:6]}@ajvj.mx"
        r = requests.post(f"{API}/users", headers=admin_h,
                          json={"email": email, "password": "p12345", "name": "x", "role": "capturista"})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "capturista"

    def test_create_operador_rejected(self, admin_h):
        email = f"TEST_op_rej_{uuid.uuid4().hex[:6]}@ajvj.mx"
        r = requests.post(f"{API}/users", headers=admin_h,
                          json={"email": email, "password": "p12345", "name": "x", "role": "operador"})
        assert r.status_code == 422, r.text


# ─── Capturista RBAC ─────────────────────────────────────────────────
class TestCapturistaRBAC:
    def test_capturista_403_on_admin_only_endpoints(self, capturista, test_client, admin_h):
        h = capturista["headers"]
        denied = [
            ("POST", "/clients", {"name": "TEST_x"}),
            ("DELETE", f"/clients/{test_client['id']}", None),
            ("PUT", "/company", {"name": "TEST", "rfc": "", "address": "", "phone": "", "logo_url": ""}),
            ("PUT", "/modules/A", {"id": "A", "active_crop": None, "surface_m2": 0, "surface_unit": "m2", "plant_count": 0, "cycles": []}),
            ("POST", "/catalog/crops", {"name": "TEST_NewCrop", "qualities": [], "colors": [], "sizes": [], "has_color": False}),
            ("PUT", "/catalog/crops/Jitomate", {"name": "Jitomate", "qualities": ["1ra"], "colors": ["Rojo"], "sizes": ["L"], "has_color": True}),
            ("DELETE", "/catalog/crops/Jitomate", None),
            ("PUT", "/signer_names", {"almacen": [], "estibador": []}),
            ("POST", f"/clients/{test_client['id']}/payments", {"date": "2026-01-01", "amount": 100, "ref": ""}),
            ("GET", "/users", None),
            ("POST", "/users", {"email": "TEST_x@x.com", "password": "p", "name": "x", "role": "capturista"}),
            ("DELETE", f"/users/{capturista['id']}", None),
        ]
        for method, path, body in denied:
            r = requests.request(method, f"{API}{path}", headers=h, json=body)
            assert r.status_code == 403, f"{method} {path} -> {r.status_code} ({r.text[:120]})"

    def test_capturista_can_create_box_movement(self, capturista, test_client):
        r = requests.post(f"{API}/box_movements", headers=capturista["headers"],
                          json={"client_id": test_client["id"], "date": "2026-01-15", "type": "ingreso",
                                "quantity": 5, "ref": "TEST cap ingreso"})
        assert r.status_code == 200, r.text
        # delete should be admin-only
        r2 = requests.delete(f"{API}/box_movements/{r.json()['id']}", headers=capturista["headers"])
        assert r2.status_code == 403

    def test_capturista_can_post_remision(self, capturista, test_client):
        body = {"date": "2026-01-15", "status": "draft", "client_id": test_client["id"],
                "lines": [_line()]}
        r = requests.post(f"{API}/remisiones", headers=capturista["headers"], json=body)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "draft"

        body["status"] = "confirmed"
        r = requests.post(f"{API}/remisiones", headers=capturista["headers"], json=body)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "confirmed"
        assert r.json()["number"]  # number assigned

    def test_capturista_edit_draft_ok_confirmed_403(self, capturista, test_client, admin_h):
        # Create draft
        body = {"date": "2026-01-16", "status": "draft", "client_id": test_client["id"], "lines": [_line()]}
        r = requests.post(f"{API}/remisiones", headers=capturista["headers"], json=body)
        rid = r.json()["id"]
        # Edit draft -> OK
        body["destination"] = "TEST destino"
        r = requests.put(f"{API}/remisiones/{rid}", headers=capturista["headers"], json=body)
        assert r.status_code == 200, r.text

        # Admin confirms it
        body["status"] = "confirmed"
        r = requests.put(f"{API}/remisiones/{rid}", headers=admin_h, json=body)
        assert r.status_code == 200, r.text

        # Capturista now tries to edit confirmed -> 403
        body["destination"] = "Bloqueado"
        r = requests.put(f"{API}/remisiones/{rid}", headers=capturista["headers"], json=body)
        assert r.status_code == 403, r.text

    def test_capturista_cant_cancel_or_delete_rem(self, capturista, test_client, admin_h):
        body = {"date": "2026-01-17", "status": "draft", "client_id": test_client["id"], "lines": [_line()]}
        rid = requests.post(f"{API}/remisiones", headers=admin_h, json=body).json()["id"]
        r1 = requests.post(f"{API}/remisiones/{rid}/cancel", headers=capturista["headers"])
        r2 = requests.delete(f"{API}/remisiones/{rid}", headers=capturista["headers"])
        assert r1.status_code == 403
        assert r2.status_code == 403


# ─── Crop catalog ─────────────────────────────────────────────────────
class TestCropCatalog:
    def test_seeded_crops(self, admin_h):
        r = requests.get(f"{API}/catalog/crops", headers=admin_h)
        assert r.status_code == 200
        crops = {c["id"]: c for c in r.json()}
        assert "Jitomate" in crops
        j = crops["Jitomate"]
        assert set(j["qualities"]) >= {"1ra", "Arrastre", "Papeles"}
        assert set(j["colors"]) >= {"Verde", "Rayado", "Rojo"}
        assert set(j["sizes"]) >= {"XL", "L", "M", "S", "C"}
        assert j["has_color"] is True
        assert "Pepino" in crops
        p = crops["Pepino"]
        assert p["has_color"] is False
        assert p["colors"] == []
        assert set(p["sizes"]) >= {"XL", "L", "C"}

    def test_create_update_delete_crop(self, admin_h):
        name = f"TEST_Crop_{uuid.uuid4().hex[:6]}"
        body = {"name": name, "qualities": ["1ra"], "colors": [], "sizes": ["U"], "has_color": False}
        r = requests.post(f"{API}/catalog/crops", headers=admin_h, json=body)
        assert r.status_code == 200, r.text
        # Update
        body2 = {"name": name, "qualities": ["1ra", "2da"], "colors": ["Verde"], "sizes": ["U", "X"], "has_color": True}
        r = requests.put(f"{API}/catalog/crops/{name}", headers=admin_h, json=body2)
        assert r.status_code == 200
        # Verify GET
        crops = requests.get(f"{API}/catalog/crops", headers=admin_h).json()
        c = [x for x in crops if x["id"] == name][0]
        assert "2da" in c["qualities"] and c["has_color"] is True
        # Delete (not in use) -> 200
        r = requests.delete(f"{API}/catalog/crops/{name}", headers=admin_h)
        assert r.status_code == 200

    def test_delete_crop_in_use_400(self, admin_h):
        # Create a crop and assign to a module
        name = f"TEST_Used_{uuid.uuid4().hex[:6]}"
        requests.post(f"{API}/catalog/crops", headers=admin_h,
                      json={"name": name, "qualities": ["1ra"], "colors": [], "sizes": ["L"], "has_color": False})
        # Put module with open cycle using that crop
        body = {"id": "G", "active_crop": None, "surface_m2": 100, "surface_unit": "m2", "plant_count": 50,
                "cycles": [{"crop": name, "variety": "v", "start_date": "2026-01-01", "end_date": None, "closed": False}]}
        r = requests.put(f"{API}/modules/G", headers=admin_h, json=body)
        assert r.status_code == 200
        assert r.json()["active_crop"] == name
        # Try delete - must 400
        r = requests.delete(f"{API}/catalog/crops/{name}", headers=admin_h)
        assert r.status_code == 400, r.text
        # Cleanup: close cycle and remove from module
        body2 = {"id": "G", "active_crop": None, "surface_m2": 100, "surface_unit": "m2",
                 "plant_count": 50, "cycles": []}
        requests.put(f"{API}/modules/G", headers=admin_h, json=body2)
        requests.delete(f"{API}/catalog/crops/{name}", headers=admin_h)


# ─── Signer names ────────────────────────────────────────────────────
class TestSignerNames:
    def test_round_trip(self, admin_h):
        payload = {"almacen": ["Juan", "Pedro"], "estibador": ["Luis"]}
        r = requests.put(f"{API}/signer_names", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        r = requests.get(f"{API}/signer_names", headers=admin_h)
        assert r.status_code == 200
        j = r.json()
        assert j["almacen"] == ["Juan", "Pedro"]
        assert j["estibador"] == ["Luis"]


# ─── Module cycles & close_cycle ─────────────────────────────────────
class TestModuleCycles:
    def test_open_cycle_no_end_date(self, admin_h):
        body = {"id": "F", "active_crop": None, "surface_m2": 100, "surface_unit": "m2", "plant_count": 50,
                "cycles": [{"crop": "Jitomate", "variety": "x", "start_date": "2026-01-01",
                            "end_date": None, "closed": False}]}
        r = requests.put(f"{API}/modules/F", headers=admin_h, json=body)
        assert r.status_code == 200, r.text
        assert r.json()["active_crop"] == "Jitomate"

    def test_overlap_only_when_both_closed(self, admin_h):
        # One open, one open -> OK (no overlap check)
        body = {"id": "PA", "active_crop": None, "surface_m2": 50, "surface_unit": "m2", "plant_count": 20,
                "cycles": [
                    {"crop": "Jitomate", "variety": "", "start_date": "2026-01-01", "end_date": None, "closed": False},
                    {"crop": "Pepino", "variety": "", "start_date": "2026-02-01", "end_date": None, "closed": False},
                ]}
        r = requests.put(f"{API}/modules/PA", headers=admin_h, json=body)
        assert r.status_code == 200, r.text

        # Both closed with overlap -> 400
        body2 = {"id": "PA", "active_crop": None, "surface_m2": 50, "surface_unit": "m2", "plant_count": 20,
                 "cycles": [
                     {"crop": "Jitomate", "variety": "", "start_date": "2026-01-01", "end_date": "2026-03-01", "closed": True},
                     {"crop": "Pepino", "variety": "", "start_date": "2026-02-01", "end_date": "2026-04-01", "closed": True},
                 ]}
        r = requests.put(f"{API}/modules/PA", headers=admin_h, json=body2)
        assert r.status_code == 400, r.text

    def test_close_cycle_endpoint(self, admin_h):
        # Set 2 open cycles in TB
        body = {"id": "TB", "active_crop": None, "surface_m2": 30, "surface_unit": "m2", "plant_count": 10,
                "cycles": [
                    {"crop": "Jitomate", "variety": "", "start_date": "2026-01-01", "end_date": None, "closed": False},
                    {"crop": "Pepino", "variety": "", "start_date": "2026-02-01", "end_date": None, "closed": False},
                ]}
        r = requests.put(f"{API}/modules/TB", headers=admin_h, json=body)
        assert r.status_code == 200
        # Active crop should derive from last open
        assert r.json()["active_crop"] == "Pepino"
        # Close index 1 (Pepino)
        r = requests.post(f"{API}/modules/TB/close_cycle", headers=admin_h,
                          json={"cycle_index": 1, "end_date": "2026-03-01"})
        assert r.status_code == 200
        # GET module and verify
        m = next(x for x in requests.get(f"{API}/modules", headers=admin_h).json() if x["id"] == "TB")
        assert m["cycles"][1]["closed"] is True
        assert m["cycles"][1]["end_date"] == "2026-03-01"
        assert m["active_crop"] == "Jitomate"  # remaining open
        # Close index 0 too -> active_crop should be None
        r = requests.post(f"{API}/modules/TB/close_cycle", headers=admin_h,
                          json={"cycle_index": 0, "end_date": "2026-01-31"})
        assert r.status_code == 200
        m = next(x for x in requests.get(f"{API}/modules", headers=admin_h).json() if x["id"] == "TB")
        assert m["active_crop"] is None


# ─── Remisiones auto-egreso, soft delete, folio, signatures ──────────
class TestRemisionesIter2:
    def test_confirmed_auto_egreso(self, admin_h, test_client):
        # baseline egresos
        r0 = requests.get(f"{API}/box_movements", headers=admin_h, params={"client_id": test_client["id"]})
        base_eg = sum(m["quantity"] for m in r0.json() if m["type"] == "egreso")

        body = {"date": "2026-01-20", "status": "confirmed", "client_id": test_client["id"],
                "lines": [_line(boxes=7), _line(boxes=3, module_id="B")]}
        r = requests.post(f"{API}/remisiones", headers=admin_h, json=body)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        total_boxes = r.json()["totals"]["boxes"]
        assert total_boxes == 10

        # Verify box_movement was auto-created
        movs = requests.get(f"{API}/box_movements", headers=admin_h,
                            params={"client_id": test_client["id"]}).json()
        auto = [m for m in movs if m.get("remision_id") == rid]
        assert len(auto) == 1
        assert auto[0]["type"] == "egreso"
        assert auto[0]["quantity"] == 10
        assert auto[0].get("auto") is True

    def test_draft_no_auto_egreso(self, admin_h, test_client):
        body = {"date": "2026-01-21", "status": "draft", "client_id": test_client["id"],
                "lines": [_line(boxes=5)]}
        rid = requests.post(f"{API}/remisiones", headers=admin_h, json=body).json()["id"]
        movs = requests.get(f"{API}/box_movements", headers=admin_h,
                            params={"client_id": test_client["id"]}).json()
        auto = [m for m in movs if m.get("remision_id") == rid]
        assert len(auto) == 0

    def test_draft_to_confirmed_creates_egreso_and_number(self, admin_h, test_client):
        body = {"date": "2026-01-22", "status": "draft", "client_id": test_client["id"],
                "lines": [_line(boxes=4)]}
        rid = requests.post(f"{API}/remisiones", headers=admin_h, json=body).json()["id"]
        body["status"] = "confirmed"
        r = requests.put(f"{API}/remisiones/{rid}", headers=admin_h, json=body)
        assert r.status_code == 200
        assert r.json()["number"]
        movs = requests.get(f"{API}/box_movements", headers=admin_h,
                            params={"client_id": test_client["id"]}).json()
        auto = [m for m in movs if m.get("remision_id") == rid]
        assert len(auto) == 1 and auto[0]["quantity"] == 4

    def test_cancel_removes_auto_egreso(self, admin_h, test_client):
        body = {"date": "2026-01-23", "status": "confirmed", "client_id": test_client["id"],
                "lines": [_line(boxes=6)]}
        rid = requests.post(f"{API}/remisiones", headers=admin_h, json=body).json()["id"]
        # confirm egreso exists
        movs = requests.get(f"{API}/box_movements", headers=admin_h,
                            params={"client_id": test_client["id"]}).json()
        assert any(m.get("remision_id") == rid for m in movs)
        # cancel
        r = requests.post(f"{API}/remisiones/{rid}/cancel", headers=admin_h)
        assert r.status_code == 200
        # rem status now cancelled
        g = requests.get(f"{API}/remisiones/{rid}", headers=admin_h).json()
        assert g["status"] == "cancelled"
        # auto egreso removed
        movs2 = requests.get(f"{API}/box_movements", headers=admin_h,
                             params={"client_id": test_client["id"]}).json()
        assert not any(m.get("remision_id") == rid for m in movs2)

    def test_delete_draft_ok_confirmed_400(self, admin_h, test_client):
        # draft -> deletable
        body = {"date": "2026-01-24", "status": "draft", "client_id": test_client["id"],
                "lines": [_line()]}
        rid = requests.post(f"{API}/remisiones", headers=admin_h, json=body).json()["id"]
        r = requests.delete(f"{API}/remisiones/{rid}", headers=admin_h)
        assert r.status_code == 200
        r = requests.get(f"{API}/remisiones/{rid}", headers=admin_h)
        assert r.status_code == 404

        # confirmed -> 400
        body["status"] = "confirmed"
        rid2 = requests.post(f"{API}/remisiones", headers=admin_h, json=body).json()["id"]
        r = requests.delete(f"{API}/remisiones/{rid2}", headers=admin_h)
        assert r.status_code == 400, r.text

    def test_folio_cliente_and_signatures_roundtrip(self, admin_h, test_client):
        signatures = {
            "chofer": {"name": "Chofer Test", "image": "data:image/png;base64,AAA"},
            "almacen": {"name": "Almacen Test", "image": "data:image/png;base64,BBB"},
            "estibador": {"name": "Estibador Test", "image": "data:image/png;base64,CCC"},
        }
        body = {"date": "2026-01-25", "status": "confirmed", "client_id": test_client["id"],
                "folio_cliente": "CLI-FOLIO-123", "signatures": signatures, "lines": [_line()]}
        r = requests.post(f"{API}/remisiones", headers=admin_h, json=body)
        assert r.status_code == 200
        rid = r.json()["id"]
        g = requests.get(f"{API}/remisiones/{rid}", headers=admin_h).json()
        assert g["folio_cliente"] == "CLI-FOLIO-123"
        assert g["signatures"]["chofer"]["name"] == "Chofer Test"
        assert g["signatures"]["almacen"]["image"].startswith("data:image/png")
        assert g["signatures"]["estibador"]["name"] == "Estibador Test"


# ─── Box movements standalone ─────────────────────────────────────────
class TestBoxMovements:
    def test_create_ingreso_egreso_and_filter(self, admin_h, test_client):
        cid = test_client["id"]
        r1 = requests.post(f"{API}/box_movements", headers=admin_h,
                           json={"client_id": cid, "date": "2026-01-10", "type": "ingreso", "quantity": 20})
        r2 = requests.post(f"{API}/box_movements", headers=admin_h,
                           json={"client_id": cid, "date": "2026-01-11", "type": "egreso", "quantity": 5})
        assert r1.status_code == 200 and r2.status_code == 200

        # Filter by client_id
        r = requests.get(f"{API}/box_movements", headers=admin_h, params={"client_id": cid})
        assert r.status_code == 200
        movs = r.json()
        assert all(m["client_id"] == cid for m in movs)
        assert any(m["id"] == r1.json()["id"] for m in movs)


# ─── Client account ──────────────────────────────────────────────────
class TestClientAccount:
    def test_account_excludes_cancelled_and_has_boxes(self, admin_h, test_client):
        cid = test_client["id"]
        # Create confirmed rem then cancel
        body = {"date": "2026-01-28", "status": "confirmed", "client_id": cid,
                "lines": [_line(boxes=8, price_per_box=100)]}
        rid = requests.post(f"{API}/remisiones", headers=admin_h, json=body).json()["id"]
        requests.post(f"{API}/remisiones/{rid}/cancel", headers=admin_h)

        # Create non-cancelled rem
        body2 = {"date": "2026-01-29", "status": "confirmed", "client_id": cid,
                 "lines": [_line(boxes=2, price_per_box=100)]}
        rid2 = requests.post(f"{API}/remisiones", headers=admin_h, json=body2).json()["id"]

        r = requests.get(f"{API}/clients/{cid}/account", headers=admin_h)
        assert r.status_code == 200
        j = r.json()
        ids = {x["id"] for x in j["remisiones"]}
        assert rid not in ids, "cancelled remision must not appear in account"
        assert rid2 in ids
        # boxes structure
        assert "boxes" in j
        for k in ("ingresos", "egresos", "balance", "movements"):
            assert k in j["boxes"]
        assert j["boxes"]["balance"] == j["boxes"]["ingresos"] - j["boxes"]["egresos"]


# ─── Dashboard filters ───────────────────────────────────────────────
class TestDashboardFilters:
    def test_filters_lines_and_counts_only_matching(self, admin_h, test_client):
        cid = test_client["id"]
        # Rem with line module=A crop=Jitomate quality=1ra size=L
        body1 = {"date": "2026-02-05", "status": "confirmed", "client_id": cid,
                 "lines": [_line(module_id="A", crop="Jitomate", quality="1ra", size="L", boxes=3, price_per_box=150)]}
        requests.post(f"{API}/remisiones", headers=admin_h, json=body1)
        # Rem with non-matching line module=B
        body2 = {"date": "2026-02-06", "status": "confirmed", "client_id": cid,
                 "lines": [_line(module_id="B", crop="Pepino", color=None, quality="Arrastre", size="C", boxes=4, price_per_box=80)]}
        requests.post(f"{API}/remisiones", headers=admin_h, json=body2)

        # Filter narrow: module=A
        r = requests.get(f"{API}/dashboard/stats", headers=admin_h,
                         params={"date_from": "2026-02-01", "date_to": "2026-02-28", "module": "A"})
        assert r.status_code == 200
        s = r.json()
        # Only module A lines counted in by_module_amount
        assert "A" in s["by_module_amount"]
        # B shouldn't be in module_amount when module filter is A
        assert "B" not in s["by_module_amount"]
        # num_remisiones counts only those with matching lines
        assert s["num_remisiones"] >= 1

        # Filter by crop=Pepino in same range -> should not include Jitomate
        r = requests.get(f"{API}/dashboard/stats", headers=admin_h,
                         params={"date_from": "2026-02-01", "date_to": "2026-02-28", "crop": "Pepino"})
        s = r.json()
        assert "Pepino" in s["by_crop"]
        assert "Jitomate" not in s["by_crop"]
