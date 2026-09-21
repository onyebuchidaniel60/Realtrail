import { toast as sonner } from "sonner";

// Thin wrapper so product code depends on our own module (mockable in
// tests) rather than the sonner package directly.
export const toast = {
  success: (message: string) => sonner.success(message),
  error: (message: string) => sonner.error(message),
  info: (message: string) => sonner.info(message),
};
