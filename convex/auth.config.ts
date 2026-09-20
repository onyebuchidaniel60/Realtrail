// Clerk issuer configuration. CLERK_FRONTEND_API_URL is set on the Convex
// deployment via `npx convex env set` in Phase 1.3-B; until then the dev
// deployment cannot validate Clerk tokens.
export default {
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL,
      applicationID: "convex",
    },
  ],
};
