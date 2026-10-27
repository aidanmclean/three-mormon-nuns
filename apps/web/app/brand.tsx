import Image from "next/image";
import Link from "next/link";

/** Published cartoon asset; source and public-domain notice: docs/ASSETS.md. */
export function NunIllustration({ small = false }: { small?: boolean }) {
  return (
    <Image
      src="/art/nun-having-fun.png"
      alt=""
      width={580}
      height={580}
      preload={!small}
      sizes={small ? "260px" : "(max-width: 760px) 320px, 600px"}
      className={`nun-illustration ${small ? "nun-illustration-small" : ""}`}
    />
  );
}

export function Masthead({ label = "PARTY GAME" }: { label?: string }) {
  return (
    <header className="masthead">
      <Link href="/" className="brand-lockup" aria-label="3 Mormon Nuns home">
        <span className="brand-mark">
          3<span aria-hidden>✳</span>
        </span>
        <span>
          MORMON
          <br />
          NUNS
        </span>
      </Link>
      <span className="eyebrow masthead-label">{label}</span>
    </header>
  );
}

export function Steps({
  current,
}: {
  current: "setup" | "lobby" | "teams" | "writing";
}) {
  const steps = ["setup", "lobby", "teams", "writing"] as const;
  return (
    <ol className="steps" aria-label="Game progress">
      {steps.map((step, i) => (
        <li
          key={step}
          className={current === step ? "current" : ""}
          aria-current={current === step ? "step" : undefined}
        >
          <span>0{i + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}
