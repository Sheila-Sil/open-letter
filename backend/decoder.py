"""Talks to Claude: turns photos of a letter into a plain-language explanation, and drafts replies."""

import base64
import json
import os
import re
from datetime import date

import anthropic

from .prompts import DECODE_SYSTEM, LANGUAGES, REPLY_SYSTEM
from .schemas import DECODE_SCHEMA, REPLY_SCHEMA

MODEL = os.environ.get("OPEN_LETTER_MODEL", "claude-opus-5-5")
DECODE_EFFORT = os.environ.get("OPEN_LETTER_EFFORT", "medium")

# Keep lists short enough to read on a phone.
MAX_ACTIONS = 8
MAX_FACTS = 8
MAX_CONTACTS = 4


class DecoderError(Exception):
    """A failure we can explain to the user. `code` is translated by the frontend."""

    def __init__(self, code, status=502):
        super().__init__(code)
        self.code = code
        self.status = status


_client = None


def get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(max_retries=2, timeout=120)
    return _client


def is_configured():
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def ask_claude(system, content, schema, effort):
    """Send one request and return Claude's answer as a dict matching `schema`."""
    try:
        response = get_client().beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            # If a safety check declines the request, the API retries on a recommended model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise DecoderError("not_configured", 503)
    except anthropic.RateLimitError:
        raise DecoderError("busy", 429)
    except anthropic.APIStatusError as e:
        raise DecoderError("ai_unavailable" if e.status_code >= 500 else "ai_error")
    except anthropic.APIConnectionError:
        raise DecoderError("ai_unavailable")

    if response.stop_reason == "refusal":
        raise DecoderError("refused")
    if response.stop_reason == "max_tokens":
        raise DecoderError("ai_error")

    text = next((block.text for block in response.content if block.type == "text"), None)
    try:
        return json.loads(text)
    except (TypeError, json.JSONDecodeError):
        raise DecoderError("ai_error")


def decode_letter(images, language, today):
    """images: list of (bytes, media_type), one per page."""
    content = []
    for number, (data, media_type) in enumerate(images, start=1):
        content.append({"type": "text", "text": f"Page {number}:"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.standard_b64encode(data).decode("ascii"),
            },
        })
    content.append({
        "type": "text",
        "text": (
            f"Today's date is {today.isoformat()}. The reader's language is {LANGUAGES[language]}. "
            "Explain this letter for them. Write every explanation in their language, "
            "and copy quotes exactly as printed in the letter."
        ),
    })
    return clean_result(ask_claude(DECODE_SYSTEM, content, DECODE_SCHEMA, DECODE_EFFORT))


def draft_reply(letter, note, language):
    content = (
        f"The reader's language is {LANGUAGES[language]}.\n\n"
        f"<letter_summary>\n{json.dumps(letter, ensure_ascii=False)}\n</letter_summary>\n\n"
        f"<their_note>\n{note.strip() or '(no note)'}\n</their_note>"
    )
    return ask_claude(REPLY_SYSTEM, content, REPLY_SCHEMA, "low")


def clean_result(result):
    """Double-check the parts of Claude's answer that people will act on directly."""
    deadline = result.get("deadline")
    if deadline:
        try:
            date.fromisoformat(deadline["date"])
        except ValueError:
            result["deadline"] = None
            result["uncertain"].append(deadline.get("what_is_due", ""))

    contacts = []
    for contact in result["contacts"][:MAX_CONTACTS]:
        contact["phone"] = clean_phone(contact["phone"])
        contact["website"] = clean_website(contact["website"])
        if contact["phone"] or contact["website"] or contact["hours"]:
            contacts.append(contact)
    result["contacts"] = contacts

    result["actions"] = result["actions"][:MAX_ACTIONS]
    result["key_facts"] = result["key_facts"][:MAX_FACTS]
    result["uncertain"] = [item for item in result["uncertain"] if item.strip()]

    # Never show contact details from a letter that looks like a scam.
    if result["scam_check"]["possible_scam"]:
        result["contacts"] = []
    return result


def clean_phone(phone):
    if not phone:
        return None
    phone = phone.strip()
    digits = re.sub(r"\D", "", phone)
    if not 7 <= len(digits) <= 15 or not re.fullmatch(r"[\d\s()+\-.]+(\s*(ext\.?|x)\s*\d+)?", phone, re.I):
        return None
    return phone


def clean_website(website):
    """Only allow plain web links, so a letter can't sneak in a javascript: or other link."""
    if not website:
        return None
    website = website.strip()
    if not re.match(r"^https?://", website, re.I):
        website = "https://" + website
    if not re.fullmatch(r"https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:\d+)?(/[^\s<>\"']*)?", website):
        return None
    return website
