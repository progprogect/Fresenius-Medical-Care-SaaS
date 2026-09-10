import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  BOOKED: "bg-primary/10 text-primary border-primary/25",
  CONFIRMED: "bg-sky-100 text-sky-700 border-sky-200",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-100 text-red-600 border-red-200",
  NO_SHOW: "bg-amber-100 text-amber-700 border-amber-200",
  ACTIVE: "bg-sky-100 text-sky-700 border-sky-200",
  RESOLVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  NEEDS_HUMAN: "bg-amber-100 text-amber-700 border-amber-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  SENT: "bg-sky-100 text-sky-700 border-sky-200",
  ACCEPTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  DECLINED: "bg-neutral-100 text-neutral-600 border-neutral-200",
  EXPIRED: "bg-neutral-100 text-neutral-500 border-neutral-200",
  SUPERSEDED: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", STYLES[status] ?? "", className)}>
      {status.toLowerCase().replace(/_/g, " ")}
    </Badge>
  );
}
