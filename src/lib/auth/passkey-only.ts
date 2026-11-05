/**
 * Passkey-only authentication policy for the Better Auth gateway (`/api/auth/*`).
 *
 * The ONLY ways to obtain a session are:
 *   - a WebAuthn passkey assertion (`/passkey/verify-authentication`);
 *   - registering a first passkey with a signed sign-up ticket or an admin-approved
 *     recovery token (`/passkey/verify-registration` + `createSession`).
 * E-mail links, passwords and social/OIDC sign-in are refused. Social accounts can
 * still be LINKED to an existing, signed-in member as identity proofs.
 */

/** Paths Better Auth may serve. Everything else answers 410 `method_disabled`. */
const ALLOWED_EXACT = new Set([
  "/get-session",
  "/sign-out",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/update-user",
  "/delete-user",
  "/list-accounts",
  "/unlink-account",
  // Linking a social identity to the signed-in member (never a sign-in).
  "/link-social",
  "/oauth2/link",
]);
const ALLOWED_PREFIXES = ["/passkey/", "/two-factor/", "/callback/", "/oauth2/callback/"];

/** Explicitly dead methods, reported with a clearer message than a generic 410. */
const DEAD_PREFIXES = ["/sign-in/", "/sign-up/", "/magic-link/", "/forget-password", "/reset-password", "/request-password-reset", "/change-password", "/set-password", "/verify-email", "/send-verification-email"];

export type AuthPathDecision = { allow: true } | { allow: false; code: "method_disabled" };

export function passkeyOnlyDecision(relativePath: string): AuthPathDecision {
  const path = relativePath.replace(/\/+$/, "") || "/";
  const dead = DEAD_PREFIXES.some((p) => {
    const base = p.replace(/\/$/, "");
    return path === base || path.startsWith(`${base}/`);
  });
  if (dead) {
    return { allow: false, code: "method_disabled" };
  }
  if (ALLOWED_EXACT.has(path) || ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return { allow: true };
  return { allow: false, code: "method_disabled" };
}

export const METHOD_DISABLED_MESSAGE =
  "ROUT accepteert alleen passkeys. Log in met je passkey, maak een account met een passkey, of herstel je account via /recovery/quarantine.";

/** Context prefixes for first-passkey registration without a session. */
export const SIGNUP_CONTEXT_PREFIX = "su.";
export const RECOVERY_CONTEXT_PREFIX = "rq.";
