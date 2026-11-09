import Image from "next/image";
import { useState } from "react";
import type { RoomIdentity, RoomSnapshot } from "./room-contract";
import { ROOM_THEMES } from "./room-theme";
import Toast from "../shared/Toast";
import styles from "./waiting-room.module.css";

function Avatar({src,red}:{src:string|null|undefined;red:boolean}) {
  const [failed,setFailed]=useState(false);
  return src&&!failed?<Image className={styles.avatar} src={src} width={64} height={64} alt="Avatar người chơi" onError={()=>setFailed(true)}/>:<span className={styles.avatar} role="img" aria-label="Avatar quân cờ mặc định">{red?"帥":"將"}</span>;
}
export default function WaitingRoom({code,identity,snapshot,phase,busy,action}:{code:string;identity:RoomIdentity|null;snapshot:RoomSnapshot|null;phase:string;busy:boolean;action:(kind:"ready"|"leave",ready?:boolean)=>Promise<void>}) {
  const [notice,setNotice]=useState("");
  const own=identity?snapshot?.players[identity.seat]:null;
  async function copy(){try{await navigator.clipboard.writeText(code);setNotice("Đã sao chép mã phòng.");}catch{setNotice("Chưa sao chép được. Bạn có thể chọn mã và sao chép thủ công.");}}
  return <section className={styles.panel} aria-labelledby="waiting-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>GIẢI TRÍ ONLINE</p><h2 id="waiting-title">Phòng chờ</h2></div><div className={styles.code}><span>Mã phòng <strong data-room-code>{code}</strong></span><button className="xq-action xq-action--secondary" onClick={()=>void copy()}>Sao chép mã</button></div></div>
    <p className={styles.connection} role="status">{phase}</p>
    <ul className={styles.players} aria-label="Hai vị trí người chơi">
      {(["red","black"] as const).map(side=>{const player=snapshot?.players[side];return <li key={side} data-seat={side} className={styles.player}>
        <Avatar src={player?.avatar} red={side==="red"}/><div><h3>{side==="red"?"Chủ phòng · Đỏ":"Khách · Đen"}</h3><p className={styles.name}>{player?.nickname??"Đang chờ người chơi"}</p><p>{player?(player.connected?"Đang online":"Mất kết nối · giữ ghế 60 giây"):"Chia sẻ mã để mời bạn vào"}</p><strong className={player?.ready?styles.ready:styles.notReady}>{player?(player.ready?"Đã sẵn sàng":"Chưa sẵn sàng"):"Ghế trống"}</strong></div>
      </li>})}
    </ul>
    {snapshot&&<div className={styles.theme}><Image src={ROOM_THEMES[snapshot.themeId].preview} width={128} height={72} alt="Xem trước phong cách bàn"/><div><strong>Bàn cờ: {ROOM_THEMES[snapshot.themeId].name}</strong><p>Cả hai dùng phong cách chủ phòng đã chọn.</p></div></div>}
    <p className={styles.help}>Trận tự bắt đầu khi cả hai online và sẵn sàng. Đỏ đi trước.</p>
    <div className={styles.actions}><button className="xq-action xq-action--secondary" disabled={busy} onClick={()=>void action("leave")}>Rời phòng</button><button className="xq-action xq-action--primary" disabled={busy||!identity||!own?.connected} aria-pressed={!!own?.ready} onClick={()=>void action("ready",!own?.ready)}>{own?.ready?"Bỏ sẵn sàng":"Sẵn sàng"}</button></div>
    <Toast message={notice} tone="info" onClose={()=>setNotice("")}/>
  </section>;
}
