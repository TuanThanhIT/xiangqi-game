import LobbyIcon from "./LobbyIcon";
import styles from "./lobby.module.css";
export default function ModeTabs() {
  return <div role="tablist" aria-label="Chế độ chơi" className={styles.modeTabs}>
    <button type="button" role="tab" id="casual-tab" aria-selected="true" aria-controls="casual-panel"><LobbyIcon name="gamepad" /><span>Giải trí</span></button>
    <button type="button" role="tab" aria-selected="false" aria-disabled="true" disabled><LobbyIcon name="rank" /><span>Xếp hạng</span><small>Sắp ra mắt</small></button>
    <button type="button" role="tab" aria-selected="false" aria-disabled="true" disabled><LobbyIcon name="book" /><span>Hướng dẫn</span><small>Sắp ra mắt</small></button>
  </div>;
}
