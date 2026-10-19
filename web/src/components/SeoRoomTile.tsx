import Link from "next/link";
import { naira, ROOM_LABEL } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { HOUSEHOLD_LABEL } from "@/lib/bunkie";
import type { RoomCard } from "@/lib/types";
import styles from "@/app/abuja/seo.module.css";

/** Server-rendered room tile for the public area pages, so search engines see the rooms. */
export function SeoRoomTile({ room }: { room: RoomCard }) {
  const kind = ROOM_LABEL[room.room_kind];
  return (
    <Link href={`/rooms/${room.id}`} className={styles.tile}>
      <span className={styles.tileImg} style={{ backgroundImage: `url(${photoUrl(room.cover_path)})` }} role="img" aria-label={`${kind} in ${room.area_name}, Abuja`} />
      <span className={styles.tileBody}>
        <b>{kind} in {room.area_name}</b>
        <span>{naira(room.monthly_total)} a month · {HOUSEHOLD_LABEL[room.household]} home</span>
        <span className={styles.tileHost}>With {room.host_first_name}{room.host_corper ? ", a corper host" : room.host_verified ? ", verified host" : ""}</span>
      </span>
    </Link>
  );
}
