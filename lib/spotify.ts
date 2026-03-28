// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayHistoryItem {
  track: {
    id: string;
    artists: { id: string }[];
  };
  played_at: string;
}

interface PlayHistoryPage {
  items: PlayHistoryItem[];
  next: string | null;
}

interface AudioFeatures {
  id: string;
  energy: number;   // 0–1
  tempo: number;    // BPM
  valence: number;  // 0–1
}

export interface MusicDNARaw {
  energy_avg: number;
  tempo_avg: number;
  valence_avg: number;
  popularity_avg: number;
  unique_tracks: number;
  total_plays: number;
  repeat_rate: number;
  feature_variance: number;
}

export interface MusicDNAScores {
  raw: MusicDNARaw;
  energy_score: number;
  tempo_score: number;
  valence_score: number;
  popularity_score: number;
  depth_score: number;
  range_score: number;
  final_energy: number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalize(val: number, min: number, max: number): number {
  return clamp((val - min) / (max - min), 0, 1);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  const avg = mean(values);
  return mean(values.map((v) => Math.pow(v - avg, 2)));
}

// ─── Spotify API calls ────────────────────────────────────────────────────────

async function spotifyGet<T>(
  url: string,
  token: string
): Promise<T | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// Fetch up to 3 pages of recently played (max ~150 items)
async function fetchPlayHistory(token: string): Promise<PlayHistoryItem[]> {
  const items: PlayHistoryItem[] = [];
  let url: string | null =
    "https://api.spotify.com/v1/me/player/recently-played?limit=50";

  for (let page = 0; page < 3 && url !== null; page++) {
    const data: PlayHistoryPage | null = await spotifyGet<PlayHistoryPage>(url, token);
    if (!data) break;
    items.push(...data.items);
    url = data.next;
  }
  return items;
}

// Fetch audio features for up to 100 tracks per request
async function fetchAudioFeatures(
  token: string,
  trackIds: string[]
): Promise<AudioFeatures[]> {
  const features: AudioFeatures[] = [];
  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100).join(",");
    const data = await spotifyGet<{ audio_features: (AudioFeatures | null)[] }>(
      `https://api.spotify.com/v1/audio-features?ids=${batch}`,
      token
    );
    if (data?.audio_features) {
      features.push(...data.audio_features.filter((f): f is AudioFeatures => f !== null));
    }
  }
  return features;
}

// Fetch artist popularity for up to 50 artists per request
async function fetchArtistPopularities(
  token: string,
  artistIds: string[]
): Promise<number[]> {
  const popularities: number[] = [];
  for (let i = 0; i < artistIds.length; i += 50) {
    const batch = artistIds.slice(i, i + 50).join(",");
    const data = await spotifyGet<{
      artists: { popularity: number }[];
    }>(`https://api.spotify.com/v1/artists?ids=${batch}`, token);
    if (data?.artists) {
      popularities.push(...data.artists.filter(Boolean).map((a) => a.popularity));
    }
  }
  return popularities;
}

// ─── Main computation ─────────────────────────────────────────────────────────

export async function computeMusicDNA(token: string): Promise<MusicDNAScores> {
  // 1. Play history
  const history = await fetchPlayHistory(token);
  const total_plays = history.length;

  const allTrackIds = history.map((item) => item.track.id);
  const uniqueTrackIds = [...new Set(allTrackIds)];
  const unique_tracks = uniqueTrackIds.length;
  const repeat_rate = 1 - unique_tracks / total_plays;

  // Unique first-artist IDs for popularity lookup
  const uniqueArtistIds = [
    ...new Set(
      history
        .map((item) => item.track.artists[0]?.id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  // 2. Fetch audio features + artist popularities in parallel
  const [features, artistPopularities] = await Promise.all([
    fetchAudioFeatures(token, uniqueTrackIds),
    fetchArtistPopularities(token, uniqueArtistIds),
  ]);

  // 3. Raw averages
  const energy_avg = mean(features.map((f) => f.energy));
  const tempo_avg = mean(features.map((f) => f.tempo));
  const valence_avg = mean(features.map((f) => f.valence));
  const popularity_avg =
    artistPopularities.length > 0 ? mean(artistPopularities) : 50;

  // 4. Feature variance (energy + valence + normalized tempo, averaged)
  const normTempos = features.map((f) => normalize(f.tempo, 60, 180));
  const feature_variance =
    (variance(features.map((f) => f.energy)) +
      variance(features.map((f) => f.valence)) +
      variance(normTempos)) /
    3;

  // 5. Normalize to 0–1
  const energy_score = clamp(energy_avg, 0, 1);
  const tempo_score = normalize(tempo_avg, 60, 180);
  const valence_score = clamp(valence_avg, 0, 1);
  const popularity_score = normalize(popularity_avg, 0, 100);
  const depth_score = clamp(unique_tracks / total_plays, 0, 1);
  // Divide by 0.04 so typical variance (0.008–0.032) maps to 0.2–0.8
  const range_score = clamp(feature_variance / 0.04, 0, 1);

  const final_energy = 0.6 * energy_score + 0.4 * tempo_score;

  return {
    raw: {
      energy_avg,
      tempo_avg,
      valence_avg,
      popularity_avg,
      unique_tracks,
      total_plays,
      repeat_rate,
      feature_variance,
    },
    energy_score,
    tempo_score,
    valence_score,
    popularity_score,
    depth_score,
    range_score,
    final_energy,
  };
}
