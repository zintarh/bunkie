import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRoom } from "@/lib/rooms";
import { naira, ROOM_LABEL } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { RoomView } from "./RoomView";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/site";

// Pre-rendered and refreshed every minute, so shared links and busy days stay fast.
export const revalidate = 60;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const room = await getRoom((await params).id);
  if (!room) return { title: "Room not found" };
  const title = `${ROOM_LABEL[room.room_kind]} for rent in ${room.area_name}, Abuja`;
  const description = `${naira(room.monthly_total)} a month with ${room.host_first_name}, a verified Bunkie host. For corp members in Abuja.`;
  const path = `/rooms/${room.id}`;
  return { title, description, alternates: { canonical: path }, openGraph: { title, description, url: path, images: [photoUrl(room.cover_path, 1080)] } };
}

export default async function RoomPage({ params }: Props) {
  const room = await getRoom((await params).id);
  if (!room) notFound();
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Accommodation",
        name: `${ROOM_LABEL[room.room_kind]} in ${room.area_name}, Abuja`,
        url: `${SITE_URL}/rooms/${room.id}`,
        image: photoUrl(room.cover_path, 1080),
        address: { "@type": "PostalAddress", addressLocality: room.area_name, addressRegion: "FCT", addressCountry: "NG" },
        ...(room.area_lat != null && room.area_lng != null ? { geo: { "@type": "GeoCoordinates", latitude: room.area_lat, longitude: room.area_lng } } : {}),
        ...(room.rating_count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: room.rating_avg, reviewCount: room.rating_count } } : {}),
      }} />
      <RoomView room={room} />
    </>
  );
}
