import type { SVGProps } from "react";
export type LobbyIconName = "friends" | "calendar" | "tasks" | "shop" | "inventory" | "history" | "rank" | "gamepad" | "book";
const paths: Record<LobbyIconName, string> = {
  gamepad: "M8 6h8a4 4 0 0 1 4 3l2 8a2 2 0 0 1-3 2l-4-3H9l-4 3a2 2 0 0 1-3-2l2-8a4 4 0 0 1 4-3Zm-1 3v5m-2-2h4m6-2h.01m3 3h.01",
  book: "M12 5C9 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-7-2-10 1Zm0 0v15",
  friends: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m3 10h2m4 0h2m-8 4h2",
  tasks: "M20 12v8H4V4h11m-8 7 4 4L22 4",
  shop: "m2 3 3 1 3 13h11l3-10H6m2 14h.01M19 21h.01",
  inventory: "M3 8h18v13H3V8Zm-1-5h20v5H2V3Zm7 5v5h6V8",
  history: "M3 12a9 9 0 1 0 3-7M3 3v5h5m4-1v6l4 2",
  rank: "M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H3v3a4 4 0 0 0 5 4m8-7h5v3a4 4 0 0 1-5 4m-4 2v5m-4 3h8m-6-3h4",
};
export default function LobbyIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: LobbyIconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
