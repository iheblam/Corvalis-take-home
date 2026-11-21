"""The sample data must itself respect the leave policy."""

from collections import Counter, defaultdict

import pytest
from sqlmodel import select

from app.models import ACTIVE_STATUSES, Department, Employee, LeaveRequest, LeaveStatus, LeaveType, PublicHoliday, Role
from app.seed import seed, seed_if_empty
from app.services import workdays
from app.services.leave_rules import compute_balance
from tests.conftest import TODAY


@pytest.fixture
def seeded(empty_session):
    seed(empty_session, today=TODAY)
    return empty_session


def test_org_chart(seeded):
    staff = seeded.exec(select(Employee)).all()
    counts = Counter(e.department for e in staff)
    assert counts == {Department.management: 3, Department.structures: 18, Department.building_services: 14,
                      Department.drawing_office: 5, Department.office: 10}
    assert len({e.email for e in staff}) == 50
    assert [e.full_name for e in staff if e.manager_id is None] == ["Philippe Janssens"]
    ids = {e.id for e in staff}
    assert all(e.manager_id in ids for e in staff if e.manager_id)
    assert sum(e.role == Role.hr for e in staff) == 2


def test_no_management_cycles(seeded):
    by_id = {e.id: e for e in seeded.exec(select(Employee)).all()}
    for e in by_id.values():
        seen, cur = set(), e
        while cur.manager_id:
            assert cur.id not in seen
            seen.add(cur.id)
            cur = by_id[cur.manager_id]


def test_requests_respect_the_rules(seeded):
    requests = seeded.exec(select(LeaveRequest)).all()
    assert len(requests) > 150
    holidays = set(seeded.exec(select(PublicHoliday.date)).all())
    active = [r for r in requests if r.status in ACTIVE_STATUSES]

    # No employee is away twice at the same time.
    per_emp = defaultdict(list)
    for r in active:
        per_emp[r.employee_id].append(r)
    for rs in per_emp.values():
        rs.sort(key=lambda r: r.start_date)
        for a, b in zip(rs, rs[1:]):
            assert a.end_date < b.start_date

    # Remote work: never Tuesday / Thursday, at most 2 days per week.
    remote_weeks = Counter()
    for r in active:
        if r.type == LeaveType.remote:
            for d in workdays.working_days(r.start_date, r.end_date, holidays):
                assert d.weekday() not in (1, 3)
                remote_weeks[(r.employee_id, d.isocalendar()[:2])] += 1
    assert max(remote_weeks.values()) <= 2

    for r in requests:
        assert r.working_days == workdays.count_working_days(r.start_date, r.end_date, holidays) > 0
        if r.type == LeaveType.sick:
            assert r.status == LeaveStatus.approved
            assert r.certificate_required == (r.working_days > 1)
        if r.status == LeaveStatus.rejected:
            assert r.decision_note


def test_nobody_is_over_their_allowance(seeded):
    for e in seeded.exec(select(Employee)).all():
        for year in (TODAY.year, TODAY.year + 1):
            assert compute_balance(seeded, e.id, year).available_days >= 0, (e.full_name, year)


def test_demo_has_work_to_show(seeded):
    requests = seeded.exec(select(LeaveRequest)).all()
    assert sum(r.status == LeaveStatus.pending for r in requests) >= 10  # approvals page
    assert any(r.type == LeaveType.sick and r.certificate_required and not r.certificate_received for r in requests)
    assert any(r.status == LeaveStatus.rejected for r in requests)
    assert any(r.type == LeaveType.unpaid for r in requests)


def test_seed_runs_only_once(empty_session):
    assert seed_if_empty(empty_session) is True
    count = len(empty_session.exec(select(LeaveRequest)).all())
    assert seed_if_empty(empty_session) is False
    assert len(empty_session.exec(select(LeaveRequest)).all()) == count
