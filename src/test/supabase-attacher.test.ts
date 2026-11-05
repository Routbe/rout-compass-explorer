import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseConfigured } from "@/lib/supabase-auth-attacher";

/**
 * ROUT's data layer is Neon; Supabase is an optional extra backend. While it is
 * not linked, server functions must still run - so the auth attacher has to
 * know the difference instead of touching the generated client and throwing.
 */
describe("supabaseConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is false while no Supabase backend is linked", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    expect(supabaseConfigured()).toBe(false);
  });

  it("is false when only the URL is present", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    expect(supabaseConfigured()).toBe(false);
  });

  it("is true once both Supabase settings are present", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example");
    expect(supabaseConfigured()).toBe(true);
  });
});
