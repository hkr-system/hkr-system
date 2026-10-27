import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { supabaseEnv } from "./env";

// Supabase client for Client Components (e.g. Realtime in the WhatsApp inbox).
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient<Database>(url, key);
}
