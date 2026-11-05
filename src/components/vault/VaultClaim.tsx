import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { seal } from "@/lib/e2ee/crypto";
import { masterKeyFromMnemonic, newMasterKey } from "@/lib/e2ee/recovery";
import { loadDeviceKey, saveDeviceKey, workspaceKeyFromMaster, type WorkspaceKey } from "@/lib/e2ee/device-key";
import { openEphemeralVault } from "@/lib/vault/ephemeral-vault.functions";
import { openVaultPayload, vaultClaimProof, vaultConfigSchema, workspaceConfigAad, type VaultConfig } from "@/lib/vault/ephemeral-vault";

type Props = { vaultId: string; secret: string; onCancel: () => void };
type Opened = { config: VaultConfig; claimProof: string; expiresAt: string };

/**
 * Zero-knowledge claim of an AI handoff vault. Everything secret happens here,
 * in the browser: decrypt with the ephemeral secret (step B), re-encrypt with
 * the member's own key (step C). The server receives only ciphertext, the
 * one-way claim proof and the public workspace name.
 */
export function VaultClaim({ vaultId, secret, onCancel }: Props) {
  const { user } = useAuth();
  const openVault = useServerFn(openEphemeralVault);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [deviceKey, setDeviceKey] = useState<WorkspaceKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [phrase, setPhrase] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [wroteDown, setWroteDown] = useState(false);
  const [done, setDone] = useState<{ slug: string } | null>(null);

  // Step A + B: fetch ciphertext with the claim proof, decrypt locally.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const claimProof = await vaultClaimProof(secret);
        const res = await openVault({ data: { vaultId, claimProof } });
        if (cancelled) return;
        if (res.status === "not_found") return setError("Deze overdracht bestaat niet (meer). Kluizen vernietigen zichzelf na 1 uur.");
        if (res.status === "invalid") return setError("Deze code past niet bij de kluis. Controleer elk teken.");
        const raw = await openVaultPayload(secret, vaultId, res.encryptedPayload);
        const config = vaultConfigSchema.parse(raw);
        if (!cancelled) setOpened({ config, claimProof, expiresAt: res.expiresAt });
      } catch {
        if (!cancelled) setError("Openen mislukt. Probeer het zo opnieuw.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultId, secret, openVault]);

  useEffect(() => {
    if (!user) return;
    void loadDeviceKey(user.id).then(setDeviceKey).catch(() => setDeviceKey(null));
  }, [user]);

  async function unlockWith(masterKey: Uint8Array) {
    if (!user) return;
    const k = await workspaceKeyFromMaster(masterKey);
    masterKey.fill(0);
    await saveDeviceKey(user.id, k);
    setDeviceKey(k);
    setPhrase("");
    setFresh(null);
  }

  async function unlockFromPhrase() {
    setError(null);
    try {
      await unlockWith(masterKeyFromMnemonic(phrase));
    } catch {
      setError("Ongeldige Master Key. Controleer de 24 woorden.");
    }
  }

  // Step C + commit: re-encrypt with the member's key, send ciphertext only.
  async function commit() {
    if (!user || !opened || !deviceKey) return;
    setBusy(true);
    setError(null);
    try {
      const encrypted = await seal(deviceKey.key, opened.config, workspaceConfigAad(user.id));
      const res = await fetch("/api/v1/workspaces/commit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vault_id: vaultId,
          claim_proof: opened.claimProof,
          name: opened.config.name,
          ...(opened.config.slug ? { slug_base: opened.config.slug } : {}),
          encrypted_config: encrypted,
          key_id: deviceKey.keyId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
      if (!res.ok || !body.slug) {
        setError(
          body.error === "vault_not_found" ? "Deze overdracht is verlopen of al geclaimd."
          : body.error === "vault_proof_invalid" ? "Deze code past niet bij de kluis."
          : body.error === "unauthorized" ? "Log opnieuw in en probeer het nog eens."
          : "Claimen mislukt. Probeer opnieuw.",
        );
        return;
      }
      setOpened(null); // drop the plaintext from memory
      setDone({ slug: body.slug });
    } catch {
      setError("Claimen mislukt. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="flex flex-col items-center gap-5 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-accent/60">
          <Check className="h-10 w-10 text-accent" aria-hidden />
        </div>
        <h2 className="font-display text-3xl">Workspace geclaimd!</h2>
        <p className="text-muted-foreground">De configuratie staat versleuteld met jouw eigen sleutel. De tijdelijke kluis is vernietigd.</p>
        <Button asChild>
          <Link to="/w/$slug" params={{ slug: done.slug }}>Open je workspace</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-xl border border-border p-5">
      <header className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-display text-2xl">Versleutelde overdracht</h2>
      </header>

      {busy && !opened && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Kluis lokaal ontsleutelen…
        </p>
      )}

      {opened && (
        <div className="space-y-1">
          <p className="text-lg font-medium">{opened.config.name}</p>
          {opened.config.description && <p className="text-sm text-muted-foreground">{opened.config.description}</p>}
          <p className="text-xs text-muted-foreground">
            Lokaal ontsleuteld in je browser. Kluis vernietigt zichzelf om {new Date(opened.expiresAt).toLocaleTimeString("nl-NL")}.
          </p>
        </div>
      )}

      {opened && !deviceKey && (
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" aria-hidden /> Ontgrendel je Master Key
          </p>
          {fresh ? (
            <>
              <p className="text-xs text-muted-foreground">Schrijf deze 24 woorden op papier. ROUT bewaart ze niet en kan ze nooit herstellen.</p>
              <p className="rounded-md border border-border bg-background p-3 font-mono text-sm leading-relaxed">{fresh}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={wroteDown} onCheckedChange={(v) => setWroteDown(v === true)} /> Ik heb ze veilig opgeschreven
              </label>
              <Button className="w-full" disabled={!wroteDown} onClick={() => void unlockWith(masterKeyFromMnemonic(fresh))}>
                Gebruik deze Master Key
              </Button>
            </>
          ) : (
            <>
              <Textarea
                aria-label="Master Key (24 woorden)"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="24 woorden, gescheiden door spaties"
                autoComplete="off"
                spellCheck={false}
                rows={3}
                className="font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void unlockFromPhrase()} disabled={!phrase.trim()}>Ontgrendelen</Button>
                <Button variant="outline" onClick={() => setFresh(newMasterKey().mnemonic)}>Nieuwe Master Key maken</Button>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">De sleutel blijft op dit apparaat (niet-exporteerbaar) en gaat nooit naar de server of de AI.</p>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-muted px-4 py-2 text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy && !!opened}>Annuleren</Button>
        <Button onClick={() => void commit()} disabled={!opened || !deviceKey || busy}>
          {busy && opened && <Loader2 className="animate-spin" aria-hidden />}
          Versleutelen en claimen
        </Button>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Alleen versleutelde gegevens verlaten je browser.
      </p>
    </section>
  );
}
