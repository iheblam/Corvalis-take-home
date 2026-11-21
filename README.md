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

## What works
<!-- TODO -->

## What does not (yet) / left out
<!-- TODO -->

## What's next
<!-- TODO -->
