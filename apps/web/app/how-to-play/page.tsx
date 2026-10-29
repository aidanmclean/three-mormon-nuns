import { ROUND_RULES } from "@tmn/game";
import type { Metadata } from "next";
import Link from "next/link";
import { Masthead } from "../brand";
import { Icon } from "../icons";

export const metadata: Metadata = { title: "How to play · 3 Mormon Nuns" };

// The rules in plain words (D44). Round names and rules come from the game
// package, so they match the intro screens word for word.
export default function HowToPlay() {
  return (
    <div className="site-shell">
      <Masthead>
        <Link href="/" className="masthead-link">
          <Icon name="arrowLeft" /> Back
        </Link>
      </Masthead>
      <main className="rules-page">
        <div className="page-heading">
          <h1>How to play</h1>
          <p>
            A party game for groups: write phrases, split into teams, then guess
            the same phrases three times, with harder clues each round.
          </p>
        </div>

        <ol className="rules-steps">
          <li>
            <h2>Get everyone in</h2>
            <p>
              One screen hosts: a TV or laptop everyone can see. Press{" "}
              <strong>Host a game</strong> on the home page. Everyone joins on
              their own phone with the code on the TV.
            </p>
            <p>
              The first person to join is the <strong>game master</strong>. They
              play too, and run the game from their phone: starting turns,
              pausing, and moving things along.
            </p>
          </li>
          <li>
            <h2>Make teams</h2>
            <p>
              A wheel puts everyone on a team, or the game master picks. The
              first person on each team is the <strong>captain</strong> and
              names the team.
            </p>
          </li>
          <li>
            <h2>Write phrases</h2>
            <p>
              Everyone secretly writes a few short phrases: people, places,
              films, things, inside jokes. They all go into one pile.
            </p>
          </li>
          <li>
            <h2>Take turns</h2>
            <p>
              Teams take turns. One player gets the phrases on their phone and
              gives clues while their own team guesses, before the timer runs
              out.
            </p>
            <p>
              Tap <strong>Got it</strong> each time your team guesses one, and
              the next phrase appears. Tapped by mistake? <strong>Back</strong>{" "}
              undoes it.
            </p>
          </li>
          <li>
            <h2>Three rounds, same phrases</h2>
            <p>
              When the pile is empty the round ends, and every phrase goes back
              in for the next round.
            </p>
            <ul className="rules-rounds">
              {ROUND_RULES.map((round, i) => (
                <li key={round.title} className={`rules-round-${i}`}>
                  <span className="rules-round-no">Round {i + 1}</span>
                  <strong>{round.title}</strong>
                  <span className="rules-round-text">{round.rules}</span>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <h2>Win</h2>
            <p>
              Every phrase your team guesses is a point. After round 3, the team
              with the most points wins.
            </p>
          </li>
        </ol>

        <section className="rules-tips" aria-labelledby="rules-tips">
          <h2 id="rules-tips">Good to know</h2>
          <ul>
            <li>
              Pay attention to the phrases that are guessed. 
            </li>
            <li>
              Lost your connection? Open the game again and type the same name you used to rejoin.
            </li>
            <li>
              Tap the stickers at the bottom of your phone (laugh, clap,
              tomato…) to cheer or heckle. They pop up on the TV.
            </li>
          </ul>
        </section>

        <div className="rules-actions">
          <Link
            href="/#join"
            className="btn-primary entry-button entry-button-join"
          >
            Join a game <Icon name="arrowRight" />
          </Link>
          <Link href="/host/new" className="btn-primary entry-button">
            Host a game <Icon name="arrowRight" />
          </Link>
        </div>
      </main>
    </div>
  );
}
