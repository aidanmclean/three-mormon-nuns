// An explicit host wins (production). Otherwise assume the worker runs on the
// machine that served this page, so phones on the LAN connect with no config (D12).
export function partyHost(): string {
  if (process.env.NEXT_PUBLIC_PARTY_HOST)
    return process.env.NEXT_PUBLIC_PARTY_HOST;
  if (typeof window === "undefined") return "localhost:8787"; // SSR; never connects
  return `${window.location.hostname}:8787`;
}
