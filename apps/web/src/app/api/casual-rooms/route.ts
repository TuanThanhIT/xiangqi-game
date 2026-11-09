import { proxyCasual } from "@/features/rooms/casual-proxy";
export const POST = (request:Request) => proxyCasual(request);
