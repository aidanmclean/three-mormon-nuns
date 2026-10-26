import { GAME_NAME } from "@tmn/game";
import { JoinForm } from "./join-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-center text-5xl font-black tracking-tight">
        {GAME_NAME}
      </h1>
      <JoinForm />
    </main>
  );
}
