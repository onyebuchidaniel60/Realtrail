export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border px-6 py-10 text-center">
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Retry
        </button>
      )}
    </div>
  );
}
