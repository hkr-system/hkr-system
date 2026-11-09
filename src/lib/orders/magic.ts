// "Magic invoice creator" (Gabriel, Nov 2 2026): paste the client's order as it comes (WhatsApp, email, EN/ES)
// and get order lines to review: model, GB, quantity, colours (or Mixed), battery option, CE, IMEI matching colour.
// Free, rule-based (no paid AI service); every line it cannot read is reported, nothing is saved without review.
import { brandOf } from "@/lib/brands";
import { batteryAllowed, colorsFor, matchColor, shortColor, type BatteryOption, type ColorSplit } from "./colors";

export type MagicLine = {
  model: string; storage_gb: number | null; qty: number | null;
  mixed: boolean; colors: ColorSplit;
  battery: BatteryOption | null; ce: boolean; imeiMatching: boolean;
  esimOnly?: boolean;   // "esim only", "solo esim" (iPhone 14–16, Nov 6 2026)
  source: string; problems: string[];
};

const TIER: [RegExp, string][] = [[/^(pro ?max|promax|pm)$/, "Pro Max"], [/^pro$/, "Pro"], [/^plus$/, "Plus"], [/^mini$/, "mini"], [/^max$/, "Pro Max"]];
const ES_COLORS: Record<string, string> = {
  negro: "black", negros: "black", negra: "black", negras: "black", blanco: "white", blancos: "white", blanca: "white", blancas: "white",
  azul: "blue", azules: "blue", rojo: "red", rojos: "red", verde: "green", verdes: "green", morado: "purple", morados: "purple",
  purpura: "purple", dorado: "gold", dorados: "gold", oro: "gold", rosa: "pink", rosados: "pink", amarillo: "yellow", amarillos: "yellow",
  gris: "grey", grises: "grey", plata: "silver", plateado: "silver",
};
const MIXED = /\b(mixed|mix|mixto|mixtos|mixta|mixtas|surtido|surtidos|assorted|random|any colou?rs?|colores? variados?)\b/;

// Samsung (Nov 4 2026): "s24 ultra", "galaxy s23+", "s22u", "note 20 ultra 5g", "s23 fe" → "S24 Ultra", "S23 Plus"…
// The order form then matches it to the client's Samsung list by the model key (names as in Samsung's file).
function findSamsung(s: string): { model: string; at: number; len: number } | null {
  const re = /(?:\b(?:samsung\s+)?(?:galaxy\s+)?)\b(note\s?\d{1,2}|s\s?2\d)(?:\s*(ultra|plus|fe|u)\b|\s*(\+))?(?:\s*5g\b)?(?:\s*(ultra|plus|u)\b|\s*(\+))?/;
  const m = re.exec(s);
  if (!m) return null;
  const base = m[1].replace(/\s+/g, "").replace(/^note/, "Note ").replace(/^s/, "S");
  const t = (m[2] ?? m[3] ?? m[4] ?? m[5] ?? "").toLowerCase();
  const tier = t === "u" || t === "ultra" ? " Ultra" : t === "plus" || t === "+" ? " Plus" : t === "fe" ? " FE" : "";
  return { model: `${base}${tier}`, at: m.index, len: m[0].length };
}

function findModel(s: string): { model: string; at: number; len: number } | null {
  const sam = findSamsung(s);
  if (sam) return sam;
  const re = /\b(?:iphone|ip|i)\s*(1[2-7])(e)?(?:\s*(pro\s*max|promax|pm|pro|plus|mini|max))?\b/;
  let m = re.exec(s);
  if (!m) m = /\b(1[2-7])(e)?\s*(pro\s*max|promax|pm|pro|plus|mini)\b/.exec(s); // "15 pro max 256"
  if (!m) return null;
  const tierWord = (m[3] ?? "").replace(/\s+/g, " ").trim();
  const tier = TIER.find(([r]) => r.test(tierWord))?.[1];
  return { model: `iPhone ${m[1]}${m[2] ? "e" : ""}${tier ? ` ${tier}` : ""}`, at: m.index, len: m[0].length };
}

const ESIM_ONLY = /(e-?sim\s*only|only\s*e-?sim|solo\s*e-?sim|e-?sim\s*solamente|e-?sim\s*[úu]nicamente)/;

function battery(s: string, model: string): BatteryOption | null {
  let b: BatteryOption | null = null;
  if (/(new batt|bater[ií]as? nuevas?|new battery|0 cycle|0 ciclos?)/.test(s)) b = "new";
  else if (/boost/.test(s) && /85/.test(s)) b = "bh85_boosted";
  else if (/boost/.test(s)) b = "boosted100";
  else if (/\b80\s*%?\s*\+?\s*(bh|battery|bater|health|salud)/.test(s) || /(bh|battery health)\s*80/.test(s)) b = "bh80";
  return b && batteryAllowed(b, model) ? b : b;
}

