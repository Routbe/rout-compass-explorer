import { createFileRoute } from "@tanstack/react-router";

/** GET /api/wallet/render/logo/<bg hex>/<light|dark>.png — 660² crest, 17.5% safe padding. Immutable per URL. */
export const Route = createFileRoute("/api_/wallet/render/logo/$bg/$file")({
  server: { handlers: { GET: async ({ params }) => {
    const bg = String(params.bg ?? "").toLowerCase();
    const tone = ({ "light.png": "light", "dark.png": "dark" } as const)[String(params.file) as "light.png" | "dark.png"];
    if (!/^[0-9a-f]{6}$/.test(bg) || !tone) return new Response("Not found", { status: 404 });
    const { googlePremiumLogoSvg, GOOGLE_PASS_DESIGN } = await import("@/lib/wallet/google-premium-art");
    const { svgToPng } = await import("@/lib/og-render.server");
    const { walletOrigin } = await import("@/lib/wallet/wallet-payload.server");
    const png = await svgToPng(googlePremiumLogoSvg(`#${bg}`, tone), walletOrigin(), `#${bg}`, GOOGLE_PASS_DESIGN.logoSize);
    return new Response(png as BodyInit, { headers: { "content-type": "image/png", "access-control-allow-origin": "*", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  } } },
});
