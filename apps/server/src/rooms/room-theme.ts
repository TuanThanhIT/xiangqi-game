// Metadata trình bày của phòng, không phải luật cờ hoặc quyền truy cập.
export const ROOM_THEME_IDS = ["earth", "meadow", "ink", "bamboo", "snow"] as const;
export type RoomThemeId = typeof ROOM_THEME_IDS[number];
export function isRoomThemeId(value: unknown): value is RoomThemeId {
  return typeof value === "string" && ROOM_THEME_IDS.some((id) => id === value);
}
