// ─── Types ────────────────────────────────────────────────────────────────────

interface SpotifyTrack {
  id: string;
  popularity: number;
}

interface SpotifyArtist {
  id: string;
  genres: string[];
  popularity: number;
}

interface PlayHistoryItem {
  track: { id: string };
}

export interface MusicDNAScores {
  taste: number;  // 0 = mainstream, 1 = offbeat
  range: number;  // 0 = focused, 1 = wide
  energy: number; // 0 = chill, 1 = pumped
  depth: number;  // 0 = repeat listener, 1 = explorer
  meta: {
    total_tracks: number;
    unique_genres: number;
    total_plays: number;
    unique_recent: number;
  };
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalize(v: number, min: number, max: number): number {
  return clamp((v - min) / (max - min), 0, 1);
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  return Math.sqrt(mean(arr.map((v) => Math.pow(v - avg, 2))));
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

async function fetchTopArtists(
  token: string,
  timeRange: string
): Promise<SpotifyArtist[]> {
  const data = await spotifyGet<{ items: SpotifyArtist[] }>(
    `https://api.spotify.com/v1/me/top/artists?time_range=${timeRange}&limit=50`,
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

// ─── Energy keyword mapping ───────────────────────────────────────────────────

const HIGH_ENERGY = [
  "metal", "punk", "hardcore", "edm", "house", "techno", "drum and bass",
  "dnb", "trap", "drill", "rave", "hardstyle", "trance", "industrial",
  "grunge", "rock", "hip hop", "rap", "rage", "breakbeat", "jungle",
  "gabber", "psytrance", "speed metal", "thrash", "death metal", "black metal",
  "dubstep", "bass", "club", "dance",
];

const LOW_ENERGY = [
  "ambient", "acoustic", "classical", "folk", "sleep", "meditation",
  "lo-fi", "lofi", "soft", "singer-songwriter", "new age", "piano",
  "choral", "lullaby", "chill", "orchestral", "chamber", "baroque",
  "impressionist", "slowcore", "drone", "post-classical",
];

function genreEnergyScore(genre: string): number {
  const g = genre.toLowerCase();
  if (HIGH_ENERGY.some((k) => g.includes(k))) return 1;
  if (LOW_ENERGY.some((k) => g.includes(k))) return -1;
  return 0;
}

// ─── Main computation ─────────────────────────────────────────────────────────

export async function computeMusicDNA(
  token: string
): Promise<MusicDNAScores | null> {
  // All 7 calls in parallel
  const [
    shortTracks, medTracks, longTracks,
    shortArtists, medArtists, longArtists,
    recentPlays,
  ] = await Promise.all([
    fetchTopTracks(token, "short_term"),
    fetchTopTracks(token, "medium_term"),
    fetchTopTracks(token, "long_term"),
    fetchTopArtists(token, "short_term"),
    fetchTopArtists(token, "medium_term"),
    fetchTopArtists(token, "long_term"),
    fetchRecentlyPlayed(token),
  ]);

  // No top tracks = token is missing user-top-read scope, needs re-auth
  if (!shortTracks.length && !medTracks.length && !longTracks.length) {
    return null;
  }

  const allTracks = dedupById([...shortTracks, ...medTracks, ...longTracks]);
  const allArtists = dedupById([...shortArtists, ...medArtists, ...longArtists]);
  const allGenres = allArtists.flatMap((a) => a.genres ?? []).filter(Boolean);

  // ── TASTE: how mainstream vs offbeat ──────────────────────────────────────
  // track.popularity (0–100) is on every track object, no extra API call.
  // Mean across all 150 deduplicated tracks, then invert so 1 = offbeat.
  const avgPopularity = mean(allTracks.map((t) => t.popularity));
  const taste = 1 - normalize(avgPopularity, 0, 100);

  // ── RANGE: how varied vs focused ──────────────────────────────────────────
  // Primary: unique genre count across all top artists (25+ = max range).
  // Secondary: std dev of track popularities — mixing mainstream + niche = wide range.
  const uniqueGenres = new Set(allGenres);
  const genre_score = clamp(uniqueGenres.size / 25, 0, 1);
  const spread_score = normalize(stdDev(allTracks.map((t) => t.popularity)), 0, 35);
  const range = 0.7 * genre_score + 0.3 * spread_score;

  // ── ENERGY: chill vs pumped ───────────────────────────────────────────────
  // Genre names are the only proxy available without audio features.
  // Score each genre tag -1/0/+1, take mean, normalize from [-1,1] to [0,1].
  const energyScores = allGenres.map(genreEnergyScore);
  const energy = normalize(mean(energyScores), -1, 1);

  // ── DEPTH: repeat listener vs explorer ────────────────────────────────────
  // Primary (65%): overlap between short_term and long_term top tracks.
  // High overlap = same songs loved for years = repeat listener (low depth).
  const shortIds = new Set(shortTracks.map((t) => t.id));
  const longIds = new Set(longTracks.map((t) => t.id));
  const overlap = [...shortIds].filter((id) => longIds.has(id)).length;
  const minSize = Math.min(shortIds.size, longIds.size);
  const cross_depth = minSize > 0 ? 1 - overlap / minSize : 0.5;

  // Secondary (35%): unique tracks / total plays from recently played.
  const totalPlays = recentPlays.length;
  const uniqueRecent = new Set(recentPlays.map((i) => i.track.id)).size;
  const recent_depth = totalPlays > 0 ? uniqueRecent / totalPlays : 0.5;

  const depth = 0.65 * cross_depth + 0.35 * recent_depth;

  return {
    taste,
    range,
    energy,
    depth,
    meta: {
      total_tracks: allTracks.length,
      unique_genres: uniqueGenres.size,
      total_plays: totalPlays,
      unique_recent: uniqueRecent,
    },
  };
}
