"use client";

import type { LobbyView } from "@tmn/game";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Fit } from "./fit";

const COLORS = [
  "#ffdc4a",
  "#bce6e3",
  "#fac1a6",
  "#d8ccec",
  "#cbdba6",
  "#f2a7b4",
];

export function NameWheel({
  view,
  clockOffset,
  fit = false,
}: {
  view: LobbyView;
  clockOffset: number;
  /** Shrink the wheel and its text to fit the panel (the TV, D42). */
  fit?: boolean;
}) {
  const draw = view.lastDraw;
  const [mountedAt] = useState(() => Date.now());
  if (!draw) return null;
  const spinning = view.draft?.stage === "spinning";
  const winner = draw.candidates.find((p) => p.id === draw.playerId);
  const team = view.teams.find((t) => t.id === draw.teamId);
  const assigned =
    view.players.find((p) => p.id === draw.playerId)?.teamId === draw.teamId;
  const selected = Math.max(
    0,
    draw.candidates.findIndex((p) => p.id === draw.playerId),
  );
  const angle = 360 / draw.candidates.length;
  const rotation = 360 * 5 - (selected + 0.5) * angle;
  const elapsed = Math.max(
    0,
    Math.min(
      draw.endsAt - draw.startedAt,
      mountedAt + clockOffset - draw.startedAt,
    ),
  );
  const wheelStyle = {
    "--wheel-rotation": `${rotation}deg`,
    "--wheel-duration": `${draw.endsAt - draw.startedAt}ms`,
    "--wheel-delay": `-${elapsed}ms`,
    transform: `rotate(${rotation}deg)`,
  } as CSSProperties;
  const body: ReactNode = (
    <>
      <div className="wheel-wrap">
        <span className="wheel-pointer" aria-hidden />
        {/* The spinning square's corners would otherwise overflow and add
            scrollbars on phones (D39). */}
        <div className="wheel-disc">
          <svg
            viewBox="0 0 320 320"
            className={`name-wheel ${spinning ? "wheel-spinning" : ""}`}
            style={wheelStyle}
            role="img"
            aria-label={`Wheel with ${draw.candidates.length} names`}
          >
            <title>Wheel of names</title>
            {draw.candidates.map((p, i) => {
              const start = ((i * angle - 90) * Math.PI) / 180;
              const end = (((i + 1) * angle - 90) * Math.PI) / 180;
              const path = `M160 160 L${160 + 152 * Math.cos(start)} ${160 + 152 * Math.sin(start)} A152 152 0 ${angle > 180 ? 1 : 0} 1 ${160 + 152 * Math.cos(end)} ${160 + 152 * Math.sin(end)} Z`;
              return (
                <g key={p.id}>
                  {draw.candidates.length === 1 ? (
                    <circle cx="160" cy="160" r="152" fill={COLORS[0]} />
                  ) : (
                    <path
                      d={path}
                      fill={COLORS[i % COLORS.length]}
                      stroke="#20231e"
                      strokeWidth="1.5"
                    />
                  )}
                  <text
                    x="160"
                    y="38"
                    textAnchor="middle"
                    transform={`rotate(${(i + 0.5) * angle} 160 160)`}
                    fontSize={draw.candidates.length > 16 ? 8 : 11}
                    fontWeight="700"
                    fill="#20231e"
                  >
                    {p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name}
                  </text>
                </g>
              );
            })}
            <circle
              cx="160"
              cy="160"
              r="19"
              fill="#fff6e5"
              stroke="#20231e"
              strokeWidth="3"
            />
            <circle
              cx="160"
              cy="160"
              r="153"
              fill="none"
              stroke="#20231e"
              strokeWidth="5"
            />
          </svg>
        </div>
      </div>
      <div className="wheel-result">
        <span className="eyebrow">
          {spinning
            ? `SPINNING FOR ${team?.name ?? "A TEAM"}`
            : assigned
              ? "PLAYER ASSIGNED"
              : "PLAYER SKIPPED"}
        </span>
        <strong>
          {spinning ? "Who’s next?" : (winner?.name ?? "Player disconnected")}
        </strong>
        <p role="status">
          {spinning
            ? `${draw.candidates.length} names left on the wheel`
            : assigned
              ? `${winner?.name} joins ${team?.name}${team?.captainId === draw.playerId ? " as captain" : ""}.`
              : "They disconnected or were removed. The next spin continues automatically."}
        </p>
        {view.draft?.stage === "complete" && (
          <span className="badge mt-3">ALL SPINS COMPLETE</span>
        )}
      </div>
    </>
  );
  return (
    <div className={`wheel-panel ${spinning ? "is-spinning" : "is-revealed"}`}>
      {fit ? (
        <Fit className="wheel-fit" innerClassName="wheel-fit-inner">
          {body}
        </Fit>
      ) : (
        body
      )}
    </div>
  );
}
