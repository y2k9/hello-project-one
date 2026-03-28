"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";

export default function LoginButton() {
  const router = useRouter();
  return (
    <Button variant="primary" size="lg" onPress={() => router.push("/api/auth/login")}>
      Login with Spotify
    </Button>
  );
}
