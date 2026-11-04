import PlayRoom from "@/features/rooms/PlayRoom";

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  const { mode } = await searchParams;
  const initialMode = mode === "create" || mode === "join" ? mode : "both";
  return <PlayRoom key={initialMode} initialMode={initialMode} />;
}
