"""Open Letter web server: serves the app and the two AI endpoints.

Run with:  uvicorn backend.main:app --reload
"""

import json
import os
import time
from collections import defaultdict, deque
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from . import decoder
from .prompts import LANGUAGES

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
MAX_PAGES = 4
MAX_PAGE_BYTES = 6 * 1024 * 1024
MAX_LETTER_JSON = 30_000
IMAGE_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}

# Each visitor can make this many AI requests per 10 minutes. Protects the API bill if the site is shared widely.
RATE_LIMIT = int(os.environ.get("OPEN_LETTER_RATE_LIMIT", "15"))
RATE_WINDOW_SECONDS = 600

app = FastAPI(title="Open Letter", docs_url=None, redoc_url=None, openapi_url=None)
_recent_requests = defaultdict(deque)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    return response


def error(status, code):
    return JSONResponse({"error": code}, status_code=status)


def client_ip(request):
    # Behind a hosting proxy, the last address in X-Forwarded-For is the one the proxy saw.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def is_rate_limited(request):
    now = time.monotonic()
    hits = _recent_requests[client_ip(request)]
    while hits and now - hits[0] > RATE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= RATE_LIMIT:
        return True
    hits.append(now)
    return False


def image_type(data):
    """Return the media type if `data` is a real JPEG/PNG/WebP image, else None."""
    try:
        with Image.open(BytesIO(data)) as img:
            img.verify()
            return IMAGE_TYPES.get(img.format)
    except (UnidentifiedImageError, OSError, SyntaxError):
        return None


def pick_today(client_today):
    """Use the phone's date (time zones differ) unless it's clearly wrong."""
    server_today = date.today()
    try:
        parsed = date.fromisoformat(client_today)
    except ValueError:
        return server_today
    return parsed if abs(parsed - server_today) <= timedelta(days=1) else server_today


@app.get("/api/health")
def health():
    return {"ok": True, "ai_ready": decoder.is_configured()}


@app.post("/api/decode")
def decode(
    request: Request,
    pages: list[UploadFile] = File(...),
    language: str = Form("en"),
    today: str = Form(""),
):
    if language not in LANGUAGES:
        return error(400, "bad_request")
    if not 1 <= len(pages) <= MAX_PAGES:
        return error(400, "too_many_pages")

    images = []
    for page in pages:
        data = page.file.read(MAX_PAGE_BYTES + 1)
        if len(data) > MAX_PAGE_BYTES:
            return error(413, "too_large")
        media_type = image_type(data)
        if media_type is None:
            return error(400, "not_an_image")
        images.append((data, media_type))

    if not decoder.is_configured():
        return error(503, "not_configured")
    if is_rate_limited(request):
        return error(429, "busy")

    # The photos are used for this one request and never stored.
    try:
        result = decoder.decode_letter(images, language, pick_today(today))
    except decoder.DecoderError as e:
        return error(e.status, e.code)
    return {"result": result, "language": language}


class ReplyRequest(BaseModel):
    language: str
    letter: dict
    note: str = Field("", max_length=1000)


@app.post("/api/reply")
def reply(request: Request, body: ReplyRequest):
    if body.language not in LANGUAGES or len(json.dumps(body.letter)) > MAX_LETTER_JSON:
        return error(400, "bad_request")
    if not decoder.is_configured():
        return error(503, "not_configured")
    if is_rate_limited(request):
        return error(429, "busy")
    try:
        return {"reply": decoder.draft_reply(body.letter, body.note, body.language)}
    except decoder.DecoderError as e:
        return error(e.status, e.code)


# Everything else is the web app itself. Mounted last so the /api routes win.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
