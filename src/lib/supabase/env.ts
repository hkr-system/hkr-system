// The two public Supabase values. They are safe in the browser: every table is
// protected by Row Level Security, so the key alone gives no data access.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Set them in Vercel → Project → Settings → Environment Variables (or .env.local when running locally).",
    );
  }
  return { url, key };
}
