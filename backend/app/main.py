from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(employees.router)
app.include_router(leave.router)
app.include_router(calendar.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
