import "server-only";
import { brevoEnabled, sendTransactionalEmail } from "@/lib/brevo";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayMonth, reportDue } from "./dates";
import { loadOps } from "./load";
import { ordersReport, reportText, rmaReport } from "./report";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** SOP P9 at 18:00 HK: Internal Orders + Internal RMA's emailed to every active admin and specialist (Brevo).
 *  Called by the every-minute worker; does nothing until Brevo is connected or before the time. */
export async function maybeSendDailyReport(now = new Date()) {
  if (!brevoEnabled()) return { skipped: "brevo" };
  const db = createAdminClient();
  const [{ data: timeRow }, { data: lastRow }] = await Promise.all([
    db.from("settings").select("value").eq("key", "report_time").maybeSingle(),
    db.from("settings").select("value").eq("key", "last_daily_report").maybeSingle(),
  ]);
  const last = typeof lastRow?.value === "string" ? lastRow.value : null;
  const { due, date } = reportDue(now, timeRow?.value as { time?: string; timezone?: string; weekdays?: number[] } | null, last);
  if (!due) return { skipped: "not due" };
  await db.from("settings").update({ value: date }).eq("key", "last_daily_report"); // claim the day first (one email per day)
  try {
    const ops = await loadOps(db, now);
    const orders = reportText(ordersReport(ops.orders));
    const rmas = reportText(rmaReport(ops.rmas, ops.today));
    const [{ data: people }, { data: senderRow }] = await Promise.all([
      db.from("profiles").select("email").in("role", ["admin", "account_specialist"]).eq("active", true),
      db.from("settings").select("value").eq("key", "email_sender").maybeSingle(),
    ]);
    const to = (people ?? []).map((p) => p.email).filter((e) => e && !/\.(test|example)$|@example\.com$/i.test(e));
    if (!to.length) return { skipped: "no recipients" };
    const sender = (senderRow?.value ?? { email: "noreply@hk-refurbished-stock.com", name: "HKR System" }) as { email: string; name: string };
    const block = (title: string, text: string) => `<h3 style="font-family:sans-serif">${esc(title)}</h3><pre style="font-size:13px;line-height:1.5">${esc(text)}</pre>`;
    await sendTransactionalEmail({
      sender, to, subject: `Daily report ${dayMonth(ops.today, "en")} — Internal Orders and Internal RMA's`,
      html: block("Internal Orders — daily", orders) + block("Internal RMA's — daily", rmas),
    });
    return { sent: to.length };
  } catch (e) {
    await db.from("settings").update({ value: last ?? "" }).eq("key", "last_daily_report"); // try again next minute
    throw e;
  }
}
