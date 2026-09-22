import { cn } from "@/lib/utils";

const BAND_STYLES: Record<string, string> = {
  high_relevance: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  relevant:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  other: "bg-muted text-muted-foreground",
};

const BAND_LABELS: Record<string, string> = {
  high_relevance: "High match",
  relevant: "Relevant",
  other: "Other",
};

// Advisory rank bands from vendor discovery (ARCHITECTURE.md §17).
// Never a numeric score — bands only.
export function RankBadge({ band }: { band: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        BAND_STYLES[band] ?? BAND_STYLES.other,
      )}
    >
      {BAND_LABELS[band] ?? band}
    </span>
  );
}
