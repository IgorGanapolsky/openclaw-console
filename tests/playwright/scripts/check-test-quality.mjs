import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const specsDir = path.join(root, "specs");

const disallowedPatterns = [
  {
    pattern: /\bwaitForTimeout\s*\(/,
    message: "Hard waits (`waitForTimeout`) are not allowed. Use explicit waits/assertions.",
  },
  {
    pattern: /\btest\.only\s*\(/,
    message: "Committed `test.only` is not allowed.",
  },
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && full.endsWith(".spec.ts")) {
      files.push(full);
    }
  }
  return files;
}

const files = fs.existsSync(specsDir) ? walk(specsDir) : [];
const errors = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);

  for (const rule of disallowedPatterns) {
    if (rule.pattern.test(content)) {
      errors.push(`${rel}: ${rule.message}`);
    }
  }

  if (!/\bexpect\s*\(/.test(content)) {
    errors.push(`${rel}: Missing assertions. Add at least one expect(...) check.`);
  }
}

if (errors.length > 0) {
  console.error("Playwright quality gate failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Playwright quality gate passed (${files.length} spec file(s) checked).`);
