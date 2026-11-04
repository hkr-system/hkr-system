"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { rankOptions, type Opt } from "@/lib/search-options";

// Every dropdown of the app (Gabriel, Nov 4 2026: "quiero poder escribir y obtener sugerencias al estilo Google").
// Same API as a <select> (name, value/defaultValue, onChange, <option> children): a real <select> stays underneath,
// invisible, so forms, onChange handlers and browser tests keep working; on top sits a text box that filters as you type.
export function NativeSelect({ className, children, value, defaultValue, onChange, disabled, id, "aria-label": ariaLabel, ...props }: React.ComponentProps<"select">) {
  const options = React.useMemo(() => readOptions(children), [children]);
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState<string>(String(defaultValue ?? options.find((o) => !o.disabled)?.value ?? ""));
  const current = controlled ? String(value ?? "") : inner;
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const shown = open ? rankOptions(options, query) : [];

  // a change made on the hidden <select> (keyboard, browser test, form reset) updates the text shown
  React.useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    const sync = () => setInner(el.value);
    el.addEventListener("change", sync);
    const form = el.form;
    const reset = () => setTimeout(() => setInner(el.value), 0);
    form?.addEventListener("reset", reset);
    return () => { el.removeEventListener("change", sync); form?.removeEventListener("reset", reset); };
  }, []);

  const choose = (o: Opt) => {
    const el = selectRef.current;
    setOpen(false);
    setQuery("");
    if (!el || o.disabled) return;
    if (el.value !== o.value) {
      // set the value the way a person would, so React's onChange runs with e.target.value
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(el, o.value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (!controlled) setInner(o.value);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      const n = shown.length;
      if (!n) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Enter") {
      if (open && shown[active]) { e.preventDefault(); choose(shown[active]); }
    } else if (e.key === "Escape") {
      setOpen(false); setQuery("");
    } else if (e.key === "Tab" && open && query && shown[0]) {
      choose(shown[active] ?? shown[0]);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <div className={cn("relative w-full min-w-0", className)} data-slot="search-select">
      <select
        ref={selectRef}
        value={controlled ? value : undefined}
        defaultValue={controlled ? undefined : defaultValue}
        onChange={onChange}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        aria-label={ariaLabel}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        {...props}
      >
        {children}
      </select>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={open ? query : selected?.label ?? ""}
        placeholder={open ? selected?.label || "Type to search…" : "Select…"}
        onFocus={() => { setOpen(true); setQuery(""); setActive(Math.max(0, options.findIndex((o) => o.value === current))); }}
        onClick={() => { if (!open) { setOpen(true); setQuery(""); } }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={onKey}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(""); }, 120)}
        className="h-8 w-full min-w-0 rounded-lg border border-input bg-background py-0 pl-2 pr-7 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      {open && !disabled ? (
        <ul id={listId} ref={listRef} role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-48 overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
          {shown.length ? shown.map((o, i) => (
            <li key={`${o.value}-${i}`} role="option" aria-selected={o.value === current} data-index={i}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-pointer rounded-md px-2 py-1.5", i === active && "bg-accent text-accent-foreground",
                o.value === current && "font-medium", o.disabled && "cursor-not-allowed opacity-50")}>
              {o.label || <span className="text-muted-foreground">—</span>}
            </li>
          )) : <li className="px-2 py-1.5 text-muted-foreground">No match</li>}
        </ul>
      ) : null}
    </div>
  );
}

// <option> children (also inside fragments and arrays) → a plain list
function readOptions(children: React.ReactNode): Opt[] {
  const out: Opt[] = [];
  const walk = (node: React.ReactNode) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      const el = child as React.ReactElement<{ value?: unknown; children?: React.ReactNode; disabled?: boolean }>;
      if (el.type === "option") {
        const label = textOf(el.props.children);
        out.push({ value: String(el.props.value ?? label), label, disabled: !!el.props.disabled });
      } else {
        walk(el.props.children);
      }
    });
  };
  walk(children);
  return out;
}
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}
