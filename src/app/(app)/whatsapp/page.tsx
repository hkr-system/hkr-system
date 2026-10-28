import type { Metadata } from "next";
import Link from "next/link";
import { Check, CheckCheck, CircleAlert, Clock, FileText } from "lucide-react";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadTeam } from "@/lib/leads/service";
import { formatDateTime, shortZone, timeLeft } from "@/lib/format";
import { windowOpen, WINDOW_MS } from "@/lib/whatsapp/templates";
import { whatsappConfigured } from "@/lib/whatsapp/graph";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { StageBadge, TierBadge } from "@/components/leads/badges";
import { Composer } from "@/components/whatsapp/composer";
import { AssignControl, StatusControl } from "@/components/whatsapp/conversation-controls";
import { InboxFilters } from "@/components/whatsapp/inbox-filters";
import { RealtimeRefresh } from "@/components/whatsapp/realtime-refresh";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "WhatsApp" };

type Conv = {
  id: string; contact_phone: string; contact_name: string | null; status: "open" | "pending" | "resolved";
  assigned_user_id: string | null; last_inbound_at: string | null; last_outbound_at: string | null;
  last_message_at: string | null; last_message_preview: string | null; lead_id: string | null; wa_number_id: string;
  wa_numbers: { label: string | null; display_phone: string; is_demo: boolean } | null;
  leads: { company: string; stage: "New"; tier: "A" | "B" | "C" | null; disqualified: boolean; contact_name: string | null } | null;
};

const unanswered = (c: Conv) =>
  !!c.last_inbound_at && (!c.last_outbound_at || new Date(c.last_inbound_at) > new Date(c.last_outbound_at));

