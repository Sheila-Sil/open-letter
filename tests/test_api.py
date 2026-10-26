"""Tests for the server. The AI is replaced with a fake, so these run free and offline."""

import json
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend import decoder, main, schemas

GOOD_RESULT = {
    "status": "ok",
    "document_type": "Medicaid renewal notice",
    "sender": "Lakeview County Health Coverage Services",
    "summary": "Your health coverage will end unless you renew it.",
    "urgency": "high",
    "deadline": {"date": "2026-11-15", "what_is_due": "Renewal form", "quote": "must be received by November 15, 2026"},
    "actions": [{"step": "Fill out the form on page 2.", "quote": "The completed renewal form"}],
    "contacts": [{"name": "Office", "phone": "1-800-555-0142", "website": "benefits.lakeview.example/renew", "hours": None}],
    "key_facts": [],
    "scam_check": {"possible_scam": False, "reasons": []},
    "uncertain": [],
    "confidence": "high",
    "reply_needed": False,
}


class FakeGemini:
    """Stands in for genai.Client() and records what was sent."""

    def __init__(self, answer, blocked=False):
        self.answer = answer
        self.blocked = blocked
        self.requests = []
        self.models = SimpleNamespace(generate_content=self.generate_content)

    def generate_content(self, **kwargs):
        self.requests.append(kwargs)
        if self.blocked:
            return SimpleNamespace(text=None, prompt_feedback=SimpleNamespace(block_reason="SAFETY"), candidates=[])
        return SimpleNamespace(text=json.dumps(self.answer), prompt_feedback=None, candidates=[])


