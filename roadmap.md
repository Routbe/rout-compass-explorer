# Repository import

- [x] Download and inspect source without credentials or repository metadata.
- [x] Import source pages, styles, assets and service code 1:1 (2356 src + 109 public files, 409 routes).
- [x] Reconcile dependencies and shared components (bun install clean, build OK).
- [x] Verify public homepage, documentation routes and account pages in a browser.
- [x] Run the imported test suite (1979/1982 tests pass).
- [x] Connect the user's own Neon database (DATABASE_URL, PUBLIC_ORIGIN, BETTER_AUTH_SECRET saved; live reads, sign-in form and signed-out dashboard redirect verified).
- [x] Keep server functions working while no Supabase backend is linked (auth attacher no longer throws; /about and /explore render, docs-routing test green).
- [ ] Link the user's own Supabase — user action: project settings → General → External Supabase → Connect. Only needed for the features that read Supabase directly.
- [ ] Request remaining provider keys as features are tested (Stripe, bunq, Bluesky, Mastodon, Spotify, YouTube, Steam, Last.fm, Telegram, Snapchat, weather, OMNI, ROUT OAuth, NEON_API_KEY).
- [ ] Regenerate `db/schema.snapshot.json` (stale vs migrations: `agent_sandboxes`, 8 `rout_agent_sandbox_*` functions, `agent_workspace_claims` columns) — pre-existing in the source repo.
- [ ] Fix `src/test/smoke/privacy.test.ts` false positive (`gtag\(` matches `qr.createSvgTag(`) — pre-existing in the source repo.
- [ ] Decide cutover: does this project replace the original deployment (webhooks, cron, OAuth redirect URIs)?

# Planning (user list, 2026-11-04)
- [x] Remove the two `e2e-agent-` test workspaces from Neon.
- [x] Cron purge route protected by LOVABLE_CRON_SECRET (401 without, 200 with). Open: an external scheduler must call it hourly (no Vercel cron here).
- [ ] E2E claim flow with a real account (/studio/workspaces/claim) — needs a signed-in session.
- [x] Parental consent page /info/parental-consent, in docs catalog, linked from sign-up.
- [x] Translate all /info articles to en/fr/de (75 files).
- [x] Fix "Session is not fresh" on Add passkey (step-up then retry).
- [x] Privacy smoke test false positive fixed.
- [ ] Keys: SMS gateway, Didit (DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_WEBHOOK_SECRET, IDENTITY_HASH_PEPPER), Google Wallet — user to supply.
- [ ] Physical mobile tests (Snapchat share widget, cache invalidation) — user on device.
- [ ] E2EE: Neon branch `feat-e2e-encryption` connection string — user.
- [x] Security Hub: passwordless sign-in/sign-up, TOTP + hardware key + low-security SMS/email rows, recovery codes gated + hashed.
- [ ] Visual check of Security Hub while signed in (needs a session).

## Nov 4 batch
- [x] Gift cards: only fixed amounts (buyer can't set price)
- [x] YouTube push verify: per-channel token, no probing of linked channels
- [x] Command Center: drag to move, edge/corner resize, pencil per tile, layout saved on profile
- [x] Weather: location saved once on profile, change via pencil
- [x] Spotify widget: album art, progress, clear status
- [x] Account settings: "Gekoppelde diensten" overview
- [ ] Google Wallet: keys saved; check a real saved pass on a phone
