"use client";

import type { LobbyView, PlayerView } from "@tmn/game";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { playerColor, teamColor } from "./palette";

// Mobile building blocks for the player screens (D39): a sticky top bar, a
// scrolling body, and a dock at the bottom for the one thing to do next, in
// thumb reach. Secondary things fold away.

export function PhoneShell({
  view,
  phase,
  children,
  dock,
}: {
  view: LobbyView;
  phase: string;
  children: ReactNode;
  dock?: ReactNode;
}) {
  const me = view.players.find((p) => p.id === view.you);
  const teamIndex = view.teams.findIndex((t) => t.id === me?.teamId);
  const team = view.teams[teamIndex];
  return (
    <div className="m-app">
      <header className="m-bar">
        <span className="m-logo" role="img" aria-label="3 Mormon Nuns">
          3<Icon name="spark" className="m-logo-spark" />
        </span>
        <span className="m-phase">{phase}</span>
        <span className="m-code">
          <span className="sr-only">Room </span>
          {view.code}
        </span>
      </header>
      {me && (
        <p className="m-me">
          <Avatar player={me} small />
          <strong>{me.name}</strong>
          {me.isGamemaster && <span className="m-role">Game master</span>}
          {team && (
            <span
              className="m-me-team"
              style={{ background: teamColor(teamIndex) }}
            >
              {team.name}
            </span>
          )}
        </p>
      )}
      <main className="m-body">{children}</main>
      {dock && <div className="m-dock">{dock}</div>}
    </div>
  );
}

/** A coloured circle with the player's initial. */
export function Avatar({
  player,
  small = false,
}: {
  player: PlayerView;
  small?: boolean;
}) {
  return (
    <span
      className={`m-avatar ${small ? "m-avatar-small" : ""} ${player.status === "inactive" ? "is-offline" : ""}`}
      style={{ background: playerColor(player.id) }}
      aria-hidden
    >
      {[...player.name][0]?.toUpperCase()}
    </span>
  );
}

/** A player's name with role icons, for lists. */
export function PlayerName({
  player,
  you = false,
  showCavan = false,
}: {
  player: PlayerView;
  you?: boolean;
  /** Only the GM's screen marks Cavan (D40). */
  showCavan?: boolean;
}) {
  return (
    <span
      className={`m-name ${player.status === "inactive" ? "is-offline" : ""}`}
    >
      <span className="m-name-text">{player.name}</span>
      {player.isGamemaster && <Icon name="crown" label="Game master" />}
      {showCavan && player.isCavan && <Icon name="magnifier" label="Cavan" />}
      {you && <span className="m-you">you</span>}
      {player.status === "inactive" && (
        <span className="m-off">
          <Icon name="wifiOff" /> offline
        </span>
      )}
    </span>
  );
}

/** A collapsible card: a big tappable summary row, content underneath. */
export function Fold({
  title,
  hint,
  open,
  children,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  open?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`m-fold ${className ?? ""}`} open={open}>
      <summary>
        <span className="m-fold-title">{title}</span>
        {hint && <span className="m-fold-hint">{hint}</span>}
        <Icon name="chevronDown" className="m-fold-chevron" />
      </summary>
      <div className="m-fold-body">{children}</div>
    </details>
  );
}

/** The big primary action. */
export function BigButton({
  children,
  onClick,
  disabled,
  icon = "arrowRight",
  tone = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: Parameters<typeof Icon>[0]["name"] | null;
  tone?: "primary" | "go" | "secondary";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`m-btn m-btn-${tone}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{children}</span>
      {icon && <Icon name={icon} />}
    </button>
  );
}

/** One line under the dock's button explaining what it does or what's missing. */
export function DockHint({ children }: { children: ReactNode }) {
  return <p className="m-hint">{children}</p>;
}
