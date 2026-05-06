import fs from 'node:fs';
import path from 'node:path';
import type { ActionType, AgentCommerceRisk, RiskLevel, SupplyChainRisk } from '../types/protocol.js';

export interface SupplyChainRiskInput {
  actionType?: ActionType;
  command?: string;
  fileChanges?: string[];
}

export interface AgentCommerceRiskInput {
  actionType?: ActionType;
  command?: string;
  estimatedMonthlyUsd?: number;
  monthlyBudgetLimitUsd?: number;
}

export interface SecretExposureInventoryOptions {
  rootDir: string;
  env?: NodeJS.ProcessEnv;
  maxFiles?: number;
}

export interface SecretExposureInventory {
  root_dir: string;
  checked_at: string;
  env_secret_key_names: string[];
  local_secret_files: Array<{
    path: string;
    key_names: string[];
  }>;
  github_actions_secret_references: string[];
  package_manifests: string[];
  counts: {
    env_secret_keys: number;
    local_secret_files: number;
    local_secret_key_names: number;
    github_actions_secret_references: number;
    package_manifests: number;
  };
}

const SUPPLY_CHAIN_PATTERNS: Array<{
  pattern: RegExp;
  category: SupplyChainRisk['category'];
  severity: RiskLevel;
  reason: string;
  requiredApproval: boolean;
}> = [
  {
    pattern: /\b(npm|pnpm|yarn)\s+(install|i|add|upgrade|update|create|exec|dlx)\b/i,
    category: 'dependency_install',
    severity: 'critical',
    reason: 'JavaScript package commands can execute lifecycle scripts and harvest developer credentials.',
    requiredApproval: true,
  },
  {
    pattern: /\bnpm\s+ci\b/i,
    category: 'dependency_install',
    severity: 'high',
    reason: 'Lockfile installs still execute package lifecycle scripts on the developer machine.',
    requiredApproval: true,
  },
  {
    pattern: /\b(pip|pip3|pipx|poetry|uv)\s+(install|add|sync|run|tool\s+install)\b/i,
    category: 'dependency_install',
    severity: 'critical',
    reason: 'Python package installation can execute setup hooks and expose local credentials.',
    requiredApproval: true,
  },
  {
    pattern: /\b(docker|podman)\s+(pull|run|build|compose\s+up|login)\b/i,
    category: 'container_image',
    severity: 'critical',
    reason: 'Container image operations can run untrusted code or access mounted credentials.',
    requiredApproval: true,
  },
  {
    pattern: /\b(curl|wget)\b.*\|\s*(sh|bash|zsh|python|python3|node)\b/i,
    category: 'remote_script',
    severity: 'critical',
    reason: 'Piping remote content into an interpreter executes unaudited code on the developer machine.',
    requiredApproval: true,
  },
  {
    pattern: /\b(brew|gem|cargo|go)\s+(install|get)\b/i,
    category: 'cli_install',
    severity: 'critical',
    reason: 'CLI installation changes the trusted toolchain used by future agent actions.',
    requiredApproval: true,
  },
  {
    pattern: /\b(gh|github|npm|docker|gcloud|az|vercel|flyctl|stripe)\s+.*\b(auth|login|token|secret|credential|configure)\b/i,
    category: 'credential_command',
    severity: 'critical',
    reason: 'Credential and auth commands can expose, mint, or mutate high-value non-human identities.',
    requiredApproval: true,
  },
  {
    pattern: /\baws\s+.*\b(auth|login|secret|credential|configure)\b/i,
    category: 'credential_command',
    severity: 'critical',
    reason: 'Credential and auth commands can expose, mint, or mutate high-value non-human identities.',
    requiredApproval: true,
  },
  {
    pattern: /\b(cat|less|more|head|tail|sed|awk|grep|rg|git\s+show)\b.*(\.env|\.npmrc|\.pypirc|\.netrc|credentials|secrets?|token|keychain)/i,
    category: 'secret_touch',
    severity: 'critical',
    reason: 'The command may read secret-bearing files or credential names into agent context.',
    requiredApproval: true,
  },
  {
    pattern: /\b(claude|codex|cursor|aider|gemini|grok)\b.*\b(install|mcp|tool|plugin|extension)\b/i,
    category: 'agent_tooling',
    severity: 'critical',
    reason: 'Agent tool/plugin changes can expand what future autonomous actions can access.',
    requiredApproval: true,
  },
];

