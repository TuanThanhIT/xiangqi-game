export const SOCKET_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

export function isAllowedSocketOrigin(origin: string | undefined): boolean {
  return origin !== undefined && SOCKET_ORIGINS.includes(origin);
}
