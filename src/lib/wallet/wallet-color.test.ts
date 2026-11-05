import { describe, expect, it } from "vitest";
import { harmonizeBackground, hexToOklch, oklchToHex, pickLogoTone, HARMONY } from "./wallet-color";

describe("perceptual colour harmonisation", () => {
  it("round-trips sRGB through OKLCH", () => {
    for (const hex of ["#ff0000", "#41db97", "#123456", "#ffffff"]) expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
  });
  it.each(["#ffffff", "#000000", "#ff00ff", "#ffff00", "#0000ff", "#41db97"])("clamps %s to L 15-20%% and capped chroma", (hex) => {
    const lch = hexToOklch(harmonizeBackground(hex))!;
    expect(lch.L).toBeGreaterThanOrEqual(HARMONY.minL - 0.005);
    expect(lch.L).toBeLessThanOrEqual(HARMONY.maxL + 0.005);
    expect(lch.C).toBeLessThanOrEqual(HARMONY.maxC + 0.005);
  });
  it("keeps the hue of the member colour", () => {
    const src = hexToOklch("#ff0000")!.h, out = hexToOklch(harmonizeBackground("#ff0000"))!.h;
    expect(Math.abs(src - out)).toBeLessThan(0.15);
  });
  it("falls back for invalid input", () => expect(harmonizeBackground("nope")).toBe("#111318"));
  it("picks the light crest on dark and the dark crest on light", () => {
    expect(pickLogoTone(harmonizeBackground("#ff00ff"))).toBe("light");
    expect(pickLogoTone("#f4f1ea")).toBe("dark");
  });
});
