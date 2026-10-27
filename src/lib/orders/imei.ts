// IMEI list parsing (SOP P4: the IMEI list from Hong Kong is loaded into the IMEI Master).
// An IMEI has 15 digits; the last one is a Luhn check digit.

export function luhnValid(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[14 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export type ImeiParse = { valid: string[]; badCheckDigit: string[]; wrongLength: string[]; repeated: string[] };

// Takes any text (CSV, TXT, cells joined) and finds IMEI-like numbers.
export function parseImeis(text: string): ImeiParse {
  const tokens = text.match(/\d+/g) ?? [];
  const out: ImeiParse = { valid: [], badCheckDigit: [], wrongLength: [], repeated: [] };
  const seen = new Set<string>();
  for (const raw of tokens) {
    const t = raw;
    if (t.length < 14 || t.length > 17) continue; // not an IMEI-sized number (phone, order no., date…)
    if (t.length !== 15) { out.wrongLength.push(t); continue; }
    if (seen.has(t)) { out.repeated.push(t); continue; }
    seen.add(t);
    if (luhnValid(t)) out.valid.push(t);
    else out.badCheckDigit.push(t);
  }
  return out;
}
