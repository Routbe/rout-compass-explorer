<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Imported application
- Preserve ROUT’s imported TanStack route, provider, asset and MDX structure so source updates remain compatible.
- Keep the source compiler settings for imported code; retain managed project metadata and generated integration files.
- Never copy source credentials or automatically apply the external database migrations; account services require explicit compatible configuration.

- Account-less AI agents use sandboxes (`agent-sandbox.ts` + db/0202): proof-of-work → 48 h `rsk_` key → one unowned workspace; login apps stay specs until claim (link, QR of link, or checksummed code) and become OAuth clients owned by the claimer. Why: no usable app or public data before a human owns it; only hashes are stored.
- AI→human encrypted handoff uses ephemeral vaults (`src/lib/vault/*` + db/0205): server seals the agent's config under a one-time secret, stores only ciphertext + argon2id of an HKDF claim proof (1 h TTL); the browser decrypts, re-seals with the member's Master-Key-derived device key and commits to `workspaces.encrypted_config`, deleting the vault atomically. Why: the raw secret never returns to the server and only ciphertext is persisted.
- `/ai-manifest.json` (`src/lib/agent/ai-manifest.ts`) generates its OpenAPI and design-token AST from the same Zod schemas and CONTRAST_RULES the vault API enforces; `public/robots.txt` (which shadows the robots route) points to it. Why: discovery docs can never drift from validation.
- Modules reachable from server route handlers read cookies, headers and the request via `src/lib/request-context.ts` (createServerOnlyFn wrappers), never by importing `@tanstack/react-start/server` directly. Why: the preview bundler follows handler imports into the browser bundle, and a direct import breaks the whole preview.
- Browser-side key operations (E2EE device key, Master Key, handoff vault open/reseal, encrypted ledger, hashing) run only in the cryptographic enclave worker (`src/lib/crypto-enclave/*`); UI code calls the typed `enclave` client over postMessage, never `crypto.subtle` or runtime crypto modules, and the worker wipes secret/plaintext typed arrays after each operation (enforced by `enclave.test.ts`). Why: keys and plaintext never live on the UI thread, shrinking XSS/heap-dump exposure.
- Costly agent endpoints (vault handoff, sandbox workspace) require a scoped, HMAC-signed proof-of-work from `/api/v1/pow/challenge` (`src/lib/pow/*`), spent once via `rout_pow_spend` (db/0206); failures answer 401 `challenge_required`. Why: compute cost and replay protection without accounts.
- Auth is passkey-only: `src/lib/auth/passkey-only.ts` allowlists Better Auth paths, first passkeys need a signed sign-up ticket or an admin-approved recovery token (`passkey-enrollment.server.ts`, db/0207), and members without a passkey are quarantined in the gateway and `bridge.server.ts`. Social providers only link identities. Why: phishing-resistant sign-in with no password, link or social fallback.
