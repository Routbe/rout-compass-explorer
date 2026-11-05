import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/agent/vault — zero-knowledge workspace handoff (Bearer rsk_… sandbox key).
 * Body: { "config": { "name": "…", "slug"?: "…", …any JSON } } (max 32 KiB).
 * The server seals the config with a fresh one-time secret (AES-256-GCM), stores
 * only the ciphertext and an argon2id hash of a claim proof, and returns the RAW
 * secret exactly once. Vaults self-destruct after 1 hour.
 */
export const Route = createFileRoute("/api_/v1/agent/vault")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateSandbox } = await import("@/lib/agent/agent-sandbox.server");
        const ctx = await authenticateSandbox(request);
        if (ctx instanceof Response) return ctx;
        const { agentError, agentOk, agentValidationError } = await import("@/lib/agent/responses");
        const { VAULT_MAX_CONFIG_BYTES, configByteLength, handoffCode, vaultConfigSchema } = await import("@/lib/vault/ephemeral-vault");
        const text = await request.text();
        if (text.length > VAULT_MAX_CONFIG_BYTES * 2) return agentError(400, "invalid_request", `Body too large. The config may be at most ${VAULT_MAX_CONFIG_BYTES} bytes.`);
        let raw: unknown = null;
        try {
          raw = JSON.parse(text);
        } catch {
          return agentError(400, "invalid_request", "Send JSON: { \"config\": { \"name\": \"…\" } }.");
        }
        const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const parsed = vaultConfigSchema.safeParse(body["config"]);
        if (!parsed.success) return agentValidationError(parsed.error, raw);
        if (configByteLength(parsed.data) > VAULT_MAX_CONFIG_BYTES) {
          return agentError(400, "invalid_request", `The config may be at most ${VAULT_MAX_CONFIG_BYTES} bytes.`);
        }
        try {
          const { createEphemeralVault } = await import("@/lib/vault/ephemeral-vault.server");
          const { claimQrSvg } = await import("@/lib/agent/agent-sandbox.server");
          const { publicOrigin } = await import("@/lib/agent/agent-auth.server");
          const v = await createEphemeralVault(ctx, parsed.data);
          const code = handoffCode(v.vaultId, v.secret);
          // The code travels in the URL fragment, which browsers never send to the server.
          const claimUrl = `${publicOrigin(request)}/studio/workspaces/claim#${code}`;
          const svg = await claimQrSvg(claimUrl);
          return agentOk(
            {
              vault_id: v.vaultId,
              ephemeral_secret: v.secret,
              handoff_code: code,
              claim_url: claimUrl,
              claim_qr_svg: `data:image/svg+xml;base64,${btoa(svg)}`,
              expires_at: v.expiresAt,
              human_steps: [
                "In ROUT: the gear icon next to “New workspace” → Claim workspace.",
                "Scan the QR code or paste the handoff code, then unlock your Master Key.",
                "Your browser decrypts the config locally and re-encrypts it with your own key.",
              ],
              note: "Shown once. ROUT stores no secret and cannot read the config after this response. Expires in 1 hour.",
            },
            201,
          );
        } catch (error) {
          // The transport keeps only the SQLSTATE; P0001 is a refusal raised by the
          // vault function (the sandbox was verified just above, so: quota).
          if ((error as { code?: string }).code === "P0001") {
            return agentError(429, "rate_limited", "At most 5 open vaults per sandbox. Wait until one is claimed or expires (1 hour).");
          }
          console.error("[vault] create failed");
          return agentError(500, "server_error", "The vault could not be created right now.");
        }
      },
    },
  },
});
