import { io } from "socket.io-client";
import type { RoomSession } from "./room-contract";
import { getBackendSocketOrigin } from "./room-config";

export function createRoomSocket(session: RoomSession) {
  return io(getBackendSocketOrigin() + "/rooms", {
    autoConnect: false, forceNew: true,
    auth: { roomCode: session.roomCode, seatToken: session.seatToken },
    timeout: 8000, reconnection: true, reconnectionAttempts: 5,
  });
}
