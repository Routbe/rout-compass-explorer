import { hexToOklch } from "./wallet-color";
import { describe, expect, it } from "vitest";
import { GOOGLE_PASS_DESIGN, googleArtworkVersion } from "./google-premium-art";
import { googleCardObject, googleCardSaveClaims, walletCardPayload } from "./wallet-pass";

const card = walletCardPayload({ handle: "maker", space: "root", displayName: "Maker", tagline: "My work", themeBg: "#ff00ff", accent: "#ff0000", avatarSrc: null }, "https://rout.be", "RT-235Q-ABCD-X");
describe("premium Google pass rules", () => {
  it("harmonises saturated profile colours into a dark matte background", () => {
    const bg = googleCardObject(card, "3388").hexBackgroundColor;
    const lch = hexToOklch(bg)!;
    expect(lch.L).toBeGreaterThanOrEqual(0.149);
    expect(lch.L).toBeLessThanOrEqual(0.201);
    expect(lch.C).toBeLessThanOrEqual(0.036);
    expect(card.hexBackgroundColor).toBe("#ff00ff");
  });
  it("reserves exactly two front rows for card number and the profile hub", () => {
    const rows = googleCardSaveClaims(card, { issuerId: "3388", serviceAccountEmail: "fixture@example.invalid", origins: ["https://rout.be"] }).payload.genericClasses[0]?.classTemplateInfo.cardTemplateOverride.cardRowTemplateInfos;
    expect(rows?.map(r => r.oneItem.item.firstValue.fields[0]?.fieldPath)).toEqual(["object.textModulesData['card']", "object.textModulesData['hub']"]);
    expect(googleCardObject(card, "3388").textModulesData.some(m => m.id === "authentication")).toBe(true);
  });
  it("uses 660-square logo with 17.5 percent safe padding", () => {
    expect(GOOGLE_PASS_DESIGN.logoSize).toBe(660);
    expect(GOOGLE_PASS_DESIGN.logoPadding).toBe(0.175);
  });
  it("uses 1032x812 hero and 1200x375 strip dimensions", () => {
    expect([GOOGLE_PASS_DESIGN.heroWidth, GOOGLE_PASS_DESIGN.heroHeight]).toEqual([1032, 812]);
    expect([GOOGLE_PASS_DESIGN.stripWidth, GOOGLE_PASS_DESIGN.stripHeight]).toEqual([1200, 375]);
  });
  it("versions clean public PNG URLs when card data changes", () => {
    const object = googleCardObject(card, "3388");
    const uri = new URL(object.heroImage.sourceUri.uri);
    expect(uri.search).toBe("");
    expect(uri.pathname.endsWith("/hero.png")).toBe(true);
    expect(googleArtworkVersion({ ...card, displayName: "Changed" })).not.toBe(googleArtworkVersion(card));
  });
});