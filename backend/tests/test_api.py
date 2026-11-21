from tests.conftest import as_user


def create(client, user, **body):
    return client.post("/api/leave-requests", json=body, headers=as_user(user))


def test_requires_a_user(client, people):
    assert client.get("/api/leave-requests").status_code == 401


def test_request_then_manager_approves(client, people):
    alice, manager = people["alice"], people["manager"]
    r = create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-11", comment="Ski")
    assert r.status_code == 201
    req = r.json()["request"]
    assert req["status"] == "pending" and req["working_days"] == 5

    todo = client.get("/api/leave-requests?scope=to_approve", headers=as_user(manager)).json()
    assert [t["id"] for t in todo] == [req["id"]] and todo[0]["can_decide"]

    # Bob is not Alice's manager; Alice cannot approve her own request.
    assert client.post(f"/api/leave-requests/{req['id']}/approve", headers=as_user(people["bob"])).status_code == 403
    assert client.post(f"/api/leave-requests/{req['id']}/approve", headers=as_user(alice)).status_code == 403

    ok = client.post(f"/api/leave-requests/{req['id']}/approve", headers=as_user(manager))
    assert ok.status_code == 200 and ok.json()["status"] == "approved"
    assert client.post(f"/api/leave-requests/{req['id']}/approve", headers=as_user(manager)).status_code == 409

    bal = client.get(f"/api/employees/{alice.id}/balance?year=2026", headers=as_user(alice)).json()
    assert bal["taken_days"] == 5 and bal["available_days"] == 15


def test_reject_needs_a_reason(client, people):
    req = create(client, people["alice"], type="annual", start_date="2026-12-07", end_date="2026-12-07").json()
    url = f"/api/leave-requests/{req['request']['id']}/reject"
    assert client.post(url, json={}, headers=as_user(people["hr"])).status_code == 400
    assert client.post(url, json={"note": "Deadline"}, headers=as_user(people["hr"])).json()["status"] == "rejected"


def test_invalid_request_returns_readable_error(client, people):
    r = create(client, people["alice"], type="remote", start_date="2026-11-24", end_date="2026-11-24")
    assert r.status_code == 400 and "Tuesday is a team day" in r.json()["detail"]


def test_sick_leave_is_hidden_from_colleagues(client, people):
    create(client, people["alice"], type="sick", start_date="2026-11-16", end_date="2026-11-17")
    avail = client.get("/api/availability?date=2026-11-16", headers=as_user(people["bob"])).json()
    assert avail["absent"][0]["type"] == "away"
    avail = client.get("/api/availability?date=2026-11-16", headers=as_user(people["manager"])).json()
    assert avail["absent"][0]["type"] == "sick"
    assert {p["full_name"] for p in avail["available"]} == {"Hanna", "Max", "Bob"}


def test_cancel_own_pending(client, people):
    req = create(client, people["alice"], type="annual", start_date="2026-12-07", end_date="2026-12-07").json()
    url = f"/api/leave-requests/{req['request']['id']}/cancel"
    assert client.post(url, headers=as_user(people["bob"])).status_code == 409
    assert client.post(url, headers=as_user(people["alice"])).json()["status"] == "cancelled"
