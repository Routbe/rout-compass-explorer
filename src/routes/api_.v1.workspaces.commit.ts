import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/workspaces/commit — permanent claim of an ephemeral vault.
 * Signed-in session required. Body (strict): vault_id, claim_proof, name,
 * slug_base?, encrypted_config (client-side ciphertext under the member's own
 * key) and key_id. The vault row is hard-deleted in the same transaction.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export const Route = createFileRoute("/api_/v1/workspaces/commit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // CSRF: JSON only (forces a CORS preflight cross-site) and never from another site.
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "unsupported_media_type" }, 415);
        if (request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "forbidden" }, 403);

        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return json({ error: "unauthorized" }, 401);

        const { vaultCommitSchema } = await import("@/lib/vault/ephemeral-vault");
        const parsed = vaultCommitSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid_request" }, 400);
        const d = parsed.data;

        const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit.server");
        try {
          enforceRateLimit(`vault-commit:${user.id}`, 10, 60_000);
        } catch (e) {
          if (e instanceof RateLimitError) return json({ error: "rate_limited" }, 429);
          throw e;
        }
        try {
          await (await import("@/lib/platform-features.server")).assertPlatformFeature("workspaces");
        } catch {
          return json({ error: "workspaces_disabled" }, 403);
        }

        const { withDbContext } = await import("@/lib/neon");
        const { readVerifiedVault, commitEphemeralVault } = await import("@/lib/vault/ephemeral-vault.server");
        const { matrixWorkspaceSlug, isValidWorkspaceSlug } = await import("@/lib/workspace-rules");
        return withDbContext({ userId: user.id, workspaceId: null }, async () => {
          try {
            const vault = await readVerifiedVault(d.vault_id, d.claim_proof);
            if (!vault) return json({ error: "vault_not_found" }, 404);
            const base = d.slug_base && d.slug_base.length >= 3 ? d.slug_base : d.name;
            for (let i = 0; i < 6; i++) {
              const slug = matrixWorkspaceSlug(base, "free");
              if (!isValidWorkspaceSlug(slug)) continue;
              try {
                const ws = await commitEphemeralVault({
                  vaultId: d.vault_id, vaultHash: vault.vaultHash, name: d.name, slug,
                  encryptedConfig: d.encrypted_config, keyId: d.key_id,
                });
                try {
                  const { setActiveWorkspaceCookie } = await import("@/lib/workspaces.server");
                  await setActiveWorkspaceCookie(ws.workspaceId);
                } catch {
                  /* the claim itself succeeded */
                }
                return json({ workspace_id: ws.workspaceId, slug: ws.slug }, 201);
              } catch (e) {
                if (!String((e as Error).message).includes("slug_taken") && (e as { code?: string }).code !== "P0001") throw e;
                if (!String((e as Error).message).includes("slug_taken")) throw e;
              }
            }
            return json({ error: "slug_unavailable" }, 409);
          } catch (e) {
            const m = String((e as Error).message ?? "");
            if (m === "vault_proof_invalid" || m.includes("vault_proof_invalid")) return json({ error: "vault_proof_invalid" }, 403);
            if (m.includes("vault_not_found") || m.includes("vault_expired")) return json({ error: "vault_not_found" }, 404);
            console.error("[vault] commit failed");
            return json({ error: "server_error" }, 500);
          }
        });
      },
    },
  },
});
