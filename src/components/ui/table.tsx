"use client"

import * as React from "react"
import { cn } from "cn"

// --- Resizable columns (HKR): drag the right edge of any header cell; double-click resets.
// Widths are remembered per page and table in this browser (localStorage).
function storageKey(table: HTMLTableElement) {
  const all = Array.from(document.querySelectorAll("table[data-slot=table]"))
  return `hkr-cols:${window.location.pathname}:${all.indexOf(table)}`
}

function headerCells(table: HTMLTableElement) {
  const row = table.querySelector("thead tr")
  return row ? (Array.from(row.children) as HTMLElement[]) : []
}

function freeze(table: HTMLTableElement) {
  if (table.dataset.resized) return
  const cells = headerCells(table)
  const widths = cells.map((c) => c.getBoundingClientRect().width)
  cells.forEach((c, i) => { c.style.width = `${widths[i]}px` })
  table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`
  table.style.tableLayout = "fixed"
  table.dataset.resized = "1"
}

function persist(table: HTMLTableElement) {
  try {
    localStorage.setItem(storageKey(table), JSON.stringify(headerCells(table).map((c) => c.getBoundingClientRect().width)))
  } catch {}
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const ref = React.useRef<HTMLTableElement>(null)
  React.useEffect(() => {
    const table = ref.current
    if (!table) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(table)) ?? "null") as number[] | null
      const cells = headerCells(table)
      if (saved && saved.length === cells.length) {
        cells.forEach((c, i) => { c.style.width = `${saved[i]}px` })
        table.style.width = `${saved.reduce((a, b) => a + b, 0)}px`
        table.style.tableLayout = "fixed"
        table.dataset.resized = "1"
      }
    } catch {}
  }, [])
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        ref={ref}
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function ColumnResizer() {
  const start = React.useRef<{ x: number; w: number; tableW: number } | null>(null)
  const thOf = (el: HTMLElement) => el.parentElement as HTMLTableCellElement
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      title="Drag to resize · double-click to reset"
      data-slot="column-resizer"
      className="absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:top-1/4 after:right-0.5 after:h-1/2 after:w-px after:bg-border hover:after:bg-primary/60"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        const th = thOf(e.currentTarget)
        const table = th.closest("table") as HTMLTableElement
        freeze(table)
        start.current = { x: e.clientX, w: th.getBoundingClientRect().width, tableW: table.getBoundingClientRect().width }
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.style.userSelect = "none"
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const th = thOf(e.currentTarget)
        const table = th.closest("table") as HTMLTableElement
        const w = Math.max(48, start.current.w + e.clientX - start.current.x)
        th.style.width = `${w}px`
        table.style.width = `${start.current.tableW + (w - start.current.w)}px`
      }}
      onPointerUp={(e) => {
        if (!start.current) return
        start.current = null
        document.body.style.userSelect = ""
        persist(thOf(e.currentTarget).closest("table") as HTMLTableElement)
      }}
      onDoubleClick={(e) => {
        const table = thOf(e.currentTarget).closest("table") as HTMLTableElement
        headerCells(table).forEach((c) => { c.style.width = "" })
        table.style.width = ""
        table.style.tableLayout = ""
        delete table.dataset.resized
        try { localStorage.removeItem(storageKey(table)) } catch {}
      }}
    />
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, children, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "relative h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >
      {children}
      <ColumnResizer />
    </th>
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
