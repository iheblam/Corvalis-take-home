from datetime import date

from app.models import LeaveAllowance, LeaveRequest, LeaveStatus, LeaveType
from app.services.leave_rules import check_request, compute_balance


def book(session, emp, t, start, end, status=LeaveStatus.approved, days=1):
    session.add(LeaveRequest(employee_id=emp.id, type=t, start_date=start, end_date=end,
                             working_days=days, status=status))
    session.commit()


def test_remote_on_team_day_is_blocked(session, people):
    c = check_request(session, people["alice"], LeaveType.remote, date(2026, 11, 24), date(2026, 11, 24))
    assert not c.ok and "Tuesday" in c.errors[0]


def test_third_remote_day_in_a_week_is_blocked(session, people):
    alice = people["alice"]
    book(session, alice, LeaveType.remote, date(2026, 11, 23), date(2026, 11, 23))  # Mon
    book(session, alice, LeaveType.remote, date(2026, 11, 25), date(2026, 11, 25), LeaveStatus.pending)  # Wed
    c = check_request(session, alice, LeaveType.remote, date(2026, 11, 27), date(2026, 11, 27))  # Fri
    assert any("2 days per week" in e for e in c.errors)
    # The following week is fine.
    assert check_request(session, alice, LeaveType.remote, date(2026, 11, 30), date(2026, 11, 30)).ok


def test_balance_counts_approved_and_pending(session, people):
    alice = people["alice"]
    book(session, alice, LeaveType.annual, date(2026, 7, 6), date(2026, 7, 10), days=5)
    book(session, alice, LeaveType.annual, date(2026, 12, 1), date(2026, 12, 2), LeaveStatus.pending, 2)
    b = compute_balance(session, alice.id, 2026)
    assert (b.taken_days, b.pending_days, b.available_days) == (5, 2, 13)


def test_not_enough_leave(session, people):
    alice = people["alice"]
    book(session, alice, LeaveType.annual, date(2026, 6, 1), date(2026, 6, 25), days=19)  # 19 working days
    c = check_request(session, alice, LeaveType.annual, date(2026, 12, 1), date(2026, 12, 2))
    assert any("Not enough leave in 2026: 1 day(s) left" in e for e in c.errors)


def test_carry_over_only_before_31_march(session, people):
    alice = people["alice"]
    session.add(LeaveAllowance(employee_id=alice.id, year=2027, annual_days=20, carried_over_days=3))
    session.commit()
    # 3 days in early March use the carry-over: the 20 annual days stay untouched.
    book(session, alice, LeaveType.annual, date(2027, 3, 1), date(2027, 3, 3), LeaveStatus.pending, 3)
    assert compute_balance(session, alice.id, 2027).available_days == 20
    # 21 days after March cannot use carry-over: blocked.
    c = check_request(session, alice, LeaveType.annual, date(2027, 6, 1), date(2027, 6, 29))
    assert not c.ok


def test_overlap_and_past_dates(session, people):
    alice = people["alice"]
    book(session, alice, LeaveType.annual, date(2026, 12, 7), date(2026, 12, 11), days=5)
    assert not check_request(session, alice, LeaveType.annual, date(2026, 12, 10), date(2026, 12, 14)).ok
    assert not check_request(session, alice, LeaveType.annual, date(2026, 11, 2), date(2026, 11, 3)).ok


def test_sick_leave_needs_certificate_from_day_two(session, people):
    c = check_request(session, people["alice"], LeaveType.sick, date(2026, 11, 16), date(2026, 11, 17))
    assert c.ok and c.certificate_required and c.working_days == 2
