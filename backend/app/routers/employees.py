from fastapi import APIRouter, HTTPException, status
from sqlmodel import func, select

from app.deps import CurrentUser, SessionDep
from app.models import Department, Employee, Office
from app.schemas import BalanceRead, EmployeeRead
from app.services import workdays
from app.services.leave_rules import can_view, compute_balance

router = APIRouter(prefix="/api/employees", tags=["employees"])


def _read(session: SessionDep, e: Employee) -> EmployeeRead:
    manager = session.get(Employee, e.manager_id) if e.manager_id else None
    reports = session.exec(select(func.count()).where(Employee.manager_id == e.id)).one()
    return EmployeeRead(
        **e.model_dump(exclude={"manager_id"}),
        manager_id=e.manager_id,
        manager_name=manager.full_name if manager else None,
        direct_reports=reports,
    )


# No auth needed: the user switcher uses this list to pick who you are.
@router.get("", response_model=list[EmployeeRead])
def list_employees(
    session: SessionDep, department: Department | None = None, office: Office | None = None
):
    query = select(Employee).order_by(Employee.full_name)
    if department:
        query = query.where(Employee.department == department)
    if office:
        query = query.where(Employee.office == office)
    return [_read(session, e) for e in session.exec(query).all()]


@router.get("/me", response_model=EmployeeRead)
def me(session: SessionDep, user: CurrentUser):
    return _read(session, user)


@router.get("/{employee_id}", response_model=EmployeeRead)
def get_employee(employee_id: int, session: SessionDep, _: CurrentUser):
    e = session.get(Employee, employee_id)
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found.")
    return _read(session, e)


@router.get("/{employee_id}/balance", response_model=BalanceRead)
def get_balance(employee_id: int, session: SessionDep, user: CurrentUser, year: int | None = None):
    e = session.get(Employee, employee_id)
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found.")
    if not can_view(user, e):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only see your own balance or your team's.")
    b = compute_balance(session, e.id, year or workdays.today().year)
    return BalanceRead(employee_id=e.id, **b.__dict__)
