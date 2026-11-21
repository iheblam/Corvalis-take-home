"""Shared views: who is away when (calendar) and who can come on a given day (availability)."""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import col, select

from app.deps import CurrentUser, SessionDep
from app.models import ACTIVE_STATUSES, Department, Employee, LeaveRequest, LeaveType, Office, PublicHoliday
from app.presenters import brief, public_type
from app.schemas import (
    AbsentPerson,
    AvailabilityRead,
    CalendarAbsence,
    CalendarDay,
    CalendarRead,
    CalendarRow,
    HolidayRead,
)
from app.services import workdays

router = APIRouter(prefix="/api", tags=["calendar"])

MAX_CALENDAR_DAYS = 62


def _employees(session: SessionDep, department: Department | None, office: Office | None) -> list[Employee]:
    query = select(Employee).order_by(Employee.department, Employee.full_name)
    if department:
        query = query.where(Employee.department == department)
    if office:
        query = query.where(Employee.office == office)
    return list(session.exec(query).all())


def _absences(session: SessionDep, ids: list[int], start: date, end: date) -> list[LeaveRequest]:
    return list(
        session.exec(
            select(LeaveRequest)
            .where(
                col(LeaveRequest.employee_id).in_(ids),
                col(LeaveRequest.status).in_(ACTIVE_STATUSES),
                LeaveRequest.start_date <= end,
                LeaveRequest.end_date >= start,
            )
            .order_by(LeaveRequest.start_date)
        ).all()
    )


def _holidays(session: SessionDep, start: date, end: date) -> dict[date, str]:
    rows = session.exec(
        select(PublicHoliday).where(PublicHoliday.date >= start, PublicHoliday.date <= end)
    ).all()
    return {h.date: h.name for h in rows}


@router.get("/calendar", response_model=CalendarRead)
def calendar(
    session: SessionDep,
    user: CurrentUser,
    start: date,
    end: date,
    department: Department | None = None,
    office: Office | None = None,
):
    if end < start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The end date is before the start date.")
    if (end - start).days >= MAX_CALENDAR_DAYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Show at most {MAX_CALENDAR_DAYS} days at once.")

    holidays = _holidays(session, start, end)
    days = [
        CalendarDay(date=d, is_working_day=workdays.is_working_day(d, set(holidays)), holiday_name=holidays.get(d))
        for d in workdays.daterange(start, end)
    ]
    people = _employees(session, department, office)
    by_employee: dict[int, list[LeaveRequest]] = {}
    for r in _absences(session, [e.id for e in people], start, end):
        by_employee.setdefault(r.employee_id, []).append(r)

    rows = [
        CalendarRow(
            employee=brief(e),
            absences=[
                CalendarAbsence(
                    id=r.id, type=public_type(user, e, r.type), status=r.status,
                    start_date=r.start_date, end_date=r.end_date,
                )
                for r in by_employee.get(e.id, [])
            ],
        )
        for e in people
    ]
    return CalendarRead(start=start, end=end, days=days, rows=rows)


@router.get("/availability", response_model=AvailabilityRead)
def availability(
    session: SessionDep,
    user: CurrentUser,
    day: Annotated[date, Query(alias="date")],
    department: Department | None = None,
    office: Office | None = None,
):
    """Who can join a site visit on `date`. Pending leave counts as absent (it may be approved)."""
    holidays = _holidays(session, day, day + timedelta(days=60))
    hol_set = set(holidays)
    people = _employees(session, department, office)
    by_employee = {r.employee_id: r for r in _absences(session, [e.id for e in people], day, day)}

    available, remote, absent = [], [], []
    for e in people:
        r = by_employee.get(e.id)
        if r is None:
            available.append(brief(e))
        elif r.type == LeaveType.remote:
            remote.append(brief(e))
        else:
            back = r.end_date + timedelta(days=1)
            while not workdays.is_working_day(back, hol_set):
                back += timedelta(days=1)
            absent.append(
                AbsentPerson(employee=brief(e), type=public_type(user, e, r.type), status=r.status, back_on=back)
            )
    return AvailabilityRead(
        date=day,
        is_working_day=workdays.is_working_day(day, hol_set),
        holiday_name=holidays.get(day),
        available=available,
        remote=remote,
        absent=absent,
    )


@router.get("/holidays", response_model=list[HolidayRead])
def holidays(session: SessionDep, year: int | None = None):
    y = year or workdays.today().year
    rows = session.exec(
        select(PublicHoliday)
        .where(PublicHoliday.date >= date(y, 1, 1), PublicHoliday.date <= date(y, 12, 31))
        .order_by(PublicHoliday.date)
    ).all()
    return [HolidayRead(date=h.date, name=h.name, is_replacement_day=h.is_replacement_day) for h in rows]
