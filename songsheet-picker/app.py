"""SongSheet theme picker: called only by the Cloudflare worker (shared X-Picker-Key)."""
import hmac
import os
import time

from fastapi import FastAPI, Header
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from llm import LLM
from picker import PickFailed, pick

TOTAL_DEADLINE = 75
NO_STORE = {"Cache-Control": "no-store"}

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

_llm = None


def get_llm():
    global _llm
    if _llm is None:
        _llm = LLM()
    return _llm


class Song(BaseModel):
    id: str
    title: str
    artist: str = ""
    excerpt: str = ""


class PickRequest(BaseModel):
    theme: str = Field(min_length=1, max_length=200)
    count: int = Field(ge=1, le=20)
    songs: list[Song]


def _authorised(given: str | None) -> bool:
    expected = os.environ.get("PICKER_KEY", "")
    return bool(expected) and hmac.compare_digest((given or "").encode(), expected.encode())


@app.middleware("http")
async def no_store(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/pick")
async def pick_route(body: PickRequest, x_picker_key: str | None = Header(default=None)):
    if not _authorised(x_picker_key):
        return JSONResponse({"error": "unauthorised"}, status_code=401, headers=NO_STORE)
    deadline = time.monotonic() + TOTAL_DEADLINE
    songs = [s.model_dump() for s in body.songs]
    try:
        picks = await run_in_threadpool(pick, body.theme, body.count, songs, get_llm(), deadline)
    except PickFailed as exc:
        status = 504 if exc.reason == "deadline" else 502
        return JSONResponse({"error": exc.reason}, status_code=status, headers=NO_STORE)
    return {"picks": picks}
