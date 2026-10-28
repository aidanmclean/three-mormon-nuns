import type { EmoteKind } from "@tmn/game";
import { type ReactNode, useId } from "react";

// Drawn icons instead of emoji and symbol characters, which render
// differently (or as colour emoji) from phone to phone (D39).

const PATHS = {
  arrowRight: "M4 12h15M13 6l6 6-6 6",
  arrowLeft: "M20 12H5M11 6l-6 6 6 6",
  arrowUpRight: "M7 17 17 7M9 7h8v8",
  check: "M4.5 12.5 9.5 17.5 19.5 6.5",
  undo: "M4 5v5h5M4.6 10A8 8 0 1 1 6 16.4",
  spin: "M20 5v5h-5M19.4 10A8 8 0 1 0 18 16.4",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  alert: "M12 3.5 2.5 20h19zM12 10v4.5M12 17.5h.01",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17h.01",
  chevronDown: "M6 9l6 6 6-6",
  skip: "M5 6l9 6-9 6zM18 6v12",
  stop: "M7 7h10v10H7z",
  trash: "M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  wifiOff:
    "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.4-1.7M12 20h.01",
} as const;

export type IconName =
  | keyof typeof PATHS
  | "crown"
  | "magnifier"
  | "spark"
  | "pause"
  | "play"
  | "more";

/** A single-colour line icon that follows the text colour. */
export function Icon({
  name,
  size = "1em",
  label,
  className,
}: {
  name: IconName;
  size?: string | number;
  /** Omit for decorative icons next to text. */
  label?: string;
  className?: string;
}) {
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: labelled icons get a <title>; the rest are aria-hidden
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`icon ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
    >
      {label && <title>{label}</title>}
      {name === "crown" ? (
        <path
          d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 19H5z"
          fill="var(--yellow)"
        />
      ) : name === "magnifier" ? (
        <>
          <circle cx="10" cy="10" r="6" fill="#fac1a6" />
          <path d="M14.5 14.5 20.5 20.5" strokeWidth={3.2} />
        </>
      ) : name === "spark" ? (
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
      ) : name === "pause" ? (
        <path d="M8 5v14M16 5v14" strokeWidth={3.4} />
      ) : name === "play" ? (
        <path d="M7 5l12 7-12 7z" fill="currentColor" />
      ) : name === "more" ? (
        <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.6} />
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  );
}

const INK = "#20231e";

/**
 * Comic emote stickers (D39). Each is drawn twice: a thick ink copy behind,
 * then the colours on top, so only the outer outline shows.
 */
export function EmoteIcon({
  kind,
  size = "1em",
}: {
  kind: EmoteKind;
  size?: string | number;
}) {
  const id = useId().replace(/:/g, "");
  const shape = EMOTE_SHAPES[kind];
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className="emote-icon"
      aria-hidden
    >
      <defs>
        <g id={`${id}-s`}>{shape.base}</g>
      </defs>
      <use
        href={`#${id}-s`}
        stroke={INK}
        strokeWidth={4}
        strokeLinejoin="round"
        fill={INK}
      />
      <use href={`#${id}-s`} />
      {shape.detail}
    </svg>
  );
}

