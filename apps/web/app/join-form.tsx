"use client";

import { CODE_LENGTH, normalizeCode } from "@tmn/game";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === CODE_LENGTH) router.push(`/play/${code}`);
      }}
    >
      <input
        aria-label="Lobby code"
        className="field text-center font-mono text-3xl uppercase tracking-[0.5em]"
        placeholder="CODE"
        value={code}
        onChange={(e) => setCode(normalizeCode(e.target.value))}
        autoComplete="off"
        autoCapitalize="characters"
      />
      <button
        type="submit"
        disabled={code.length !== CODE_LENGTH}
        className="btn-primary"
      >
        Join game
      </button>
    </form>
  );
}
