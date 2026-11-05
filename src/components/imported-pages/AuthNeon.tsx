import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { toast } from "sonner";
import { ArrowLeft, Fingerprint, KeyRound, LifeBuoy, Loader2, MailCheck, ShieldCheck } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { POST_AUTH_PATH, AUTH_ERROR_CODES } from "@/lib/auth/post-auth";
import { beginAuthIntent } from "@/lib/tour-draft.functions";
import { Altcha } from "@/components/Altcha";
import { isAdminMode } from "@/lib/app-mode";
import { usePortalFrame } from "@/components/layout/PortalContext";
import { withAltcha } from "@/lib/altcha-client";
import { AUTH_UNAVAILABLE_TEXT, type AuthReadiness } from "@/lib/auth-readiness";
import { useI18n } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { SIGNUP_CONSENT_VERSION, canSubmitSignUp } from "@/lib/signup-consent";
import { isMinorDob, signupAgeProblem } from "@/lib/minor-safety";

/** Deliberately permissive: catches typos, never rejects a valid address. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = "signin" | "signup" | "recovery";
type ApiResult = { data?: Record<string, unknown>; error?: { code?: string; message?: string } };

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

async function postJson(path: string, body: unknown, proof: string): Promise<ApiResult> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-altcha": proof },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { data: json };
  return { error: { code: typeof json["code"] === "string" ? json["code"] : `http_${res.status}`, message: typeof json["message"] === "string" ? json["message"] : undefined } };
}

/** First-passkey enrollment must run signed out, so the ticket/token decides the account. */
async function enrollPasskey(context: string, name: string) {
  await authClient.signOut().catch(() => null);
  const res = await authClient.passkey.addPasskey({ context, name, createSession: true } as never);
  const error = (res as { error?: { message?: string; code?: string } } | undefined)?.error;
  if (error) throw Object.assign(new Error(error.message || "passkey_failed"), { code: error.code });
}

/**
 * ROUT sign-in card, PASSKEY-ONLY (WebAuthn/FIDO2): no passwords, no e-mail
 * links, no social sign-in. Sign-up creates the account together with its first
 * passkey; accounts without a passkey recover through an admin-verified link.
 */
