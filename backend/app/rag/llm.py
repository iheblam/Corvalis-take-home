"""Minimal Ollama client (local LLM, no API key)."""

import httpx

from app.config import settings


class LLMUnavailable(Exception):
    """Ollama is not running, the model is not pulled, or it took too long."""


def chat(system: str, user: str, schema: dict | None = None) -> str:
    """Return the reply text. With `schema`, Ollama constrains the reply to that JSON shape."""
    try:
        r = httpx.post(
            f"{settings.ollama_base_url}/api/chat",
            timeout=settings.ollama_timeout_s,
            json={
                "model": settings.ollama_model,
                "stream": False,
                "think": settings.ollama_think,
                "keep_alive": settings.ollama_keep_alive,
                "options": {"temperature": 0.1, "num_ctx": 4096},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                **({"format": schema} if schema else {}),
            },
        )
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        raise LLMUnavailable(str(e)) from e
    if r.status_code == 404:
        raise LLMUnavailable(f"Model {settings.ollama_model} is not pulled (ollama pull {settings.ollama_model})")
    if r.status_code != 200:
        raise LLMUnavailable(f"Ollama error {r.status_code}: {r.text[:200]}")
    return r.json()["message"]["content"].strip()


def status() -> dict:
    """Is Ollama reachable, and is the configured model available?"""
    try:
        tags = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=2).json()
    except (httpx.HTTPError, ValueError):
        return {"ollama": False, "model": settings.ollama_model, "model_available": False}
    names = {m.get("name") for m in tags.get("models", [])}
    return {"ollama": True, "model": settings.ollama_model, "model_available": settings.ollama_model in names}


def warm_up() -> None:
    """Load the model into memory so the first employee does not wait ~10 s."""
    try:
        httpx.post(f"{settings.ollama_base_url}/api/generate", timeout=settings.ollama_timeout_s,
                   json={"model": settings.ollama_model, "keep_alive": settings.ollama_keep_alive})
    except httpx.HTTPError:
        pass
