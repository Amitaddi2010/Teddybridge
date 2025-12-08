import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "pending" | "confirmed" | "declined" | "live" | "completed" | "sent";
  className?: string;
}

const statusStyles = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  live: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  sent: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

const statusLabels = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
  live: "Live",
  completed: "Completed",
  sent: "Sent",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-medium text-xs px-2.5 py-0.5",
        statusStyles[status],
        status === "live" && "animate-pulse",
        className
      )}
      data-testid={`badge-status-${status}`}
    >
      {statusLabels[status]}
    </Badge>
  );
}
