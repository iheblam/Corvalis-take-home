from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.config import settings
from app.db import create_db_and_tables, engine
from app.routers import calendar, employees, leave
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db_and_tables()
    if settings.seed_on_startup:
        with Session(engine) as session:
            seed_if_empty(session)
    yield


app = FastAPI(title="Corvalis · Leave & availability API", lifespan=lifespan)

# Only the local frontend may call the API from a browser, and only with what it needs.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-User-Id"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"  # personal data: never cache
    return response


@app.exception_handler(RequestValidationError)
async def readable_validation_error(_: Request, exc: RequestValidationError):
    """Turn FastAPI's technical 422 list into one sentence the UI can show as is."""
    parts = []
    for err in exc.errors():
        field = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "header", "path"))
        parts.append(f"{field or 'request'}: {err.get('msg', 'invalid value')}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": "Invalid input. " + "; ".join(parts[:3])},
    )


app.include_router(employees.router)
app.include_router(leave.router)
app.include_router(calendar.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
