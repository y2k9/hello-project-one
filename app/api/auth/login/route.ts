import { redirect } from "next/navigation";

export function GET() {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: "user-read-recently-played user-top-read",
  });
  redirect(`https://accounts.spotify.com/authorize?${params}`);
}
