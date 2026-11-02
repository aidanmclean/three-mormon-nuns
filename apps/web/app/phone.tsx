"use client";

import { type LobbyView, type PlayerView, SKILLS, type Skill } from "@tmn/game";
import type { ReactNode } from "react";
import { Logo } from "./brand";
import { Icon } from "./icons";
import { playerColor, teamColor } from "./palette";

// Mobile building blocks for the player screens (D39): a sticky top bar, a
// scrolling body, and a dock at the bottom for the one thing to do next, in
// thumb reach. Secondary things fold away.

export function PhoneShell({
  view,
  children,
  dock,
}: {
  view: LobbyView;
  children: ReactNode;
  dock?: ReactNode;
}) {
  const me = view.players.find((p) => p.id === view.you);
  const teamIndex = view.teams.findIndex((t) => t.id === me?.teamId);
  const team = view.teams[teamIndex];
  return (
    <div className="m-app" data-turn-team={turnTeamIndex(view)}>
      {/* One bar for who you are and the room (D49). No phase label: each
          screen's own heading says where the game is (D50). */}
      <header className="m-bar">
        <span className="m-logo">
          <Logo compact />
        </span>
        {me ? (
          <span className="m-bar-me">
            <Avatar player={me} />
            <span className="m-bar-who">
              <span className="m-bar-name">
                <span className="m-bar-name-text">{me.name}</span>
                {me.isGamemaster && <Icon name="crown" label="Game master" />}
              </span>
              {team && (
                <span
                  className="m-bar-team"
                  style={{ background: teamColor(teamIndex) }}
                >
                  {team.name}
                </span>
              )}
            </span>
          </span>
        ) : (
          <span className="m-bar-me" />
        )}
        <span className="m-code">
          <span className="sr-only">Room </span>
          {view.code}
        </span>
      </header>
      <main className="m-body">{children}</main>
      {dock && <div className="m-dock">{dock}</div>}
    </div>
  );
}

/**
 * While someone is up (from "up next" through review), the whole screen takes
 * their team's colour (D56). Undefined otherwise.
 */
export function turnTeamIndex(view: LobbyView): number | undefined {
  const teamId = view.game?.turn?.teamId;
  if (
    !teamId ||
    !["turnReady", "turnActive", "turnReview"].includes(view.phase)
  )
    return undefined;
  const index = view.teams.findIndex((t) => t.id === teamId);
  return index < 0 ? undefined : index % 4;
}

export const SKILL_LABELS: Record<Skill, { title: string; detail: string }> = {
  noob: { title: "Noob", detail: "Never played" },
  intermediate: {
    title: "Intermediate",
    detail: "Played before, knows the rules",
  },
  expert: { title: "Expert", detail: "Played a lot" },
};

/** How much you've played (D51): stacked with details, or a compact row. */
export function SkillPicker({
  value,
  onChange,
  compact = false,
}: {
  value: Skill;
  onChange: (skill: Skill) => void;
  compact?: boolean;
}) {
  return (
    <fieldset className={`m-seg ${compact ? "m-seg-3" : "m-seg-stack"}`}>
      <legend>{compact ? "Your level" : "How much have you played?"}</legend>
      {SKILLS.map((skill) => (
        <label
          key={skill}
          className={value === skill ? "is-selected" : undefined}
        >
          <input
            type="radio"
            name="skill"
            value={skill}
            checked={value === skill}
            onChange={() => onChange(skill)}
          />
          <strong>{SKILL_LABELS[skill].title}</strong>
          {!compact && <span>{SKILL_LABELS[skill].detail}</span>}
        </label>
      ))}
    </fieldset>
  );
}

/** Levels show only on the GM's lists, and only when the wheel balances by them (D59, D62). */
export function seesSkill(view: LobbyView): boolean {
  const me = view.players.find((p) => p.id === view.you);
  return !!me?.isGamemaster && view.config.balanceTeams;
}

/** A small label with someone's level, for the GM's lists (D59). */
export function SkillTag({ skill }: { skill: Skill | null | undefined }) {
  if (!skill) return null;
  return <span className="m-skill">{SKILL_LABELS[skill].title}</span>;
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

/**
 * A player's name with role icons, for lists. Small tags ("you", captain,
 * level, offline) sit beside the name; `stacked` puts them on a line under
 * it, for lists where every row has a level (D63).
 */
export function PlayerName({
  player,
  you = false,
  showCavan = false,
  stacked = false,
  tags,
}: {
  player: PlayerView;
  you?: boolean;
  /** Only the GM's screen marks Cavan (D40). */
  showCavan?: boolean;
  stacked?: boolean;
  tags?: ReactNode;
}) {
  const offline = player.status === "inactive";
  return (
    <span
      className={`m-name ${stacked ? "m-name-stacked" : ""} ${offline ? "is-offline" : ""}`}
    >
      <span className="m-name-line">
        <span className="m-name-text">{player.name}</span>
        {player.isGamemaster && <Icon name="crown" label="Game master" />}
        {showCavan && player.isCavan && <Icon name="magnifier" label="Cavan" />}
      </span>
      <span className="m-name-meta">
        {you && <span className="m-you">you</span>}
        {tags}
        {offline && (
          <span className="m-off">
            <Icon name="wifiOff" /> offline
          </span>
        )}
      </span>
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
