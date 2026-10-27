"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  // Only allow paths inside this app (blocks "//evil.com" style redirects).
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Wrong email or password.", email };

  redirect(safeNext(formData.get("next")));
}
