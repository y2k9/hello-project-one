// ─── Types ────────────────────────────────────────────────────────────────────

interface SpotifyTrack {
  id: string;
  popularity: number | null;
  artists: { id: string }[];
}

interface SpotifyArtist {
  id: string;
  genres: string[];
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

// Batch-fetch full artist objects (genres, popularity) for a list of IDs.
// Uses /artists?ids= which is more reliable for genre data than /me/top/artists.
// Spotify allows up to 50 IDs per request.
async function fetchArtistDetails(
  token: string,
  artistIds: string[]
): Promise<SpotifyArtist[]> {
  if (artistIds.length === 0) return [];
  const results: SpotifyArtist[] = [];
  for (let i = 0; i < artistIds.length; i += 50) {
    const batch = artistIds.slice(i, i + 50).join(",");
    const data = await spotifyGet<{ artists: SpotifyArtist[] }>(
      `https://api.spotify.com/v1/artists?ids=${batch}`,
      token
    );
    if (data?.artists) results.push(...data.artists.filter(Boolean));
  }
  return results;
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
  // Step 1: fetch top tracks (all time ranges) + recently played in parallel
  const [shortTracks, medTracks, longTracks, recentPlays] = await Promise.all([
    fetchTopTracks(token, "short_term"),
    fetchTopTracks(token, "medium_term"),
    fetchTopTracks(token, "long_term"),
    fetchRecentlyPlayed(token),
  ]);

  // No top tracks = missing user-top-read scope, needs re-auth
  if (!shortTracks.length && !medTracks.length && !longTracks.length) {
    return null;
  }

  const allTracks = dedupById([...shortTracks, ...medTracks, ...longTracks]);

  // Step 2: fetch artist details using IDs from the tracks themselves.
  // /artists?ids= is more reliable for genre data than /me/top/artists.
  const artistIds = [
    ...new Set(
      allTracks.flatMap((t) => t.artists?.map((a) => a.id) ?? [])
    ),
  ];
  const artists = await fetchArtistDetails(token, artistIds);

  // ── TASTE: mainstream vs offbeat ──────────────────────────────────────────
  // popularity can be null in the API; default missing values to 50 (neutral)
  // so absent data doesn't distort the score toward either extreme.
  const popularities = allTracks.map((t) =>
    typeof t.popularity === "number" && !isNaN(t.popularity) ? t.popularity : 50
  );
  const avgPopularity = mean(popularities);
  const taste = 1 - normalize(avgPopularity, 0, 100);

  // ── RANGE: focused vs wide ────────────────────────────────────────────────
  const allGenres = artists
    .flatMap((a) => a.genres ?? [])
    .filter((g): g is string => typeof g === "string" && g.length > 0);
  const uniqueGenres = new Set(allGenres);
  const genre_score = clamp(uniqueGenres.size / 25, 0, 1);
  const spread_score = normalize(stdDev(popularities), 0, 35);
  const range = 0.7 * genre_score + 0.3 * spread_score;

  // ── ENERGY: chill vs pumped ───────────────────────────────────────────────
  const energyScores = allGenres.map(genreEnergyScore);
  const energy = energyScores.length > 0
    ? normalize(mean(energyScores), -1, 1)
    : 0.5;

  // ── DEPTH: repeat listener vs explorer ────────────────────────────────────
  const shortIds = new Set(shortTracks.map((t) => t.id));
  const longIds = new Set(longTracks.map((t) => t.id));
  const overlap = [...shortIds].filter((id) => longIds.has(id)).length;
  const minSize = Math.min(shortIds.size, longIds.size);
  const cross_depth = minSize > 0 ? 1 - overlap / minSize : 0.5;

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
