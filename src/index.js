#!/usr/bin/env node
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const required = [
  ["README.md", "README"],
  ["LICENSE", "license"],
  ["package.json", "package metadata"],
  [".gitignore", "gitignore"]
];

const secretPatterns = [
  /\b(?:api[_-]?key|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{24,}/i,
  /\bxai-[A-Za-z0-9_\-]{28,}\b/i,
  /\bsk-(?:proj-)?[A-Za-z0-9_\-]{28,}\b/i
];

const noisyFiles = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const binaryLike = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|mp4|mov|woff2?|ttf)$/i;

function walk(root, limit = 300, maxDepth = 8) {
  const files = [];
  const ignored = new Set(["node_modules", ".git", "dist", "coverage"]);
  const visited = new Set();
  let truncated = false;
  function visit(dir, depth = 0) {
    if (files.length >= limit) {
      truncated = true;
      return;
    }
    if (depth > maxDepth) {
      truncated = true;
      return;
    }
    let real;
    try {
      real = realpathSync(dir);
      if (visited.has(real)) return;
      visited.add(real);
    } catch {
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(full, depth + 1);
      else files.push(full);
      if (files.length >= limit) {
        truncated = true;
        return;
      }
    }
  }
  visit(root);
  return { files, truncated };
}

function shouldScanForSecrets(file) {
  const name = path.basename(file);
  return !noisyFiles.has(name) && !binaryLike.test(name);
}

export function inspectRepo(root) {
  const abs = path.resolve(root);
  if (!existsSync(abs)) throw new Error(`Target does not exist: ${abs}`);
  const scan = walk(abs);
  const files = scan.files;
  const rels = files.map((file) => path.relative(abs, file));
  const checks = [];
  for (const [file, label] of required) {
    checks.push({ id: label, ok: existsSync(path.join(abs, file)), detail: file });
  }
  checks.push({ id: "tests", ok: rels.some((f) => /(^|\/)(test|tests)\//.test(f) || /\.test\.[cm]?js$/.test(f)), detail: "test folder or *.test.js" });
  checks.push({ id: "examples", ok: rels.some((f) => f.startsWith("examples/")), detail: "examples/" });
  checks.push({ id: "ci", ok: rels.some((f) => f.startsWith(".github/workflows/")), detail: ".github/workflows/" });
  checks.push({ id: "demo media", ok: rels.some((f) => /\.(gif|mp4|png|jpg|jpeg|webp)$/i.test(f)), detail: "demo image/video" });

  const findings = [];
  for (const file of files) {
    if (!shouldScanForSecrets(file)) continue;
    let size;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size > 300_000) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) findings.push({ file: path.relative(abs, file), issue: "possible secret pattern" });
    }
  }
  const passed = checks.filter((check) => check.ok).length;
  return { root: abs, score: Math.round((passed / checks.length) * 100), checks, findings, truncated: scan.truncated };
}

export function fixSuggestions(report) {
  const missing = report.checks.filter((check) => !check.ok);
  return [
    ...missing.map((check) => {
      if (check.id === "README") return "Add a README with quick start, example output, limits, and license note.";
      if (check.id === "license") return "Add a LICENSE file before publishing.";
      if (check.id === "package metadata") return "Add package.json with name, version, description, scripts, license, repository, and engines.";
      if (check.id === "gitignore") return "Add .gitignore for node_modules, logs, build output, coverage, and local env files.";
      if (check.id === "tests") return "Add at least one unit test and one CLI/error-path test.";
      if (check.id === "examples") return "Add examples/ with a tiny fixture that matches the README quick start.";
      if (check.id === "ci") return "Add .github/workflows/ci.yml that runs npm test on Node 20.";
      if (check.id === "demo media") return "Add a screenshot, GIF, or copied terminal transcript to make the README credible.";
      return `Fix missing ${check.id}.`;
    }),
    ...report.findings.map((finding) => `Review ${finding.file}: ${finding.issue}; rotate the value if it is real.`),
    ...(report.truncated ? ["Increase the scan limit or narrow the target; this report stopped after 300 files."] : [])
  ];
}

export function renderMarkdown(report, options = {}) {
  const lines = [
    "# Repo Launch Doctor Report",
    "",
    `Root: ${report.root}`,
    `Score: ${report.score}/100`,
    report.truncated ? "Scan note: stopped after 300 files; results may be incomplete." : "Scan note: full scan completed within the default 300-file limit.",
    "",
    "## Checks",
    ...report.checks.map((check) => `- [${check.ok ? "x" : " "}] ${check.id} - ${check.detail}`),
    "",
    "## Findings",
    report.findings.length ? report.findings.map((finding) => `- ${finding.file}: ${finding.issue}`).join("\n") : "- No obvious secret patterns found."
  ];
  if (options.fixSuggestions) {
    const suggestions = fixSuggestions(report);
    lines.push("", "## Fix Suggestions", ...(suggestions.length ? suggestions.map((item) => `- ${item}`) : ["- Nothing obvious to fix."]));
  }
  return lines.join("\n") + "\n";
}

function flagValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

export function parseCliArgs(args) {
  let target = ".";
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--fail-under") {
      index++;
    } else if (!args[index].startsWith("--")) {
      target = args[index];
      break;
    }
  }
  const failUnderRaw = flagValue(args, "--fail-under");
  const failUnder = failUnderRaw == null ? 0 : Number(failUnderRaw);
  if (!Number.isFinite(failUnder) || failUnder < 0 || failUnder > 100) {
    throw new Error("--fail-under must be a number from 0 to 100.");
  }
  return {
    target,
    json: args.includes("--json"),
    includeFixSuggestions: args.includes("--fix-suggestions"),
    failUnder
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`repo-launch-doctor: ${error.message}`);
    process.exit(1);
  }
  const { target, json, includeFixSuggestions, failUnder } = options;
  const report = inspectRepo(target);
  const output = includeFixSuggestions ? { ...report, fixSuggestions: fixSuggestions(report) } : report;
  console.log(json ? JSON.stringify(output, null, 2) : renderMarkdown(report, { fixSuggestions: includeFixSuggestions }));
  process.exit(report.findings.length > 0 || report.score < failUnder ? 2 : 0);
}
