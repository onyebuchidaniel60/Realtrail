import { cn } from "@/lib/utils";

export function LoadingSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg bg-muted"
        />
      ))}
    </div>
  );
}
