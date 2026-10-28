"use client";

import { CODE_LENGTH, normalizeCode } from "@tmn/game";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      className="join-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === CODE_LENGTH) router.push(`/play/${code}`);
      }}
    >
      <input
        aria-label="Lobby code"
        className="field code-field"
        placeholder="ABCD"
        maxLength={CODE_LENGTH}
        value={code}
        onChange={(e) => setCode(normalizeCode(e.target.value))}
        autoComplete="off"
        autoCapitalize="characters"
        enterKeyHint="go"
      />
      <button
        type="submit"
        disabled={code.length !== CODE_LENGTH}
        className="btn-primary entry-button entry-button-join"
      >
        Join <Icon name="arrowRight" />
      </button>
    </form>
  );
}