const EMOTE_SHAPES: Record<EmoteKind, { base: ReactNode; detail: ReactNode }> =
  {
    laugh: {
      base: (
        <>
          <circle cx="16" cy="16" r="12" fill="#ffdc4a" />
          <path d="M3 13c-1 3 0 5 2 5s2-3 0-5z" fill="#7cc8f2" />
          <path d="M29 13c1 3 0 5-2 5s-2-3 0-5z" fill="#7cc8f2" />
        </>
      ),
      detail: (
        <g stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none">
          <path d="M9.5 13.5l2.5-2 2.5 2M17.5 13.5l2.5-2 2.5 2" />
          <path d="M9 18h14a7 7 0 0 1-14 0z" fill={INK} />
          <path
            d="M12.5 22.3a5 3 0 0 1 7 0"
            stroke="#c93329"
            strokeWidth={2.4}
          />
        </g>
      ),
    },
    clap: {
      base: (
        <>
          <rect x="9" y="4" width="4.2" height="14" rx="2.1" fill="#ffdc4a" />
          <rect
            x="13.4"
            y="2.5"
            width="4.2"
            height="15"
            rx="2.1"
            fill="#ffdc4a"
          />
          <rect
            x="17.8"
            y="4"
            width="4.2"
            height="14"
            rx="2.1"
            fill="#ffdc4a"
          />
          <rect x="22.2" y="7" width="4" height="12" rx="2" fill="#ffdc4a" />
          <rect
            x="3.5"
            y="13"
            width="4.2"
            height="10"
            rx="2.1"
            fill="#ffdc4a"
            transform="rotate(-38 5.6 18)"
          />
          <rect x="8.5" y="12" width="17.7" height="17" rx="7" fill="#ffdc4a" />
        </>
      ),
      detail: (
        <g stroke={INK} strokeWidth={2} strokeLinecap="round">
          <path d="M27.5 3.5l1.5-2M29.5 7.5l2-1M24.5 2l.2-2" />
        </g>
      ),
    },
    fire: {
      base: (
        <path
          d="M16 2c1.2 5.5 9 8 9 16.5a9 9 0 0 1-18 0c0-4.6 2.4-7.4 3.7-9.6 1 2.4 2.2 3.6 3.6 3.9C13.8 9 13.2 5.4 16 2z"
          fill="#f08a24"
        />
      ),
      detail: (
        <path
          d="M16 15c.9 3 4.6 4.3 4.6 8.4a4.6 4.6 0 0 1-9.2 0c0-2.4 1.4-3.8 2-4.9.7 1 1.4 1.5 2 1.6-.6-1.8-.3-3.6.6-5.1z"
          fill="#ffdc4a"
        />
      ),
    },
    thumbsUp: {
      base: (
        <>
          <path
            d="M11 14h3.2l3.4-9c2.2 0 3.6 1.6 3.1 3.9L19.8 13H26a2.4 2.4 0 0 1 2.3 2.9l-1.7 8.4A2.6 2.6 0 0 1 24 26.4H15a4 4 0 0 1-4-4z"
            fill="#ffdc4a"
          />
          <rect x="4" y="13.5" width="6" height="13" rx="1.2" fill="#2d4e9c" />
        </>
      ),
      detail: null,
    },
    thumbsDown: {
      base: (
        <g transform="rotate(180 16 16)">
          <path
            d="M11 14h3.2l3.4-9c2.2 0 3.6 1.6 3.1 3.9L19.8 13H26a2.4 2.4 0 0 1 2.3 2.9l-1.7 8.4A2.6 2.6 0 0 1 24 26.4H15a4 4 0 0 1-4-4z"
            fill="#ffdc4a"
          />
          <rect x="4" y="13.5" width="6" height="13" rx="1.2" fill="#2d4e9c" />
        </g>
      ),
      detail: null,
    },
    tomato: {
      base: (
        <>
          <circle cx="16" cy="18" r="11" fill="#e0483a" />
          <path
            d="M16 4.5l1.6 3.4 3.7-.8-2 3.2 3 2.2-3.8.3-.5 3.7L16 13.6l-2 2.9-.5-3.7-3.8-.3 3-2.2-2-3.2 3.7.8z"
            fill="#6aa84f"
          />
        </>
      ),
      detail: (
        <ellipse
          cx="11"
          cy="19"
          rx="2.2"
          ry="3.4"
          fill="#fffaf0"
          opacity={0.75}
          transform="rotate(20 11 19)"
        />
      ),
    },
  };

const MEDAL = {
  1: { fill: "#f4c542", shine: "#ffe58a" },
  2: { fill: "#c9cfd6", shine: "#eef1f4" },
  3: { fill: "#d38b5d", shine: "#f0b48c" },
} as const;

/** A drawn podium medal with its place number (D36, D39). */
export function Medal({
  place,
  size,
}: {
  place: 1 | 2 | 3;
  /** Width, as a CSS length; the medal is 1.2× as tall. Without one, the
   * stylesheet sizes it (`.medal`). */
  size?: string;
}) {
  const { fill, shine } = MEDAL[place];
  return (
    <svg
      viewBox="0 0 40 48"
      style={size ? { width: size, height: `calc(${size} * 1.2)` } : undefined}
      className="medal"
      aria-hidden
    >
      <g stroke={INK} strokeWidth={2.4} strokeLinejoin="round">
        <path d="M9 2h8l6 16h-8z" fill="#2d4e9c" />
        <path d="M31 2h-8l-6 16h8z" fill="#c93329" />
        <circle cx="20" cy="31" r="14" fill={fill} />
        <circle
          cx="20"
          cy="31"
          r="9.5"
          fill="none"
          stroke={shine}
          strokeWidth={2}
        />
      </g>
      <text
        x="20"
        y="36.5"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill={INK}
        fontFamily="var(--font-display), sans-serif"
      >
        {place}
      </text>
    </svg>
  );
}
