import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export type FileCheckResult = {
  missing: string[];
  empty: string[];
};

export type ScreenshotClass = "iphone_69_or_65" | "ipad_13" | "other";

type Size = { width: number; height: number };

const IPHONE_69_OR_65_SIZES = new Set<string>([
  // iPhone 6.9" and 6.5" variants
  "1320x2868",
  "2868x1320",
  "1290x2796",
  "2796x1290",
  "1284x2778",
  "2778x1284",
  "1242x2688",
  "2688x1242",
]);

const IPAD_13_SIZES = new Set<string>([
  // iPad Pro 13" variants
  "2064x2752",
  "2752x2064",
  "2048x2732",
  "2732x2048",
]);

export function checkNonEmptyFiles(paths: string[]): FileCheckResult {
  const result: FileCheckResult = { missing: [], empty: [] };

  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) {
      result.missing.push(filePath);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) {
      result.empty.push(filePath);
    }
  }

  return result;
}

export function listPngFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .map((name) => path.join(dirPath, name))
    .sort();
}

export function readPngSize(filePath: string): Size {
  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(24);
    fs.readSync(fd, header, 0, header.length, 0);

    const pngSignature = "89504e470d0a1a0a";
    if (header.subarray(0, 8).toString("hex") !== pngSignature) {
      throw new Error(`Unsupported file format (not PNG): ${filePath}`);
    }

    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    };
  } finally {
    fs.closeSync(fd);
  }
}

export function classifyScreenshot(size: Size): ScreenshotClass {
  const key = `${size.width}x${size.height}`;
  if (IPHONE_69_OR_65_SIZES.has(key)) {
    return "iphone_69_or_65";
  }
  if (IPAD_13_SIZES.has(key)) {
    return "ipad_13";
  }
  return "other";
}

export function countScreenshotClasses(files: string[]): Record<ScreenshotClass, number> {
  const counts: Record<ScreenshotClass, number> = {
    iphone_69_or_65: 0,
    ipad_13: 0,
    other: 0,
  };

  for (const filePath of files) {
    const cls = classifyScreenshot(readPngSize(filePath));
    counts[cls] += 1;
  }

  return counts;
}

export function groupScreenshotFilesByClass(
  files: string[],
): Record<ScreenshotClass, string[]> {
  const grouped: Record<ScreenshotClass, string[]> = {
    iphone_69_or_65: [],
    ipad_13: [],
    other: [],
  };

  for (const filePath of files) {
    const cls = classifyScreenshot(readPngSize(filePath));
    grouped[cls].push(filePath);
  }

  return grouped;
}

export function countUniqueFileHashes(files: string[]): number {
  const hashes = new Set<string>();
  for (const filePath of files) {
    const content = fs.readFileSync(filePath);
    hashes.add(createHash("sha256").update(content).digest("hex"));
  }
  return hashes.size;
}
