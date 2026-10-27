"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/actions";

export function UserMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  const [pending, startTransition] = useTransition();
  const initials = name
    .replace(/\(.*\)/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2" data-testid="user-menu">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-sm font-medium">{name}</span>
            <span className="block text-xs text-muted-foreground" data-testid="user-role">{roleLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="sign-out"
          disabled={pending}
          onSelect={() => startTransition(() => signOut())}
        >
          <LogOut /> {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
