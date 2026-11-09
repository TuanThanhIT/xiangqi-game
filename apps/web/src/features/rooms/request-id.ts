// Only UUID v4 is accepted; arbitrary header contents are never reflected.
export function readRequestId(value: string | null): string | null {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value : null;
}
