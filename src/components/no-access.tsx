import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoAccess({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center" data-testid="no-access">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <ShieldX className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">No access</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "Your role does not include this page. If you need it, ask Gabriel."}
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
