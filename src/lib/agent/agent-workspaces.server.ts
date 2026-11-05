import { sql, withDbContext } from "@/lib/neon";
import { generateClaimToken, hashClaimToken } from "./agent-claims";

/**
 * Server side of agent-provisioned workspaces. All state changes go through
 * the SECURITY DEFINER functions from migration 0164; rout_app holds only
 * EXECUTE on them and can never see a token hash.
 */

export type ProvisionedWorkspace = {
  workspaceId: string;
  slug: string;
  expiresAt: string;
  claimToken: string;
};

/** Create one unowned staging workspace for an agent. Throws the DB error text. */
export async function provisionAgentWorkspace(input: {
  userId: string;
  clientId: string;
  name: string;
  slug: string;
  description?: string;
}): Promise<ProvisionedWorkspace> {
  const claimToken = generateClaimToken((n) => crypto.getRandomValues(new Uint8Array(n)));
  const tokenHash = await hashClaimToken(claimToken);
  const rows = await withDbContext({ userId: input.userId, workspaceId: null }, async () => {
    return (await sql`
      select workspace_id, slug, expires_at
        from public.rout_agent_provision_workspace(
          ${input.clientId}, ${input.name}, ${input.slug}, ${input.description ?? null}, ${tokenHash}
        )
    `) as Array<{ workspace_id: string; slug: string; expires_at: string }>;
  });
  const row = rows[0];
  if (!row) throw new Error("provision_failed");
  return { workspaceId: row.workspace_id, slug: row.slug, expiresAt: row.expires_at, claimToken };
}

export type AgentClaimPreview = {
  name: string;
  slug: string;
  expiresAt: string;
  claimed: boolean;
  expired: boolean;
  appName: string | null;
};

/** Preview for the claim page. Signed-in humans only; never returns the hash. */
export async function previewAgentClaim(userId: string, tokenHash: string): Promise<AgentClaimPreview | null> {
  const rows = await withDbContext({ userId, workspaceId: null }, async () => {
    return (await sql`
      select name, slug, expires_at, claimed, expired, app_name
        from public.rout_agent_claim_preview(${tokenHash})
    `) as Array<{ name: string; slug: string; expires_at: string; claimed: boolean; expired: boolean; app_name: string | null }>;
  });
  const row = rows[0];
  if (!row) return null;
  return { name: row.name, slug: row.slug, expiresAt: row.expires_at, claimed: row.claimed, expired: row.expired, appName: row.app_name };
}

export type ClaimedApp = { name: string; clientId: string; clientSecret: string };

/**
 * Claim (link token or claim code hash): the signed-in human becomes Owner,
 * the sandbox key dies, and the agent's login-app specs become real OAuth
 * clients owned by this human. Secrets are returned once. Throws the DB error text.
 */
export async function claimAgentWorkspace(
  userId: string,
  hash: string,
): Promise<{ workspaceId: string; slug: string; apps: ClaimedApp[] }> {
  const rows = await withDbContext({ userId, workspaceId: null }, async () => {
    try {
      return (await sql`
        select workspace_id, slug, pending_apps from public.rout_claim_agent_workspace_v2(${hash})
      `) as Array<{ workspace_id: string; slug: string; pending_apps: unknown }>;
    } catch (error) {
      // Before db/0202 is applied: the original link-only claim keeps working.
      if (!/rout_claim_agent_workspace_v2.*does not exist/.test((error as Error).message ?? "")) throw error;
      return (await sql`
        select workspace_id, slug, '[]'::jsonb as pending_apps from public.rout_claim_agent_workspace(${hash})
      `) as Array<{ workspace_id: string; slug: string; pending_apps: unknown }>;
    }
  });
  const row = rows[0];
  if (!row) throw new Error("claim_not_found");
  const { sandboxAppInput } = await import("./agent-sandbox");
  const specs = (Array.isArray(row.pending_apps) ? row.pending_apps : [])
    .map((a) => sandboxAppInput.safeParse(a))
    .filter((r) => r.success)
    .map((r) => r.data);
  const apps: ClaimedApp[] = [];
  if (specs.length) {
    const { createClient } = await import("@/lib/oauth/provider.server");
    await withDbContext({ userId, workspaceId: row.workspace_id }, async () => {
      for (const s of specs) {
        try {
          const { client, clientSecret } = await createClient(
            userId,
            {
              name: s.name,
              description: s.description ?? null,
              homepageUrl: s.homepage_url ?? null,
              privacyUrl: s.privacy_url ?? null,
              termsUrl: s.terms_url ?? null,
              redirectUris: s.redirect_uris,
              scopes: s.scopes,
            },
            row.workspace_id,
          );
          apps.push({ name: client.name, clientId: client.clientId, clientSecret });
        } catch (error) {
          console.warn("[agent:claim] app spec skipped:", (error as Error).message);
        }
      }
    });
  }
  return { workspaceId: row.workspace_id, slug: row.slug, apps };
}

/** Cron: hard delete every workspace whose claim expired unclaimed. */
export async function purgeUnclaimedAgentWorkspaces(): Promise<number> {
  const rows = (await sql`select public.rout_purge_unclaimed_agent_workspaces() as purged`) as Array<{ purged: number }>;
  return Number(rows[0]?.purged ?? 0);
}
