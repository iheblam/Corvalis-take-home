"""Business rules from docs/leave.md: balances, request validation and who may do what."""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlmodel import Session, col, select

from app.models import (
    ACTIVE_STATUSES,
    Employee,
    LeaveAllowance,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
    PublicHoliday,
    Role,
)
from app.services import workdays

DEFAULT_ANNUAL_DAYS = 20  # leave.md: 20 days of paid holiday per calendar year
MAX_REMOTE_DAYS_PER_WEEK = 2  # leave.md: up to two days per week
TEAM_DAYS = {1: "Tuesday", 3: "Thursday"}  # leave.md: team days at the office


# ---------------------------------------------------------------- helpers


def holiday_dates(session: Session, start: date, end: date) -> set[date]:
    rows = session.exec(
        select(PublicHoliday.date).where(PublicHoliday.date >= start, PublicHoliday.date <= end)
    ).all()
    return set(rows)


def carry_over_deadline(year: int) -> date:
    return date(year, 3, 31)


def _active_requests(
    session: Session, employee_id: int, leave_type: LeaveType | None, start: date, end: date
) -> list[LeaveRequest]:
    query = select(LeaveRequest).where(
        LeaveRequest.employee_id == employee_id,
        col(LeaveRequest.status).in_(ACTIVE_STATUSES),
        LeaveRequest.start_date <= end,
        LeaveRequest.end_date >= start,
    )
    if leave_type is not None:
        query = query.where(LeaveRequest.type == leave_type)
    return list(session.exec(query).all())


# ---------------------------------------------------------------- balance


@dataclass
class Balance:
    year: int
    annual_days: int
    carried_over_days: int
    carry_over_deadline: date
    taken_days: int  # approved annual days in this year
    pending_days: int  # requested, not decided yet (already reserved)
    carried_over_used: int
    carried_over_expired: int
    available_days: int


def compute_balance(
    session: Session,
    employee_id: int,
    year: int,
    extra: tuple[date, date] | None = None,
    exclude_request_id: int | None = None,
) -> Balance:
    """Balance for one calendar year.

    Carried-over days only cover annual leave taken on or before 31 March. `extra` adds a
    hypothetical request (used to check a new request before saving it).
    """
    allowance = session.exec(
        select(LeaveAllowance).where(
            LeaveAllowance.employee_id == employee_id, LeaveAllowance.year == year
        )
    ).first()
    annual = allowance.annual_days if allowance else DEFAULT_ANNUAL_DAYS
    carry = allowance.carried_over_days if allowance else 0

    year_start, year_end = date(year, 1, 1), date(year, 12, 31)
    deadline = carry_over_deadline(year)
    holidays = holiday_dates(session, year_start, year_end)

    taken = pending = booked_q1 = 0
    requests = _active_requests(session, employee_id, LeaveType.annual, year_start, year_end)
    for req in requests:
        if req.id == exclude_request_id:
            continue
        days = workdays.working_days(max(req.start_date, year_start), min(req.end_date, year_end), holidays)
        if req.status == LeaveStatus.approved:
            taken += len(days)
        else:
            pending += len(days)
        booked_q1 += sum(1 for d in days if d <= deadline)

    if extra:
        days = workdays.working_days(max(extra[0], year_start), min(extra[1], year_end), holidays)
        pending += len(days)
        booked_q1 += sum(1 for d in days if d <= deadline)

    carry_used = min(carry, booked_q1)
    carry_left = carry - carry_used
    expired = carry_left if workdays.today() > deadline else 0
    annual_left = annual - (taken + pending - carry_used)
    return Balance(
        year=year,
        annual_days=annual,
        carried_over_days=carry,
        carry_over_deadline=deadline,
        taken_days=taken,
        pending_days=pending,
        carried_over_used=carry_used,
        carried_over_expired=expired,
        available_days=annual_left + carry_left - expired,
    )


# ---------------------------------------------------------------- validation


@dataclass
class Check:
    working_days: int = 0
    certificate_required: bool = False
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _fmt(d: date) -> str:
    return d.strftime("%a %d %b %Y")


