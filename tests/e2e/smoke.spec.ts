import { expect, test } from "@playwright/test";

test("redirects unauthenticated visitors to sign-in", async ({ page }) => {
  await page.goto("/");
  // First visit pays the cold Clerk load; allow extra time.
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 20000 });
  await expect(page.getByText("Realtrail").first()).toBeVisible();
});

test("/overview redirects to sign-in when unauthenticated", async ({
  page,
}) => {
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 20000 });
});
