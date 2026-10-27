"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { NavLinks, type NavItem } from "./nav-links";

import { SIDEBAR_COOKIE } from "./sidebar-cookie";
const MIN = 176;
const MAX = 360;

function save(collapsed: boolean, width: number) {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? 1 : 0}.${Math.round(width)}; path=/; max-age=31536000; samesite=lax`;
}

// Left menu: drag its right edge to resize, or fold it to icons with the button.
// The choice is kept per browser in a cookie, so the page renders the same way next time.
export function AppSidebar({ items, initialCollapsed, initialWidth }: { items: NavItem[]; initialCollapsed: boolean; initialWidth: number }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [width, setWidth] = useState(initialWidth);
  const dragging = useRef(false);

  useEffect(() => { save(collapsed, width); }, [collapsed, width]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
  }, [collapsed]);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setWidth(Math.min(MAX, Math.max(MIN, e.clientX)));
  }, []);
  const onPointerUp = useCallback(() => {
    dragging.current = false;
    document.body.style.userSelect = "";
  }, []);

  const toggle = (
    <button
      type="button"
      onClick={() => setCollapsed((c) => !c)}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={collapsed ? "Expand menu" : "Collapse menu"}
      data-testid="sidebar-toggle"
    >
      {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
    </button>
  );

  return (
    <aside
      className="sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-background md:flex"
      style={{ width: collapsed ? 56 : width }}
      data-collapsed={collapsed}
      data-testid="sidebar"
    >
      <div className={cn("flex items-center gap-2 p-3", collapsed && "flex-col px-2")}>
        {collapsed ? (
          <Image src="/brand/logo.png" alt="HK Refurbished Stock" width={469} height={278} className="h-6 w-auto" priority />
        ) : (
          <Image src="/brand/logo.png" alt="HK Refurbished Stock" width={469} height={278} className="h-10 w-auto shrink-0" priority />
        )}
        <div className={cn(!collapsed && "ml-auto")}>
          {collapsed ? (
            <Tooltip><TooltipTrigger asChild>{toggle}</TooltipTrigger><TooltipContent side="right">Expand menu</TooltipContent></Tooltip>
          ) : toggle}
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
        <NavLinks items={items} collapsed={collapsed} />
      </div>
      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize menu"
          title="Drag to resize"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => setWidth(224)}
          className="absolute top-0 -right-1 h-full w-2 cursor-col-resize hover:bg-primary/10"
          data-testid="sidebar-resizer"
        />
      ) : null}
    </aside>
  );
}
