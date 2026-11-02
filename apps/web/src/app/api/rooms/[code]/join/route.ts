import { proxyRoomRequest } from "@/features/rooms/room-proxy";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  return proxyRoomRequest(request, code);
}
