"use client";

import { ConfigSchema, DEFAULT_CONFIG, randomCode } from "@tmn/game";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Masthead } from "@/app/brand";
import { Icon } from "@/app/icons";
import { Settings } from "@/app/settings";
import { devicePath, saveScreen } from "@/lib/session";

export function HostSetup() {
  const router = useRouter();
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="site-shell">
      <Masthead />
      <main className="setup-page">
        <div className="page-heading">
          <h1>Host a game</h1>
          <p>Pick the house rules, then open the lobby on this screen.</p>
        </div>
        <form
          className="setup-layout"
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
          <section className="paper-panel setup-panel">
            <div className="panel-heading">
              <h2>House rules</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setConfig({ ...DEFAULT_CONFIG });
                  setError(null);
                }}
              >
                <Icon name="undo" /> Reset
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
              <button
                type="submit"
                className="btn-primary entry-button"
                disabled={creating}
              >
                {creating ? "Creating…" : "Create lobby"}
                <Icon name="arrowRight" />
              </button>
            </div>
          </section>
          <aside className="setup-notes">
            <h2>How hosting works</h2>
            <ol>
              <li>
                Keep this screen where everyone can see it. It shows the code,
                the timer and the scores.
              </li>
              <li>Everyone joins on their phone, you too if you’re playing.</li>
              <li>
                The first person to join is the <strong>game master</strong>.
                They run the game from their phone, and can still change these
                rules in the lobby.
              </li>
            </ol>
          </aside>
        </form>
      </main>
    </div>
  );
}
