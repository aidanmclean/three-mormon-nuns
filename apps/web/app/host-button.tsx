import Link from "next/link";

/** Turns this device into the shared host screen (D18). It doesn't join as a player. */
export function HostButton() {
  return (
    <Link href="/host/new" className="btn-primary action-link">
      Host a new game <span aria-hidden>↗</span>
    </Link>
  );
}
