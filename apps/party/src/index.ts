import { routePartykitRequest } from "partyserver";

export { Lobby } from "./lobby";

// Clients connect to /parties/lobby/<CODE>; each code gets its own Lobby
// Durable Object instance.
export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
