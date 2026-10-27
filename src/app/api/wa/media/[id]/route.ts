import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";
import { downloadMedia, whatsappConfigured } from "@/lib/whatsapp/graph";
import { graphVersion } from "@/lib/whatsapp/service";

// Opens the file of a WhatsApp message. The message is read with the user's own
// session, so RLS decides who may see it. Inbound media is fetched from Meta the
// first time and kept in the private "wa-media" bucket; the user gets a 5-minute link.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/wa/media/[id]">) {
  const { id } = await ctx.params;
  const db = await createClient();
  const { data: msg } = await db.from("wa_messages")
    .select("id, conversation_id, media_id, media_path, media_mime, media_filename").eq("id", id).maybeSingle();
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!adminClientAvailable()) return NextResponse.json({ error: "storage not configured" }, { status: 503 });
  const admin = createAdminClient();

  let path = msg.media_path;
  if (!path) {
    if (!msg.media_id || !whatsappConfigured()) return NextResponse.json({ error: "file not available" }, { status: 404 });
    const { bytes, mime } = await downloadMedia(await graphVersion(db), msg.media_id);
    const ext = (msg.media_filename?.split(".").pop() ?? mime.split("/")[1] ?? "bin").replace(/[^a-z0-9]/gi, "");
    path = `${msg.conversation_id}/${msg.id}.${ext}`;
    const { error } = await admin.storage.from("wa-media").upload(path, bytes, { contentType: mime, upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db.from("wa_messages").update({ media_path: path, media_mime: msg.media_mime ?? mime }).eq("id", msg.id);
  }
  const { data, error } = await admin.storage.from("wa-media").createSignedUrl(path, 300, {
    download: msg.media_filename ?? undefined,
  });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "no link" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
