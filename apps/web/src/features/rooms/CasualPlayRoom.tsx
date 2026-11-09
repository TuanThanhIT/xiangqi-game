"use client";
import { useAuthenticatedProfile } from "../auth/session/useAuthenticatedProfile";
import Toast from "../shared/Toast";
import PlayRoom from "./PlayRoom";
import type { RoomFormMode } from "./RoomForm";
export default function CasualPlayRoom({initialMode}:{initialMode:RoomFormMode}) {
  const auth=useAuthenticatedProfile();
  if(auth.profile&&!auth.checking)return <PlayRoom initialMode={initialMode} accountNickname={auth.profile.nickname} />;
  return <main className="xq-game-page"><h1>Giải trí online</h1>{auth.checking?<p role="status">Đang khôi phục phiên đăng nhập…</p>:<button className="xq-action" onClick={()=>void auth.check()}>Thử lại</button>}<Toast message={auth.error} onClose={auth.clearError}/></main>;
}
