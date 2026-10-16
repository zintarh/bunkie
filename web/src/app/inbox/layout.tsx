"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMe } from "@/lib/auth";
import { InboxList } from "@/components/InboxList";

/** Messages on a laptop: conversations on the left, the open chat on the right (Instagram DMs). Phones: one at a time. */
export default function InboxLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [me] = useMe();
  const open = path.startsWith("/inbox/") ? path.split("/")[2] : undefined;
  return (
    <div className="dm">
      {me && <div className="dm-list desk-only"><InboxList active={open} /></div>}
      <div className="dm-pane">{children}</div>
    </div>
  );
}
