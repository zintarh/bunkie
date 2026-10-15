import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRoom } from "@/lib/rooms";
import { naira, ROOM_LABEL } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { RoomView } from "./RoomView";

// Pre-rendered and refreshed every minute, so shared links and busy days stay fast.
export const revalidate = 60;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const room = await getRoom((await params).id);
  if (!room) return { title: "Room not found" };
  const title = `${ROOM_LABEL[room.room_kind]} in ${room.area_name}`;
  const description = `${naira(room.monthly_total)} a month with ${room.host_first_name}, a verified Bunkie host.`;
  return { title, description, openGraph: { title, description, images: [photoUrl(room.cover_path, 1080)] } };
}

export default async function RoomPage({ params }: Props) {
  const room = await getRoom((await params).id);
  if (!room) notFound();
  return <RoomView room={room} />;
}
