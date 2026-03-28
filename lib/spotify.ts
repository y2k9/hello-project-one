import {
  fetchTagsForArtists,
  scoreEnergy,
  scoreInvolvement,
  scoreMood,
} from "./lastfm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpotifyTrack {
  id: string;
  popularity: number | null;
  artists: { id: string; name: string }[];
}

interface PlayHistoryItem {
  track: { id: string };
}

export interface MusicDNAScores {
  discovery: number;   // 0 = loyalist,  1 = explorer
  energy: number;      // 0 = chill,     1 = pumped
  involvement: number; // 0 = ambient,   1 = vocal/active
  mood: number;        // 0 = dark,      1 = euphoric
  meta: {
    total_tracks: number;
    unique_artists: number;
    total_plays: number;
    unique_recent: number;
    tags_found: number;
  };
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalize(v: number, min: number, max: number): number {
  return clamp((v - min) / (max - min), 0, 1);
}

function dedupById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// ─── Spotify fetch helper ─────────────────────────────────────────────────────

async function spotifyGet<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function fetchTopTracks(
  token: string,
  timeRange: string
): Promise<SpotifyTrack[]> {
  const data = await spotifyGet<{ items: SpotifyTrack[] }>(
    `https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=50`,
    token
  );
  return data?.items ?? [];
}

async function fetchRecentlyPlayed(token: string): Promise<PlayHistoryItem[]> {
  const data = await spotifyGet<{ items: PlayHistoryItem[] }>(
    "https://api.spotify.com/v1/me/player/recently-played?limit=50",
    token
  );
  return data?.items ?? [];
}

// ─── Main computation ─────────────────────────────────────────────────────────

export async function computeMusicDNA(
  token: string
): Promise<MusicDNAScores | null> {
  // Step 1: all Spotify calls in parallel
  const [shortTracks, medTracks, longTracks, recentPlays] = await Promise.all([
    fetchTopTracks(token, "short_term"),
    fetchTopTracks(token, "medium_term"),
    fetchTopTracks(token, "long_term"),
    fetchRecentlyPlayed(token),
  ]);

  // No top tracks = missing user-top-read scope → prompt re-auth
  if (!shortTracks.length && !medTracks.length && !longTracks.length) {
    return null;
  }

  const allTracks = dedupById([...shortTracks, ...medTracks, ...longTracks]);

  // Build artist frequency map: artists who appear in more tracks are weighted
  // higher when we pick which ones to query Last.fm for.
  const artistFrequency = new Map<string, { name: string; count: number }>();
  for (const track of allTracks) {
    for (const artist of track.artists ?? []) {
      const existing = artistFrequency.get(artist.id);
      if (existing) {
        existing.count++;
      } else {
        artistFrequency.set(artist.id, { name: artist.name, count: 1 });
      }
    }
  }

  // Sort by frequency so the most-listened artists are prioritised in Last.fm
  const sortedArtists = [...artistFrequency.values()].sort(
    (a, b) => b.count - a.count
  );
  const artistNames = sortedArtists.map((a) => a.name);
  const uniqueArtistCount = artistFrequency.size;

  // Step 2: fetch Last.fm tags for top 30 artists (in parallel)
  const lastfmApiKey = process.env.LASTFM_API_KEY ?? "";
  const allTags = await fetchTagsForArtists(artistNames, lastfmApiKey);

  // ── DISCOVERY: loyalist → explorer ────────────────────────────────────────
  // Signal 1 — artist density: unique artists relative to track count.
  // Range: ~0.05 (one artist, many tracks) to ~1.0 (one artist per track).
  const artistDensity = normalize(
    uniqueArtistCount / allTracks.length,
    0.05,
    0.9
  );

  // Signal 2 — cross-time drift: if your short-term and long-term top artists
  // are totally different, you're constantly exploring new ones.
  const shortArtistIds = new Set(
    shortTracks.flatMap((t) => t.artists?.map((a) => a.id) ?? [])
  );
  const longArtistIds = new Set(
    longTracks.flatMap((t) => t.artists?.map((a) => a.id) ?? [])
  );
  const artistOverlap = [...shortArtistIds].filter((id) =>
    longArtistIds.has(id)
  ).length;
  const minArtistSize = Math.min(shortArtistIds.size, longArtistIds.size);
  const crossTimeDrift =
    minArtistSize > 0 ? 1 - artistOverlap / minArtistSize : 0.5;

  const discovery = clamp(0.6 * artistDensity + 0.4 * crossTimeDrift, 0, 1);

  // ── ENERGY, INVOLVEMENT, MOOD: scored from Last.fm tags ───────────────────
  const energy = scoreEnergy(allTags);
  const involvement = scoreInvolvement(allTags);
  const mood = scoreMood(allTags);

  // Recently played stats for meta
  const totalPlays = recentPlays.length;
  const uniqueRecent = new Set(recentPlays.map((i) => i.track.id)).size;

  return {
    discovery,
    energy,
    involvement,
    mood,
    meta: {
      total_tracks: allTracks.length,
      unique_artists: uniqueArtistCount,
      total_plays: totalPlays,
      unique_recent: uniqueRecent,
      tags_found: allTags.length,
    },
  };
}
