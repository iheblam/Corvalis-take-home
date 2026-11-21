from datetime import UTC, date, datetime
from typing import Literal

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import col, select

from app.deps import CurrentUser, HRUser, SessionDep
from app.models import Employee, LeaveRequest, LeaveStatus, LeaveType, Role
from app.presenters import leave_reads
from app.schemas import DecisionIn, LeavePreview, LeaveRequestCreated, LeaveRequestIn, LeaveRequestRead
from app.services.leave_rules import can_cancel, can_decide, can_view, check_request

router = APIRouter(prefix="/api/leave-requests", tags=["leave"])

Scope = Literal["mine", "team", "to_approve", "all"]


@router.get("", response_model=list[LeaveRequestRead])
def list_requests(
    session: SessionDep,
    user: CurrentUser,
    scope: Scope = "mine",
    status_: Annotated[LeaveStatus | None, Query(alias="status")] = None,
    type: LeaveType | None = None,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
):
    """mine: your requests · team: your direct reports (HR: everyone) ·
    to_approve: pending requests you can decide on · all: HR only."""
    query = select(LeaveRequest)
    report_ids = select(Employee.id).where(Employee.manager_id == user.id)
    if scope == "mine":
        query = query.where(LeaveRequest.employee_id == user.id)
    elif scope == "team":
        if user.role != Role.hr:
            query = query.where(col(LeaveRequest.employee_id).in_(report_ids))
    elif scope == "to_approve":
        query = query.where(LeaveRequest.status == LeaveStatus.pending, LeaveRequest.employee_id != user.id)
        if user.role != Role.hr:
            query = query.where(col(LeaveRequest.employee_id).in_(report_ids))
    elif scope == "all" and user.role != Role.hr:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only HR can see all requests.")

    if status_:
        query = query.where(LeaveRequest.status == status_)
    if type:
        query = query.where(LeaveRequest.type == type)
    if from_:
        query = query.where(LeaveRequest.end_date >= from_)
    if to:
        query = query.where(LeaveRequest.start_date <= to)

    order = col(LeaveRequest.start_date)
    query = query.order_by(order.asc() if scope == "to_approve" else order.desc())
    return leave_reads(session, user, list(session.exec(query).all()))


@router.post("/preview", response_model=LeavePreview)
def preview(body: LeaveRequestIn, session: SessionDep, user: CurrentUser):
    """Dry run: what the request would cost and what would block it. Nothing is saved."""
    c = check_request(session, user, body.type, body.start_date, body.end_date)
    return LeavePreview(
        ok=c.ok, working_days=c.working_days, certificate_required=c.certificate_required,
        errors=c.errors, warnings=c.warnings,
    )


@router.post("", response_model=LeaveRequestCreated, status_code=status.HTTP_201_CREATED)
def create(body: LeaveRequestIn, session: SessionDep, user: CurrentUser):
    c = check_request(session, user, body.type, body.start_date, body.end_date)
    if not c.ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, " ".join(c.errors))

    req = LeaveRequest(
        employee_id=user.id,
        type=body.type,
        start_date=body.start_date,
        end_date=body.end_date,
        working_days=c.working_days,
        comment=body.comment,
        certificate_required=c.certificate_required,
    )
    # Sick leave is reported, not requested: it is recorded as approved straight away.
    if body.type == LeaveType.sick:
        req.status = LeaveStatus.approved
        req.decided_at = datetime.now(UTC)
        req.decision_note = "Sick leave is recorded automatically."
    session.add(req)
    session.commit()
    session.refresh(req)
    return LeaveRequestCreated(request=leave_reads(session, user, [req])[0], warnings=c.warnings)


def _load(session: SessionDep, request_id: int) -> tuple[LeaveRequest, Employee]:
    req = session.get(LeaveRequest, request_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found.")
    return req, session.get(Employee, req.employee_id)


@router.get("/{request_id}", response_model=LeaveRequestRead)
def get_request(request_id: int, session: SessionDep, user: CurrentUser):
    req, owner = _load(session, request_id)
    if not can_view(user, owner):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot see this request.")
    return leave_reads(session, user, [req])[0]


def _decide(request_id: int, session: SessionDep, user: CurrentUser, new_status: LeaveStatus, note: str | None):
    req, owner = _load(session, request_id)
    if not can_decide(user, req, owner):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the employee's manager or HR can decide on this request."
        )
    if req.status != LeaveStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request is already {req.status.value}.")
    req.status = new_status
    req.decided_by_id = user.id
    req.decided_at = datetime.now(UTC)
    req.decision_note = note
    session.add(req)
    session.commit()
    session.refresh(req)
    return leave_reads(session, user, [req])[0]


@router.post("/{request_id}/approve", response_model=LeaveRequestRead)
def approve(request_id: int, session: SessionDep, user: CurrentUser, body: DecisionIn | None = None):
    return _decide(request_id, session, user, LeaveStatus.approved, body.note if body else None)


@router.post("/{request_id}/reject", response_model=LeaveRequestRead)
def reject(request_id: int, body: DecisionIn, session: SessionDep, user: CurrentUser):
    if not (body.note or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please give a reason when rejecting a request.")
    return _decide(request_id, session, user, LeaveStatus.rejected, body.note)


@router.post("/{request_id}/cancel", response_model=LeaveRequestRead)
def cancel(request_id: int, session: SessionDep, user: CurrentUser):
    req, _ = _load(session, request_id)
    reason = can_cancel(user, req)
    if reason:
        raise HTTPException(status.HTTP_409_CONFLICT, reason)
    req.status = LeaveStatus.cancelled
    session.add(req)
    session.commit()
    session.refresh(req)
    return leave_reads(session, user, [req])[0]


@router.post("/{request_id}/certificate", response_model=LeaveRequestRead)
def certificate_received(request_id: int, session: SessionDep, user: HRUser):
    req, _ = _load(session, request_id)
    if not req.certificate_required:
        raise HTTPException(status.HTTP_409_CONFLICT, "No medical certificate is needed for this leave.")
    req.certificate_received = True
    session.add(req)
    session.commit()
    session.refresh(req)
    return leave_reads(session, user, [req])[0]
