import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudSun, Music2, RefreshCw, ExternalLink, LockKeyhole, Users } from "lucide-react";
import { getDashboardMusic, getDashboardWeather } from "@/lib/dashboard-widgets.functions";
import { getMyVisitStats } from "@/lib/visits.functions";
import { Button } from "@/components/ui/button";

const MUSIC_REASON: Record<string, string> = {
  not_connected: "Spotify is nog niet gekoppeld aan je ROUT-profiel.",
  not_configured: "Spotify is op deze server nog niet ingesteld.",
  not_playing: "Er speelt nu niets.",
  no_content: "Er speelt nu niets.",
  unavailable: "Spotify is even niet bereikbaar.",
};

export function DashboardMusic({ userId }: { userId: string }) {
  const load = useServerFn(getDashboardMusic);
  const q = useQuery({ queryKey: ["dashboard-music", userId], queryFn: () => load(), staleTime: 10000, refetchInterval: 20000, retry: 1 });
  const d = q.data as { playing?: boolean; reason?: string; title?: string; artist?: string; image?: string | null; url?: string | null; progressMs?: number; durationMs?: number } | undefined;
  const pct = d?.playing && d.durationMs ? Math.min(100, ((d.progressMs ?? 0) / d.durationMs) * 100) : 0;
  const notLinked = d?.reason === "not_connected";
  return <section className="acrylic-card flex min-w-0 flex-col gap-4 p-5"><h2 className="flex items-center gap-2 text-sm"><Music2 className="size-4" />Spotify</h2>
    <div className="flex min-w-0 flex-1 items-center gap-4">
      {d?.playing && d.image ? <img src={d.image} alt="" className="size-16 shrink-0 rounded-md object-cover" /> : null}
      <div className="min-w-0 flex-1">
        <p className="break-words font-display text-2xl">{q.isPending ? "Laden…" : d?.playing ? d.title : "Geen muziek actief"}</p>
        {d?.playing ? <p className="truncate text-sm text-muted-foreground">{d.artist}</p> : <p className="text-sm text-muted-foreground">{q.isError ? "Spotify is even niet bereikbaar." : MUSIC_REASON[d?.reason ?? ""] ?? ""}</p>}
        {d?.playing ? <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></div> : null}
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" title="Muziekstatus vernieuwen" aria-label="Muziekstatus vernieuwen" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "size-4 animate-spin" : "size-4"} /></Button>
      <Button asChild variant="outline" size="sm"><a href={d?.url ?? "https://open.spotify.com"} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />Open Spotify</a></Button>
      <Button asChild variant={notLinked ? "default" : "ghost"} size="sm"><a href="/settings">{notLinked ? "Spotify koppelen" : "Koppeling beheren"}</a></Button></div>
  </section>;
}

type WeatherResult = Awaited<ReturnType<typeof getDashboardWeather>>;

/** Location is saved once on the ROUT profile; change it via the pencil in Customize mode. */
export function DashboardWeather({ city }: { city: string | null }) {
  const load = useServerFn(getDashboardWeather);
  const q = useQuery<WeatherResult>({ queryKey: ["dashboard-weather", city], enabled: !!city, queryFn: () => load({ data: { city: city! } }), staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: 1 });
  const r = q.data;
  return <section className="acrylic-card flex min-w-0 flex-col gap-4 p-5"><h2 className="flex items-center gap-2 text-sm"><CloudSun className="size-4" />Weer</h2>
    <div aria-live="polite" className="flex-1">{!city ? <p className="text-sm text-muted-foreground">Nog geen locatie. Klik op <strong>Aanpassen</strong> en daarna op het potloodje op deze tegel.</p> : q.isPending ? <p>Laden…</p> : r?.ok ? <><p className="font-display text-4xl">{Math.round(r.temperature_2m)} °C</p><p className="text-sm">{r.city}{r.country ? ` · ${r.country}` : ""}</p><p className="text-xs text-muted-foreground">Wind {r.wind_speed_10m} km/h · Open-Meteo</p></> : <p className="text-sm text-muted-foreground">{r && !r.ok && r.error === "city_not_found" ? "Stad niet gevonden. Pas de locatie aan." : "Weer momenteel niet beschikbaar."}</p>}</div>
  </section>;
}

export function DashboardVisitors({ userId }: { userId: string }) {
  const load = useServerFn(getMyVisitStats);
  const q = useQuery({ queryKey: ["dashboard-visitors", userId], queryFn: () => load({ data: { days: 30, space: "all" } }), staleTime: 60000, retry: false });
  return <section className="acrylic-card flex min-w-0 flex-col gap-3 p-5"><h2 className="flex items-center gap-2 text-sm"><Users className="size-4" />Bezoekers</h2><p className="font-display text-3xl">{q.data ? q.data.total : "—"}</p><p className="text-xs text-muted-foreground">{q.isError ? "Statistieken niet beschikbaar." : "Laatste 30 dagen"}</p>{q.data && <p className="text-sm">{q.data.unique} unieke bezoekers</p>}<Button asChild variant="outline" size="sm"><a href="/dashboard/assets">Statistieken</a></Button></section>;
}

export function UpcomingDashboardWidget({ title }: { title: string }) {
  return <section className="acrylic-card flex min-w-0 flex-col gap-4 p-5"><h2 className="flex items-center gap-2 text-sm"><LockKeyhole className="size-4" />{title}</h2><p className="font-display text-2xl">Coming soon</p></section>;
}