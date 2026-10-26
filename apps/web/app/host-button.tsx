"use client";

import { randomCode } from "@tmn/game";
import { useRouter } from "next/navigation";
import { saveScreen } from "@/lib/session";

/** Turns this device into the shared host screen (D18). It doesn't join as a player. */
export function HostButton() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          // The lobby is created when /host connects and sends `create` (D14).
          const code = randomCode();
          saveScreen(code, { creating: true });
          router.push(`/host/${code}`);
        }}
      >
        Host a new game
      </button>
      <p className="text-center text-xs text-foreground/40">
        Do this on a TV or laptop everyone can see.
      </p>
    </div>
  );
}
