import fs from "node:fs";
import { expect, test } from "@playwright/test";

const defaultAscUrl =
  "https://appstoreconnect.apple.com/apps/6758355312/distribution/ios/version/inflight";
const defaultPlayUrl =
  "https://play.google.com/console/u/0/developers/8239620436488925047/app/4974974102541773558/app-dashboard";

function tryParseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function isAscLoginUrl(rawUrl: string): boolean {
  const parsed = tryParseUrl(rawUrl);
  if (!parsed) {
    return false;
  }

  if (parsed.hostname.toLowerCase() !== "appstoreconnect.apple.com") {
    return false;
  }

  const path = parsed.pathname.toLowerCase();
  return path.startsWith("/login") || path.startsWith("/signin");
}

function isPlayLoginUrl(rawUrl: string): boolean {
  const parsed = tryParseUrl(rawUrl);
  if (!parsed) {
    return false;
  }

  return parsed.hostname.toLowerCase() === "accounts.google.com";
}

test.describe("Store Console Read-Only Verification", () => {
  test("App Store Connect: version page exposes expected state", async ({ browser }, testInfo) => {
    const storageStatePath = process.env.ASC_STORAGE_STATE_PATH;
    const hasAuthState = Boolean(storageStatePath && fs.existsSync(storageStatePath));
    test.skip(
      !hasAuthState,
      "Set ASC_STORAGE_STATE_PATH to an existing auth state file to run ASC console verification.",
    );
    if (!hasAuthState || !storageStatePath) {
      return;
    }

    const ascUrl = process.env.ASC_VERSION_URL ?? defaultAscUrl;
    const expectedState = process.env.ASC_EXPECTED_STATE_TEXT ?? "Prepare for Submission";
    const expectedAppName = process.env.ASC_EXPECTED_APP_NAME ?? "Random Tactical Timer";

    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();
    await page.goto(ascUrl, { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/^https:\/\/appstoreconnect\.apple\.com(?:\/.*)?$/i);
    const currentUrl = page.url();
    const isAscLogin = isAscLoginUrl(currentUrl);
    const hasAscLoginField = await page
      .getByPlaceholder(/email or phone number/i)
      .first()
      .isVisible()
      .catch(() => false);

    if (isAscLogin || hasAscLoginField) {
      throw new Error(
        "ASC auth state is not authenticated. Refresh with `cd tests/playwright && TARGET=asc npm run auth:save` and sync secrets.",
      );
    }

    await expect(page.getByText(new RegExp(expectedAppName, "i")).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(new RegExp(expectedState, "i")).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({
      path: testInfo.outputPath("asc-version-readonly.png"),
      fullPage: true,
    });
    await context.close();
  });

  test("Play Console: dashboard loads with expected app", async ({ browser }, testInfo) => {
    const storageStatePath = process.env.PLAY_STORAGE_STATE_PATH;
    const hasAuthState = Boolean(storageStatePath && fs.existsSync(storageStatePath));
    test.skip(
      !hasAuthState,
      "Set PLAY_STORAGE_STATE_PATH to an existing auth state file to run Play Console verification.",
    );
    if (!hasAuthState || !storageStatePath) {
      return;
    }

    const playUrl = process.env.PLAY_CONSOLE_URL ?? defaultPlayUrl;
    const expectedAppName = process.env.PLAY_EXPECTED_APP_NAME ?? "Random Timer";
    const expectedBannerText = process.env.PLAY_EXPECTED_BANNER_TEXT ?? "";

    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();
    await page.goto(playUrl, { waitUntil: "domcontentloaded" });

    const currentUrl = page.url();
    const isPlayLogin = isPlayLoginUrl(currentUrl);
    const hasPlayLoginField = await page
      .locator('input[type="email"]')
      .first()
      .isVisible()
      .catch(() => false);

    if (isPlayLogin || hasPlayLoginField) {
      throw new Error(
        "Play auth state is not authenticated. Refresh with `cd tests/playwright && TARGET=play npm run auth:save` and sync secrets.",
      );
    }

    await expect(page).toHaveURL(/^https:\/\/play\.google\.com\/console(?:\/.*)?$/i);
    await expect(page.getByText(new RegExp(expectedAppName, "i")).first()).toBeVisible({
      timeout: 30_000,
    });

    if (expectedBannerText.trim().length > 0) {
      await expect(page.getByText(new RegExp(expectedBannerText, "i")).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.screenshot({
      path: testInfo.outputPath("play-dashboard-readonly.png"),
      fullPage: true,
    });
    await context.close();
  });
});
