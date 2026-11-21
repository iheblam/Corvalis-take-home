"""Realistic sample data for Corvalis, generated around today's date so the demo always looks current.

Run on startup when the database is empty. Reset with:  uv run python -m app.seed --reset
"""

import random
import sys
import unicodedata
from datetime import UTC, date, datetime, timedelta

from sqlmodel import Session, SQLModel, select

from app.models import (
    Department,
    Employee,
    LeaveAllowance,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
    Office,
    PublicHoliday,
    Role,
)
from app.services import workdays

B, L = Office.brussels, Office.liege
D = Department

# (key, full name, job title, department, office, role, manager key)
# Org chart from the brief: management 3, structures 18, building services 14, drawing office 5,
# office 10 (finance 3, HR 2, IT desk 2, reception 3).
ROSTER: list[tuple[str, str, str, Department, Office, Role, str | None]] = [
    # Management (3)
    ("md", "Philippe Janssens", "Managing Director", D.management, B, Role.manager, None),
    ("fd", "Isabelle Dubois", "Finance Director", D.management, B, Role.manager, "md"),
    ("td", "Marc Peeters", "Technical Director", D.management, L, Role.manager, "md"),
    # Structures (18): two team leads, each approving their office's engineers
    ("st_b", "Sophie Lambert", "Head of Structures (Brussels)", D.structures, B, Role.manager, "td"),
    ("st_l", "Thomas Wouters", "Structures Team Lead (Liège)", D.structures, L, Role.manager, "td"),
    ("s1", "Pieter Van den Broeck", "Project Manager – Structures", D.structures, B, Role.employee, "st_b"),
    ("s2", "Camille Leroy", "Project Manager – Structures", D.structures, B, Role.employee, "st_b"),
    ("s3", "Arnaud Collignon", "Project Manager – Structures", D.structures, L, Role.employee, "st_l"),
    ("s4", "Lotte Jacobs", "Senior Structural Engineer", D.structures, B, Role.employee, "st_b"),
    ("s5", "Maxime Renard", "Senior Structural Engineer", D.structures, B, Role.employee, "st_b"),
    ("s6", "Elise Goossens", "Structural Engineer", D.structures, B, Role.employee, "st_b"),
    ("s7", "Nicolas Lejeune", "Structural Engineer", D.structures, B, Role.employee, "st_b"),
    ("s8", "Hanne De Smet", "Structural Engineer", D.structures, B, Role.employee, "st_b"),
    ("s9", "Youssef El Amrani", "Structural Engineer", D.structures, B, Role.employee, "st_b"),
    ("s10", "Charlotte Vermeulen", "Structural Engineer", D.structures, B, Role.employee, "st_b"),
    ("s11", "Julien Mathieu", "Senior Structural Engineer", D.structures, L, Role.employee, "st_l"),
    ("s12", "Amélie Fontaine", "Structural Engineer", D.structures, L, Role.employee, "st_l"),
    ("s13", "Benoît Henrard", "Structural Engineer", D.structures, L, Role.employee, "st_l"),
    ("s14", "Manon Delvaux", "Structural Engineer", D.structures, L, Role.employee, "st_l"),
    ("s15", "Ruben Claessens", "Junior Structural Engineer", D.structures, B, Role.employee, "st_b"),
    ("s16", "Laura Simon", "Junior Structural Engineer", D.structures, L, Role.employee, "st_l"),
    # Building services (14)
    ("bs_h", "Kevin Maes", "Head of Building Services", D.building_services, B, Role.manager, "td"),
    ("b1", "Ann Willems", "Project Manager – HVAC", D.building_services, B, Role.employee, "bs_h"),
    ("b2", "Olivier Lemmens", "Project Manager – MEP", D.building_services, L, Role.employee, "bs_h"),
    ("b3", "Sarah Bogaert", "HVAC Engineer", D.building_services, B, Role.employee, "bs_h"),
    ("b4", "Mehdi Bensaïd", "HVAC Engineer", D.building_services, B, Role.employee, "bs_h"),
    ("b5", "Jonas Hermans", "HVAC Engineer", D.building_services, L, Role.employee, "bs_h"),
    ("b6", "Chloé Gilson", "Electrical Engineer", D.building_services, B, Role.employee, "bs_h"),
    ("b7", "Wouter Desmet", "Electrical Engineer", D.building_services, B, Role.employee, "bs_h"),
    ("b8", "Pauline Hubert", "Electrical Engineer", D.building_services, L, Role.employee, "bs_h"),
    ("b9", "Bram Verstraete", "Plumbing & Fire Safety Engineer", D.building_services, B, Role.employee, "bs_h"),
    ("b10", "Inès Kabongo", "Energy Performance Engineer", D.building_services, B, Role.employee, "bs_h"),
    ("b11", "Simon Dupont", "Energy Performance Engineer", D.building_services, L, Role.employee, "bs_h"),
    ("b12", "Eva Martens", "Junior MEP Engineer", D.building_services, B, Role.employee, "bs_h"),
    ("b13", "Antoine Lecocq", "Junior MEP Engineer", D.building_services, L, Role.employee, "bs_h"),
    # Drawing office (5)
    ("do_h", "Julie Lemaire", "Drawing Office Lead", D.drawing_office, L, Role.manager, "td"),
    ("d1", "Stijn Peeters", "BIM Draughtsman", D.drawing_office, B, Role.employee, "do_h"),
    ("d2", "Valérie Thiry", "CAD Draughtswoman", D.drawing_office, L, Role.employee, "do_h"),
    ("d3", "Dries Van Damme", "BIM Draughtsman", D.drawing_office, B, Role.employee, "do_h"),
    ("d4", "Gaëlle Remacle", "CAD Draughtswoman", D.drawing_office, L, Role.employee, "do_h"),
    # Office (10): finance 3, HR 2, IT desk 2, reception 3
    ("f1", "Bart Van Acker", "Accountant", D.office, B, Role.employee, "fd"),
    ("f2", "Fatima Ouali", "Accountant", D.office, B, Role.employee, "fd"),
    ("f3", "Christine Lambrechts", "Finance Officer", D.office, L, Role.employee, "fd"),
    ("hr1", "Nathalie Claes", "HR Manager", D.office, B, Role.hr, "md"),
    ("hr2", "Sarah Mertens", "HR Officer", D.office, B, Role.hr, "hr1"),
    ("it1", "Tom Vandenberghe", "IT Desk", D.office, B, Role.employee, "td"),
    ("it2", "Kevin Lambert", "IT Desk", D.office, L, Role.employee, "td"),
    ("r1", "Marie Declercq", "Receptionist", D.office, B, Role.employee, "hr1"),
    ("r2", "Sofia Rossi", "Receptionist", D.office, B, Role.employee, "hr1"),
    ("r3", "Aurélie Gérard", "Receptionist", D.office, L, Role.employee, "hr1"),
]


