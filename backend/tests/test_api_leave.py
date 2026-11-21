from sqlmodel import func, select

from app.models import LeaveRequest
from tests.conftest import as_user, create


def ids(resp):
    return sorted(r["id"] for r in resp.json())


# ------------------------------------------------------------------ create & preview


def test_preview_does_not_save(client, session, people):
    body = {"type": "annual", "start_date": "2026-12-07", "end_date": "2026-12-11"}
    r = client.post("/api/leave-requests/preview", json=body, headers=as_user(people["alice"]))
    assert r.json() == {"ok": True, "working_days": 5, "certificate_required": False, "errors": [], "warnings": []}
    assert session.exec(select(func.count()).select_from(LeaveRequest)).one() == 0


def test_preview_returns_errors_instead_of_failing(client, people):
    body = {"type": "remote", "start_date": "2026-11-24", "end_date": "2026-11-26"}
    p = client.post("/api/leave-requests/preview", json=body, headers=as_user(people["alice"])).json()
    assert not p["ok"] and "Tuesday and Thursday are team days" in p["errors"][0]


def test_create_each_type(client, people):
    alice = people["alice"]
    annual = create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-08").json()
    assert annual["request"]["status"] == "pending" and annual["request"]["working_days"] == 2
    remote = create(client, alice, type="remote", start_date="2026-11-30", end_date="2026-11-30").json()
    assert remote["request"]["status"] == "pending"
    unpaid = create(client, alice, type="unpaid", start_date="2027-02-01", end_date="2027-02-05").json()
    assert unpaid["request"]["status"] == "pending" and unpaid["warnings"]
    sick = create(client, alice, type="sick", start_date="2026-11-16", end_date="2026-11-18").json()
    assert sick["request"]["status"] == "approved"  # recorded, not requested
    assert sick["request"]["certificate_required"] and not sick["request"]["certificate_received"]


def test_create_rejections_are_readable(client, people):
    alice = people["alice"]
    cases = [
        ({"type": "annual", "start_date": "2026-12-10", "end_date": "2026-12-01"}, "end date is before"),
        ({"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-03"}, "in the past"),
        ({"type": "annual", "start_date": "2026-11-21", "end_date": "2026-11-22"}, "no working day"),
        ({"type": "annual", "start_date": "2026-12-25", "end_date": "2026-12-25"}, "no working day"),  # Christmas
        ({"type": "annual", "start_date": "2026-12-01", "end_date": "2027-12-31"}, "longer than one year"),
        ({"type": "annual", "start_date": "2029-01-08", "end_date": "2029-01-09"}, "two years ahead"),
        ({"type": "annual", "start_date": "2026-11-30", "end_date": "2026-12-31"}, "Not enough leave in 2026"),
    ]
    for body, message in cases:
        r = create(client, alice, **body)
        assert r.status_code == 400, body
        assert message in r.json()["detail"], (message, r.json())


def test_overlap_is_refused(client, people):
    alice = people["alice"]
    assert create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-11").status_code == 201
    r = create(client, alice, type="remote", start_date="2026-12-09", end_date="2026-12-09")
    assert r.status_code == 400 and "already have annual leave" in r.json()["detail"]


def test_input_validation(client, people):
    alice = people["alice"]
    assert create(client, alice, type="holiday", start_date="2026-12-07", end_date="2026-12-07").status_code == 422
    assert create(client, alice, type="annual", start_date="07/12/2026", end_date="2026-12-07").status_code == 422
    r = create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-07", comment="x" * 501)
    assert r.status_code == 422 and "comment" in r.json()["detail"]
    assert client.post("/api/leave-requests", json={"type": "annual"}, headers=as_user(alice)).status_code == 422


# ------------------------------------------------------------------ listing


def test_list_scopes(client, people):
    alice, bob, carol, manager, hr = (people[k] for k in ("alice", "bob", "carol", "manager", "hr"))
    a1 = create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    c1 = create(client, carol, type="annual", start_date="2026-12-08", end_date="2026-12-08").json()["request"]["id"]
    b1 = create(client, bob, type="annual", start_date="2026-12-09", end_date="2026-12-09").json()["request"]["id"]
    h1 = create(client, hr, type="annual", start_date="2026-12-10", end_date="2026-12-10").json()["request"]["id"]

    get = lambda u, scope: client.get(f"/api/leave-requests?scope={scope}", headers=as_user(u))  # noqa: E731
    assert ids(get(alice, "mine")) == [a1]
    assert ids(get(manager, "team")) == sorted([a1, c1])  # only direct reports
    assert ids(get(alice, "team")) == []  # nobody reports to Alice
    assert ids(get(manager, "to_approve")) == sorted([a1, c1])
    assert ids(get(hr, "to_approve")) == sorted([a1, c1, b1])  # everyone except HR's own request
    assert ids(get(hr, "team")) == sorted([a1, c1, b1, h1])
    assert get(alice, "all").status_code == 403
    assert ids(get(hr, "all")) == sorted([a1, c1, b1, h1])
    assert get(alice, "everything").status_code == 422


def test_list_filters(client, people):
    alice, hr = people["alice"], people["hr"]
    create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-08")
    create(client, alice, type="remote", start_date="2026-11-30", end_date="2026-11-30")
    sick = create(client, alice, type="sick", start_date="2026-11-16", end_date="2026-11-16").json()["request"]["id"]

    q = lambda qs: client.get(f"/api/leave-requests?scope=mine&{qs}", headers=as_user(alice)).json()  # noqa: E731
    assert [r["type"] for r in q("type=remote")] == ["remote"]
    assert [r["id"] for r in q("status=approved")] == [sick]
    assert [r["type"] for r in q("from=2026-12-01")] == ["annual"]
    assert {r["type"] for r in q("to=2026-11-30")} == {"remote", "sick"}
    assert len(client.get("/api/leave-requests?scope=all&type=sick&status=approved", headers=as_user(hr)).json()) == 1


