"use client";

import { DEFAULT_CONFIG, randomCode } from "@tmn/game";
import { useEffect, useRef, useState } from "react";
import { Masthead } from "@/app/brand";
import { saveScreen, saveSession } from "@/lib/session";

const NAMES = [
  "Alex",
  "Blair",
  "Casey",
  "Drew",
  "Emery",
  "Frankie",
  "Gray",
  "Harper",
  "Jules",
  "Kai",
  "Lee",
  "Morgan",
];
type Snapshot = {
  status: string;
  connected: boolean;
  phase: string | null;
  name: string | null;
  isGamemaster: boolean;
};

export function TestDesk() {
  const [count, setCount] = useState(6);
  const [teamCount, setTeamCount] = useState(2);
  const [code, setCode] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [startedCount, setStartedCount] = useState(6);
  const hostReady = snapshots["test-host"]?.status === "joined";
  const gmReady = snapshots["test-phone-1"]?.status === "joined";
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        !event.data ||
        event.data.type !== "tmn:test-device" ||
        typeof event.data.device !== "string"
      )
        return;
      const device = event.data.device;
      const frames = Array.from(
        document.querySelectorAll<HTMLIFrameElement>("iframe[data-device]"),
      );
      if (
        !frames.some(
          (frame) =>
            frame.dataset.device === device &&
            frame.contentWindow === event.source,
        )
      )
        return;
      const { status, connected, phase, name, isGamemaster } = event.data;
      if (
        typeof status !== "string" ||
        typeof connected !== "boolean" ||
        (phase !== null && typeof phase !== "string") ||
        (name !== null && typeof name !== "string") ||
        typeof isGamemaster !== "boolean"
      )
        return;
      setSnapshots((previous) => ({
        ...previous,
        [device]: { status, connected, phase, name, isGamemaster },
      }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const start = () => {
    const next = randomCode();
    saveScreen(
      next,
      {
        creating: true,
        config: { ...DEFAULT_CONFIG, teamCount, maxPlayers: 20 },
      },
      "test-host",
    );
    NAMES.slice(0, count).forEach((name, i) => {
      saveSession(next, { name }, `test-phone-${i + 1}`);
    });
    setSnapshots({});
    setStartedCount(count);
    setRun((n) => n + 1);
    setCode(next);
  };
  return (
    <div className="site-shell test-desk">
      <Masthead label="LOCAL MULTIPLAYER TEST DESK" />
      <main>
        <div className="page-heading">
          <h1>Test every screen</h1>
          <p>
            Real room, real sockets, separate player identities. Click inside
            any phone to control that player.
          </p>
        </div>
        <form
          className="test-controls"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <label>
            Players
            <select
              className="field"
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCount(n);
                setTeamCount((t) => Math.min(t, n));
              }}
            >
              {NAMES.map((_, i) => i + 1)
                .filter((n) => n >= 2)
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Teams
            <select
              className="field"
              value={teamCount}
              onChange={(e) => setTeamCount(Number(e.target.value))}
            >
              {Array.from(
                { length: Math.min(8, count) - 1 },
                (_, i) => i + 2,
              ).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary">
            {code ? "New test room" : "Start test room"}
          </button>
          {code && <span className="test-room-code">ROOM {code}</span>}
        </form>
        <p className="fine-print mb-5">
          Player 1 joins first and becomes GM. Press “Everyone’s in” on their
          phone. Captains save team names after the wheel finishes. Reload and
          disconnect buttons affect only that device.
        </p>
        {code && (
          <>
            <div className="test-primary">
              <Device
                key={`${run}-host`}
                device="test-host"
                title="Shared host screen"
                src={`/host/${code}?device=test-host`}
                width={1280}
                height={720}
                snapshot={snapshots["test-host"]}
              />
              <Device
                key={`${run}-gm`}
                device="test-phone-1"
                title="Alex · first player"
                src={`/play/${code}?device=test-phone-1`}
                width={390}
                height={780}
                enabled={hostReady}
                snapshot={snapshots["test-phone-1"]}
              />
            </div>
            <div className="test-phones">
              {NAMES.slice(1, startedCount).map((name, i) => {
                const device = `test-phone-${i + 2}`;
                return (
                  <Device
                    key={`${run}-${device}`}
                    device={device}
                    title={name}
                    src={`/play/${code}?device=${device}`}
                    width={390}
                    height={780}
                    enabled={gmReady}
                    snapshot={snapshots[device]}
                  />
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Device({
  device,
  title,
  src,
  width,
  height,
  enabled = true,
  snapshot,
}: {
  device: string;
  title: string;
  src: string;
  width: number;
  height: number;
  enabled?: boolean;
  snapshot?: Snapshot;
}) {
  const [offline, setOffline] = useState(false);
  const [reload, setReload] = useState(0);
  const [available, setAvailable] = useState(width);
  const frameArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = frameArea.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, available / width);
  return (
    <section className="test-device">
      <header>
        <div>
          <h2>
            {title}
            {snapshot?.isGamemaster && " · GM"}
          </h2>
          <p>
            {offline
              ? "Disconnected — presence updates within 20 seconds"
              : snapshot
                ? `${snapshot.connected ? "Connected" : "Connecting"} · ${snapshot.phase ?? snapshot.status}`
                : "Waiting to connect"}
          </p>
        </div>
        <div className="test-device-tools">
          <button
            type="button"
            className="text-button"
            disabled={!enabled || offline}
            onClick={() => setReload((n) => n + 1)}
          >
            Reload
          </button>
          <button
            type="button"
            className="text-button"
            disabled={!enabled}
            onClick={() => setOffline((value) => !value)}
          >
            {offline ? "Reconnect" : "Disconnect"}
          </button>
        </div>
      </header>
      <div
        ref={frameArea}
        className="test-frame-area"
        style={{ height: height * scale }}
      >
        {enabled && !offline ? (
          <iframe
            key={reload}
            data-device={device}
            title={title}
            src={src}
            width={width}
            height={height}
            style={{ transform: `scale(${scale})` }}
          />
        ) : (
          <p className="waiting-note">
            {offline
              ? "Device disconnected"
              : "Waiting for the host and first player…"}
          </p>
        )}
      </div>
    </section>
  );
}
