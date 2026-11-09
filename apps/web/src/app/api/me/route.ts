import { proxyAuth } from "@/features/auth/auth-proxy";
export async function GET(request: Request): Promise<Response> { return proxyAuth(request, "me"); }
