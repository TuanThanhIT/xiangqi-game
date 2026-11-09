import Lobby from "@/features/lobby/Lobby";
export default async function LobbyPage({searchParams}:{searchParams:Promise<{room?:string}>}) { const query=await searchParams; return <Lobby roomNotice={query.room}/>; }
