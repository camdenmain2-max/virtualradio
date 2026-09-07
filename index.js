const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/signal") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return json({ ok: true, service: "VirtualTX signaling backend" });
      }

      const roomName = url.searchParams.get("room") || "default";
      const id = env.ROOM.idFromName(roomName);
      const stub = env.ROOM.get(id);
      return stub.fetch(new Request(request, {
        headers: new Headers(request.headers)
      }));
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "VirtualTX backend" });
    }

    return new Response("VirtualTX Worker backend is running.", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};

export class RadioRoom {
  constructor(state) {
    this.state = state;
    this.clients = new Map();
    this.stations = new Map();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket endpoint", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const id = crypto.randomUUID();
    const peer = {
      id,
      ws: server,
      name: "Operator",
      room: null,
      stationId: null,
      role: "receiver"
    };

    server.accept();
    this.clients.set(id, peer);

    server.addEventListener("message", async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handle(peer, message);
      } catch (error) {
        this.send(peer, {
          t: "error",
          message: "Invalid signaling message"
        });
      }
    });

    const close = () => this.cleanup(peer);
    server.addEventListener("close", close);
    server.addEventListener("error", close);

    this.send(peer, { t: "id", id });

    return new Response(null, { status: 101, webSocket: client });
  }

  send(peer, message) {
    try {
      peer.ws.send(JSON.stringify(message));
    } catch {}
  }

  broadcast(message, exceptId = null) {
    const payload = JSON.stringify(message);
    for (const peer of this.clients.values()) {
      if (peer.id === exceptId) continue;
      try {
        peer.ws.send(payload);
      } catch {}
    }
  }

  stationsFor(room) {
    return [...this.stations.values()]
      .filter(s => s.room === room)
      .map(s => s.station);
  }

  sendStations(peer) {
    if (peer.room) {
      this.send(peer, {
        t: "stations",
        stations: this.stationsFor(peer.room)
      });
    }
  }

  roomPeers(room) {
    return [...this.clients.values()].filter(p => p.room === room);
  }

  async handle(peer, m) {
    if (m.t === "hello") {
      peer.name = String(m.name || "Operator").slice(0, 80);
      return;
    }

    if (m.t === "join") {
      const oldRoom = peer.room;
      if (oldRoom && oldRoom !== m.room) {
        this.leaveRoom(peer, oldRoom);
      }

      peer.room = String(m.room || "default").slice(0, 120);
      peer.role = "receiver";

      this.sendStations(peer);

      // Tell broadcasters already in this room that a new receiver needs an offer.
      for (const other of this.roomPeers(peer.room)) {
        if (other.id !== peer.id && other.role === "broadcaster") {
          this.send(other, { t: "peer", a: "join", id: peer.id });
        }
      }
      return;
    }

    if (m.t === "broadcast") {
      if (!peer.room) return;

      peer.role = "broadcaster";
      peer.stationId = String(m.id || crypto.randomUUID());

      const station = {
        ...(m.station || {}),
        id: peer.stationId,
        owner: String((m.station && m.station.owner) || peer.name).slice(0, 80)
      };

      this.stations.set(peer.stationId, {
        id: peer.stationId,
        room: String(m.room || peer.room),
        ownerId: peer.id,
        station
      });

      peer.room = String(m.room || peer.room);

      // Make sure listeners currently tuned to the room receive the broadcaster offer.
      for (const other of this.roomPeers(peer.room)) {
        if (other.id !== peer.id) {
          this.send(peer, { t: "peer", a: "join", id: other.id });
        }
      }

      this.broadcast({
        t: "stations",
        stations: this.stationsFor(peer.room)
      });

      return;
    }

    if (m.t === "stop") {
      this.stopStation(peer, m.id);
      return;
    }

    // Route WebRTC offer/answer/ICE directly to a peer in this Durable Object.
    if (m.t === "offer" || m.t === "answer" || m.t === "ice") {
      const target = this.clients.get(String(m.to || ""));
      if (!target) return;

      const out = { ...m, from: peer.id };
      delete out.to;
      this.send(target, out);
      return;
    }
  }

  leaveRoom(peer, room) {
    if (peer.stationId) this.stopStation(peer, peer.stationId);

    for (const other of this.roomPeers(room)) {
      if (other.id !== peer.id) {
        this.send(other, { t: "peer", a: "leave", id: peer.id });
      }
    }
  }

  stopStation(peer, stationId) {
    const station = this.stations.get(String(stationId || ""));
    if (!station || station.ownerId !== peer.id) return;

    this.stations.delete(station.id);

    for (const other of this.roomPeers(station.room)) {
      if (other.id !== peer.id) {
        this.send(other, { t: "peer", a: "leave", id: peer.id });
      }
    }

    this.broadcast({
      t: "stations",
      stations: this.stationsFor(station.room)
    });

    peer.stationId = null;
    peer.role = "receiver";
  }

  cleanup(peer) {
    if (!this.clients.has(peer.id)) return;

    const room = peer.room;
    if (peer.stationId) this.stopStation(peer, peer.stationId);

    this.clients.delete(peer.id);

    if (room) {
      for (const other of this.roomPeers(room)) {
        this.send(other, { t: "peer", a: "leave", id: peer.id });
        this.sendStations(other);
      }
    }
  }
}
