import { Suspense } from "react";
import { HostScreen } from "./host-screen";

// The shared screen (D18). Params are read inside Suspense (D4).
export default function HostPage({ params }: PageProps<"/host/[code]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense
        fallback={<p className="m-auto text-foreground/60">Loading…</p>}
      >
        {params.then(({ code }) => (
          <HostScreen code={code} />
        ))}
      </Suspense>
    </main>
  );
}
