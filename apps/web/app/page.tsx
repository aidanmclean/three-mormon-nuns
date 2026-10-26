import { GAME_NAME } from "@tmn/game";
import { HostButton } from "./host-button";
import { JoinForm } from "./join-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 p-6">
      <h1 className="text-center text-5xl font-black tracking-tight">
        {GAME_NAME}
      </h1>
      <div className="flex w-full max-w-xs flex-col gap-8">
        <JoinForm />
        <div className="flex items-center gap-3 text-sm text-foreground/50">
          <span className="h-px flex-1 bg-foreground/15" />
          or
          <span className="h-px flex-1 bg-foreground/15" />
        </div>
        <HostButton />
      </div>
    </main>
  );
}
