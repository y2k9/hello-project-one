"use client";

import { Button } from "@heroui/react";

export default function LogoutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={() => { window.location.href = "/api/auth/logout"; }}
    >
      Log out
    </Button>
  );
}
