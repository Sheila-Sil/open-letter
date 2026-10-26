# Open Letter

**Take a photo of a confusing official letter. Get a plain-language explanation in your language, the deadline, and exactly what to do next.**

Millions of people lose health coverage, food benefits, or housing because they couldn't understand a letter and missed a deadline. Often a kid ends up translating the letter for their parents. Translation apps give you the words; Open Letter tells you what the letter *means* and what to *do*.

| Home | Privacy step | Result (Spanish) | Reply helper (Arabic) |
|---|---|---|---|
| ![Home](docs/screenshot-home.png) | ![Private numbers hidden](docs/screenshot-privacy.png) | ![Spanish result](docs/screenshot-result-es.png) | ![Arabic reply](docs/screenshot-reply-ar.png) |

## What it does

- **Photo → plain-language explanation** in English, Spanish, Chinese, Vietnamese, or Arabic (right-to-left supported).
- **Deadline first.** A color-, icon-, and text-coded urgency banner with the due date and days left (computed by the app, not guessed by the AI).
- **Checklist** of what to do, **tap-to-call** contact numbers, and **important details**.
- **Every point shows its source.** Tap to see the exact line from the letter. The app double-checks each quote against the text it read from the photo and warns you if it can't find it.
- **Private numbers hidden on the phone first.** OCR runs in the browser and covers Social Security, account, member, and case numbers with black boxes *before* anything is uploaded. You can cover anything else (name, address) by hand.
- **Scam warnings** for gift-card demands, threats, and other red flags.
- **Read aloud**, **add a calendar reminder** (3 days before the deadline), and **share** with family.
- **Reply helper:** say what you want in any language; get a polite letter in English plus a translation so you know what you're signing.
- **Example mode** that works with no internet AI at all, for demos and judges.

## How it works

```
Phone browser                                          Server (Python)            AI (Gemini or Claude)
─────────────                                          ───────────────            ─────────────────────
photo ─► OCR (Tesseract, runs locally) ─► black boxes ─► /api/decode ───────────► reads image,
                │                         over private     checks file type,      returns JSON that
                │                         numbers          rate-limits, never     must match a schema
                ▼                                          stores the photo
         letter text stays on the phone                         │
                │                                               ▼
                └──► checks every quote in the answer ◄── cleans links & phone numbers
```

- `backend/` is a small FastAPI server (Python). `prompts.py` has the instructions for the AI, `schemas.py` has the exact JSON shape it must return (enforced with structured outputs), `decoder.py` calls Gemini or Claude and double-checks the answer, and `main.py` has the web routes.
- `frontend/` is plain HTML, CSS, and JavaScript with no build step. `redact.js` is the privacy step, `verify.js` checks quotes, `sample.js` has the example letter, and `i18n.js` has every piece of text in all five languages.
- OCR (tesseract.js) is bundled in `frontend/vendor/` so it works on school networks that block CDNs, and so no third party sees anything.

## Run it on your computer

You need Python 3.10 or newer.

```bash
git clone https://github.com/Sheila-Sil/open-letter
cd open-letter
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # then paste your free Gemini API key into .env
uvicorn backend.main:app --reload
```

Open http://localhost:8000. **"See an example" works without an API key**, which makes it handy for testing the design.

To test on your phone, run `uvicorn backend.main:app --host 0.0.0.0` and open `http://<your-computer's-IP>:8000` on the same Wi-Fi. (The camera button needs HTTPS on some phones; deploying gives you that.)

## Put it online (so judges can use it)

Any host that runs Python works. For example, on [Render](https://render.com):

1. Push this folder to a GitHub repository.
2. Create a new **Web Service** from the repo.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. Add an environment variable `GEMINI_API_KEY` with your key (free from [Google AI Studio](https://aistudio.google.com/apikey)).

**Free tier limits:** Gemini's free tier allows only a limited number of requests per minute and per day (see your quotas in AI Studio). If too many people use it at once, the app tells them to wait a few minutes. The server also limits each visitor to 15 letters per 10 minutes (`OPEN_LETTER_RATE_LIMIT`) so one person can't use up your quota.

**Privacy on the free tier:** Google may use what free-tier apps send to improve its products, and people at Google may review it. That's why the app covers private numbers before uploading, and why the home page says the AI service may keep a copy. For better privacy, switch to a paid Gemini tier or to Claude (`AI_PROVIDER=claude` plus `ANTHROPIC_API_KEY`); with Claude, set a monthly spend limit in the Anthropic Console.

Settings (all optional, in `.env` or your host's environment variables):

| Variable | Default | What it does |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini` (free tier) or `claude` (paid) |
| `OPEN_LETTER_MODEL` | `gemini-flash-latest` / `claude-opus-5-5` | Which model reads letters |
| `OPEN_LETTER_EFFORT` | `medium` | Claude only: `low` is faster and cheaper; `high` thinks harder |
| `OPEN_LETTER_RATE_LIMIT` | `15` | Letters per visitor per 10 minutes |

## Tests

```bash
python -m pytest              # server: uploads, errors, rate limits, link cleaning (the AI is faked, so it's free)
node --test tests/redact.test.mjs   # private-number detection and quote checking
```

## Things to know

- **Translations need a native speaker's review.** The app's text was machine-assisted. Before submitting, ask a native speaker of each language to read through it (and say so in your write-up; that's real user testing).
- **The AI can be wrong.** That's why every claim links to its source, unverifiable quotes are flagged, and the app always tells people to confirm with the office.
- **The example letter is fictional.** "Lakeview County" doesn't exist, 555 phone numbers and `.example` websites are reserved for samples.

## Credits

- [tesseract.js](https://github.com/naptha/tesseract.js) (Apache 2.0) for on-device OCR
- [Lucide](https://lucide.dev) icons (ISC)
- [Public Sans](https://public-sans.digital.gov) font (SIL Open Font License)
- [Google Gemini](https://ai.google.dev) (default) or [Claude](https://www.anthropic.com/claude) by Anthropic for reading and explaining letters