const DEFAULT_AGENT_COMMERCE_MONTHLY_BUDGET_USD = 100;

const AGENT_COMMERCE_PATTERNS: Array<{
  pattern: RegExp;
  category: AgentCommerceRisk['category'];
  provider: AgentCommerceRisk['provider'];
  severity: RiskLevel;
  reason: string;
}> = [
  {
    pattern: /\bstripe\s+projects\s+add\s+cloudflare\/registrar:domain\b/i,
    category: 'domain_registration',
    provider: 'stripe_projects',
    severity: 'critical',
    reason: 'Stripe Projects can register a Cloudflare domain and bill the signed-in user.',
  },
  {
    pattern: /\bstripe\s+projects\s+add\s+cloudflare\/(?!registrar:domain\b)[^ \n]+/i,
    category: 'paid_subscription',
    provider: 'stripe_projects',
    severity: 'critical',
    reason: 'Stripe Projects can provision paid Cloudflare services using the user payment context.',
  },
  {
    pattern: /\bstripe\s+projects\s+(deploy|provision|create|use)\b.*\bcloudflare\b/i,
    category: 'cloud_account_provisioning',
    provider: 'stripe_projects',
    severity: 'critical',
    reason: 'Agent-driven Cloudflare provisioning can create accounts, subscriptions, and deployable credentials.',
  },
  {
    pattern: /(?:\bwrangler\b|\bcloudflare\s+).*\b(registrar|register|domain|zone)\b/i,
    category: 'domain_registration',
    provider: 'cloudflare',
    severity: 'critical',
    reason: 'Cloudflare domain and zone operations can create durable externally reachable infrastructure.',
  },
  {
    pattern: /(?:\bwrangler\b|\bcloudflare\s+).*\b(account|subscription|billing|plan)\b/i,
    category: 'paid_subscription',
    provider: 'cloudflare',
    severity: 'critical',
    reason: 'Cloudflare account, subscription, and billing operations can create spend obligations.',
  },
  {
    pattern: /(?:\bwrangler\b|\bcloudflare\s+).*\b(api[-_ ]?token|token|secret)\b/i,
    category: 'api_token_minting',
    provider: 'cloudflare',
    severity: 'critical',
    reason: 'Cloudflare token and secret operations can mint or expose deploy-capable credentials.',
  },
  {
    pattern: /\bwrangler\s+(deploy|pages\s+deploy)\b/i,
    category: 'deployment',
    provider: 'cloudflare',
    severity: 'high',
    reason: 'Cloudflare deploy commands publish code to an externally reachable runtime.',
  },
];

const SECRET_FILE_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.staging',
  '.npmrc',
  '.pypirc',
  '.netrc',
  'credentials',
  'secrets.json',
  'service-account.json',
]);

const PACKAGE_MANIFEST_BASENAMES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'requirements.txt',
  'pyproject.toml',
  'poetry.lock',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.gradle',
  '.next',
  'DerivedData',
]);

const SECRET_KEY_PATTERN = /(SECRET|TOKEN|KEY|PASSWORD|PASS|CREDENTIAL|PRIVATE|APPSTORE|STRIPE|REVENUECAT|GITHUB|GH_|XAI|OPENAI|ANTHROPIC|GEMINI|FIREBASE|SLACK|AWS|GCP|AZURE|DOCKER|NPM)/i;

