"use client";

import {
  CONFIG_RANGES,
  type Config,
  type LobbyView,
  type PlayerView,
} from "@tmn/game";
import { useState } from "react";
import type { LobbyAction } from "@/lib/use-lobby";

type Send = (action: LobbyAction) => void;

export function LobbyScreen({ view, send }: { view: LobbyView; send: Send }) {
  const me = view.players.find((p) => p.id === view.you);
  // The game master controls the game; everyone else just plays (D18).
  const amGm = me?.isGamemaster ?? false;
  const gm = view.players.find((p) => p.isGamemaster);
  const active = view.players.filter((p) => p.status === "active").length;
  const cavan = view.players.find((p) => p.isCavan);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 p-4 pb-24">
      <header className="flex flex-col items-center gap-1 pt-4 text-center">
        <p className="text-sm uppercase tracking-widest text-foreground/60">
          Lobby code
        </p>
        <p className="font-mono text-6xl font-black tracking-[0.3em]">
          {view.code}
        </p>
        <p className="text-sm text-foreground/60">
          {active} here · {view.players.length}/{view.config.maxPlayers} players
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Players</h2>
        <ul className="flex flex-col divide-y divide-foreground/10 rounded-xl border border-foreground/15">
          {view.players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              isYou={p.id === view.you}
              canManage={amGm}
              send={send}
            />
          ))}
        </ul>
        {cavan && (
          <p className="text-sm text-foreground/60">
            The game master approves or rejects every phrase {cavan.name}{" "}
            writes.
          </p>
        )}
      </section>

      <Settings config={view.config} editable={amGm} send={send} />

      <section className="flex flex-col gap-2 text-center">
        {amGm ? (
          <>
            <button type="button" className="btn-primary" disabled>
              Start team selection
            </button>
            <p className="text-sm text-foreground/60">
              Team selection is the next slice being built.
            </p>
          </>
        ) : (
          <p className="text-foreground/60">
            Waiting for {gm?.name ?? "the game master"} to start…
          </p>
        )}
      </section>
    </div>
  );
}

function PlayerRow({
  player,
  isYou,
  canManage,
  send,
}: {
  player: PlayerView;
  isYou: boolean;
  canManage: boolean;
  send: Send;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(player.name);
  const inactive = player.status === "inactive";

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        {/* The dot is decoration; the "offline" label carries the meaning, so
            it doesn't rely on colour alone. */}
        <span
          aria-hidden
          className={`size-2.5 shrink-0 rounded-full ${inactive ? "bg-foreground/25" : "bg-emerald-500"}`}
        />
        <span
          className={`flex-1 truncate font-medium ${inactive ? "text-foreground/40" : ""}`}
        >
          {player.name}
          {isYou && <span className="text-foreground/50"> (you)</span>}
          {inactive && (
            <span className="text-sm font-normal text-foreground/50">
              {" "}
              · offline
            </span>
          )}
        </span>
        {player.isGamemaster && <Badge>Game master</Badge>}
        {player.isCavan && <Badge>Cavan</Badge>}
        {player.waiting && <Badge>Waiting</Badge>}
        {canManage && (
          <button
            type="button"
            aria-label={`Manage ${player.name}`}
            className="rounded-lg px-2 text-xl leading-none text-foreground/60 hover:bg-foreground/10"
            onClick={() => setOpen((o) => !o)}
          >
            ⋯
          </button>
        )}
      </div>

      {canManage && open && (
        <div className="flex flex-wrap gap-2 pl-5">
          {!player.isGamemaster && !inactive && (
            <SmallButton
              onClick={() =>
                send({ type: "setGamemaster", playerId: player.id })
              }
            >
              Make game master
            </SmallButton>
          )}
          <SmallButton
            onClick={() =>
              send({
                type: "setCavan",
                playerId: player.isCavan ? null : player.id,
              })
            }
          >
            {player.isCavan ? "Not Cavan" : "Make Cavan"}
          </SmallButton>
          <SmallButton onClick={() => setRenaming((r) => !r)}>
            Rename
          </SmallButton>
          {!isYou && (
            <SmallButton
              danger
              onClick={() => send({ type: "kick", playerId: player.id })}
            >
              Kick
            </SmallButton>
          )}
        </div>
      )}

      {canManage && open && renaming && (
        <form
          className="flex gap-2 pl-5"
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: "rename", playerId: player.id, name: newName });
            setRenaming(false);
          }}
        >
          <input
            aria-label="New name"
            className="field flex-1 py-1.5"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <SmallButton type="submit">Save</SmallButton>
        </form>
      )}
    </li>
  );
}

const range = ([min, max]: readonly [number, number], step = 1) =>
  Array.from(
    { length: Math.floor((max - min) / step) + 1 },
    (_, i) => min + i * step,
  );

const formatSeconds = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Profanity filtering isn't enforced yet, so it isn't offered here (§4).
const SETTINGS: {
  key: keyof Config;
  label: string;
  options: { value: string | number; label: string }[];
}[] = [
  {
    key: "roundLengthSec",
    label: "Turn length",
    options: range(CONFIG_RANGES.roundLengthSec, 15).map((v) => ({
      value: v,
      label: formatSeconds(v),
    })),
  },
  {
    key: "teamCount",
    label: "Teams",
    options: range(CONFIG_RANGES.teamCount).map((v) => ({
      value: v,
      label: String(v),
    })),
  },
  {
    key: "phrasesPerPlayer",
    label: "Phrases per player",
    options: range(CONFIG_RANGES.phrasesPerPlayer).map((v) => ({
      value: v,
      label: String(v),
    })),
  },
  {
    key: "maxWordsPerPhrase",
    label: "Max words per phrase",
    options: range(CONFIG_RANGES.maxWordsPerPhrase).map((v) => ({
      value: v,
      label: String(v),
    })),
  },
  {
    key: "maxPlayers",
    label: "Max players",
    options: range(CONFIG_RANGES.maxPlayers).map((v) => ({
      value: v,
      label: String(v),
    })),
  },
];

function Settings({
  config,
  editable,
  send,
}: {
  config: Config;
  editable: boolean;
  send: Send;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">Settings</h2>
      <dl className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 rounded-xl border border-foreground/15 p-4">
        {SETTINGS.map(({ key, label, options }) => {
          const current = config[key];
          return (
            <div key={key} className="contents">
              <dt className="text-foreground/80">{label}</dt>
              <dd>
                {editable ? (
                  <select
                    aria-label={label}
                    className="rounded-lg border border-foreground/20 bg-background px-2 py-1"
                    value={String(current)}
                    onChange={(e) => {
                      const option = options.find(
                        (o) => String(o.value) === e.target.value,
                      );
                      if (option)
                        send({
                          type: "updateConfig",
                          config: { [key]: option.value },
                        });
                    }}
                  >
                    {options.map((o) => (
                      <option key={o.value} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-medium">
                    {options.find((o) => o.value === current)?.label ??
                      String(current)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-violet-600/15 px-2 py-0.5 text-xs font-semibold text-violet-600 dark:text-violet-300">
      {children}
    </span>
  );
}

function SmallButton({
  children,
  onClick,
  danger,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
        danger
          ? "border-red-500/40 text-red-600 hover:bg-red-500/10"
          : "border-foreground/20 hover:bg-foreground/10"
      }`}
    >
      {children}
    </button>
  );
}
