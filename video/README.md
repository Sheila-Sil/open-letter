# Demo video

A 3-minute, 1920×1080 demo of Open Letter with no sound, made to be narrated. Each scene starts at the same timestamp as the voiceover script, so the narration lines up when you put the two together in any video editor.

| Time | Scene |
|---|---|
| 0:00 | Hook: an official letter |
| 0:15 | The problem: what a letter can decide, why letters are hard, "Not what to do." |
| 0:35 | Open Letter title, then the website in a browser |
| 0:45 | Privacy: private numbers covered on the phone, covering a name by hand |
| 1:10 | The explanation: deadline, checklist, quote checking, tap to call |
| 1:45 | Spanish and Arabic, read aloud, calendar reminder |
| 2:10 | Reply helper |
| 2:25 | How it works inside |
| 2:45 | Closing card |

The phone scenes use the real app (the built-in example letter), tapped through automatically.

## Re-render it

You need Node 18+, ffmpeg, and Playwright with Chromium:

```bash
npm install playwright
npx playwright install chromium
node video/record.cjs open-letter-demo.mp4
```

Recording runs in real time (about 3 minutes). The example letter's dates are always a few weeks from the day you render.

## Change it

- **Words on screen:** the captions and labels are in `record.cjs` (`V('caption', ...)` and `V('label', ...)`); the title cards are in `composition.html`.
- **Timing:** each `await at(seconds)` in `record.cjs` is when that step happens. Move them to match your narration.
- **Look:** styles are at the top of `composition.html` and use the same colors and fonts as the app.
