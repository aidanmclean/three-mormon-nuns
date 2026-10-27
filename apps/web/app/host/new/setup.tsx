"use client";

import { ConfigSchema, DEFAULT_CONFIG, randomCode } from "@tmn/game";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Masthead, NunIllustration, Steps } from "@/app/brand";
import { Settings } from "@/app/settings";
import { devicePath, saveScreen } from "@/lib/session";

export function HostSetup() {
  const router = useRouter();
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="site-shell">
      <Masthead label="NEW GAME" />
      <main className="setup-main">
        <Steps current="setup" />
        <div className="page-heading">
          <h1>Game setup</h1>
          <p>Choose the rules before creating your lobby.</p>
        </div>
        <form
          className="setup-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = ConfigSchema.safeParse(config);
            if (!parsed.success || config.teamCount > config.maxPlayers)
              return setError(
                "Room capacity must have space for at least one person per team.",
              );
            setCreating(true);
            const code = randomCode();
            saveScreen(code, { creating: true, config: parsed.data });
            router.push(devicePath(`/host/${code}`));
          }}
        >
          <section className="paper-panel">
            <div className="panel-heading">
              <h2>Game settings</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setConfig({ ...DEFAULT_CONFIG });
                  setError(null);
                }}
              >
                Reset defaults ↺
              </button>
            </div>
            <Settings
              config={config}
              onChange={(patch) => {
                setConfig((previous) => ({ ...previous, ...patch }));
                setError(null);
              }}
            />
            <div className="setup-submit">
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? "Creating…" : "Create lobby"}
                <span aria-hidden>↗</span>
              </button>
            </div>
          </section>
          <aside className="setup-aside">
            <div className="dither-box">
              <NunIllustration small />
            </div>
            <h2>How to host</h2>
            <p>
              Keep this screen visible. Everyone, including you, joins on their
              phone.
            </p>
            <p>
              The first player to join is the game master and controls the game.
            </p>
            <div className="aside-note">
              <strong>Three rounds</strong>
              <span>Describe it → Charades → One word</span>
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}
