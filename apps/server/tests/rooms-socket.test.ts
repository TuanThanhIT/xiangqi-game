import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { io, Socket } from "socket.io-client";
import type { Namespace } from "socket.io";
import { EventEmitter } from "node:events";
import { AppModule } from "../src/app.module";
import { configureHttp } from "../src/configure-http";
import type { JsonParserApplication } from "../src/configure-http";
import { RoomsService } from "../src/rooms/rooms.service";
import type { PublicRoomState, SeatResponse } from "../src/rooms/rooms.types";
import type { PublicGameState } from "../src/rooms/rooms.types";
import type { MoveAck } from "../src/rooms/move-request";
import { randomUUID } from "node:crypto";

test("Socket.IO: xác thực, trạng thái phòng, thay ghế, cạnh tranh và origin", { timeout: 30000 }, async (t) => {
  const app = await NestFactory.create<JsonParserApplication>(AppModule, { logger: false, abortOnError: false, bodyParser: false });
  const clients: Socket[] = [];
  const cleanups = new Set<() => void>();
  let service: RoomsService | undefined;
  try {
    configureHttp(app);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const rooms = app.get<RoomsService>(RoomsService);
    service = rooms;
    // Lấy namespace từ gateway trong test, không tạo endpoint hoặc cấu hình công khai.
    const { RoomsGateway } = await import("../src/rooms/rooms.gateway");
    const gateway = app.get(RoomsGateway) as unknown as { server: Namespace };
    const server = gateway.server;

    function wait<T>(socket: Socket, name: string, predicate: (data: T) => boolean = () => true): Promise<T> {
      const result = new Promise<T>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); socket.off(name, listener); cleanups.delete(cleanup); };
        const listener = (data: T) => { if (predicate(data)) { cleanup(); resolve(data); } };
        const timer = setTimeout(() => { cleanup(); reject(new Error(`Timeout chờ ${name}`)); }, 4000);
        socket.on(name, listener); cleanups.add(cleanup);
      });
      void result.catch(() => undefined);
      return result;
    }
    function client(auth: unknown, transport: "polling" | "websocket" = "websocket", origin: string | undefined = "http://localhost:3000"): Socket {
      const socket = io(base + "/rooms", {
        auth: auth as Record<string, unknown>, autoConnect: false, forceNew: true,
        reconnection: false, timeout: 3000, transports: [transport],
        extraHeaders: origin ? { Origin: origin } : {},
      });
      clients.push(socket); return socket;
    }
    const auth = (seat: SeatResponse) => ({ roomCode: seat.roomCode, seatToken: seat.seatToken });
    async function request(path: string, nickname: string): Promise<SeatResponse> {
      const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }), signal: AbortSignal.timeout(4000) });
      assert.ok(response.ok); return response.json() as Promise<SeatResponse>;
    }
    async function connect(seat: SeatResponse, transport: "polling" | "websocket" = "websocket", origin = "http://localhost:3000") {
      const socket = client(auth(seat), transport, origin);
      const session = wait<{ roomCode: string; seat: string }>(socket, "room:session");
      const state = wait<PublicRoomState>(socket, "room:state");
      socket.connect();
      assert.deepEqual(await session, { roomCode: seat.roomCode, seat: seat.seat });
      const snapshot = await state;
      assert.equal(snapshot.roomCode, seat.roomCode);
      return socket;
    }
    function assertPublic(state: PublicRoomState, tokens: string[]) {
      assert.deepEqual(Object.keys(state).sort(), ["players", "roomCode"]);
      for (const player of Object.values(state.players)) if (player) {
        assert.deepEqual(Object.keys(player).sort(), ["connected", "nickname", "side"]);
      }
      for (const token of tokens) assert.ok(!JSON.stringify(state).includes(token));
    }

    async function move(socket: Socket, pieceId: string, row: number, col: number, expectedRevision: number, requestId = randomUUID()): Promise<MoveAck> {
      return socket.timeout(4000).emitWithAck("game:move", { requestId, expectedRevision, pieceId, to: { row, col } }) as Promise<MoveAck>;
    }

    await t.test("Game socket: khai cuộc HTTP, đi/ăn luân phiên, ack trùng, cạnh tranh và reconnect", async () => {
      const red = await request("/rooms", "Game đỏ");
      const sr = await connect(red);
      const initial = wait<PublicGameState>(sr, "game:state", (s) => s.game !== null);
      const black = await request(`/rooms/${red.roomCode}/join`, "Game đen");
      assert.equal((await initial).game!.pieces.length, 32);
      const enabled = wait<PublicGameState>(sr, "game:state", (s) => s.playEnabled);
      const sb = await connect(black); assert.equal((await enabled).game!.revision, 0);
      const id = randomUUID();
      const first = wait<PublicGameState>(sb, "game:state", (s) => s.game?.revision === 1);
      const ack = await move(sr, "red-soldier-0", 5, 0, 0, id); assert.equal(ack.ok, true);
      const snapshot = await first;
      assert.equal(snapshot.game!.sideToMove, "black");
      assert.equal(snapshot.playEnabled, true);
      for (const token of [red.seatToken, black.seatToken]) assert.ok(!JSON.stringify(snapshot).includes(token));
      assert.deepEqual(Object.keys(snapshot).sort(), ["game", "playEnabled", "roomCode"]);
      assert.ok(!JSON.stringify(snapshot).includes(sr.id!));
      let repeats = 0;
      const listener = () => repeats++;
      sr.on("game:state", listener);
      try {
        assert.deepEqual(await move(sr, "red-soldier-0", 5, 0, 0, id), ack);
        assert.equal(repeats, 0); // Ack đi sau mọi packet cùng kết nối.
      } finally { sr.off("game:state", listener); }
      const competing = await Promise.all([
        move(sb, "black-soldier-0", 4, 0, 1), move(sb, "black-soldier-2", 4, 2, 1),
      ]);
      assert.equal(competing.filter((a) => a.ok).length, 1);
      assert.ok(competing.some((a) => !a.ok && a.code === "STALE_REVISION"));
      // Request đầu cùng kết nối được xử lý trước, nên Tốt cột 0 đã tiến.
      assert.equal((await move(sr, "red-soldier-0", 4, 0, 2)).ok, true);
      const before = rooms.publicGameState(red.roomCode).game!;
      assert.equal(before.pieces.length, 31); assert.equal(before.revision, 3);
      const offline = wait<PublicGameState>(sb, "game:state", (s) => !s.playEnabled);
      sr.disconnect(); await offline;
      const rejected = await move(sb, "black-soldier-2", 4, 2, 3);
      assert.ok(!rejected.ok && rejected.code === "PLAYERS_OFFLINE");
      assert.deepEqual(rooms.publicGameState(red.roomCode).game, before);
      const onlineAgain = wait<PublicGameState>(sb, "game:state", (s) => s.playEnabled);
      const restored = await connect(red); assert.deepEqual((await onlineAgain).game, before);
      assert.deepEqual(await move(restored, "red-soldier-0", 5, 0, 0, id), ack);
      assert.equal(rooms.publicGameState(red.roomCode).game!.revision, 3);
      // Chủ ghế mới thay thế; gọi handler trực tiếp bằng server socket cũ vẫn bị từ chối.
      const staleServer = server.sockets.get(restored.id!)!;
      const replaced = wait(restored, "disconnect"); await connect(red); await replaced;
      const { RoomsGateway } = await import("../src/rooms/rooms.gateway");
      const staleAck = app.get(RoomsGateway).handleMove(staleServer as never, { requestId: id, expectedRevision: 0,
        pieceId: "red-soldier-0", to: { row: 5, col: 0 } });
      assert.ok(!staleAck.ok && staleAck.code === "SOCKET_NOT_ACTIVE");
    });

    await t.test("Game socket: snapshot hai phòng cách ly, payload sai không đổi trận", async () => {
      const a = await request("/rooms", "A"), b = await request("/rooms", "B");
      const ba = await request(`/rooms/${a.roomCode}/join`, "A đen");
      const bb = await request(`/rooms/${b.roomCode}/join`, "B đen");
      const sa = await connect(a), sb = await connect(b);
      await connect(ba); await connect(bb);
      let leaks = 0;
      const listener = (s: PublicGameState) => { if (s.roomCode !== b.roomCode || s.game?.revision !== 0) leaks++; };
      sb.on("game:state", listener);
      try {
        const invalid = await sa.timeout(4000).emitWithAck("game:move", { seat: "red", pieces: [] }) as MoveAck;
        assert.ok(!invalid.ok && invalid.code === "INVALID_MOVE_REQUEST");
        assert.equal((await move(sa, "red-soldier-0", 5, 0, 0)).ok, true);
        const barrier = wait(sb, "test:barrier"); server.to(sb.id!).emit("test:barrier"); await barrier;
        assert.equal(leaks, 0); assert.equal(rooms.publicGameState(b.roomCode).game!.revision, 0);
      } finally { sb.off("game:state", listener); }
    });

    await t.test("HTTP join cập nhật người Đỏ; connect/disconnect và payload không token", async () => {
      const red = await request("/rooms", "Đỏ");
      const redSocket = await connect(red);
      assert.deepEqual(rooms.publicState(red.roomCode).players.black, null);
      const joined = wait<PublicRoomState>(redSocket, "room:state", (s) => s.players.black?.nickname === "Đen");
      const black = await request(`/rooms/${red.roomCode}/join`, "Đen");
      const offline = await joined;
      assert.equal(offline.players.black!.connected, false);
      assertPublic(offline, [red.seatToken, black.seatToken]);
      const online = wait<PublicRoomState>(redSocket, "room:state", (s) => s.players.black?.connected === true);
      const blackSocket = await connect(black, "polling", "http://127.0.0.1:3000");
      assertPublic(await online, [red.seatToken, black.seatToken]);
      const gone = wait<PublicRoomState>(redSocket, "room:state", (s) => s.players.black?.connected === false);
      blackSocket.disconnect(); await gone;
    });

    await t.test("auth sai bị từ chối, không thay socket đang giữ ghế", async () => {
      const red = await request("/rooms", "Chủ");
      const other = await request("/rooms", "Khác");
      const owner = await connect(red);
      for (const [payload, expected] of [
        [{}, "INVALID_HANDSHAKE"],
        [{ roomCode: red.roomCode, seatToken: 1 }, "INVALID_HANDSHAKE"],
        [{ ...auth(red), seat: "black" }, "INVALID_HANDSHAKE"],
        [{ ...auth(red), nickname: "Giả" }, "INVALID_HANDSHAKE"],
        [{ roomCode: red.roomCode, seatToken: other.seatToken }, "AUTH_FAILED"],
        [{ roomCode: red.roomCode, seatToken: "A".repeat(43) }, "AUTH_FAILED"],
        [{ roomCode: "ZZZZZZ", seatToken: red.seatToken }, "AUTH_FAILED"],
      ] as const) {
        const socket = client(payload);
        const failed = wait<Error & { data: { code: string } }>(socket, "connect_error");
        socket.connect();
        const error = await failed;
        assert.equal(error.data.code, expected);
        assert.ok(!JSON.stringify(error).includes(red.seatToken));
        assert.ok(owner.connected);
        assert.ok(rooms.ownsSocket({ roomCode: red.roomCode, seat: "red" }, owner.id!));
        socket.disconnect();
      }
    });

    await t.test("hai phòng cách ly, chỉ socket đúng phòng nằm trong room đích", async () => {
      const a = await request("/rooms", "A"), b = await request("/rooms", "B");
      const sa = await connect(a), sb = await connect(b);
      assert.deepEqual([...server.adapter.rooms.get(`room:${a.roomCode}`)!], [sa.id]);
      assert.deepEqual([...server.adapter.rooms.get(`room:${b.roomCode}`)!], [sb.id]);
      let leaked = false;
      const listener = (state: PublicRoomState) => { if (state.roomCode !== b.roomCode) leaked = true; };
      sb.on("room:state", listener);
      try {
        const changed = wait<PublicRoomState>(sa, "room:state", (s) => s.players.black !== null);
        await request(`/rooms/${a.roomCode}/join`, "A đen"); await changed;
        // Cùng server phát gói làm mốc; không dùng sleep để kết luận không rò.
        const barrier = wait(sb, "test:barrier");
        server.to(sb.id!).emit("test:barrier"); await barrier;
        assert.equal(leaked, false);
      } finally { sb.off("room:state", listener); }
    });

    await t.test("socket mới thay socket cũ; disconnect cũ không đánh offline; token cũ reconnect", async () => {
      const red = await request("/rooms", "A");
      const old = await connect(red); const oldId = old.id!;
      const replaced = wait<{ code: string }>(old, "room:replaced");
      const disconnected = wait<string>(old, "disconnect");
      const newer = await connect(red);
      assert.equal((await replaced).code, "SEAT_REPLACED");
      assert.equal(await disconnected, "io server disconnect");
      const identity = { roomCode: red.roomCode, seat: "red" as const };
      assert.ok(rooms.ownsSocket(identity, newer.id!));
      assert.equal(rooms.releaseSocket(identity, oldId), false);
      assert.equal(rooms.publicState(red.roomCode).players.red.connected, true);
      assert.deepEqual([...server.adapter.rooms.get(`room:${red.roomCode}`)!], [newer.id]);
      const gone = wait(newer, "disconnect");
      const reconnected = await connect(red); await gone;
      assert.ok(rooms.ownsSocket(identity, reconnected.id!));
    });

    await t.test("kết nối cạnh tranh chỉ giữ một chủ ghế và một thành viên room", async () => {
      const red = await request("/rooms", "Cạnh tranh");
      const sockets = [client(auth(red)), client(auth(red)), client(auth(red))];
      const ids: string[] = [];
      const settlements = sockets.map((socket) => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout kết nối cạnh tranh")), 4000);
        const done = () => { clearTimeout(timer); resolve(); };
        socket.once("room:session", () => { if (socket.id) ids.push(socket.id); done(); });
        socket.once("disconnect", done);
        socket.once("connect_error", () => { clearTimeout(timer); reject(new Error("Kết nối cạnh tranh thất bại")); });
        cleanups.add(() => clearTimeout(timer));
      }));
      sockets.forEach((socket) => socket.connect()); await Promise.all(settlements);
      const identity = { roomCode: red.roomCode, seat: "red" as const };
      const current = sockets.find((socket) => socket.id && rooms.ownsSocket(identity, socket.id));
      assert.ok(current?.id);
      // round-trip xác nhận gateway đã hoàn tất xử lý, không phụ thuộc thời gian sleep.
      const barrier = wait(current, "test:barrier"); server.to(current.id).emit("test:barrier"); await barrier;
      const members = [...server.adapter.rooms.get(`room:${red.roomCode}`)!];
      assert.deepEqual(members, [current.id]);
      for (const socket of sockets) if (socket !== current) assert.equal(socket.connected, false);
      assert.ok(ids.length >= 1);
      assert.equal(rooms.publicState(red.roomCode).players.red.connected, true);
    });

    await t.test("socket mất quyền khi đang chờ join không nhận session muộn hoặc còn trong room", async () => {
      const red = await request("/rooms", "Chờ join");
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const stale = client(auth(red));
      let privateSessions = 0;
      stale.on("room:session", () => { privateSessions++; });
      // Middleware test chỉ áp dụng một lần cho socket có credentials fixture.
      let intercepted = false;
      server.use((socket, next) => {
        if (!intercepted && socket.data.identity?.roomCode === red.roomCode) {
          intercepted = true;
          const originalJoin = socket.join.bind(socket);
          socket.join = async (room) => { entered(); await gate; await originalJoin(room); };
        }
        next();
      });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        stale.connect();
        await Promise.race([started, new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("Timeout bước join được giữ")), 4000);
        })]);
        clearTimeout(deadline);
        const premature = await move(stale, "red-soldier-0", 5, 0, 0);
        assert.ok(!premature.ok && premature.code === "SOCKET_NOT_ACTIVE");
        const disconnected = wait(stale, "disconnect");
        const current = await connect(red); await disconnected;
        release();
        // Chờ một round-trip Engine.IO sau khi giải phóng gate.
        const barrier = wait(current, "test:barrier"); server.to(current.id!).emit("test:barrier"); await barrier;
        assert.equal(privateSessions, 0);
        assert.deepEqual([...server.adapter.rooms.get(`room:${red.roomCode}`)!], [current.id]);
      } finally { clearTimeout(deadline); release(); }
    });

    await t.test("Origin sai/thiếu bị từ chối trên polling và WebSocket", async () => {
      const red = await request("/rooms", "Origin");
      for (const transport of ["polling", "websocket"] as const) {
        for (const origin of ["http://evil.example", "http://localhost:3002", undefined]) {
          // Truyền undefined qua hàm có default sẽ thành origin mặc định; dùng chuỗi rỗng để không gửi header.
          const socket = client(auth(red), transport, origin ?? "");
          const failed = wait(socket, "connect_error"); socket.connect(); await failed;
          assert.equal(socket.connected, false); socket.disconnect();
        }
      }
      assert.equal(rooms.publicState(red.roomCode).players.red.connected, false);
      const good = await connect(red, "websocket", "http://127.0.0.1:3000"); assert.ok(good.connected);
    });
  } finally {
    for (const cleanup of cleanups) cleanup();
    clients.forEach((socket) => socket.disconnect());
    await app.close();
    if (service) {
      const emitter = (service as unknown as { changes: EventEmitter }).changes;
      assert.equal(emitter.listenerCount("room-change"), 0);
    }
  }
});
