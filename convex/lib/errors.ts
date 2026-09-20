import { ConvexError } from "convex/values";

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "INVALID_TRANSITION",
  "CONFLICT",
  "DUPLICATE",
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "AI_ERROR",
  "WEBHOOK_INVALID",
  "TOKEN_EXPIRED",
  "TOKEN_USED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppErrorData {
  code: ErrorCode;
  message: string;
  field?: string;
  retryable?: boolean;
}

export function appError(
  code: ErrorCode,
  message: string,
  field?: string,
  retryable?: boolean,
): never {
  throw new ConvexError({
    code,
    message,
    ...(field !== undefined ? { field } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
  } satisfies AppErrorData);
}
