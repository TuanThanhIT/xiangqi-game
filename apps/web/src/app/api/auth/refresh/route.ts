import { proxyAuth } from "@/features/auth/auth-proxy";
export async function POST(request: Request): Promise<Response> { return proxyAuth(request, "refresh"); }
