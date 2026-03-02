import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  checkNonEmptyFiles,
  countUniqueFileHashes,
  countScreenshotClasses,
  groupScreenshotFilesByClass,
  listPngFiles,
} from "../../src/storeVerification";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");

function rel(filePath: string): string {
  return path.relative(repoRoot, filePath);
}

test.describe("Local Store Metadata", () => {
  test("required store metadata files are present and non-empty", async () => {
    const androidRequired = [
      "native-android/fastlane/metadata/android/en-US/title.txt",
      "native-android/fastlane/metadata/android/en-US/short_description.txt",
      "native-android/fastlane/metadata/android/en-US/full_description.txt",
    ].map((p) => path.join(repoRoot, p));

    const iosRequired = [
      "native-ios/fastlane/metadata/en-US/name.txt",
      "native-ios/fastlane/metadata/en-US/subtitle.txt",
      "native-ios/fastlane/metadata/en-US/description.txt",
      "native-ios/fastlane/metadata/en-US/keywords.txt",
      "native-ios/fastlane/metadata/en-US/release_notes.txt",
      "native-ios/fastlane/metadata/en-US/support_url.txt",
      "native-ios/fastlane/metadata/en-US/privacy_url.txt",
    ].map((p) => path.join(repoRoot, p));

    const checks = checkNonEmptyFiles([...androidRequired, ...iosRequired]);
    expect(checks.missing.map(rel), "Missing files").toEqual([]);
    expect(checks.empty.map(rel), "Empty files").toEqual([]);
  });

  test("baseline screenshot inventory exists", async () => {
    const androidShots = listPngFiles(
      path.join(repoRoot, "native-android/fastlane/metadata/android/en-US/images/phoneScreenshots"),
    );
    const iosShots = listPngFiles(
      path.join(repoRoot, "native-ios/fastlane/screenshots/en-US"),
    );

    expect(
      androidShots.length,
      "Expected at least 3 Android phone screenshots for listing quality.",
    ).toBeGreaterThanOrEqual(3);

    expect(
      iosShots.length,
      "Expected at least 3 iOS screenshots in fastlane/screenshots/en-US.",
    ).toBeGreaterThanOrEqual(3);
  });

  test("strict App Store readiness requires iPhone and iPad screenshot coverage", async () => {
    test.skip(
      process.env.STRICT_STORE_READINESS !== "1",
      "Set STRICT_STORE_READINESS=1 to enforce release-grade screenshot coverage.",
    );

    const iosShots = listPngFiles(
      path.join(repoRoot, "native-ios/fastlane/screenshots/en-US"),
    );

    const counts = countScreenshotClasses(iosShots);
    const grouped = groupScreenshotFilesByClass(iosShots);

    const requiredIpadFiles = [
      "5_ipad_setup.png",
      "6_ipad_running.png",
      "7_ipad_stopped.png",
    ];
    const iosShotNames = new Set(iosShots.map((filePath) => path.basename(filePath)));

    expect(
      counts.iphone_69_or_65,
      "Need at least 3 screenshots for iPhone 6.9\"/6.5\" class.",
    ).toBeGreaterThanOrEqual(3);
    expect(
      counts.ipad_13,
      "Need at least 3 screenshots for iPad 13\" class.",
    ).toBeGreaterThanOrEqual(3);

    expect(
      countUniqueFileHashes(grouped.iphone_69_or_65),
      "Need at least 2 distinct iPhone-class screenshots.",
    ).toBeGreaterThanOrEqual(2);
    expect(
      countUniqueFileHashes(grouped.ipad_13),
      "Need at least 2 distinct iPad-class screenshots.",
    ).toBeGreaterThanOrEqual(2);

    for (const fileName of requiredIpadFiles) {
      expect(iosShotNames.has(fileName), `Missing required iPad screenshot ${fileName}`).toBeTruthy();
    }
  });
});
