import Link from "next/link";
import { Masthead, NunIllustration } from "./brand";
import { HostButton } from "./host-button";
import { Icon } from "./icons";
import { JoinForm } from "./join-form";

export default function Home() {
  return (
    <div className="site-shell home-shell">
      <Masthead />
      <main>
        <section className="home-hero">
          <div className="hero-copy">
            <h1 className="hero-title" aria-label="3 Mormon Nuns">
              <span className="title-three">3</span>
              <span>
                MORMON
                <br />
                <span className="title-nuns">
                  NUNS
                  <Icon name="spark" className="title-star" />
                </span>
              </span>
            </h1>
            <p className="hero-description">
              Write phrases. Split into teams. Guess.
            </p>
            <ol className="round-tabs" aria-label="The three rounds">
              <li>
                <span>1</span> Describe
              </li>
              <li>
                <span>2</span> Charades
              </li>
              <li>
                <span>3</span> One word
              </li>
            </ol>
          </div>
          <div className="hero-art">
            <div className="comic-rays" aria-hidden />
            <div className="comic-balloon">
              Same phrases.
              <br />
              Three rounds.
            </div>
            <NunIllustration />
          </div>
        </section>
        <section className="entry-grid" aria-label="Play the game">
          <div className="host-entry">
            <div>
              <h2>New game</h2>
              <p>Host on a TV or laptop.</p>
            </div>
            <div className="entry-action">
              <HostButton />
            </div>
          </div>
          <div className="join-entry">
            <h2>Join a game</h2>
            <JoinForm />
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>Play on your phones. Keep this screen up.</span>
        {process.env.NODE_ENV === "development" && (
          <Link href="/dev" className="underline">
            Test multiple players
          </Link>
        )}
        <span>No downloads or accounts.</span>
      </footer>
    </div>
  );
}
