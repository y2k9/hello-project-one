"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" onPress={() => router.push("/api/auth/logout")}>
      Log out
    </Button>
  );
}
