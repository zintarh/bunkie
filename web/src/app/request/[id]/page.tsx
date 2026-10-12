import { notFound } from "next/navigation";
import { getRoom } from "@/lib/rooms";
import { RequestSheet } from "./RequestSheet";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const room = await getRoom((await params).id);
  if (!room) notFound();
  return <RequestSheet room={room} />;
}