function Ticks({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="size-3.5 text-sky-500" aria-label="Read" />;
  if (status === "delivered") return <CheckCheck className="size-3.5" aria-label="Delivered" />;
  if (status === "sent") return <Check className="size-3.5" aria-label="Sent" />;
  if (status === "failed") return <CircleAlert className="size-3.5 text-destructive" aria-label="Failed" />;
  return <Clock className="size-3.5" aria-label="Queued" />;
}

export default async function InboxPage({ searchParams }: PageProps<"/whatsapp">) {
  const access = await checkSection("whatsapp");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const p = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const db = await createClient();

  let query = db.from("wa_conversations")
    .select("id, contact_phone, contact_name, status, assigned_user_id, last_inbound_at, last_outbound_at, last_message_at, last_message_preview, lead_id, wa_number_id, wa_numbers(label, display_phone, is_demo), leads(company, stage, tier, disqualified, contact_name)")
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(300);
  const view = p("view");
  if (view === "resolved") query = query.eq("status", "resolved");
  else if (view !== "all") query = query.neq("status", "resolved");
  if (view === "mine") query = query.eq("assigned_user_id", user.id);
  if (view === "unassigned") query = query.is("assigned_user_id", null);
  if (/^[0-9a-f-]{36}$/.test(p("number"))) query = query.eq("wa_number_id", p("number"));

  const [{ data: convRows }, { data: numbers }, team] = await Promise.all([
    query, db.from("wa_numbers").select("id, label, display_phone").order("label"), loadTeam(db),
  ]);
  let convs = (convRows ?? []) as unknown as Conv[];
  if (view === "unanswered") convs = convs.filter(unanswered);
  const q = p("q").toLowerCase();
  if (q) {
    convs = convs.filter((c) => [c.contact_name, c.contact_phone, c.leads?.company].some((x) => x?.toLowerCase().includes(q)));
  }

  const selectedId = p("c") || convs[0]?.id;
  let selected: Conv | null = convs.find((c) => c.id === selectedId) ?? null;
  if (!selected && selectedId && /^[0-9a-f-]{36}$/.test(selectedId)) {
    const { data } = await db.from("wa_conversations")
      .select("id, contact_phone, contact_name, status, assigned_user_id, last_inbound_at, last_outbound_at, last_message_at, last_message_preview, lead_id, wa_number_id, wa_numbers(label, display_phone, is_demo), leads(company, stage, tier, disqualified, contact_name)")
      .eq("id", selectedId).maybeSingle();
    selected = (data as unknown as Conv) ?? null;
  }

  const [{ data: messages }, { data: templates }] = selected
    ? await Promise.all([
        db.from("wa_messages").select("id, direction, type, body, template_name, media_id, media_path, media_mime, media_filename, status, error_title, sent_by, created_at, meta_timestamp")
          .eq("conversation_id", selected.id).order("created_at").limit(500),
        db.from("wa_templates").select("id, name, language, category, components").eq("status", "APPROVED").order("name"),
      ])
    : [{ data: [] }, { data: [] }];
  const names = new Map(team.map((t) => [t.user_id, t.full_name]));
  const tz = user.timezone;
  const open = selected ? windowOpen(selected.last_inbound_at) : false;
  const qs = (c: string) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    next.set("c", c);
    return `/whatsapp?${next.toString()}`;
  };

  return (
    <div className="grid h-[calc(100svh-10.5rem)] min-h-[520px] grid-cols-1 overflow-hidden rounded-xl border bg-background md:grid-cols-[320px_1fr]">
      <RealtimeRefresh tables={["wa_messages", "wa_conversations"]} />
      <aside className={cn("flex min-h-0 flex-col border-r", p("c") && "hidden md:flex")}>
        <InboxFilters numbers={(numbers ?? []).map((n) => ({ id: n.id, label: n.label ?? n.display_phone }))} />
        <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="conversation-list">
          {convs.map((c) => (
            <li key={c.id}>
              <Link href={qs(c.id)}
                className={cn("block border-b px-3 py-2.5 hover:bg-muted/60", c.id === selected?.id && "bg-muted")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{c.leads?.company ?? c.contact_name ?? c.contact_phone}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {c.last_message_at ? formatDateTime(c.last_message_at, tz).split(", ")[1] ?? "" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {unanswered(c) ? <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-label="Unanswered" /> : null}
                  <span className="truncate text-xs text-muted-foreground">{c.last_message_preview ?? "No messages yet"}</span>
                </div>
                <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
                  <span>{c.wa_numbers?.label ?? c.wa_numbers?.display_phone}</span>
                  <span>{c.assigned_user_id ? `→ ${names.get(c.assigned_user_id) ?? "someone"}` : "unassigned"}</span>
                </div>
              </Link>
            </li>
          ))}
          {!convs.length ? <li className="p-6 text-center text-sm text-muted-foreground">No conversations here.</li> : null}
        </ul>
      </aside>

      {/* phones: the list first; a chat opens full screen (?c=) with "← Back" to the list */}
      <section className={cn("flex min-h-0 min-w-0 flex-col", !p("c") && "hidden md:flex")}>
        {selected ? (
          <>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
              <Link href="/whatsapp" className="text-xs text-muted-foreground md:hidden">← Back</Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium" data-testid="conversation-title">
                  {selected.leads?.company ?? selected.contact_name ?? selected.contact_phone}
                  {selected.leads ? <TierBadge tier={selected.leads.tier} disqualified={selected.leads.disqualified} /> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selected.contact_phone} · via {selected.wa_numbers?.label ?? ""} {selected.wa_numbers?.display_phone}
                  {selected.lead_id ? <> · <Link className="underline" href={`/leads/${selected.lead_id}`}>Open lead</Link></> : null}
                  {selected.leads ? <> · <StageBadge stage={selected.leads.stage} /></> : null}
                </div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Badge variant={open ? "secondary" : "outline"} data-testid="window-badge"
                  className={open ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : ""}>
                  {open ? `24h window open · ${timeLeft(selected.last_inbound_at, WINDOW_MS)}` : "24h window closed"}
                </Badge>
                <AssignControl id={selected.id} assigned={selected.assigned_user_id} team={team} />
                <StatusControl id={selected.id} status={selected.status} />
              </div>
            </header>

            <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 px-4 py-4" data-testid="thread">
              {(messages ?? []).map((m) => {
                const out = m.direction === "outbound";
                const hasFile = Boolean(m.media_id || m.media_path);
                const isImage = (m.media_mime ?? "").startsWith("image/");
                return (
                  <li key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[78%] rounded-xl px-3 py-2 text-sm shadow-xs",
                      out ? "bg-emerald-50 dark:bg-emerald-950/60" : "bg-background", m.status === "failed" && "ring-1 ring-destructive/40")}>
                      {m.template_name ? <div className="mb-0.5 text-[11px] text-muted-foreground">Template: {m.template_name}</div> : null}
                      {hasFile && isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/wa/media/${m.id}`} alt={m.media_filename ?? "Image"} className="mb-1 max-h-60 rounded-md" />
                      ) : null}
                      {hasFile && !isImage ? (
                        <a href={`/api/wa/media/${m.id}`} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1.5 underline">
                          <FileText className="size-4" /> {m.media_filename ?? `Open ${m.type}`}
                        </a>
                      ) : null}
                      {m.body && !(hasFile && m.body === m.media_filename) ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
                      {!m.body && !hasFile ? <p className="text-muted-foreground italic">[{m.type}]</p> : null}
                      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                        {out && m.sent_by ? <span>{names.get(m.sent_by) ?? ""} ·</span> : null}
                        {out && !m.sent_by ? <span>system ·</span> : null}
                        <span>{formatDateTime(m.meta_timestamp ?? m.created_at, tz)} {shortZone(tz)}</span>
                        {out ? <Ticks status={m.status} /> : null}
                      </div>
                      {m.status === "failed" && m.error_title ? <p className="mt-1 text-xs text-destructive">{m.error_title}</p> : null}
                    </div>
                  </li>
                );
              })}
              {!messages?.length ? <li className="py-10 text-center text-sm text-muted-foreground">No messages yet.</li> : null}
            </ol>

            <footer className="border-t p-3">
              <Composer
                key={selected.id}
                conversationId={selected.id}
                windowOpen={open}
                templates={(templates ?? []) as never}
                lead={{ company: selected.leads?.company, contact_name: selected.leads?.contact_name ?? selected.contact_name }}
                canSend={!selected.wa_numbers?.is_demo && whatsappConfigured()}
                blockedReason={selected.wa_numbers?.is_demo
                  ? "Demo conversation: this number is not connected to Meta, so replies are disabled."
                  : "WhatsApp is not connected yet: the admin must add the access token in Vercel."}
              />
            </footer>
          </>
        ) : (
          <div className="m-auto p-10 text-center text-sm text-muted-foreground">Choose a conversation.</div>
        )}
      </section>
    </div>
  );
}
