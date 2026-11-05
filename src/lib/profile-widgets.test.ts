import { describe, expect, it } from "vitest";
import { daysUntilBirthday, musicEmbed, parseWidgetConfig, postEmbed, videoEmbed } from "./profile-widgets";
import { blockDisplay } from "./profile";

describe("profile widgets", () => {
  it("counts days to the next birthday, rolling to next year", () => {
    expect(daysUntilBirthday("1990-11-10", new Date(2026, 10, 4))).toBe(6);
    expect(daysUntilBirthday("1990-11-04", new Date(2026, 10, 4))).toBe(0);
    expect(daysUntilBirthday("1990-11-03", new Date(2026, 10, 4))).toBe(364);
  });

  it("stores only a city-level place (rounded coordinates)", () => {
    const c = parseWidgetConfig(JSON.stringify({ place: { name: "Gent", lat: 51.054342, lon: 3.717424, timezone: "Europe/Brussels" } }));
    expect(c.place).toEqual({ name: "Gent", lat: 51.05, lon: 3.72, timezone: "Europe/Brussels" });
  });

  it("turns single-post links into embeds", () => {
    expect(postEmbed("https://www.instagram.com/p/Cabc123/")).toEqual({ provider: "instagram", src: "https://www.instagram.com/p/Cabc123/embed" });
    expect(postEmbed("https://x.com/rout/status/123456")?.provider).toBe("x");
    expect(postEmbed("https://bsky.app/profile/rout.be/post/3kabc")).toEqual({ provider: "bluesky", handle: "rout.be", rkey: "3kabc" });
    expect(postEmbed("https://mastodon.social/@rout/11223344")?.provider).toBe("mastodon");
    expect(postEmbed("https://example.com/")).toBeNull();
  });

  it("embeds music and video links", () => {
    expect(musicEmbed("https://open.spotify.com/track/abc123")).toBe("https://open.spotify.com/embed/track/abc123");
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("a link can be a button, a logo under the bio, or both", () => {
    expect(blockDisplay({ display: "icon" }, "rows")).toEqual({ button: false, icon: true });
    expect(blockDisplay({ display: "both" }, "rows")).toEqual({ button: true, icon: true });
    expect(blockDisplay({}, "rows")).toEqual({ button: true, icon: false });
  });
});
