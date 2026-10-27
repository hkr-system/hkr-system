// Client code AAA-CC-NNN (SOP §2.1): three letters of the client's name, ISO-2 country of the
// invoiced entity, global sequence. The next number is the next free one; a code is never reused.

export const CODE_RE = /^[A-Z]{3}-[A-Z]{2}-\d{3}$/;

export function nameLetters(name: string): string {
  const letters = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z]/g, "");
  return (letters + "XXX").slice(0, 3);
}

export function suggestCode(name: string, country: string, lastSeq: number): string {
  const cc = (country || "XX").toUpperCase().slice(0, 2).padEnd(2, "X");
  return `${nameLetters(name)}-${cc}-${String(lastSeq + 1).padStart(3, "0")}`;
}