/** One order line from one line of text. */
export function readLine(raw: string): MagicLine | null {
  const source = raw.trim();
  let s = ` ${source.toLowerCase().replace(/[“”"*_]/g, " ").replace(/[,;:/]+/g, " ").replace(/\s+/g, " ")} `;
  const found = findModel(s);
  if (!found) return null;
  const { model } = found;
  const problems: string[] = [];
  // remove the model words so its generation is not read as a quantity
  s = `${s.slice(0, found.at)} ${s.slice(found.at + found.len)}`;

  let storage: number | null = null;
  const tb = /\b1\s*tb\b/.exec(s);
  const gb = /\b(64|128|256|512)\s*(gb|g|gigas?)?\b/.exec(s);
  if (tb) { storage = 1024; s = s.replace(tb[0], " "); } else if (gb) { storage = Number(gb[1]); s = s.replace(gb[0], " "); }

  // colours with quantities: "15 midnight", "midnight 15", "negros 20"
  const colors: ColorSplit = [];
  const words = colorsFor(model).flatMap((c) => [c.name.toLowerCase().replace(/[()]/g, ""), shortColor(c.name), c.plain.toLowerCase()])
    .concat(["black", "white", "red", "grey", "gray", "silver", "gold", "blue", "green", "pink", "purple", "yellow"], Object.keys(ES_COLORS));
  const uniq = [...new Set(words)].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const colorRe = new RegExp(`(?:\\b(\\d{1,4})\\s*(?:x\\s*)?(?:pcs?\\s*)?(${uniq.join("|")})\\b|\\b(${uniq.join("|")})\\s*(?:x|:|-|=)?\\s*(\\d{1,4})\\b|\\b(${uniq.join("|")})\\b)`, "g");
  let single: string | null = null;
  for (const m of s.matchAll(colorRe)) {
    const word = m[2] ?? m[3] ?? m[5];
    const n = m[1] ?? m[4];
    const official = matchColor(model, ES_COLORS[word] ?? word);
    if (!official) { problems.push(`“${word}” is not a colour of the ${model}.`); continue; }
    if (n) { colors.push({ color: official.name, qty: Number(n) }); s = s.replace(m[0], " "); }
    else if (!single) { single = official.name; s = s.replace(m[0], " "); }
  }
  const mixed = MIXED.test(s);

  // quantity: "50 pcs", "x 50", "50x", "50 units/unidades/piezas", else a number left on its own
  let qty: number | null = null;
  const q = /\b(\d{1,5})\s*(?:pcs|pc|units?|unidades|uds|piezas|pzs|x)\b/.exec(s) ?? /\bx\s*(\d{1,5})\b/.exec(s) ?? /\b(\d{1,5})\b/.exec(s);
  if (q) qty = Number(q[1]);
  const split = colors.reduce((t, c) => t + c.qty, 0);
  if (qty === null && split) qty = split;
  if (single && !colors.length && qty) colors.push({ color: single, qty });

  if (qty === null) problems.push("Quantity not found.");
  if (storage === null) problems.push("Storage (GB) not found.");
  if (!mixed && !colors.length) problems.push("No colours given: set to Mixed — check with the client.");
  if (!mixed && colors.length && qty !== null && split && split !== qty) problems.push(`Colours add up to ${split}, the line says ${qty}.`);
  const samsung = brandOf(model) === "samsung";             // battery and CE never apply to Samsung
  const bat = samsung ? null : battery(s, model);
  if (bat === "bh80" && !batteryAllowed("bh80", model)) problems.push("80%+ BH is only for iPhone 14 and newer.");

  return {
    model, storage_gb: storage, qty, mixed: mixed || !colors.length, colors: mixed ? [] : colors,
    battery: bat, ce: !samsung && /\bce\b|ce mark/.test(s), esimOnly: ESIM_ONLY.test(s), imeiMatching: /imei/.test(s) && /(colou?r|color)/.test(s),
    source, problems,
  };
}

/** The whole message: one line per model; lines without a model are skipped (greetings, signatures…).
 *  A model written alone as a heading ("iPhone 15 Pro Max") applies to the lines below it that only give the GB
 *  ("- 256GB x2: 1 Natural Titanium, 1 Black Titanium") — the layout of client order sheets (Gabriel, Nov 9 2026). */
export function readOrder(text: string): { lines: MagicLine[]; skipped: string[] } {
  const parts = text.split(/\r?\n|(?<=\d)\s*[;|]\s*/).map((l) => l.trim()).filter(Boolean);
  const lines: MagicLine[] = []; const skipped: string[] = [];
  // global options written once for the whole order ("all with CE", "todas con batería nueva")
  const all = text.toLowerCase();
  let heading: MagicLine | null = null; let headingUsed = false;
  const flush = () => { if (heading && !headingUsed) lines.push(heading); heading = null; };
  for (const p of parts) {
    const l = readLine(p);
    if (l && l.qty === null && l.storage_gb === null && !l.colors.length) { flush(); heading = l; headingUsed = false; continue; }
    if (l) { flush(); lines.push(l); continue; }
    if (heading && /\b(64|128|256|512)\s*(gb|g)?\b|\b1\s*tb\b/i.test(p)) {
      const sub = readLine(`${heading.model} ${p.replace(/^[-•·*\s]+/, "")}`);
      if (sub) { sub.source = `${heading.source} · ${p}`; lines.push(sub); headingUsed = true; continue; }
    }
    skipped.push(p);
  }
  flush();
  for (const l of lines) {
    if (brandOf(l.model) === "samsung") continue;
    if (!l.ce && /\bce\b|ce mark/.test(all)) l.ce = true;
    if (!l.battery) l.battery = battery(all, l.model);
    if (ESIM_ONLY.test(all)) l.esimOnly = true;
    if (!l.imeiMatching && /imei/.test(all) && /colou?r/.test(all)) l.imeiMatching = true;
  }
  return { lines, skipped };
}
