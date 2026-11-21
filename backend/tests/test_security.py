"""Access control, input hardening and HTTP headers."""

import pytest

from tests.conftest import as_user, create


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "no-referrer"
    assert r.headers["Cache-Control"] == "no-store"


def test_cors_only_allows_the_frontend(client):
    preflight = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-User-Id"}
    ok = client.options("/api/leave-requests", headers={"Origin": "http://localhost:5173", **preflight})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    evil = client.options("/api/leave-requests", headers={"Origin": "https://evil.example", **preflight})
    assert "access-control-allow-origin" not in evil.headers
    delete = client.options("/api/leave-requests", headers={"Origin": "http://localhost:5173",
                                                             "Access-Control-Request-Method": "DELETE"})
    assert delete.status_code == 400  # method not allowed by CORS


@pytest.mark.parametrize("header", ["abc", "1 OR 1=1", "1; DROP TABLE employee", "-1", "0", "99999999"])
def test_bad_user_header_is_refused(client, people, header):
    r = client.get("/api/leave-requests", headers={"X-User-Id": header})
    assert r.status_code in (401, 422)
    assert isinstance(r.json()["detail"], str)


@pytest.mark.parametrize(
    "url",
    [
        "/api/employees?department=structures' OR '1'='1",
        "/api/leave-requests?scope=all' --",
        "/api/leave-requests?status=approved;DROP TABLE leaverequest",
        "/api/calendar?start=2026-12-01'&end=2026-12-31",
        "/api/availability?date=2026-12-01 OR 1=1",
    ],
)
def test_injection_attempts_are_rejected_by_validation(client, people, url):
    r = client.get(url, headers=as_user(people["hr"]))
    assert r.status_code == 422
    assert client.get("/api/employees").status_code == 200  # database intact


def test_text_is_stored_as_plain_data(client, people):
    payload = "<script>alert('x')</script>"
    r = create(client, people["alice"], type="annual", start_date="2026-12-07", end_date="2026-12-07", comment=payload)
    assert r.json()["request"]["comment"] == payload  # stored verbatim; React renders it as text, never as HTML


# Every protected endpoint refuses anonymous calls.
ANONYMOUS = [
    ("get", "/api/employees/me"),
    ("get", "/api/employees/1"),
    ("get", "/api/employees/1/balance"),
    ("get", "/api/leave-requests"),
    ("get", "/api/leave-requests/1"),
    ("post", "/api/leave-requests"),
    ("post", "/api/leave-requests/preview"),
    ("post", "/api/leave-requests/1/approve"),
    ("post", "/api/leave-requests/1/reject"),
    ("post", "/api/leave-requests/1/cancel"),
    ("post", "/api/leave-requests/1/certificate"),
    ("get", "/api/calendar?start=2026-12-01&end=2026-12-31"),
    ("get", "/api/availability?date=2026-12-01"),
]


@pytest.mark.parametrize("method,url", ANONYMOUS)
def test_anonymous_calls_are_refused(client, people, method, url):
    body = {"type": "annual", "start_date": "2026-12-07", "end_date": "2026-12-07", "note": "x"}
    r = client.request(method.upper(), url, json=body if method == "post" else None)
    assert r.status_code == 401, (method, url, r.status_code)


def test_employee_cannot_reach_manager_or_hr_actions(client, people):
    """An employee typing URLs by hand gets 403, never data."""
    alice, bob = people["alice"], people["bob"]
    rid = create(client, alice, type="sick", start_date="2026-11-16", end_date="2026-11-17").json()["request"]["id"]
    h = as_user(bob)
    assert client.get("/api/leave-requests?scope=all", headers=h).status_code == 403
    assert client.get(f"/api/leave-requests/{rid}", headers=h).status_code == 403
    assert client.get(f"/api/employees/{alice.id}/balance", headers=h).status_code == 403
    assert client.post(f"/api/leave-requests/{rid}/approve", headers=h).status_code == 403
    assert client.post(f"/api/leave-requests/{rid}/reject", json={"note": "no"}, headers=h).status_code == 403
    assert client.post(f"/api/leave-requests/{rid}/cancel", headers=h).status_code == 403
    assert client.post(f"/api/leave-requests/{rid}/certificate", headers=h).status_code == 403
    # Bob's "mine" never contains Alice's request.
    assert client.get("/api/leave-requests?scope=mine", headers=h).json() == []


def test_a_manager_only_manages_direct_reports(client, people):
    bob_req = create(client, people["bob"], type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    max_h = as_user(people["manager"])
    assert client.get(f"/api/leave-requests/{bob_req}", headers=max_h).status_code == 403
    assert client.post(f"/api/leave-requests/{bob_req}/approve", headers=max_h).status_code == 403
    assert client.get(f"/api/employees/{people['bob'].id}/balance", headers=max_h).status_code == 403


def test_unknown_routes_and_methods(client, people):
    assert client.get("/api/admin").status_code == 404
    assert client.delete("/api/leave-requests/1", headers=as_user(people["hr"])).status_code == 405
    assert client.put("/api/employees/1", headers=as_user(people["hr"])).status_code == 405
