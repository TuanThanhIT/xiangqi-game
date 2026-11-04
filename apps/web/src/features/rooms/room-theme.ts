export const ROOM_THEME_IDS = ["earth", "meadow", "ink", "bamboo", "snow"] as const;
export type RoomThemeId = typeof ROOM_THEME_IDS[number];
export function isRoomThemeId(value: unknown): value is RoomThemeId {
  return typeof value === "string" && ROOM_THEME_IDS.some((id) => id === value);
}

export const ROOM_THEMES: Record<RoomThemeId, { name: string; description: string; background: string; ground: string; preview: string }> = {
  earth: { name: "Đất cát", description: "Đất vàng, gỗ và đồng, sông ngọc", background: "/themes/earth/page-bg.webp", ground: "/themes/earth/ground.webp", preview: "/themes/earth/preview.webp" },
  meadow: { name: "Thảo nguyên", description: "Cỏ xanh dịu, đất mòn, suối tự nhiên", background: "/themes/meadow/page-bg.webp", ground: "/themes/meadow/ground.webp", preview: "/themes/meadow/preview.webp" },
  ink: { name: "Thủy mặc", description: "Giấy ngà, núi mực, khung gỗ thanh", background: "/themes/ink/page-bg.webp", ground: "/themes/ink/ground.webp", preview: "/themes/ink/preview.webp" },
  bamboo: { name: "Trúc lâm", description: "Rừng trúc, khung tre, sông ngọc", background: "/themes/bamboo/page-bg.webp", ground: "/themes/bamboo/ground.webp", preview: "/themes/bamboo/preview.webp" },
  snow: { name: "Tuyết sơn", description: "Núi tuyết, đá bạc và sông băng", background: "/themes/snow/page-bg.webp", ground: "/themes/snow/ground.webp", preview: "/themes/snow/preview.webp" },
};

export function roomThemePageStyle(themeId: RoomThemeId | undefined) {
  return themeId ? { backgroundImage: `linear-gradient(var(--xq-page-shade), var(--xq-page-shade)), url("${ROOM_THEMES[themeId].background}")` } : undefined;
}
