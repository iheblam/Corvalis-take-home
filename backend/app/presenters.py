"""Turn table rows into API schemas, applying who-may-see-what."""

from collections.abc import Iterable

from sqlmodel import Session, col, select

from app.models import Employee, LeaveRequest, LeaveType
from app.schemas import EmployeeBrief, LeaveRequestRead
from app.services.leave_rules import can_cancel, can_decide, can_view


def brief(e: Employee) -> EmployeeBrief:
    return EmployeeBrief(
        id=e.id, full_name=e.full_name, job_title=e.job_title, department=e.department, office=e.office
    )


def public_type(user: Employee, owner: Employee, leave_type: LeaveType) -> LeaveType | str:
    """Colleagues see that someone is away, not that they are sick."""
    if leave_type == LeaveType.sick and not can_view(user, owner):
        return "away"
    return leave_type


def employees_by_id(session: Session, ids: Iterable[int | None]) -> dict[int, Employee]:
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    rows = session.exec(select(Employee).where(col(Employee.id).in_(wanted))).all()
    return {e.id: e for e in rows}


def leave_reads(session: Session, user: Employee, requests: list[LeaveRequest]) -> list[LeaveRequestRead]:
    people = employees_by_id(
        session, [r.employee_id for r in requests] + [r.decided_by_id for r in requests]
    )
    out = []
    for r in requests:
        owner = people[r.employee_id]
        decider = people.get(r.decided_by_id) if r.decided_by_id else None
        out.append(
            LeaveRequestRead(
                id=r.id,
                employee=brief(owner),
                type=r.type,
                start_date=r.start_date,
                end_date=r.end_date,
                working_days=r.working_days,
                status=r.status,
                comment=r.comment,
                decided_by_name=decider.full_name if decider else None,
                decided_at=r.decided_at,
                decision_note=r.decision_note,
                certificate_required=r.certificate_required,
                certificate_received=r.certificate_received,
                created_at=r.created_at,
                can_decide=r.status == "pending" and can_decide(user, r, owner),
                can_cancel=can_cancel(user, r) is None,
            )
        )
    return out
