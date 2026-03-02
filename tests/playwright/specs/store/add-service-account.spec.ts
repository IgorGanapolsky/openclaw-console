import fs from "node:fs";
import { expect, test } from "@playwright/test";

const developerId = "8239620436488925047";
const serviceAccountEmail = "firebase-adminsdk-fbsvc@random-tactical-timer.iam.gserviceaccount.com";
const usersUrl = `https://play.google.com/console/u/0/developers/${developerId}/users-and-permissions`;

test.describe("Google Play Console: Add Service Account User", () => {
  test("Invite service account with Admin permissions", async ({ browser }, testInfo) => {
    const storageStatePath = ".auth/play.json";
    const hasAuthState = fs.existsSync(storageStatePath);
    test.skip(!hasAuthState, "No play.json auth state found.");
    if (!hasAuthState) return;

    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    console.log(`🚀 Navigating to Users & Permissions: ${usersUrl}`);
    await page.goto(usersUrl, { waitUntil: "domcontentloaded" });

    // Check if already invited
    const isAlreadyInvited = await page.getByText(serviceAccountEmail).isVisible().catch(() => false);
    if (isAlreadyInvited) {
      console.log(`✅ Service account ${serviceAccountEmail} is already in the users list.`);
      await page.screenshot({ path: testInfo.outputPath("play-users-existing.png") });
      await context.close();
      return;
    }

    console.log(`➕ Inviting new user: ${serviceAccountEmail}...`);
    await page.getByText(/Invite new users/i).first().click();
    await page.waitForURL(/invite-user/);

    console.log(`📧 Entering email address...`);
    await page.locator('input[type="email"]').first().fill(serviceAccountEmail);

    console.log(`🛡️ Granting Admin permissions...`);
    // In Play Console, Admin is often the first checkbox or a specific role
    await page.getByText(/Admin/i).first().click();

    // Click Invite user button
    console.log(`📤 Clicking Invite user...`);
    await page.getByRole("button", { name: /Invite user/i }).click();

    // Confirm in the dialog if it appears
    const sendInviteButton = page.getByRole("button", { name: /Send invite/i });
    if (await sendInviteButton.isVisible()) {
      await sendInviteButton.click();
    }

    console.log(`✅ Invitation sent!`);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: testInfo.outputPath("play-user-invited.png"), fullPage: true });

    await context.close();
  });
});
