export function getAppError(err: unknown): {
  code?: string;
  field?: string;
  message?: string;
} {
  if (typeof err === "object" && err !== null && "data" in err) {
    const data = (err as { data?: { code?: string; field?: string; message?: string } })
      .data;
    return { code: data?.code, field: data?.field, message: data?.message };
  }
  return {};
}

export function errorMessage(err: unknown): string {
  const { message } = getAppError(err);
  return message ?? "Something went wrong. Check your input and retry.";
}

export const inputClass =
  "rounded-md border bg-background px-3 py-2 disabled:opacity-50";