export function assessSupplyChainRisk(input: SupplyChainRiskInput): SupplyChainRisk | null {
  const command = input.command?.trim() ?? '';
  const fileChanges = input.fileChanges ?? [];
  const matches = SUPPLY_CHAIN_PATTERNS.filter((entry) => command && entry.pattern.test(command));

  for (const file of fileChanges) {
    const normalized = file.replaceAll('\\', '/');
    if (isSecretBearingPath(normalized)) {
      matches.push({
        pattern: /.*/,
        category: 'secret_touch',
        severity: 'critical',
        reason: `Changes include secret-bearing path "${normalized}".`,
        requiredApproval: true,
      });
      break;
    }
    if (isPackageManifest(normalized)) {
      matches.push({
        pattern: /.*/,
        category: 'dependency_install',
        severity: 'critical',
        reason: `Changes include dependency or container manifest "${normalized}".`,
        requiredApproval: true,
      });
      break;
    }
  }

  if (input.actionType === 'agent_skill_install') {
    matches.push({
      pattern: /.*/,
      category: 'agent_tooling',
      severity: 'critical',
      reason: 'Installing agent skills expands future agent capability and access.',
      requiredApproval: true,
    });
  }

  if (matches.length === 0) return null;

  const severity: RiskLevel = matches.some((match) => match.severity === 'critical') ? 'critical' : 'high';
  const categories = Array.from(new Set(matches.map((match) => match.category)));
  return {
    detected: true,
    category: categories.length === 1 ? categories[0]! : 'mixed',
    severity,
    requires_explicit_approval: matches.some((match) => match.requiredApproval),
    reasons: Array.from(new Set(matches.map((match) => match.reason))),
    recommended_questions: recommendedQuestions(categories),
    recommended_rotations: recommendedRotations(categories),
  };
}

export function appendSupplyChainApprovalSummary(description: string, risk: SupplyChainRisk | null): string {
  if (!risk) return description;
  return [
    description,
    '',
    'Supply-chain guardrail:',
    `Risk: ${risk.severity.toUpperCase()} (${risk.category})`,
    ...risk.reasons.map((reason) => `- ${reason}`),
    'Before approving, verify the package/source, expected credential access, and rollback/rotation plan.',
  ].join('\n');
}

export function assessAgentCommerceRisk(input: AgentCommerceRiskInput): AgentCommerceRisk | null {
  const command = input.command?.trim() ?? '';
  if (!command && input.actionType !== 'deploy') return null;

  const matches = AGENT_COMMERCE_PATTERNS.filter((entry) => command && entry.pattern.test(command));
  if (input.actionType === 'deploy' && /\b(cloudflare|wrangler|workers?|pages)\b/i.test(command)) {
    matches.push({
      pattern: /.*/,
      category: 'deployment',
      provider: 'cloudflare',
      severity: 'high',
      reason: 'Cloudflare deployments publish code to production-like infrastructure.',
    });
  }

  if (matches.length === 0) return null;

  const categories = Array.from(new Set(matches.map((match) => match.category)));
  const providers = Array.from(new Set(matches.map((match) => match.provider)));
  const monthlyLimit = input.monthlyBudgetLimitUsd ?? DEFAULT_AGENT_COMMERCE_MONTHLY_BUDGET_USD;
  const estimatedMonthlyUsd = normalizeUsd(input.estimatedMonthlyUsd) ?? extractUsdAmount(command);
  const requiresBudgetConfirmation = estimatedMonthlyUsd === undefined;
  const overBudget = estimatedMonthlyUsd !== undefined && estimatedMonthlyUsd > monthlyLimit;
  const severity: RiskLevel = overBudget || matches.some((match) => match.severity === 'critical') ? 'critical' : 'high';

  return {
    detected: true,
    category: categories.length === 1 ? categories[0]! : 'mixed',
    provider: providers.length === 1 ? providers[0]! : 'unknown',
    severity,
    requires_explicit_approval: true,
    reasons: Array.from(new Set([
      ...matches.map((match) => match.reason),
      overBudget
        ? `Estimated monthly spend ${formatUsd(estimatedMonthlyUsd)} exceeds the configured ${formatUsd(monthlyLimit)} monthly approval budget.`
        : null,
      requiresBudgetConfirmation
        ? `No monthly spend estimate was supplied; default approval budget is ${formatUsd(monthlyLimit)} per provider.`
        : null,
    ].filter((reason): reason is string => reason !== null))),
    recommended_questions: recommendedAgentCommerceQuestions(categories, overBudget, requiresBudgetConfirmation),
    budget: {
      currency: 'USD',
      monthly_limit_usd: monthlyLimit,
      estimated_monthly_usd: estimatedMonthlyUsd ?? null,
      over_budget: overBudget,
      requires_budget_confirmation: requiresBudgetConfirmation,
    },
    artifacts: {
      domains: extractDomains(command),
      services: extractCloudflareServices(command),
    },
  };
}

