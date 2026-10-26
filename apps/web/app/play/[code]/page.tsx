import { Suspense } from "react";
import { Game } from "./game";

// Lobby codes are only known at request time, so params are read inside
// Suspense (required with cacheComponents).
export default function PlayPage({ params }: PageProps<"/play/[code]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<Centered>Loading…</Centered>}>
        {params.then(({ code }) => (
          <Game code={code} />
        ))}
      </Suspense>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-foreground/60">
      {children}
    </div>
  );
}