export default function AuthNeon({ initialMode = "signin" }: { initialMode?: Mode }) {
  const { t } = useTranslation();
  const { locale } = useI18n();
  const adminPortal = Boolean(usePortalFrame()) || isAdminMode();
  const { user, refresh } = useAuth();

  const [mode, setMode] = useState<Mode>(adminPortal && initialMode === "signup" ? "signin" : initialMode);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);
  const [totp, setTotp] = useState("");
  const [recoveryFiled, setRecoveryFiled] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [dob, setDob] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const minor = isMinorDob(dob);
  const redirected = useRef(false);
  const [readiness, setReadiness] = useState<AuthReadiness | null>(null);
  const unavailable = readiness?.ready === false;

  useEffect(() => {
    fetch("/api/public/auth/providers", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { readiness?: AuthReadiness }) => {
        if (body.readiness) setReadiness(body.readiness);
      })
      .catch(() => setReadiness(null));
  }, []);

  useEffect(() => {
    if (!user || redirected.current || recoveryToken) return;
    redirected.current = true;
    window.location.replace(POST_AUTH_PATH);
  }, [user, recoveryToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    const redirect = params.get("redirect") ?? params.get("next");
    const token = params.get("token");
    if (token && /^[0-9a-f]{64}$/.test(token)) {
      setRecoveryToken(token);
      setMode("recovery");
    }
    if (code) {
      const known = (AUTH_ERROR_CODES as readonly string[]).includes(code) ? code : "provider_rejected";
      toast.error(known === "method_disabled" ? t("auth.pk.methodDisabled") : t("auth.pk.failed"));
    }
    if (redirect) void beginAuthIntent({ data: { next: redirect } }).catch(() => null);
    if (params.toString()) window.history.replaceState({}, "", window.location.pathname);
  }, [t]);

  const onEmailChange = (value: string) => {
    setEmail(value);
    setEmailError(value && !EMAIL_REGEX.test(value.trim()) ? t("auth.ui.email.invalid") : null);
  };
  const emailAccepted = () => {
    if (EMAIL_REGEX.test(email.trim())) return true;
    const message = t("auth.ui.email.invalid");
    setEmailError(message);
    toast.error(message);
    return false;
  };

  const passkeyLogin = async () => {
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    setLoading(true);
    try {
      const res = await authClient.signIn.passkey();
      if (res?.error) {
        toast.error(res.error.message || t("auth.passkey.failed"));
        return;
      }
      if ((res as { data?: { twoFactorRedirect?: boolean } } | undefined)?.data?.twoFactorRedirect) {
        setTotp("");
        setNeedTotp(true);
        return;
      }
      toast.success(t("auth.ui.toast.welcome"));
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, t("auth.passkey.failed")));
    } finally {
      setLoading(false);
    }
  };

  // WebAuthn Conditional UI: saved passkeys appear in the browser's autofill.
  useEffect(() => {
    if (!readiness?.ready || mode !== "signin") return;
    let cancelled = false;
    const pkc = typeof window !== "undefined" ? window.PublicKeyCredential : undefined;
    if (!pkc?.isConditionalMediationAvailable) return;
    void pkc.isConditionalMediationAvailable().then(async (ok) => {
      if (!ok || cancelled) return;
      try {
        const res = await authClient.signIn.passkey({ autoFill: true });
        if (cancelled || !res || res.error) return;
        toast.success(t("auth.ui.toast.welcome"));
        await refresh();
      } catch {
        // Aborted or dismissed autofill: the explicit passkey button still works.
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readiness?.ready, mode]);

  const verifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authClient.twoFactor.verifyTotp({ code: totp, trustDevice: true });
      if (res.error) {
        toast.error(res.error.message || t("auth.ui.code.invalid"));
        return;
      }
      setNeedTotp(false);
      toast.success(t("auth.ui.toast.welcome"));
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consented) { toast.error(t("auth.signupConsent.required")); return; }
    const ageProblem = signupAgeProblem({ dob, parentEmail, email });
    if (ageProblem) {
      toast.error(ageProblem === "dob_invalid" ? t("auth.pk.dobInvalid") : t("auth.pk.parentInvalid"));
      return;
    }
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (adminPortal || !emailAccepted()) return;
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) =>
        postJson("/api/auth-passkey/signup", { email: address, name: name.trim(), dob, parentEmail: minor ? parentEmail.trim().toLowerCase() : "", consent: SIGNUP_CONSENT_VERSION }, proof),
      );
      if (result.error || typeof result.data?.["ticket"] !== "string") {
        toast.error(result.error?.message || t("auth.ui.toast.failed"));
        return;
      }
      await enrollPasskey(result.data["ticket"] as string, "ROUT");
      toast.success(minor ? t("auth.pk.welcomeMinor") : t("auth.ui.toast.welcome"));
      await refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      toast.error(code === "account_exists" || /account_exists/.test(String((err as Error).message)) ? t("auth.pk.accountExists") : errorMessage(err, t("auth.pk.failed")));
    } finally {
      setLoading(false);
    }
  };

  const fileRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailAccepted()) return;
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) => postJson("/api/auth-passkey/recovery", { email: address, note: note.trim() }, proof));
      if (result.error) {
        toast.error(result.error.message || t("auth.ui.toast.failed"));
        return;
      }
      setRecoveryFiled(true);
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.toast.failed")));
    } finally {
      setLoading(false);
    }
  };

  const bindRecoveryPasskey = async () => {
    if (!recoveryToken) return;
    setLoading(true);
    try {
      await enrollPasskey(`rq.${recoveryToken}`, "ROUT");
      setRecoveryToken(null);
      toast.success(t("auth.pk.recovered"));
      await refresh();
    } catch (err) {
      toast.error(/recovery_token_invalid/.test(String((err as Error).message)) ? t("auth.pk.tokenInvalid") : errorMessage(err, t("auth.pk.failed")));
    } finally {
      setLoading(false);
    }
  };

  const emailField = (
    <div className="space-y-1">
      <Label htmlFor="auth-email" className="text-sm">{t("auth.ui.email.label")}</Label>
      <Input
        id="auth-email"
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder={t("auth.email.placeholder")}
        autoComplete="email"
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? "auth-email-error" : undefined}
        className={`h-10 rounded-lg ${emailError ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
        required
      />
      {emailError && <p id="auth-email-error" className="text-[11px] text-destructive">{emailError}</p>}
      {!unavailable && <Altcha className="mt-1" />}
    </div>
  );

  const linkButton = (target: Mode, label: string, Icon: typeof KeyRound) => (
    <button
      type="button"
      onClick={() => setMode(target)}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );

  return (
    <AppLayout>
      <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col items-center justify-center bg-background p-4 text-foreground">
        {!adminPortal && (
          <div className="w-full max-w-md">
            <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> {t("auth.ui.back")}
            </Link>
          </div>
        )}

        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 sm:p-7">
          <div className="mb-4">
            <h1 className="mb-1 font-display text-2xl text-foreground">
              {adminPortal ? t("auth.admin") : mode === "signup" ? t("auth.ui.signup.cta") : mode === "recovery" ? t("auth.pk.recoveryTitle") : t("auth.ui.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{mode === "recovery" ? t("auth.pk.recoverySubtitle") : t("auth.pk.subtitle")}</p>
          </div>

          {unavailable && <Alert variant="destructive" className="mb-4"><AlertDescription>{AUTH_UNAVAILABLE_TEXT[locale]}</AlertDescription></Alert>}

          {mode === "signin" && (
            <div className="space-y-3">
              <Button type="button" onClick={() => void passkeyLogin()} disabled={loading || unavailable} className="cta-glow h-auto min-h-12 w-full gap-2 whitespace-normal px-4 py-3 text-center text-sm leading-tight sm:text-base">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4 shrink-0" />} <span className="min-w-0">{t("auth.passkey")}</span>
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">{t("auth.passkey.hint")}</p>
              {needTotp && (
                <form onSubmit={verifyTotp} className="space-y-2 rounded-xl border border-border p-3">
                  <p className="text-sm">{t("auth.totp")}</p>
                  <input
                    value={totp}
                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label={t("auth.ui.code.label")}
                    className="h-11 w-full rounded-xl border border-input bg-background text-center font-mono tracking-[0.4em]"
                  />
                  <Button type="submit" disabled={loading || totp.length !== 6} className="h-11 w-full rounded-xl">{t("auth.confirm")}</Button>
                </form>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                {!adminPortal && linkButton("signup", t("auth.ui.signup.cta"), KeyRound)}
                {linkButton("recovery", t("auth.pk.noPasskey"), LifeBuoy)}
              </div>
            </div>
          )}

          {mode === "signup" && !adminPortal && (
            <form onSubmit={signUp} className="space-y-3.5">
              {emailField}
              <div className="space-y-1">
                <Label htmlFor="auth-signup-name" className="text-sm">{t("auth.pk.name")}</Label>
                <Input id="auth-signup-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-signup-dob" className="text-sm">{t("auth.pk.dob")}</Label>
                <input
                  id="auth-signup-dob"
                  type="date"
                  required
                  value={dob}
                  max={new Date().toISOString().slice(0, 10)}
                  min="1900-01-01"
                  onChange={(e) => setDob(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                />
              </div>
              {minor && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                  <Label htmlFor="auth-signup-parent" className="text-sm">{t("auth.pk.parentEmail")}</Label>
                  <input
                    id="auth-signup-parent"
                    type="email"
                    required
                    autoComplete="off"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("auth.pk.parentNote")} <Link to="/info/parental-consent" target="_blank" className="underline">{t("auth.pk.parentHow")}</Link>
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2.5 rounded-lg border border-border p-3">
                <Checkbox id="auth-signup-consent" checked={consented} onCheckedChange={(v) => setConsented(v === true)} required aria-required="true" className="mt-0.5" />
                <label htmlFor="auth-signup-consent" className="text-xs leading-relaxed text-muted-foreground">
                  {t("auth.signupConsent.before")}{" "}
                  <Link to="/terms" className="font-medium text-foreground underline underline-offset-2">{t("auth.signupConsent.terms")}</Link>{" "}
                  {t("auth.signupConsent.and")}{" "}
                  <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">{t("auth.signupConsent.privacy")}</Link>{" "}
                  {t("auth.signupConsent.after")}
                </label>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("auth.pk.signupNote")}</p>
              <Button type="submit" className="h-11 w-full gap-2 rounded-lg font-medium" disabled={!canSubmitSignUp({ consented, busy: loading, unavailable, emailError: !!emailError })}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />} {t("auth.pk.signupCta")}
              </Button>
              {linkButton("signin", t("auth.pk.haveAccount"), Fingerprint)}
            </form>
          )}

          {mode === "recovery" && (
            recoveryToken ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> {t("auth.pk.bindIntro")}</p>
                <Button type="button" onClick={() => void bindRecoveryPasskey()} disabled={loading || unavailable} className="h-11 w-full gap-2 rounded-lg">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />} {t("auth.pk.bindCta")}
                </Button>
              </div>
            ) : recoveryFiled ? (
              <div data-testid="auth-recovery-filed" className="space-y-3 rounded-2xl border border-border bg-card/60 p-4 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60"><MailCheck className="h-5 w-5" aria-hidden /></span>
                <p className="text-sm text-muted-foreground">{t("auth.pk.recoveryFiled")}</p>
                {linkButton("signin", t("auth.pk.haveAccount"), Fingerprint)}
              </div>
            ) : (
              <form onSubmit={fileRecovery} className="space-y-3.5">
                {emailField}
                <div className="space-y-1">
                  <Label htmlFor="auth-recovery-note" className="text-sm">{t("auth.pk.recoveryNote")}</Label>
                  <Textarea id="auth-recovery-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} rows={3} />
                </div>
                <Button type="submit" className="h-11 w-full rounded-lg" disabled={loading || unavailable || !!emailError}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.pk.recoveryCta")}
                </Button>
                {linkButton("signin", t("auth.pk.haveAccount"), Fingerprint)}
              </form>
            )
          )}
        </div>
      </div>
    </AppLayout>
  );
}
