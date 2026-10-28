import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

/** Published cartoon asset; source and public-domain notice: docs/ASSETS.md. */
export function NunIllustration() {
  return (
    <Image
      src="/art/nun-having-fun.png"
      alt=""
      width={580}
      height={580}
      preload
      sizes="(max-width: 760px) 320px, 600px"
      className="nun-illustration"
    />
  );
}

/**
 * The one logo, everywhere (D44): a big yellow 3, "MORMON" in blue, "NUNS" in
 * red and a yellow spark. It's drawn in `em`, so the page sets its size.
 */
export function Logo({ decorative = false }: { decorative?: boolean }) {
  return (
    <span
      className="logo"
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": "3 Mormon Nuns" })}
    >
      <span className="logo-three" aria-hidden>
        3
      </span>
      <span className="logo-words" aria-hidden>
        <span className="logo-mormon">MORMON</span>
        <span className="logo-nuns">
          NUNS
          <Icon name="spark" className="logo-spark" />
        </span>
      </span>
    </span>
  );
}

/** The site's top bar: the logo home, and How to play (or `children`). */
export function Masthead({ children }: { children?: ReactNode }) {
  return (
    <header className="masthead">
      <Link href="/" className="masthead-home" aria-label="3 Mormon Nuns home">
        <Logo decorative />
      </Link>
      {children ?? (
        <Link href="/how-to-play" className="masthead-link">
          <Icon name="help" /> How to play
        </Link>
      )}
    </header>
  );
}
