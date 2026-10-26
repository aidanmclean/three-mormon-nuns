import { Suspense } from "react";
import { LobbyStatus } from "./lobby-status";

// Lobby codes are only known at request time, so params are read inside
// Suspense (required with cacheComponents).
export default function PlayPage({ params }: PageProps<"/play/[code]">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <Suspense fallback={<p className="text-foreground/60">Loading…</p>}>
        {params.then(({ code }) => (
          <LobbyStatus code={code} />
        ))}
      </Suspense>
    </main>
  );
}
