import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const defaultAscUrl =
  "https://appstoreconnect.apple.com/apps/6758355312/distribution/ios/version/inflight";
const defaultPlayUrl =
  "https://play.google.com/console/u/0/developers/8239620436488925047/app/4974974102541773558/app-dashboard";
const agentBrowserVersion = "0.10.0";

function tryParseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function isAscLoginUrl(rawUrl) {
  const parsed = tryParseUrl(rawUrl);
  if (!parsed) {
    return false;
  }
  if (parsed.hostname.toLowerCase() !== "appstoreconnect.apple.com") {
    return false;
  }
  const pathName = parsed.pathname.toLowerCase();
  return pathName.startsWith("/login") || pathName.startsWith("/signin");
}

function isPlayLoginUrl(rawUrl) {
  const parsed = tryParseUrl(rawUrl);
  if (!parsed) {
    return false;
  }
  return parsed.hostname.toLowerCase() === "accounts.google.com";
}

/** Resolve absolute path to a CLI tool, falling back to the name itself. */
function resolveExecutable(name) {
  try {
    return execFileSync("/usr/bin/which", [name], { encoding: "utf8" }).trim();
  } catch {
    return name;
  }
}

function resolveAgentRunner() {
  const resolvedPath = resolveExecutable("agent-browser");
  const direct = spawnSync(resolvedPath, ["--version"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (direct.status === 0) {
    return { cmd: resolvedPath, prefix: [] };
  }
  return {
    cmd: resolveExecutable("npx"),
    prefix: ["--yes", `agent-browser@${agentBrowserVersion}`],
  };
}

const agentRunner = resolveAgentRunner();

function fail(message) {
  throw new Error(message);
}

function ensureFile(filePath, label) {
  if (!filePath) {
    fail(`${label} is required.`);
  }
  if (!fs.existsSync(filePath)) {
    fail(`${label} does not exist: ${filePath}`);
  }
}

function runAgent(args, { expectJson = false } = {}) {
  const fullArgs = [...agentRunner.prefix, ...args];
  const result = spawnSync(agentRunner.cmd, fullArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const details = [
      `${agentRunner.cmd} ${fullArgs.join(" ")}`,
      result.stdout?.trim() ? `stdout: ${result.stdout.trim()}` : "",
      result.stderr?.trim() ? `stderr: ${result.stderr.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    fail(`agent-browser command failed\n${details}`);
  }

  const output = (result.stdout || "").trim();
  if (!expectJson) {
    return output;
  }
  try {
    return JSON.parse(output);
  } catch (error) {
    fail(
      `Expected JSON output from agent-browser, got:\n${output}\nParse error: ${String(error)}`,
    );
  }
}

function closeSession(session) {
  try {
    runAgent(["--session", session, "close"]);
  } catch (_) {
    // best-effort cleanup
  }
}

function evaluateContains(session, text) {
  const needle = String(text).toLowerCase();
  const script = `Boolean(document.body && document.body.innerText && document.body.innerText.toLowerCase().includes(${JSON.stringify(needle)}))`;
  const response = runAgent(["--session", session, "--json", "eval", script], {
    expectJson: true,
  });
  return Boolean(response?.data?.result);
}

function openAndVerifyAsc({
  statePath,
  url,
  expectedAppName,
  expectedState,
  screenshotPath,
}) {
  const session = `asc-agent-${Date.now()}`;
  try {
    runAgent(["--session", session, "--state", statePath, "--json", "open", url], {
      expectJson: true,
    });

    const currentUrl = String(
      runAgent(["--session", session, "--json", "get", "url"], { expectJson: true })?.data?.url ||
        "",
    );
    if (isAscLoginUrl(currentUrl)) {
      fail(
        "ASC auth state is not authenticated. Re-capture with `TARGET=asc npm run auth:save`.",
      );
    }

    if (!evaluateContains(session, expectedAppName)) {
      fail(`ASC page does not contain expected app name: ${expectedAppName}`);
    }
    if (!evaluateContains(session, expectedState)) {
      fail(`ASC page does not contain expected state text: ${expectedState}`);
    }

    runAgent(["--session", session, "screenshot", screenshotPath, "--full"]);
    return {
      currentUrl,
      screenshotPath,
    };
  } finally {
    closeSession(session);
  }
}

function openAndVerifyPlay({
  statePath,
  url,
  expectedAppName,
  expectedBannerText,
  screenshotPath,
}) {
  const session = `play-agent-${Date.now()}`;
  try {
    runAgent(["--session", session, "--state", statePath, "--json", "open", url], {
      expectJson: true,
    });

    const currentUrl = String(
      runAgent(["--session", session, "--json", "get", "url"], { expectJson: true })?.data?.url ||
        "",
    );
    if (isPlayLoginUrl(currentUrl)) {
      fail(
        "Play auth state is not authenticated. Re-capture with `TARGET=play npm run auth:save`.",
      );
    }

    if (!evaluateContains(session, expectedAppName)) {
      fail(`Play Console page does not contain expected app name: ${expectedAppName}`);
    }

    if (expectedBannerText && !evaluateContains(session, expectedBannerText)) {
      fail(`Play Console page does not contain expected banner text: ${expectedBannerText}`);
    }

    runAgent(["--session", session, "screenshot", screenshotPath, "--full"]);
    return {
      currentUrl,
      screenshotPath,
    };
  } finally {
    closeSession(session);
  }
}

function main() {
  const ascStatePath = process.env.ASC_STORAGE_STATE_PATH || ".auth/appstore.json";
  const playStatePath = process.env.PLAY_STORAGE_STATE_PATH || ".auth/play.json";
  ensureFile(ascStatePath, "ASC_STORAGE_STATE_PATH");
  ensureFile(playStatePath, "PLAY_STORAGE_STATE_PATH");

  const ascUrl = process.env.ASC_VERSION_URL || defaultAscUrl;
  const playUrl = process.env.PLAY_CONSOLE_URL || defaultPlayUrl;

  const ascExpectedState = process.env.ASC_EXPECTED_STATE_TEXT || "Prepare for Submission";
  const ascExpectedAppName = process.env.ASC_EXPECTED_APP_NAME || "Random Tactical Timer";
  const playExpectedAppName = process.env.PLAY_EXPECTED_APP_NAME || "Random Timer";
  const playExpectedBannerText = process.env.PLAY_EXPECTED_BANNER_TEXT || "";

  const artifactsDir = path.resolve("test-results/agent-browser");
  fs.mkdirSync(artifactsDir, { recursive: true });

  const ascResult = openAndVerifyAsc({
    statePath: ascStatePath,
    url: ascUrl,
    expectedAppName: ascExpectedAppName,
    expectedState: ascExpectedState,
    screenshotPath: path.join(artifactsDir, "asc-agent-browser.png"),
  });

  const playResult = openAndVerifyPlay({
    statePath: playStatePath,
    url: playUrl,
    expectedAppName: playExpectedAppName,
    expectedBannerText: playExpectedBannerText,
    screenshotPath: path.join(artifactsDir, "play-agent-browser.png"),
  });

  console.log("agent-browser store verification passed");
  console.log(`ASC URL: ${ascResult.currentUrl}`);
  console.log(`ASC screenshot: ${ascResult.screenshotPath}`);
  console.log(`Play URL: ${playResult.currentUrl}`);
  console.log(`Play screenshot: ${playResult.screenshotPath}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agent-browser store verification failed: ${message}`);
  process.exit(1);
}
