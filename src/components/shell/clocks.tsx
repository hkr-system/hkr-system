"use client";

import { useEffect, useState } from "react";

const ZONES = [
  { label: "Hong Kong", tz: "Asia/Hong_Kong" },
  { label: "El Salvador", tz: "America/El_Salvador" },
] as const;

// Dates are stored in UTC; the team works across HK and SV, so both clocks are shown.
export function Clocks() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
      {ZONES.map((z) => (
        <span key={z.tz} className="tabular-nums">
          {z.label}{" "}
          <span className="font-medium text-foreground">
            {now
              ? new Intl.DateTimeFormat("en-GB", {
                  timeZone: z.tz, weekday: "short", hour: "2-digit", minute: "2-digit",
                }).format(now)
              : "--:--"}
          </span>
        </span>
      ))}
    </div>
  );
}
