import { networkInterfaces } from "node:os";
import { connection } from "next/server";

// Dev-only helper for the host screen (D20). When the TV opened the app via
// localhost, phones can't use that address, so the screen asks for this
// machine's LAN addresses instead. Disabled outside development so a deployed
// app never reveals anything about the machine it runs on.
export async function GET() {
  await connection(); // per request; never prerendered with the build machine's IPs
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404 });
  }
  return Response.json({ addresses: lanAddresses() });
}

/** Private IPv4 addresses, Wi-Fi interfaces first (that's what phones join). */
function lanAddresses(): string[] {
  const found: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && isPrivate(a.address)) {
        found.push({ name, address: a.address });
      }
    }
  }
  const isWifi = (name: string) => /^(wl|wi-?fi)/i.test(name) || name === "en0";
  return found
    .sort((a, b) => Number(isWifi(b.name)) - Number(isWifi(a.name)))
    .map((f) => f.address);
}

function isPrivate(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31)
  );
}
