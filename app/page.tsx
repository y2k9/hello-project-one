import { cookies } from "next/headers";
import Image from "next/image";
import LoginButton from "./components/LoginButton";
import LogoutButton from "./components/LogoutButton";

interface SpotifyTrack {
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  external_urls: { spotify: string };
}

async function getRecentlyPlayed(token: string): Promise<SpotifyTrack | null> {
  const res = await fetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=1",
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0]?.track ?? null;
}

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("spotify_access_token")?.value;

  const track = token ? await getRecentlyPlayed(token) : null;
  const albumArt = track?.album.images[0];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">
          Saturday Morning
        </h1>
        <p className="mt-3 text-lg text-default-500">
          Discover what your music says about you.
        </p>
      </div>

      {!token || !track ? (
        <LoginButton />
      ) : (
        <div className="flex flex-col items-center gap-6">
          <p className="text-sm font-medium uppercase tracking-widest text-default-400">
            Last played
          </p>
          <a
            href={track.external_urls.spotify}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-5 rounded-2xl border border-default-200 bg-default-50 p-5 shadow-sm transition hover:shadow-md"
          >
            {albumArt && (
              <Image
                src={albumArt.url}
                alt={track.album.name}
                width={80}
                height={80}
                className="rounded-xl"
              />
            )}
            <div>
              <p className="text-lg font-semibold text-foreground">
                {track.name}
              </p>
              <p className="text-default-500">
                {track.artists.map((a) => a.name).join(", ")}
              </p>
              <p className="text-sm text-default-400">{track.album.name}</p>
            </div>
          </a>
          <LogoutButton />
        </div>
      )}
    </div>
  );
}
