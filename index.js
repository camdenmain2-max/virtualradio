// VirtualTX Cloudflare Worker.
// Static files live in /public. Signaling is handled by the Durable Object below.
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

      const room = url.searchParams.get("room") || "default";
      const id = env.ROOM.idFromName(room.slice(0, 120));
      return env.ROOM.get(id).fetch(request);
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "VirtualTX", status: "running" });
    }

    return env.ASSETS.fetch(request);
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
    const ws = pair[1];
    const id = crypto.randomUUID();

    const peer = {
      id, ws, name: "Operator", room: "default",
      stationId: null, role: "receiver"
    };

    ws.accept();
    this.clients.set(id, peer);

    ws.addEventListener("message", async e => {
      try {
        await this.handle(peer, JSON.parse(e.data));
      } catch {
        this.send(peer, { t: "error", message: "Invalid signaling message" });
      }
    });

    const cleanup = () => this.cleanup(peer);
    ws.addEventListener("close", cleanup);
    ws.addEventListener("error", cleanup);

    this.send(peer, { t: "id", id });
    return new Response(null, { status: 101, webSocket: client });
  }

  send(peer, message) {
    try { peer.ws.send(JSON.stringify(message)); } catch {}
  }

  roomPeers(room) {
    return [...this.clients.values()].filter(p => p.room === room);
  }

  stationsFor(room) {
    return [...this.stations.values()]
      .filter(s => s.room === room)
      .map(s => s.station);
  }

  broadcastRoom(room, message, exceptId = null) {
    const payload = JSON.stringify(message);
    for (const p of this.roomPeers(room)) {
      if (p.id === exceptId) continue;
      try { p.ws.send(payload); } catch {}
    }
  }

  sendStations(peer) {
    this.send(peer, { t: "stations", stations: this.stationsFor(peer.room) });
  }

  async handle(peer, m) {
    if (m.t === "hello") {
      peer.name = String(m.name || "Operator").slice(0, 80);
      return;
    }

    if (m.t === "join") {
      const nextRoom = String(m.room || "default").slice(0, 120);

      if (peer.room !== nextRoom && peer.room) {
        this.leaveRoom(peer, peer.room);
      }

      peer.room = nextRoom;
      if (!peer.stationId) peer.role = "receiver";
      this.sendStations(peer);

      for (const other of this.roomPeers(peer.room)) {
        if (other.id !== peer.id && other.role === "broadcaster") {
          this.send(other, { t: "peer", a: "join", id: peer.id });
        }
      }
      return;
    }

    if (m.t === "broadcast") {
      if (!peer.room) peer.room = String(m.room || "default").slice(0, 120);

      peer.role = "broadcaster";
      peer.stationId = String(m.id || crypto.randomUUID());

      const station = {
        ...(m.station || {}),
        id: peer.stationId,
        owner: String(m.station?.owner || peer.name).slice(0, 80)
      };

      this.stations.set(peer.stationId, {
        id: peer.stationId,
        room: peer.room,
        ownerId: peer.id,
        station
      });

      for (const other of this.roomPeers(peer.room)) {
        if (other.id !== peer.id) {
          this.send(peer, { t: "peer", a: "join", id: other.id });
        }
      }

      this.broadcastRoom(peer.room, {
        t: "stations",
        stations: this.stationsFor(peer.room)
      });
      return;
    }

    if (m.t === "stop") {
      this.stopStation(peer, m.id);
      return;
    }

    if (["offer", "answer", "ice"].includes(m.t)) {
      const target = this.clients.get(String(m.to || ""));
      if (!target || target.room !== peer.room) return;

      const out = { ...m, from: peer.id };
      delete out.to;
      this.send(target, out);
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
    const s = this.stations.get(String(stationId || ""));
    if (!s || s.ownerId !== peer.id) return;

    this.stations.delete(s.id);
    peer.stationId = null;
    peer.role = "receiver";

    for (const other of this.roomPeers(s.room)) {
      if (other.id !== peer.id) {
        this.send(other, { t: "peer", a: "leave", id: peer.id });
      }
    }

    this.broadcastRoom(s.room, {
      t: "stations",
      stations: this.stationsFor(s.room)
    }, peer.id);
  }

  cleanup(peer) {
    if (!this.clients.has(peer.id)) return;

    const room = peer.room;
    if (peer.stationId) this.stopStation(peer, peer.stationId);
    this.clients.delete(peer.id);

    for (const other of this.roomPeers(room)) {
      this.send(other, { t: "peer", a: "leave", id: peer.id });
      this.sendStations(other);
    }
  }
}