def check_request(
    session: Session, employee: Employee, leave_type: LeaveType, start: date, end: date
) -> Check:
    """Validate a new request. Errors block it; warnings are shown but allow it."""
    check = Check()
    today = workdays.today()

    if end < start:
        check.errors.append("The end date is before the start date.")
        return check
    if (end - start).days > 366:
        check.errors.append("A request cannot be longer than one year.")
        return check

    holidays = holiday_dates(session, start, end)
    days = workdays.working_days(start, end, holidays)
    check.working_days = len(days)

    if not days:
        check.errors.append("There is no working day in this period (weekend or public holiday).")
        return check

    if leave_type != LeaveType.sick and start < today:
        check.errors.append("Leave cannot start in the past. Ask HR to record past absences.")

    # No overlap with the employee's own pending or approved requests.
    for other in _active_requests(session, employee.id, None, start, end):
        check.errors.append(
            f"You already have {other.type.value} leave ({other.status.value}) "
            f"from {_fmt(other.start_date)} to {_fmt(other.end_date)}."
        )

    if leave_type == LeaveType.annual:
        for year in sorted({d.year for d in days}):
            balance = compute_balance(session, employee.id, year, extra=(start, end))
            if balance.available_days < 0:
                needed = sum(1 for d in days if d.year == year)
                left = balance.available_days + needed
                check.errors.append(
                    f"Not enough leave in {year}: {left} day(s) left, this request needs {needed}."
                )
        if any(d.year > today.year for d in days):
            check.warnings.append("Days in next year are taken from next year's allowance.")

    elif leave_type == LeaveType.remote:
        team_days = sorted({TEAM_DAYS[d.weekday()] for d in days if d.weekday() in TEAM_DAYS})
        if team_days:
            verb = "are team days" if len(team_days) > 1 else "is a team day"
            check.errors.append(
                f"{' and '.join(team_days)} {verb} at the office: remote work is not possible."
            )
        # Count this request's days plus already booked remote days, per ISO week.
        per_week: dict[tuple[int, int], int] = defaultdict(int)
        for d in days:
            per_week[d.isocalendar()[:2]] += 1
        first_monday = start - timedelta(days=start.weekday())
        last_sunday = end + timedelta(days=6 - end.weekday())
        week_holidays = holiday_dates(session, first_monday, last_sunday)
        for other in _active_requests(session, employee.id, LeaveType.remote, first_monday, last_sunday):
            for d in workdays.working_days(other.start_date, other.end_date, week_holidays):
                key = d.isocalendar()[:2]
                if key in per_week:
                    per_week[key] += 1
        too_many = sorted(k for k, n in per_week.items() if n > MAX_REMOTE_DAYS_PER_WEEK)
        if too_many:
            weeks = ", ".join(f"week {w}" for _, w in too_many)
            check.errors.append(
                f"Remote work is limited to {MAX_REMOTE_DAYS_PER_WEEK} days per week ({weeks})."
            )

    elif leave_type == LeaveType.sick:
        check.certificate_required = len(days) > 1
        if check.certificate_required:
            check.warnings.append(
                "A medical certificate is required from the second day of illness: send it to HR."
            )
        if start > today:
            check.warnings.append("Sick leave is normally reported on the first day of illness.")
        else:
            check.warnings.append("Remember to inform your manager before 9:00 on the first day.")

    elif leave_type == LeaveType.unpaid:
        check.warnings.append("Unpaid leave is not deducted from your holidays but needs HR's agreement.")

    if leave_type != LeaveType.remote and check.ok:
        away = _colleagues_away(session, employee, start, end)
        if away:
            names = ", ".join(away[:3]) + (f" and {len(away) - 3} more" if len(away) > 3 else "")
            check.warnings.append(f"Also away from your department in this period: {names}.")

    return check


def _colleagues_away(session: Session, employee: Employee, start: date, end: date) -> list[str]:
    rows = session.exec(
        select(Employee.full_name)
        .join(LeaveRequest, LeaveRequest.employee_id == Employee.id)
        .where(
            Employee.department == employee.department,
            Employee.id != employee.id,
            col(LeaveRequest.status).in_(ACTIVE_STATUSES),
            LeaveRequest.type != LeaveType.remote,
            LeaveRequest.start_date <= end,
            LeaveRequest.end_date >= start,
        )
        .distinct()
    ).all()
    return sorted(rows)


# ---------------------------------------------------------------- permissions


def can_decide(user: Employee, request: LeaveRequest, owner: Employee) -> bool:
    """HR decides on anyone's request; a manager on their direct reports'. Never on your own."""
    if request.employee_id == user.id:
        return False
    return user.role == Role.hr or owner.manager_id == user.id


def can_view(user: Employee, owner: Employee) -> bool:
    return user.id == owner.id or user.role == Role.hr or owner.manager_id == user.id


def can_cancel(user: Employee, request: LeaveRequest) -> str | None:
    """Return None when allowed, otherwise the reason."""
    if request.employee_id != user.id and user.role != Role.hr:
        return "You can only cancel your own requests."
    if request.status == LeaveStatus.pending:
        return None
    if request.status == LeaveStatus.approved:
        if request.start_date > workdays.today():
            return None
        return "This leave has already started; ask HR to change it."
    return f"This request is already {request.status.value}."
