"""Request dependencies.

There is no real login in this demo: the frontend's "You are" switcher sends the chosen
employee id in the X-User-Id header. In production this would come from the company SSO.
"""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session

from app.db import get_session
from app.models import Employee, Role

SessionDep = Annotated[Session, Depends(get_session)]


def get_current_user(
    session: SessionDep,
    x_user_id: Annotated[int | None, Header()] = None,
) -> Employee:
    if x_user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Choose who you are first (X-User-Id header).")
    user = session.get(Employee, x_user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user.")
    return user


CurrentUser = Annotated[Employee, Depends(get_current_user)]


def require_hr(user: CurrentUser) -> Employee:
    if user.role != Role.hr:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only HR can do this.")
    return user


HRUser = Annotated[Employee, Depends(require_hr)]