export function appendAgentCommerceApprovalSummary(description: string, risk: AgentCommerceRisk | null): string {
  if (!risk) return description;
  return [
    description,
    '',
    'Agent commerce guardrail:',
    `Risk: ${risk.severity.toUpperCase()} (${risk.category})`,
    `Provider: ${risk.provider}`,
    `Budget: ${risk.budget.estimated_monthly_usd === null ? 'unestimated' : formatUsd(risk.budget.estimated_monthly_usd)} / ${formatUsd(risk.budget.monthly_limit_usd)} monthly limit`,
    ...risk.reasons.map((reason) => `- ${reason}`),
    'Before approving, verify ownership, billing cap, token scope, deployment target, and rollback/revoke plan.',
  ].join('\n');
}

export function buildSupplyChainIncidentRunbook(params: {
  title: string;
  command?: string;
  risk?: SupplyChainRisk | null;
  inventory?: SecretExposureInventory | null;
}): string {
  const risk = params.risk;
  const inventory = params.inventory;
  return [
    `Supply-chain security workflow for "${params.title}":`,
    '',
    risk ? `Risk classification: ${risk.severity.toUpperCase()} ${risk.category}` : 'Risk classification: not provided',
    params.command ? `Command: ${params.command}` : null,
    '',
    'Immediate containment:',
    '1. Pause the agent session and stop new package/container/tool installs.',
    '2. Capture evidence: command, package name/version, lockfile diff, image digest, and agent logs.',
    '3. Review whether local secret-bearing files or environment variables were accessible.',
    '',
    'Credential rotation priority:',
    ...(risk?.recommended_rotations.length ? risk.recommended_rotations.map((item) => `- ${item}`) : [
      '- Rotate GitHub tokens and package registry tokens first.',
      '- Rotate cloud, deploy, billing, and app store keys reachable from this machine.',
    ]),
    inventory ? '' : null,
    inventory ? `Inventory counts: ${inventory.counts.env_secret_keys} env key names, ${inventory.counts.local_secret_files} local secret files, ${inventory.counts.github_actions_secret_references} GitHub Actions secret references.` : null,
    '',
    'Recovery checklist:',
    '- Reinstall dependencies from a reviewed lockfile or pinned digest.',
    '- Revoke suspicious sessions/tokens before resuming the agent.',
    '- Record the final rotation evidence in the incident timeline.',
  ].filter((line): line is string => line !== null).join('\n');
}