def test_get_one_request_visibility(client, people):
    rid = create(client, people["alice"], type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    url = f"/api/leave-requests/{rid}"
    for who, code in [("alice", 200), ("manager", 200), ("hr", 200), ("bob", 403), ("carol", 403)]:
        assert client.get(url, headers=as_user(people[who])).status_code == code, who
    assert client.get("/api/leave-requests/9999", headers=as_user(people["hr"])).status_code == 404


def test_can_flags_follow_the_viewer(client, people):
    rid = create(client, people["alice"], type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    as_alice = client.get(f"/api/leave-requests/{rid}", headers=as_user(people["alice"])).json()
    as_max = client.get(f"/api/leave-requests/{rid}", headers=as_user(people["manager"])).json()
    assert as_alice["can_cancel"] and not as_alice["can_decide"]
    assert as_max["can_decide"] and not as_max["can_cancel"]


# ------------------------------------------------------------------ decisions


def test_approve_flow_and_permissions(client, people):
    alice, manager = people["alice"], people["manager"]
    rid = create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-11").json()["request"]["id"]
    url = f"/api/leave-requests/{rid}/approve"
    assert client.post(url, headers=as_user(people["bob"])).status_code == 403  # not her manager
    assert client.post(url, headers=as_user(people["carol"])).status_code == 403  # a peer
    assert client.post(url, headers=as_user(alice)).status_code == 403  # herself
    ok = client.post(url, json={"note": "Enjoy"}, headers=as_user(manager)).json()
    assert ok["status"] == "approved" and ok["decided_by_name"] == "Max" and ok["decision_note"] == "Enjoy"
    assert client.post(url, headers=as_user(manager)).status_code == 409  # already decided
    bal = client.get(f"/api/employees/{alice.id}/balance?year=2026", headers=as_user(alice)).json()
    assert (bal["taken_days"], bal["pending_days"], bal["available_days"]) == (5, 0, 15)


def test_hr_can_decide_for_anyone_but_not_for_themselves(client, people):
    bob_req = create(client, people["bob"], type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    hr_req = create(client, people["hr"], type="annual", start_date="2026-12-08", end_date="2026-12-08").json()["request"]["id"]
    assert client.post(f"/api/leave-requests/{bob_req}/approve", headers=as_user(people["hr"])).status_code == 200
    assert client.post(f"/api/leave-requests/{hr_req}/approve", headers=as_user(people["hr"])).status_code == 403


def test_reject_needs_a_reason(client, people):
    rid = create(client, people["alice"], type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    url = f"/api/leave-requests/{rid}/reject"
    for body in ({}, {"note": ""}, {"note": "   "}):
        assert client.post(url, json=body, headers=as_user(people["manager"])).status_code == 400
    r = client.post(url, json={"note": "Deadline"}, headers=as_user(people["manager"])).json()
    assert r["status"] == "rejected" and r["decision_note"] == "Deadline"
    # A refused request no longer reserves days.
    bal = client.get(f"/api/employees/{people['alice'].id}/balance", headers=as_user(people["alice"])).json()
    assert bal["pending_days"] == 0 and bal["available_days"] == 20


def test_decisions_on_missing_request(client, people):
    assert client.post("/api/leave-requests/9999/approve", headers=as_user(people["hr"])).status_code == 404


# ------------------------------------------------------------------ cancel & certificate


def test_cancel_rules(client, session, people):
    alice = people["alice"]
    pending = create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    assert client.post(f"/api/leave-requests/{pending}/cancel", headers=as_user(people["bob"])).status_code == 403
    assert client.post(f"/api/leave-requests/{pending}/cancel", headers=as_user(people["manager"])).status_code == 403
    assert client.post(f"/api/leave-requests/{pending}/cancel", headers=as_user(alice)).json()["status"] == "cancelled"
    assert client.post(f"/api/leave-requests/{pending}/cancel", headers=as_user(alice)).status_code == 409  # twice

    # Approved and in the future: can still be cancelled. Already started: no.
    future = create(client, alice, type="annual", start_date="2026-12-14", end_date="2026-12-14").json()["request"]["id"]
    client.post(f"/api/leave-requests/{future}/approve", headers=as_user(people["manager"]))
    assert client.post(f"/api/leave-requests/{future}/cancel", headers=as_user(alice)).status_code == 200
    started = create(client, alice, type="sick", start_date="2026-11-16", end_date="2026-11-16").json()["request"]["id"]
    r = client.post(f"/api/leave-requests/{started}/cancel", headers=as_user(alice))
    assert r.status_code == 409 and "already started" in r.json()["detail"]


def test_hr_can_cancel_for_someone(client, people):
    rid = create(client, people["alice"], type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    assert client.post(f"/api/leave-requests/{rid}/cancel", headers=as_user(people["hr"])).status_code == 200


def test_certificate(client, people):
    long_sick = create(client, people["alice"], type="sick", start_date="2026-11-16", end_date="2026-11-17").json()["request"]["id"]
    one_day = create(client, people["bob"], type="sick", start_date="2026-11-16", end_date="2026-11-16").json()["request"]["id"]
    url = f"/api/leave-requests/{long_sick}/certificate"
    assert client.post(url, headers=as_user(people["manager"])).status_code == 403  # HR only
    assert client.post(url, headers=as_user(people["alice"])).status_code == 403
    assert client.post(url, headers=as_user(people["hr"])).json()["certificate_received"] is True
    assert client.post(f"/api/leave-requests/{one_day}/certificate", headers=as_user(people["hr"])).status_code == 409
