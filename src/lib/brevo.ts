import "server-only";

// Minimal Brevo (ex-Sendinblue) REST client — https://developers.brevo.com
// Disabled (all calls are no-ops) until BREVO_API_KEY is set in Vercel.
const BASE = "https://api.brevo.com/v3";
const FOLDER_NAME = "HKR System";

export function brevoEnabled() {
  return Boolean(process.env.BREVO_API_KEY);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "api-key": process.env.BREVO_API_KEY ?? "",
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : null;
  if (res.status >= 400 && res.status !== 404) {
    const msg = (data as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`Brevo ${method} ${path} failed (${res.status}): ${msg}`);
  }
  return { status: res.status, data };
}

let folderId: number | null = null;

async function ensureFolder(): Promise<number> {
  if (folderId) return folderId;
  const { data } = await call<{ folders?: { id: number; name: string }[] }>("GET", "/contacts/folders?limit=50&offset=0");
  const found = data?.folders?.find((f) => f.name === FOLDER_NAME);
  if (found) return (folderId = found.id);
  const created = await call<{ id: number }>("POST", "/contacts/folders", { name: FOLDER_NAME });
  return (folderId = created.data!.id);
}

export async function createList(name: string): Promise<number> {
  const folder = await ensureFolder();
  const { data } = await call<{ id: number }>("POST", "/contacts/lists", { name, folderId: folder });
  return data!.id;
}

// Puts the contact in `listId` and removes it from the other app lists.
// Creates the contact if Brevo does not know it yet. Returns Brevo's contact id when known.
export async function upsertContact(input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  listId: number;
  unlinkListIds: number[];
}): Promise<number | null> {
  const attributes: Record<string, string> = {};
  if (input.firstName) attributes.FIRSTNAME = input.firstName;
  if (input.lastName) attributes.LASTNAME = input.lastName;

  const unlink = input.unlinkListIds.filter((id) => id !== input.listId);
  const updated = await call("PUT", `/contacts/${encodeURIComponent(input.email)}`, {
    listIds: [input.listId],
    ...(unlink.length ? { unlinkListIds: unlink } : {}),
    attributes,
  });
  if (updated.status === 404) {
    const created = await call<{ id?: number }>("POST", "/contacts", {
      email: input.email,
      attributes,
      listIds: [input.listId],
      updateEnabled: true,
    });
    return created.data?.id ?? null;
  }
  return null;
}

// Emails that unsubscribed (blacklisted) and were modified since `since`.
export async function unsubscribedSince(since: Date): Promise<string[]> {
  const emails: string[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data } = await call<{ contacts?: { email?: string; emailBlacklisted?: boolean }[] }>(
      "GET",
      `/contacts?limit=1000&offset=${offset}&modifiedSince=${encodeURIComponent(since.toISOString())}`,
    );
    const batch = data?.contacts ?? [];
    for (const c of batch) if (c.emailBlacklisted && c.email) emails.push(c.email.toLowerCase());
    if (batch.length < 1000) break;
  }
  return emails;
}
