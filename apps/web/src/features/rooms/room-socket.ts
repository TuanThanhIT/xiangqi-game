import { io } from "socket.io-client";
import type { RoomSession } from "./room-contract";
import { getBackendSocketOrigin } from "./room-config";
import { authAccessToken } from "../auth/auth-client";

export function createRoomSocket(session: RoomSession) {
  return io(getBackendSocketOrigin() + "/rooms", {
    autoConnect: false, forceNew: true,
    auth: session.casual ? callback => { void authAccessToken().then(accessToken=>callback({roomCode:session.roomCode,seatToken:session.seatToken,accessToken})).catch(()=>callback({roomCode:session.roomCode,seatToken:session.seatToken,accessToken:""})); } : { roomCode: session.roomCode, seatToken: session.seatToken },
    timeout: 8000, reconnection: true, reconnectionAttempts: 5,
  });
}