def _email(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    first, *rest = ascii_name.lower().split()
    return f"{first}.{''.join(rest)}@corvalis.be"


class _Builder:
    def __init__(self, session: Session, today: date, rng: random.Random):
        self.s = session
        self.today = today
        self.rng = rng
        self.holidays: set[date] = set()
        self.booked: dict[int, list[tuple[date, date]]] = {}
        self.annual_used: dict[tuple[int, int], int] = {}

    def add(self, emp: Employee, leave_type: LeaveType, start: date, end: date, status: LeaveStatus,
            decider: Employee | None = None, note: str | None = None, comment: str | None = None,
            certificate_received: bool = False) -> LeaveRequest | None:
        days = workdays.working_days(start, end, self.holidays)
        if not days:
            return None
        if status in (LeaveStatus.pending, LeaveStatus.approved):
            for s, e in self.booked.get(emp.id, []):
                if s <= end and e >= start:
                    return None
            if leave_type == LeaveType.annual:  # never exceed the 20-day allowance in a year
                per_year: dict[int, int] = {}
                for d in days:
                    per_year[d.year] = per_year.get(d.year, 0) + 1
                if any(self.annual_used.get((emp.id, y), 0) + n > 20 for y, n in per_year.items()):
                    return None
                for y, n in per_year.items():
                    self.annual_used[(emp.id, y)] = self.annual_used.get((emp.id, y), 0) + n
            self.booked.setdefault(emp.id, []).append((start, end))
        created = datetime.combine(min(start, self.today) - timedelta(days=self.rng.randint(3, 20)),
                                   datetime.min.time(), tzinfo=UTC).replace(hour=self.rng.randint(8, 17))
        decided = status in (LeaveStatus.approved, LeaveStatus.rejected)
        req = LeaveRequest(
            employee_id=emp.id, type=leave_type, start_date=start, end_date=end,
            working_days=len(days), status=status, comment=comment, created_at=created,
            decided_by_id=decider.id if decided and decider else None,
            decided_at=created + timedelta(hours=self.rng.randint(2, 30)) if decided else None,
            decision_note=note,
            certificate_required=leave_type == LeaveType.sick and len(days) > 1,
            certificate_received=certificate_received,
        )
        self.s.add(req)
        return req

    def next_workday(self, d: date) -> date:
        while not workdays.is_working_day(d, self.holidays):
            d += timedelta(days=1)
        return d

    def block(self, start: date, length: int) -> tuple[date, date]:
        """`length` working days starting on the first working day >= start."""
        s = self.next_workday(start)
        e, n = s, 1
        while n < length:
            e += timedelta(days=1)
            if workdays.is_working_day(e, self.holidays):
                n += 1
        return s, e


def seed(session: Session, today: date | None = None) -> None:
    today = today or workdays.today()
    rng = random.Random(42)
    b = _Builder(session, today, rng)

    # Public holidays: previous, current and next year.
    for year in (today.year - 1, today.year, today.year + 1):
        for d, name, replacement in workdays.belgian_holidays(year):
            session.add(PublicHoliday(date=d, name=name, is_replacement_day=replacement))
            b.holidays.add(d)

    # Employees (two passes so managers exist before their reports reference them).
    people: dict[str, Employee] = {}
    for key, name, title, dept, office, role, _ in ROSTER:
        people[key] = Employee(full_name=name, email=_email(name), job_title=title,
                               department=dept, office=office, role=role)
        session.add(people[key])
    session.flush()
    for key, *_, manager_key in ROSTER:
        if manager_key:
            people[key].manager_id = people[manager_key].id
    session.flush()

    def manager_of(e: Employee) -> Employee | None:
        return session.get(Employee, e.manager_id) if e.manager_id else None

    # Allowances: 20 days, some carry-over from the year before.
    for e in people.values():
        for year in (today.year, today.year + 1):
            session.add(LeaveAllowance(employee_id=e.id, year=year, annual_days=20,
                                       carried_over_days=rng.choice([0, 0, 1, 2, 3, 5])))

    staff = list(people.values())
    year_start = date(today.year, 1, 1)

    # 1. Holidays already taken this year (approved), 2–3 blocks per person.
    for e in staff:
        target = rng.randint(7, 13)
        for _ in range(8):
            if target <= 0:
                break
            length = min(target, rng.choice([1, 2, 3, 5, 5]))
            offset = rng.randint(0, max(1, (today - year_start).days - 10))
            s, end = b.block(year_start + timedelta(days=offset), length)
            if end >= today:
                continue
            if b.add(e, LeaveType.annual, s, end, LeaveStatus.approved, manager_of(e)):
                target -= length

    # 2. Christmas break: most people, mostly approved, some still pending.
    xmas_start = date(today.year, 12, 21)
    if xmas_start > today:
        for e in rng.sample(staff, 30):
            s = xmas_start + timedelta(days=rng.choice([0, 0, 4, 7]))
            length = rng.choice([3, 4, 5, 8])
            s, end = b.block(s, length)
            status = LeaveStatus.pending if rng.random() < 0.2 else LeaveStatus.approved
            b.add(e, LeaveType.annual, s, end, status, manager_of(e), comment="Christmas holidays")

    # 3. Upcoming leave in the next weeks: a mix of approved and pending (fills the approvals page).
    comments = [None, None, "Family visit", "Long weekend", "Moving house", "School holidays", "Wedding"]
    for e in rng.sample(staff, 22):
        s, end = b.block(today + timedelta(days=rng.randint(2, 40)), rng.choice([1, 1, 2, 3, 5]))
        status = LeaveStatus.pending if rng.random() < 0.45 else LeaveStatus.approved
        b.add(e, LeaveType.annual, s, end, status, manager_of(e), comment=rng.choice(comments))

    # 4. People away today, so the home page and availability have something to show.
    for e in rng.sample(staff, 4):
        s, end = b.block(today - timedelta(days=rng.randint(0, 2)), rng.choice([3, 4, 5]))
        b.add(e, LeaveType.annual, min(s, today), end, LeaveStatus.approved, manager_of(e))

    # 5. Remote work on Mon / Wed / Fri (never Tue/Thu team days), max 2 per week.
    monday = today - timedelta(days=today.weekday())
    for e in rng.sample(staff, 16):
        for week in range(-2, 4):
            for wd in rng.sample([0, 2, 4], rng.choice([1, 1, 2])):
                d = monday + timedelta(weeks=week, days=wd)
                status = LeaveStatus.approved if d < today or rng.random() < 0.8 else LeaveStatus.pending
                b.add(e, LeaveType.remote, d, d, status, manager_of(e))

    # 6. Sick leave: recent and current, some needing a certificate.
    for i, e in enumerate(rng.sample(staff, 7)):
        s = b.next_workday(today - timedelta(days=rng.randint(0, 45)))
        length = rng.choice([1, 1, 2, 3, 5])
        if i == 0:  # someone off sick today, certificate not received yet
            s, length = b.next_workday(today - timedelta(days=1)), 3
        s, end = b.block(s, length)
        received = length > 1 and i != 0 and rng.random() < 0.6
        b.add(e, LeaveType.sick, s, end, LeaveStatus.approved, None,
              note="Sick leave is recorded automatically.", certificate_received=received)

    # 7. A few rejected and cancelled requests for realism.
    for e in rng.sample(staff, 3):
        s, end = b.block(today + timedelta(days=rng.randint(5, 30)), rng.choice([3, 5]))
        b.add(e, LeaveType.annual, s, end, LeaveStatus.rejected, manager_of(e),
              note="Site visits and a client deadline that week, can we move it one week later?")
    for e in rng.sample(staff, 3):
        s, end = b.block(today + timedelta(days=rng.randint(5, 30)), 2)
        b.add(e, LeaveType.annual, s, end, LeaveStatus.cancelled)

    # 8. One unpaid leave request.
    e = people["d3"]
    s, end = b.block(today + timedelta(days=50), 10)
    b.add(e, LeaveType.unpaid, s, end, LeaveStatus.pending, comment="Travelling for three weeks")

    session.commit()


def seed_if_empty(session: Session) -> bool:
    if session.exec(select(Employee).limit(1)).first() is not None:
        return False
    seed(session)
    return True


if __name__ == "__main__":
    from app.db import create_db_and_tables, engine

    if "--reset" in sys.argv:
        SQLModel.metadata.drop_all(engine)
    create_db_and_tables()
    with Session(engine) as s:
        print("Seeded." if seed_if_empty(s) else "Database already has data (use --reset).")
