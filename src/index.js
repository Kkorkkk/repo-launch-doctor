#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const required = [
  ["README.md", "README"],
  ["LICENSE", "license"],
  ["package.json", "package metadata"],
  [".gitignore", "gitignore"]
];

const secretPatterns = [
  /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{18,}/i,
  /secret\s*[:=]\s*['"]?[A-Za-z0-9_\-]{18,}/i,
  /token\s*[:=]\s*['"]?[A-Za-z0-9_\-]{18,}/i,
  /xai-[A-Za-z0-9_\-]{20,}/i,
  /sk-[A-Za-z0-9_\-]{20,}/i
];

const noisyFiles = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const binaryLike = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|mp4|mov|woff2?|ttf)$/i;

function walk(root, limit = 300) {
  const files = [];
  const ignored = new Set(["node_modules", ".git", "dist", "coverage"]);
  let truncated = false;
  function visit(dir) {
    if (files.length >= limit) {
      truncated = true;
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
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
  const scan = existsSync(abs) ? walk(abs) : { files: [], truncated: false };
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
    let size = statSync(file).size;
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] || ".";
  const json = process.argv.includes("--json");
  const includeFixSuggestions = process.argv.includes("--fix-suggestions");
  const failUnderIndex = process.argv.indexOf("--fail-under");
  const failUnder = failUnderIndex > -1 ? Number(process.argv[failUnderIndex + 1]) : 0;
  const report = inspectRepo(target);
  const output = includeFixSuggestions ? { ...report, fixSuggestions: fixSuggestions(report) } : report;
  console.log(json ? JSON.stringify(output, null, 2) : renderMarkdown(report, { fixSuggestions: includeFixSuggestions }));
  process.exit(report.findings.length || report.score < failUnder ? 2 : 0);
}
