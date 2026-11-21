# Corvalis · Leave & availability

A small internal web app for Corvalis (fictional engineering consultancy, ~50 people, Brussels & Liège).

> Work in progress. Progress is tracked in [HANDOFF.md](HANDOFF.md).

## The problem and why
<!-- TODO: P8 + P1, who it is for, why these two -->

## How to run

**Requirements:** Python 3.12 via [uv](https://docs.astral.sh/uv/), Node.js 20+, and optionally [Ollama](https://ollama.com) for the assistant.

```powershell
# 1. Backend (http://localhost:8000, API docs at /docs)
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

```powershell
# 2. Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

```powershell
# 3. Optional: local AI assistant
ollama pull qwen3.5:4b
ollama serve
```

Configuration is optional: copy `backend/.env.example` to `backend/.env` to change it.
The SQLite database is created and filled with sample data on the first start.
Reset the sample data: `cd backend; uv run python -m app.seed --reset`.

## Tests

```powershell
cd backend
uv run pytest          # 82 tests: API, leave rules, permissions, security, seed data, persistence
```

```powershell
cd frontend
npm test               # 13 tests: search, URL filters, guided-tour targets
npm run build          # type-check + production build
```

## Security (what is in place, and what is a demo shortcut)
- **Access control on the server**, not only in the UI: managers decide only for their direct reports, HR for everyone, nobody for themselves; colleagues see sick leave as "Away"; every protected route answers 401 without a user and 403 for the wrong role (all covered by tests).
- **Input validation**: typed dates/enums, length limits, readable errors; the ORM uses bound parameters (injection strings are rejected with 422, tested).
- **HTTP**: CORS limited to the local frontend (GET/POST only), `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, `no-store` on API responses.
- **Demo shortcut:** there is no login. The "Signed in as" switcher sends `X-User-Id`, which anyone could change. In production this header would come from the company SSO (Microsoft 365), and the employee list would not be public.

## What works
<!-- TODO -->

## What does not (yet) / left out
<!-- TODO -->

## What's next
<!-- TODO -->