export function scanSecretExposureInventory(options: SecretExposureInventoryOptions): SecretExposureInventory {
  const rootDir = path.resolve(options.rootDir);
  const maxFiles = options.maxFiles ?? 400;
  const env = options.env ?? process.env;
  const envSecretKeyNames = Object.keys(env)
    .filter((key) => SECRET_KEY_PATTERN.test(key))
    .sort();

  const localSecretFiles: SecretExposureInventory['local_secret_files'] = [];
  const githubSecrets = new Set<string>();
  const packageManifests = new Set<string>();
  let visited = 0;

  if (fs.existsSync(rootDir)) {
    walk(rootDir, rootDir, (absolutePath, relativePath) => {
      if (visited >= maxFiles) return;
      visited++;
      const normalized = relativePath.replaceAll('\\', '/');
      const basename = path.basename(normalized);

      if (isPackageManifest(normalized)) {
        packageManifests.add(normalized);
      }

      if (isSecretBearingPath(normalized)) {
        localSecretFiles.push({
          path: normalized,
          key_names: extractSecretKeyNames(absolutePath),
        });
      }

      if (normalized.startsWith('.github/workflows/') && /\.(ya?ml)$/i.test(normalized)) {
        for (const secret of extractGithubActionsSecretReferences(absolutePath)) {
          githubSecrets.add(secret);
        }
      }

      if (SECRET_FILE_BASENAMES.has(basename) && !localSecretFiles.some((file) => file.path === normalized)) {
        localSecretFiles.push({
          path: normalized,
          key_names: extractSecretKeyNames(absolutePath),
        });
      }
    });
  }

  const uniqueLocalSecretFiles = dedupeSecretFiles(localSecretFiles);
  const localSecretKeyCount = uniqueLocalSecretFiles.reduce((sum, file) => sum + file.key_names.length, 0);

  return {
    root_dir: rootDir,
    checked_at: new Date().toISOString(),
    env_secret_key_names: envSecretKeyNames,
    local_secret_files: uniqueLocalSecretFiles,
    github_actions_secret_references: Array.from(githubSecrets).sort(),
    package_manifests: Array.from(packageManifests).sort(),
    counts: {
      env_secret_keys: envSecretKeyNames.length,
      local_secret_files: uniqueLocalSecretFiles.length,
      local_secret_key_names: localSecretKeyCount,
      github_actions_secret_references: githubSecrets.size,
      package_manifests: packageManifests.size,
    },
  };
}

function recommendedQuestions(categories: SupplyChainRisk['category'][]): string[] {
  const questions = [
    'Is the package, image, script, or tool source pinned and trusted?',
    'Which local secrets and non-human identities could the command access?',
    'What is the rollback or credential-rotation plan if this is malicious?',
  ];
  if (categories.includes('remote_script')) {
    questions.unshift('Has the remote script content been downloaded and reviewed before execution?');
  }
  if (categories.includes('credential_command') || categories.includes('secret_touch')) {
    questions.unshift('Will this command print, mint, rotate, or upload credentials?');
  }
  return Array.from(new Set(questions));
}

function recommendedRotations(categories: SupplyChainRisk['category'][]): string[] {
  const rotations = new Set<string>([
    'GitHub personal access tokens, fine-grained tokens, and GitHub App credentials',
    'Package registry tokens for npm, PyPI, Docker Hub, and GitHub Packages',
  ]);
  if (categories.includes('container_image')) {
    rotations.add('Container registry credentials and cloud runtime secrets mounted into builds');
  }
  if (categories.includes('credential_command') || categories.includes('secret_touch')) {
    rotations.add('Cloud provider, billing, app store, analytics, and AI provider API keys visible to the developer machine');
  }
  if (categories.includes('agent_tooling')) {
    rotations.add('Agent bridge tokens, MCP server tokens, and CLI auth sessions');
  }
  return Array.from(rotations);
}

function recommendedAgentCommerceQuestions(
  categories: AgentCommerceRisk['category'][],
  overBudget: boolean,
  requiresBudgetConfirmation: boolean,
): string[] {
  const questions = [
    'Which signed-in user, account, and payment method will own the provisioned Cloudflare resources?',
    'What token scopes and expiration will be issued, and where will the token be stored?',
    'What is the rollback plan: revoke token, cancel subscription, remove DNS/zone, or delete deployment?',
  ];
  if (categories.includes('domain_registration')) {
    questions.unshift('What exact domain is being registered, what is the renewal cost, and who owns the registrant contact?');
  }
  if (categories.includes('paid_subscription') || overBudget || requiresBudgetConfirmation) {
    questions.unshift('What monthly spend cap applies to this provider before the agent is allowed to continue?');
  }
  if (categories.includes('deployment')) {
    questions.unshift('Which environment, route, and public hostname will receive the deployment?');
  }
  return Array.from(new Set(questions));
}

function isSecretBearingPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  const basename = path.basename(normalized);
  return SECRET_FILE_BASENAMES.has(basename) ||
    normalized.includes('/.env') ||
    normalized.includes('/secrets/') ||
    normalized.includes('/credentials') ||
    normalized.includes('service-account') ||
    normalized.endsWith('.pem') ||
    normalized.endsWith('.key');
}

function isPackageManifest(filePath: string): boolean {
  const basename = path.basename(filePath);
  return PACKAGE_MANIFEST_BASENAMES.has(basename) ||
    filePath.includes('.github/dependabot.yml') ||
    filePath.includes('.github/dependabot.yaml');
}

function normalizeUsd(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100) / 100;
}

function extractUsdAmount(command: string): number | undefined {
  const amounts = [
    ...Array.from(command.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)).map((match) => Number.parseFloat(match[1]!)),
    ...Array.from(command.matchAll(/\bUSD\s*(\d+(?:\.\d{1,2})?)/gi)).map((match) => Number.parseFloat(match[1]!)),
    ...Array.from(command.matchAll(/--(?:budget|max[-_]?spend|monthly[-_]?limit|spend[-_]?limit)(?:=|\s+)(\d+(?:\.\d{1,2})?)/gi)).map((match) => Number.parseFloat(match[1]!)),
  ].filter((amount) => Number.isFinite(amount) && amount >= 0);
  if (amounts.length === 0) return undefined;
  return Math.max(...amounts);
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)} USD`;
}

function extractDomains(command: string): string[] {
  return Array.from(command.matchAll(/\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:ai|app|build|cloud|co|com|dev|io|me|net|org|page|site|us|xyz))\b/gi))
    .map((match) => match[1]!.toLowerCase())
    .filter((domain, index, domains) => domains.indexOf(domain) === index)
    .sort();
}

function extractCloudflareServices(command: string): string[] {
  return Array.from(command.matchAll(/\b(cloudflare\/[a-z0-9:_-]+)\b/gi))
    .map((match) => match[1]!.toLowerCase())
    .filter((service, index, services) => services.indexOf(service) === index)
    .sort();
}

function walk(rootDir: string, currentDir: string, onFile: (absolutePath: string, relativePath: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    if (entry.isDirectory()) {
      walk(rootDir, absolutePath, onFile);
    } else if (entry.isFile()) {
      onFile(absolutePath, relativePath);
    }
  }
}

function extractSecretKeyNames(filePath: string): string[] {
  const keyNames = new Set<string>();
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const envMatch = trimmed.match(/^(?:export\s+)?([A-Z0-9_][A-Z0-9_.-]*)\s*=/i);
    if (envMatch?.[1]) {
      keyNames.add(envMatch[1]);
    }
  }
  return Array.from(keyNames).sort();
}

function extractGithubActionsSecretReferences(filePath: string): string[] {
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  return Array.from(contents.matchAll(/secrets\.([A-Z0-9_]+)/gi))
    .map((match) => match[1]!)
    .sort();
}

function dedupeSecretFiles(files: SecretExposureInventory['local_secret_files']): SecretExposureInventory['local_secret_files'] {
  const byPath = new Map<string, SecretExposureInventory['local_secret_files'][number]>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (!existing) {
      byPath.set(file.path, { path: file.path, key_names: file.key_names });
    } else {
      byPath.set(file.path, {
        path: file.path,
        key_names: Array.from(new Set([...existing.key_names, ...file.key_names])).sort(),
      });
    }
  }
  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}
