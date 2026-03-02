import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Resolve absolute path to a CLI tool, falling back to the name itself. */
function resolveExecutable(name) {
  try {
    return execFileSync("/usr/bin/which", [name], { encoding: "utf8" }).trim();
  } catch {
    return name;
  }
}

const ghPath = resolveExecutable("gh");

function repoFromGitHubCli() {
  if (process.env.GH_REPO && process.env.GH_REPO.trim().length > 0) {
    return process.env.GH_REPO.trim();
  }

  const value = execFileSync(
    ghPath,
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    { encoding: "utf8" },
  ).trim();

  if (!value) {
    throw new Error(
      "Could not determine repository. Set GH_REPO (example: IgorGanapolsky/Random-Timer).",
    );
  }
  return value;
}

function readFileRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) {
    throw new Error(`File is empty: ${filePath}`);
  }
  return content;
}

function setSecret(repo, name, value) {
  execFileSync(
    ghPath,
    ["secret", "set", name, "--repo", repo],
    {
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
}

const root = process.cwd();
const ascPath = path.join(root, ".auth", "appstore.json");
const playPath = path.join(root, ".auth", "play.json");

const repo = repoFromGitHubCli();
const asc = readFileRequired(ascPath);
const play = readFileRequired(playPath);

setSecret(repo, "ASC_STORAGE_STATE_JSON", asc);
setSecret(repo, "PLAY_STORAGE_STATE_JSON", play);

console.log(`Updated Actions secrets in ${repo}: ASC_STORAGE_STATE_JSON, PLAY_STORAGE_STATE_JSON`);
