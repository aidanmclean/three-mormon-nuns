import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";
import { Logo, Masthead, NunIllustration } from "./brand";
import { HostButton } from "./host-button";
import { JoinForm } from "./join-form";

/**
 * The lines under the logo on the start page; each visit gets one at random.
 * Add, remove or edit them here (D45).
 */
const TAGLINES = [
  "The classic party game.",
  "Charades, but with more yelling.",
  "Your friends are worse at this than you think!",
  "A dead horse's worst nightmare!",
];

// The start page (D44): the logo and the nun, then the two ways in, worded
// the same way. Rules live on /how-to-play.
export default function Home() {
  return (
    <div className="site-shell home-shell">
      <Masthead />
      <main className="home-main">
        <div className="home-title">
          <h1>
            <span className="sr-only">3 Mormon Nuns</span>
            <Logo decorative />
          </h1>
          {/* The page is prerendered; only the tagline is picked per visit.
              The fallback holds its space so nothing jumps. */}
          <Suspense
            fallback={
              <p className="home-tagline home-tagline-hold" aria-hidden>
                {TAGLINES[0]}
              </p>
            }
          >
            <Tagline />
          </Suspense>
        </div>
        <div className="home-art" aria-hidden>
          <NunIllustration />
        </div>
        <section className="home-entries" aria-label="Play">
          <div className="entry-card entry-join" id="join">
            <h2>Join a game</h2>
            <p>Type the code on the TV.</p>
            <JoinForm />
          </div>
          <p className="entry-or">
            <span>or</span>
          </p>
          <div className="entry-card entry-host">
            <h2>Host a game</h2>
            <p>Put it on a TV or laptop everyone can see.</p>
            <HostButton />
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>Free. No downloads or accounts.</span>
        {process.env.NODE_ENV === "development" && (
          <Link href="/dev">Test multiple players</Link>
        )}
      </footer>
    </div>
  );
}

async function Tagline() {
  await io();
  const line = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
  return <p className="home-tagline">{line}</p>;
}
