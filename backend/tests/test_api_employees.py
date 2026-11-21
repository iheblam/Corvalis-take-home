from tests.conftest import as_user


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_list_employees_is_sorted_and_filterable(client, people):
    names = [e["full_name"] for e in client.get("/api/employees").json()]
    assert names == sorted(names) and len(names) == 5
    structures = client.get("/api/employees?department=structures").json()
    assert {e["full_name"] for e in structures} == {"Max", "Alice", "Bob"}
    liege = client.get("/api/employees?office=liege").json()
    assert [e["full_name"] for e in liege] == ["Carol"]
    both = client.get("/api/employees?department=building_services&office=brussels").json()
    assert both == []


def test_unknown_filter_value_is_rejected(client, people):
    r = client.get("/api/employees?department=marketing")
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


def test_me_requires_a_known_user(client, people):
    assert client.get("/api/employees/me").status_code == 401
    assert client.get("/api/employees/me", headers={"X-User-Id": "9999"}).status_code == 401
    me = client.get("/api/employees/me", headers=as_user(people["manager"])).json()
    assert me["full_name"] == "Max" and me["direct_reports"] == 2 and me["role"] == "manager"
    alice = client.get("/api/employees/me", headers=as_user(people["alice"])).json()
    assert alice["manager_name"] == "Max" and alice["direct_reports"] == 0


def test_get_employee(client, people):
    r = client.get(f"/api/employees/{people['bob'].id}", headers=as_user(people["alice"]))
    assert r.status_code == 200 and r.json()["full_name"] == "Bob"
    assert client.get("/api/employees/9999", headers=as_user(people["alice"])).status_code == 404


def test_balance_visibility(client, people):
    alice_id = people["alice"].id
    url = f"/api/employees/{alice_id}/balance?year=2026"
    assert client.get(url, headers=as_user(people["alice"])).status_code == 200  # self
    assert client.get(url, headers=as_user(people["manager"])).status_code == 200  # her manager
    assert client.get(url, headers=as_user(people["hr"])).status_code == 200  # HR
    assert client.get(url, headers=as_user(people["bob"])).status_code == 403  # a colleague
    assert client.get(url).status_code == 401
    assert client.get("/api/employees/9999/balance", headers=as_user(people["hr"])).status_code == 404


def test_balance_defaults_without_allowance_row(client, people):
    b = client.get(f"/api/employees/{people['bob'].id}/balance", headers=as_user(people["bob"])).json()
    assert b["year"] == 2026 and b["annual_days"] == 20 and b["available_days"] == 20
