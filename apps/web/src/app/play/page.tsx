import PlayRoom from "@/features/rooms/PlayRoom";
import CasualPlayRoom from "@/features/rooms/CasualPlayRoom";

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[]; casual?:string }> }) {
  const { mode, casual } = await searchParams;
  const initialMode = mode === "create" || mode === "join" ? mode : "both";
  return casual === "1" ? <CasualPlayRoom key={initialMode} initialMode={initialMode}/> : <PlayRoom key={initialMode} initialMode={initialMode} />;
}
