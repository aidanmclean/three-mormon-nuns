import type { ServerMessage } from "@tmn/game";
import { type Connection, Server } from "partyserver";

// One instance per lobby code. For now it only reports how many sockets are
// connected, which is enough to prove web <-> party wiring end to end.
export class Lobby extends Server<Env> {
  static options = { hibernate: true };

  onConnect() {
    this.broadcastCount();
  }

  onClose(connection: Connection) {
    this.broadcastCount(connection.id);
  }

  private broadcastCount(closingId?: string) {
    let n = 0;
    for (const conn of this.getConnections()) {
      if (conn.id !== closingId) n++;
    }
    const msg: ServerMessage = { type: "count", n };
    this.broadcast(JSON.stringify(msg), closingId ? [closingId] : []);
  }
}
