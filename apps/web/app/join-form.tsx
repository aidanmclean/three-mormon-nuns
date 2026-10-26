"use client";

import { CODE_LENGTH, normalizeCode } from "@tmn/game";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      className="flex w-full max-w-xs flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === CODE_LENGTH) router.push(`/play/${code}`);
      }}
    >
      <input
        aria-label="Lobby code"
        className="rounded-xl border-2 border-foreground/20 bg-transparent px-4 py-3 text-center font-mono text-3xl uppercase tracking-[0.5em] outline-none focus:border-foreground"
        placeholder="CODE"
        value={code}
        onChange={(e) => setCode(normalizeCode(e.target.value))}
        autoComplete="off"
        autoCapitalize="characters"
      />
      <button
        type="submit"
        disabled={code.length !== CODE_LENGTH}
        className="rounded-xl bg-foreground px-4 py-3 text-lg font-bold text-background disabled:opacity-40"
      >
        Join
      </button>
    </form>
  );
}
