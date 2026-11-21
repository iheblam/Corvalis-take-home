from tests.conftest import as_user, create


def test_calendar_days_and_rows(client, people):
    alice, manager = people["alice"], people["manager"]
    create(client, alice, type="annual", start_date="2026-12-21", end_date="2026-12-24")
    cal = client.get("/api/calendar?start=2026-12-21&end=2026-12-31", headers=as_user(alice)).json()
    days = {d["date"]: d for d in cal["days"]}
    assert len(days) == 11
    assert days["2026-12-25"] == {"date": "2026-12-25", "is_working_day": False, "holiday_name": "Christmas Day"}
    assert days["2026-12-26"]["is_working_day"] is False and days["2026-12-26"]["holiday_name"] is None  # Saturday
    assert days["2026-12-28"]["is_working_day"] is True
    rows = {r["employee"]["full_name"]: r["absences"] for r in cal["rows"]}
    assert len(rows) == 5 and rows["Bob"] == []
    assert rows["Alice"][0]["status"] == "pending" and rows["Alice"][0]["type"] == "annual"
    assert manager  # fixture used


def test_calendar_filters_and_excluded_statuses(client, people):
    alice = people["alice"]
    rid = create(client, alice, type="annual", start_date="2026-12-07", end_date="2026-12-07").json()["request"]["id"]
    client.post(f"/api/leave-requests/{rid}/cancel", headers=as_user(alice))
    cal = client.get("/api/calendar?start=2026-12-01&end=2026-12-31&department=structures", headers=as_user(alice)).json()
    assert {r["employee"]["full_name"] for r in cal["rows"]} == {"Max", "Alice", "Bob"}
    assert all(r["absences"] == [] for r in cal["rows"])  # cancelled leave is not shown
    liege = client.get("/api/calendar?start=2026-12-01&end=2026-12-31&office=liege", headers=as_user(alice)).json()
    assert [r["employee"]["full_name"] for r in liege["rows"]] == ["Carol"]


def test_calendar_range_validation(client, people):
    h = as_user(people["alice"])
    assert client.get("/api/calendar?start=2026-12-10&end=2026-12-01", headers=h).status_code == 400
    assert client.get("/api/calendar?start=2026-01-01&end=2026-12-31", headers=h).status_code == 400
    assert client.get("/api/calendar?start=2026-12-01", headers=h).status_code == 422
    assert client.get("/api/calendar?start=2026-12-01&end=2026-12-31").status_code == 401


def test_sick_reason_only_for_self_manager_and_hr(client, people):
    create(client, people["alice"], type="sick", start_date="2026-11-16", end_date="2026-11-17")
    url = "/api/calendar?start=2026-11-16&end=2026-11-20"

    def alice_type(viewer):
        cal = client.get(url, headers=as_user(people[viewer])).json()
        return next(r for r in cal["rows"] if r["employee"]["full_name"] == "Alice")["absences"][0]["type"]

    assert alice_type("alice") == "sick"
    assert alice_type("manager") == "sick"
    assert alice_type("hr") == "sick"
    assert alice_type("bob") == "away"
    assert alice_type("carol") == "away"


def test_availability_columns_and_return_day(client, people):
    alice, carol, manager = people["alice"], people["carol"], people["manager"]
    create(client, alice, type="annual", start_date="2026-12-21", end_date="2026-12-24")
    create(client, carol, type="remote", start_date="2026-12-23", end_date="2026-12-23")
    a = client.get("/api/availability?date=2026-12-23", headers=as_user(manager)).json()
    assert a["is_working_day"] is True and a["holiday_name"] is None
    assert {p["full_name"] for p in a["available"]} == {"Hanna", "Max", "Bob"}
    assert [p["full_name"] for p in a["remote"]] == ["Carol"]
    away = a["absent"][0]
    # Back after Christmas (Fri 25 = holiday, then the weekend).
    assert away["employee"]["full_name"] == "Alice" and away["status"] == "pending" and away["back_on"] == "2026-12-28"


def test_availability_on_a_holiday_and_with_filters(client, people):
    h = as_user(people["alice"])
    xmas = client.get("/api/availability?date=2026-12-25", headers=h).json()
    assert xmas["is_working_day"] is False and xmas["holiday_name"] == "Christmas Day"
    liege = client.get("/api/availability?date=2026-12-23&office=liege", headers=h).json()
    assert [p["full_name"] for p in liege["available"]] == ["Carol"]
    assert client.get("/api/availability", headers=h).status_code == 422  # date is required
    assert client.get("/api/availability?date=2026-12-23").status_code == 401


def test_holidays(client, people):
    hols = client.get("/api/holidays?year=2026").json()
    assert len(hols) == 11  # 10 public holidays + 1 replacement (All Saints' Day on a Sunday)
    assert {"date": "2026-11-02", "name": "All Saints' Day (replacement day)", "is_replacement_day": True} in hols
    assert client.get("/api/holidays").json() == hols  # defaults to the current year
    assert client.get("/api/holidays?year=1990").json() == []
