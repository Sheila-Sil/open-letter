// Double-checks the AI: does each quote it gives actually appear in the letter?
// Compares against the text our own OCR read from the photo, so it catches made-up quotes.

const normalize = (text) => text
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

// true = found, false = not found, null = can't tell (OCR didn't get enough text)
export function quoteFound(quote, letterText) {
  if (!quote || !letterText || letterText.length < 80) return null;
  const q = normalize(quote);
  const text = normalize(letterText);
  if (!q) return null;
  if (text.includes(q)) return true;

  // OCR misreads a character here and there ("renewa1"), so a long word may be off by one,
  // and a few words may be missing entirely.
  const words = q.split(' ').filter((w) => w.length > 2);
  if (words.length === 0) return null;
  const letterWords = [...new Set(text.split(' '))];
  const matches = (word) => letterWords.some((lw) => lw === word || (word.length >= 5 && offByOne(word, lw)));
  return words.filter(matches).length / words.length >= 0.75;
}

// True if one letter was changed, added, or removed.
function offByOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
