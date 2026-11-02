import { proxyRoomRequest } from "@/features/rooms/room-proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyRoomRequest(request);
}
