import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Landing of the portal sign-in link. Works with the token-hash link (our email template and
// the "Copy sign-in link" button: any device) and with the default code link (same browser).
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const code = url.searchParams.get("code");
  const db = await createClient();
  let ok = false;
  if (tokenHash) ok = !(await db.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  else if (code) ok = !(await db.auth.exchangeCodeForSession(code)).error;
  const to = req.nextUrl.clone();
  to.search = "";
  if (!ok) {
    to.pathname = "/portal/login";
    to.searchParams.set("error", "link");
    return NextResponse.redirect(to);
  }
  const { data: acc } = await db.from("portal_account").select("id").maybeSingle();
  if (!acc) {
    // a team member or a disabled client: no portal
    const { data: profile } = await db.from("profiles").select("role").maybeSingle();
    if (profile?.role) {
      to.pathname = "/dashboard";
      return NextResponse.redirect(to);
    }
    await db.auth.signOut();
    to.pathname = "/portal/login";
    to.searchParams.set("error", "noaccess");
    return NextResponse.redirect(to);
  }
  await db.rpc("portal_touch");
  to.pathname = "/portal";
  return NextResponse.redirect(to);
}