class FakeClaude:
    """Stands in for anthropic.Anthropic() and records what was sent."""

    def __init__(self, answer, stop_reason="end_turn"):
        self.answer = answer
        self.stop_reason = stop_reason
        self.requests = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[
                SimpleNamespace(type="thinking", thinking=""),
                SimpleNamespace(type="text", text=json.dumps(self.answer)),
            ],
        )


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.delenv("OPEN_LETTER_MODEL", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    main._recent_requests.clear()
    return TestClient(main.app)


@pytest.fixture
def fake_ai(monkeypatch):
    """Installs a fake Gemini (the default provider)."""
    def install(answer=GOOD_RESULT, blocked=False):
        fake = FakeGemini(json.loads(json.dumps(answer)), blocked)
        monkeypatch.setattr(decoder, "_gemini", fake)
        return fake
    return install


@pytest.fixture
def fake_claude(monkeypatch):
    def install(answer=GOOD_RESULT, stop_reason="end_turn"):
        monkeypatch.setenv("AI_PROVIDER", "claude")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        fake = FakeClaude(json.loads(json.dumps(answer)), stop_reason)
        monkeypatch.setattr(decoder, "_client", fake)
        return fake
    return install


def jpeg_bytes():
    buffer = BytesIO()
    Image.new("RGB", (40, 60), "white").save(buffer, "JPEG")
    return buffer.getvalue()


def upload(client, files=None, language="es"):
    files = files or [("pages", ("page1.jpg", jpeg_bytes(), "image/jpeg"))]
    return client.post("/api/decode", files=files, data={"language": language, "today": "2026-10-25"})


def test_serves_the_app(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Open Letter" in response.text


def test_health_reports_ai_ready(client):
    assert client.get("/api/health").json() == {"ok": True, "ai_ready": True}


def test_decode_sends_image_and_language_to_gemini(client, fake_ai):
    fake = fake_ai()
    response = upload(client)
    assert response.status_code == 200
    assert response.json()["result"]["document_type"] == "Medicaid renewal notice"

    request = fake.requests[0]
    assert request["model"] == "gemini-flash-latest"
    assert request["config"].response_mime_type == "application/json"
    assert request["config"].response_json_schema == schemas.DECODE_SCHEMA
    contents = request["contents"]
    assert contents[1].inline_data.mime_type == "image/jpeg"
    assert "Spanish" in contents[-1]


def test_blocked_by_gemini_safety_filter(client, fake_ai):
    fake_ai(blocked=True)
    assert upload(client).json() == {"error": "refused"}


def test_decode_with_claude(client, fake_claude):
    fake = fake_claude()
    response = upload(client)
    assert response.status_code == 200
    assert response.json()["result"]["document_type"] == "Medicaid renewal notice"

    request = fake.requests[0]
    assert request["model"] == "claude-opus-5-5"
    assert request["output_config"]["format"]["type"] == "json_schema"
    content = request["messages"][0]["content"]
    assert content[1]["type"] == "image"
    assert content[1]["source"]["media_type"] == "image/jpeg"
    assert "Spanish" in content[-1]["text"]


def test_website_gets_https_and_bad_links_are_removed(client, fake_ai):
    answer = json.loads(json.dumps(GOOD_RESULT))
    answer["contacts"].append({"name": "Bad", "phone": "call now!!", "website": "javascript:alert(1)", "hours": None})
    fake_ai(answer)
    contacts = upload(client).json()["result"]["contacts"]
    assert contacts == [{
        "name": "Office", "phone": "1-800-555-0142",
        "website": "https://benefits.lakeview.example/renew", "hours": None,
    }]


def test_scam_letters_never_show_contacts(client, fake_ai):
    answer = json.loads(json.dumps(GOOD_RESULT))
    answer["scam_check"] = {"possible_scam": True, "reasons": ["Asks for gift cards"]}
    fake_ai(answer)
    assert upload(client).json()["result"]["contacts"] == []


def test_rejects_files_that_are_not_images(client, fake_ai):
    fake = fake_ai()
    response = upload(client, files=[("pages", ("letter.jpg", b"<html>not an image</html>", "image/jpeg"))])
    assert response.status_code == 400
    assert response.json() == {"error": "not_an_image"}
    assert fake.requests == []


def test_rejects_too_many_pages(client, fake_ai):
    fake_ai()
    files = [("pages", (f"p{i}.jpg", jpeg_bytes(), "image/jpeg")) for i in range(main.MAX_PAGES + 1)]
    assert upload(client, files=files).json() == {"error": "too_many_pages"}


def test_rejects_unknown_language(client, fake_ai):
    fake_ai()
    assert upload(client, language="xx").status_code == 400


def test_refusal_becomes_a_friendly_error(client, fake_claude):
    fake_claude(stop_reason="refusal")
    response = upload(client)
    assert response.status_code == 502
    assert response.json() == {"error": "refused"}


def test_missing_api_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    assert client.get("/api/health").json()["ai_ready"] is False
    assert upload(client).json() == {"error": "not_configured"}


def test_rate_limit(client, fake_ai, monkeypatch):
    fake_ai()
    monkeypatch.setattr(main, "RATE_LIMIT", 2)
    assert upload(client).status_code == 200
    assert upload(client).status_code == 200
    assert upload(client).json() == {"error": "busy"}


def test_reply(client, fake_ai):
    reply = {
        "subject": "Renewal", "letter_to_send": "Dear office, ...", "letter_translated": "Estimada oficina, ...",
        "fill_in": [{"placeholder": "[Your full name]", "explanation": "Su nombre"}], "tips": [],
    }
    fake = fake_ai(reply)
    response = client.post("/api/reply", json={"language": "es", "letter": GOOD_RESULT, "note": "Necesito más tiempo"})
    assert response.json() == {"reply": reply}
    assert "Necesito más tiempo" in fake.requests[0]["contents"][0]


def test_bad_deadline_date_is_dropped():
    result = json.loads(json.dumps(GOOD_RESULT))
    result["deadline"]["date"] = "sometime soon"
    cleaned = decoder.clean_result(result)
    assert cleaned["deadline"] is None
    assert cleaned["uncertain"] == ["Renewal form"]


def test_client_date_is_used_only_when_close_to_server_date():
    from datetime import date, timedelta
    today = date.today()
    assert main.pick_today((today + timedelta(days=1)).isoformat()) == today + timedelta(days=1)
    assert main.pick_today("1999-01-01") == today
    assert main.pick_today("garbage") == today
