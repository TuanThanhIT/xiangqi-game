import { proxyCasual } from "@/features/rooms/casual-proxy";
export async function POST(request:Request, context:{params:Promise<{parts:string[]}>}) {return proxyCasual(request,(await context.params).parts);}
