"use client";

import { CONFIG_RANGES, type Config } from "@tmn/game";

const FIELDS = [
  {
    key: "teamCount",
    label: "Teams",
    help: "At least one player per team.",
    suffix: "teams",
  },
  {
    key: "roundLengthSec",
    label: "Turn length",
    help: "Time to guess on each turn.",
    suffix: "seconds",
  },
  {
    key: "phrasesPerPlayer",
    label: "Phrases per person",
    help: "How many phrases each player writes.",
    suffix: "phrases",
  },
  {
    key: "maxWordsPerPhrase",
    label: "Words per phrase",
    help: "Maximum words in a phrase.",
    suffix: "words max",
  },
  {
    key: "maxPlayers",
    label: "Room capacity",
    help: "Maximum number of players.",
    suffix: "people",
  },
] as const;

export function Settings({
  config,
  onChange,
  compact = false,
}: {
  config: Config;
  onChange?: (config: Partial<Config>) => void;
  compact?: boolean;
}) {
  return (
    <div className={`settings-list ${compact ? "settings-compact" : ""}`}>
      {FIELDS.map(({ key, label, help, suffix }, i) => {
        const [min, max] = CONFIG_RANGES[key];
        const options = Array.from(
          { length: max - min + 1 },
          (_, n) => n + min,
        );
        return (
          <div className="setting-row" key={key}>
            <span className="setting-index eyebrow">0{i + 1}</span>
            <div className="setting-copy">
              <label htmlFor={`setting-${key}`}>{label}</label>
              {!compact && <p>{help}</p>}
            </div>
            {onChange ? (
              <select
                className="field setting-select"
                id={`setting-${key}`}
                value={config[key]}
                onChange={(e) => onChange({ [key]: Number(e.target.value) })}
              >
                {options.map((v) => (
                  <option key={v} value={v}>
                    {v} {suffix}
                  </option>
                ))}
              </select>
            ) : (
              <span className="setting-value">
                {config[key]} {suffix}
              </span>
            )}
          </div>
        );
      })}
      <div className="setting-row">
        <span className="setting-index eyebrow">0{FIELDS.length + 1}</span>
        <div className="setting-copy">
          <label htmlFor="setting-showGuessed">Show guessed phrases</label>
          {!compact && <p>List them for everyone after each turn.</p>}
        </div>
        {onChange ? (
          <button
            type="button"
            role="switch"
            id="setting-showGuessed"
            aria-checked={config.showGuessed}
            className="setting-switch"
            onClick={() => onChange({ showGuessed: !config.showGuessed })}
          >
            <span className="setting-switch-knob" aria-hidden />
            <span className="setting-switch-text">
              {config.showGuessed ? "On" : "Off"}
            </span>
          </button>
        ) : (
          <span className="setting-value">
            {config.showGuessed ? "On" : "Off"}
          </span>
        )}
      </div>
    </div>
  );
}
