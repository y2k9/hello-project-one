import { cookies } from "next/headers";
import { computeMusicDNA } from "@/lib/spotify";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("spotify_access_token")?.value;

  if (!token) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  const scores = await computeMusicDNA(token);
  return Response.json(scores);
}
