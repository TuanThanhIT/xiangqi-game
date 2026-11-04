import Image from "next/image";
import { ROOM_THEME_IDS, ROOM_THEMES } from "./room-theme";
import type { RoomThemeId } from "./room-theme";
import styles from "./play-room.module.css";

interface Props { value: RoomThemeId; disabled: boolean; onChange(value: RoomThemeId): void }
export default function ThemePicker({ value, disabled, onChange }: Props) {
  return <fieldset className={styles.themePicker} disabled={disabled} aria-describedby="theme-help">
    <legend>Phong cách miễn phí</legend>
    <p id="theme-help" className={styles.help}>Cả hai người dùng cùng phong cách. Cố định từ khi tạo phòng.</p>
    <div className={styles.themeChoices}>{ROOM_THEME_IDS.map((id) => {
      const theme = ROOM_THEMES[id];
      return <label key={id} className={styles.themeChoice}>
        <input type="radio" name="room-theme" value={id} checked={value === id} onChange={() => onChange(id)} />
        <span className={styles.themeCard}>
          <span className={styles.themePreview} data-theme={id} aria-hidden="true">
            <Image src={theme.preview} width={320} height={180} alt="" sizes="(max-width: 767px) 40vw, 180px" />
            <span className={styles.miniBoard}><span /></span>
          </span>
          <strong>{theme.name}</strong>
          <span className={styles.help}>{theme.description}</span>
          <span className={styles.themeSelected}>{value === id ? "✓ Đã chọn" : "Miễn phí"}</span>
        </span>
      </label>;
    })}</div>
  </fieldset>;
}
