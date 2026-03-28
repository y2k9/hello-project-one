// ─── Types ────────────────────────────────────────────────────────────────────

interface LastFmTag {
  name: string;
  count: number; // how many Last.fm users applied this tag — used as weight
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchArtistTags(
  artistName: string,
  apiKey: string
): Promise<LastFmTag[]> {
  const params = new URLSearchParams({
    method: "artist.getTopTags",
    artist: artistName,
    api_key: apiKey,
    autocorrect: "1",
    format: "json",
  });
  try {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Last.fm returns error code 6 when artist not found
    if (data.error) return [];
    return (data?.toptags?.tag ?? []) as LastFmTag[];
  } catch {
    return [];
  }
}

// Fetch tags for up to 30 artists in parallel.
// Artists should be pre-sorted by listening frequency (most listened first)
// so the slice captures the most representative ones.
export async function fetchTagsForArtists(
  artistNames: string[],
  apiKey: string
): Promise<LastFmTag[]> {
  const top = artistNames.slice(0, 30);
  const results = await Promise.all(top.map((name) => fetchArtistTags(name, apiKey)));
  return results.flat();
}

// ─── Tag scoring ──────────────────────────────────────────────────────────────
// For each tag, assign -1 / 0 / +1, then compute a weighted mean using
// tag.count as the weight. Returns a value in [-1, 1], or null if no
// relevant tags were found.

function scoreWeighted(
  tags: LastFmTag[],
  highKeywords: string[],
  lowKeywords: string[]
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const tag of tags.slice(0, 10)) { // top 10 tags per artist call
    const t = tag.name.toLowerCase();
    let score = 0;
    if (highKeywords.some((k) => t.includes(k))) score = 1;
    else if (lowKeywords.some((k) => t.includes(k))) score = -1;

    weightedSum += score * tag.count;
    totalWeight += tag.count;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

// ─── Axis scorers ─────────────────────────────────────────────────────────────

const ENERGY_HIGH = [
  "metal", "punk", "hardcore", "edm", "house", "techno", "drum and bass",
  "dnb", "trap", "drill", "hardstyle", "trance", "industrial", "grunge",
  "rock", "hip hop", "rap", "dance", "dubstep", "energetic", "intense",
  "upbeat", "rave", "club", "breakbeat",
];
const ENERGY_LOW = [
  "ambient", "acoustic", "classical", "folk", "sleep", "meditation",
  "lo-fi", "lofi", "soft", "singer-songwriter", "new age", "piano",
  "choral", "chill", "orchestral", "mellow", "relaxing", "calm", "slow",
  "drone", "slowcore",
];

const INVOLVEMENT_HIGH = [
  "rap", "hip hop", "rnb", "r&b", "pop", "reggae", "soul", "country",
  "singer-songwriter", "vocal", "lyrics", "sing along", "spoken word",
  "folk", "blues", "gospel",
];
const INVOLVEMENT_LOW = [
  "ambient", "instrumental", "classical", "post-rock", "drone", "techno",
  "electronic", "background", "soundtrack", "noise", "experimental",
  "post-classical", "neoclassical",
];

const MOOD_HIGH = [ // bright / euphoric end
  "happy", "feel good", "feel-good", "upbeat", "cheerful", "fun", "party",
  "positive", "summer", "sunshine", "joyful", "euphoric", "energetic",
  "reggae", "ska", "funk", "disco", "tropical",
];
const MOOD_LOW = [ // dark / melancholic end
  "sad", "melancholy", "melancholic", "dark", "depressing", "depression",
  "angry", "aggressive", "gothic", "emo", "doom", "gloomy", "heavy",
  "intense", "dark wave", "post-punk", "black metal", "death metal",
];

// Returns 0→1 (0 = chill, 1 = pumped). Defaults to 0.5 if no signal.
export function scoreEnergy(tags: LastFmTag[]): number {
  const raw = scoreWeighted(tags, ENERGY_HIGH, ENERGY_LOW);
  if (raw === null) return 0.5;
  return (raw + 1) / 2; // [-1,1] → [0,1]
}

// Returns 0→1 (0 = passive/ambient, 1 = active/vocal). Defaults to 0.5.
export function scoreInvolvement(tags: LastFmTag[]): number {
  const raw = scoreWeighted(tags, INVOLVEMENT_HIGH, INVOLVEMENT_LOW);
  if (raw === null) return 0.5;
  return (raw + 1) / 2;
}

// Returns 0→1 (0 = dark/melancholic, 1 = bright/euphoric). Defaults to 0.5.
export function scoreMood(tags: LastFmTag[]): number {
  const raw = scoreWeighted(tags, MOOD_HIGH, MOOD_LOW);
  if (raw === null) return 0.5;
  return (raw + 1) / 2;
}
