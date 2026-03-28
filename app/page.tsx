import { cookies } from "next/headers";
import { computeMusicDNA, MusicDNAScores } from "@/lib/spotify";
import LoginButton from "./components/LoginButton";
import LogoutButton from "./components/LogoutButton";

// ─── Score bar component ───────────────────────────────────────────────────────

function ScoreBar({
  label,
  value,
  low,
  high,
  fromColor,
  toColor,
}: {
  label: string;
  value: number;
  low: string;
  high: string;
  fromColor: string;
  toColor: string;
}) {
  const isValid = !isNaN(value) && isFinite(value);
  const pct = isValid ? Math.round(value * 100) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/50">
          {label}
        </span>
        <span className="font-mono text-sm text-white/30">
          {isValid ? pct : "–"}
        </span>
      </div>

      <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(to right, ${fromColor}, ${toColor})`,
          }}
        />
      </div>

      <div className="flex justify-between">
        <span className="text-xs text-white/20">{low}</span>
        <span className="text-xs text-white/20">{high}</span>
      </div>
    </div>
  );
}

// ─── Axis definitions ──────────────────────────────────────────────────────────

interface Axis {
  label: string;
  getValue: (s: MusicDNAScores) => number;
  low: string;
  high: string;
  from: string;
  to: string;
}

const AXES: Axis[] = [
  {
    label: "Energy",
    getValue: (s) => s.final_energy,
    low: "Chill",
    high: "Pumped",
    from: "#f59e0b",
    to: "#ef4444",
  },
  {
    label: "Mood",
    getValue: (s) => s.valence_score,
    low: "Dark",
    high: "Euphoric",
    from: "#6366f1",
    to: "#ec4899",
  },
  {
    label: "Taste",
    getValue: (s) => 1 - s.popularity_score,
    low: "Mainstream",
    high: "Offbeat",
    from: "#06b6d4",
    to: "#14b8a6",
  },
  {
    label: "Range",
    getValue: (s) => s.range_score,
    low: "Focused",
    high: "Wide",
    from: "#3b82f6",
    to: "#8b5cf6",
  },
  {
    label: "Depth",
    getValue: (s) => s.depth_score,
    low: "Repeat Listener",
    high: "Explorer",
    from: "#10b981",
    to: "#84cc16",
  },
  {
    label: "Tempo",
    getValue: (s) => s.tempo_score,
    low: "Slow",
    high: "Fast",
    from: "#f97316",
    to: "#fbbf24",
  },
  {
    label: "Raw Energy",
    getValue: (s) => s.energy_score,
    low: "Mellow",
    high: "Intense",
    from: "#e11d48",
    to: "#fb7185",
  },
];

// ─── Pages ────────────────────────────────────────────────────────────────────

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("spotify_access_token")?.value;

  if (!token) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-8 px-4"
        style={{ background: "#0b0b0f" }}
      >
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-white">
            Music DNA
          </h1>
          <p className="mt-3 text-lg" style={{ color: "rgba(255,255,255,0.35)" }}>
            Discover what your music says about you.
          </p>
        </div>
        <LoginButton />
      </div>
    );
  }

  const scores = await computeMusicDNA(token);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-12 px-6 py-20"
      style={{ background: "#0b0b0f" }}
    >
      <div className="text-center">
        <p
          className="mb-2 text-xs uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          Your listening fingerprint
        </p>
        <h1 className="text-5xl font-bold tracking-tight text-white">
          Music DNA
        </h1>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-8">
        {AXES.map((axis) => (
          <ScoreBar
            key={axis.label}
            label={axis.label}
            value={axis.getValue(scores)}
            low={axis.low}
            high={axis.high}
            fromColor={axis.from}
            toColor={axis.to}
          />
        ))}
      </div>

      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.7rem" }}>
        Based on your last {scores.raw.total_plays} plays · {scores.raw.unique_tracks} unique tracks
      </div>

      <LogoutButton />
    </div>
  );
}
