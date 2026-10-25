"""JSON schemas Claude must follow. Structured outputs guarantee the reply matches these exactly."""

STRING = {"type": "string"}
NULLABLE_STRING = {"anyOf": [{"type": "string"}, {"type": "null"}]}


def obj(**properties):
    """An object where every property is required and nothing extra is allowed."""
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def array_of(item):
    return {"type": "array", "items": item}


DECODE_SCHEMA = obj(
    status={"type": "string", "enum": ["ok", "unreadable", "not_a_letter"]},
    document_type=STRING,
    sender=STRING,
    summary=STRING,
    urgency={"type": "string", "enum": ["high", "medium", "low", "none"]},
    deadline={
        "anyOf": [
            obj(date={"type": "string", "format": "date"}, what_is_due=STRING, quote=STRING),
            {"type": "null"},
        ]
    },
    actions=array_of(obj(step=STRING, quote=NULLABLE_STRING)),
    contacts=array_of(
        obj(name=STRING, phone=NULLABLE_STRING, website=NULLABLE_STRING, hours=NULLABLE_STRING)
    ),
    key_facts=array_of(obj(fact=STRING, quote=STRING, quote_translation=STRING)),
    scam_check=obj(possible_scam={"type": "boolean"}, reasons=array_of(STRING)),
    uncertain=array_of(STRING),
    confidence={"type": "string", "enum": ["high", "medium", "low"]},
    reply_needed={"type": "boolean"},
)

REPLY_SCHEMA = obj(
    subject=STRING,
    letter_to_send=STRING,
    letter_translated=STRING,
    fill_in=array_of(obj(placeholder=STRING, explanation=STRING)),
    tips=array_of(STRING),
)
