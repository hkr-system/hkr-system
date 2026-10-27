import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export function normalizeEmail(input: string | null | undefined): string | null {
  const e = (input ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// Returns +E.164 (e.g. +31612345678) or null. Numbers without "+" are read with
// the lead's country as the default.
export function normalizePhone(input: string | null | undefined, defaultCountry?: string | null): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
  const parsed = parsePhoneNumberFromString(cleaned, (defaultCountry ?? undefined) as CountryCode | undefined);
  return parsed && parsed.isPossible() ? parsed.number : null;
}

export function normalizeUrl(input: string | null | undefined): string | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function clean(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const v = String(input).trim();
  return v ? v : null;
}
