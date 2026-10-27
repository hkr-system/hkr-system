"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllNotificationsRead, markNotificationRead } from "@/app/(app)/whatsapp/actions";

export type Note = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; when: string };

export function NotificationsBell({ notes, unread }: { notes: Note[]; unread: number }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unread} unread)`} data-testid="bell">
          <Bell />
          {unread ? (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unread ? (
            <button className="text-xs font-normal text-muted-foreground hover:underline"
              onClick={() => start(async () => { await markAllNotificationsRead(); router.refresh(); })}>Mark all read</button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notes.length ? notes.map((n) => (
          <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5"
            onSelect={() => start(async () => { await markNotificationRead(n.id); if (n.link) router.push(n.link); else router.refresh(); })}>
            <span className={n.read_at ? "text-muted-foreground" : "font-medium"}>{n.title}</span>
            {n.body ? <span className="text-xs text-muted-foreground">{n.body}</span> : null}
            <span className="text-[11px] text-muted-foreground">{n.when}</span>
          </DropdownMenuItem>
        )) : <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nothing new.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
