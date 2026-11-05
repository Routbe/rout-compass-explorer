import { describe, expect, it } from "vitest";
import { passkeyOnlyDecision } from "./passkey-only";
import { signSignupTicket, verifySignupTicket, SIGNUP_TICKET_TTL_S } from "./signup-ticket";

describe("passkey-only gateway policy", () => {
  it.each([
    "/sign-in/email",
    "/sign-in/magic-link",
    "/sign-in/social",
    "/sign-in/oauth2",
    "/sign-up/email",
    "/magic-link/verify",
    "/forget-password",
    "/request-password-reset",
    "/reset-password",
    "/change-password",
    "/set-password",
    "/something-new",
  ])("refuses %s", (path) => {
    expect(passkeyOnlyDecision(path)).toEqual({ allow: false, code: "method_disabled" });
  });

  it.each([
    "/passkey/generate-authenticate-options",
    "/passkey/verify-authentication",
    "/passkey/generate-register-options",
    "/passkey/verify-registration",
    "/get-session",
    "/sign-out",
    "/link-social",
    "/callback/google",
  ])("allows %s", (path) => {
    expect(passkeyOnlyDecision(path)).toEqual({ allow: true });
  });
});

describe("sign-up ticket", () => {
  const secret = "x".repeat(40);
  const data = { email: "a@b.be", name: "A", dob: "2000-01-01", parentEmail: null, consent: "v1" };

  it("round-trips and expires after 10 minutes", async () => {
    const t = await signSignupTicket(secret, data, 1000);
    expect((await verifySignupTicket(secret, t, 1000))?.email).toBe("a@b.be");
    expect(SIGNUP_TICKET_TTL_S).toBe(600);
    expect(await verifySignupTicket(secret, t, 1000 + 601)).toBeNull();
  });

  it("rejects a tampered ticket or another secret", async () => {
    const t = await signSignupTicket(secret, data, 1000);
    const [prefix, sig] = [t.slice(0, t.lastIndexOf(".")), t.slice(t.lastIndexOf(".") + 1)];
    expect(await verifySignupTicket(secret, `${prefix}x.${sig}`, 1000)).toBeNull();
    expect(await verifySignupTicket("y".repeat(40), t, 1000)).toBeNull();
  });
});
