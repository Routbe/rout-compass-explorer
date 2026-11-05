import { createMiddleware } from "@tanstack/react-start";

/**
 * Supabase is optional at runtime: ROUT's own data layer is Neon, and the
 * generated client throws as soon as it is touched while its env vars are
 * absent. Reading a session before that throw made *every* server function call
 * fail, which blanked pages whose loader did not catch (e.g. /about, /explore).
 * So the bearer token is attached only when a Supabase backend is configured.
 */
export function supabaseConfigured(): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  const read = (name: string): string | undefined =>
    env[name] ?? (typeof process !== "undefined" ? process.env[name] : undefined);
  return (
    Boolean(read("VITE_SUPABASE_URL") || read("SUPABASE_URL")) &&
    Boolean(read("VITE_SUPABASE_PUBLISHABLE_KEY") || read("SUPABASE_PUBLISHABLE_KEY"))
  );
}

// Registered as global `functionMiddleware` in src/start.ts: without it the
// browser never attaches the bearer token to serverFn RPCs.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    if (!supabaseConfigured()) return next({ headers: {} });
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
