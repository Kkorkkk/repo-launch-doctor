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

function walk(root, limit = 300) {
  const files = [];
  const ignored = new Set(["node_modules", ".git", "dist", "coverage"]);
  function visit(dir) {
    if (files.length >= limit) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(full);
      if (files.length >= limit) return;
    }
  }
  visit(root);
  return files;
}

export function inspectRepo(root) {
  const abs = path.resolve(root);
  const files = existsSync(abs) ? walk(abs) : [];
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
    let size = statSync(file).size;
    if (size > 300_000) continue;
    const text = readFileSync(file, "utf8");
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) findings.push({ file: path.relative(abs, file), issue: "possible secret pattern" });
    }
  }
  const passed = checks.filter((check) => check.ok).length;
  return { root: abs, score: Math.round((passed / checks.length) * 100), checks, findings };
}

export function renderMarkdown(report) {
  const lines = [
    "# Repo Launch Doctor Report",
    "",
    `Root: ${report.root}`,
    `Score: ${report.score}/100`,
    "",
    "## Checks",
    ...report.checks.map((check) => `- [${check.ok ? "x" : " "}] ${check.id} - ${check.detail}`),
    "",
    "## Findings",
    report.findings.length ? report.findings.map((finding) => `- ${finding.file}: ${finding.issue}`).join("\n") : "- No obvious secret patterns found."
  ];
  return lines.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] || ".";
  const json = process.argv.includes("--json");
  const failUnderIndex = process.argv.indexOf("--fail-under");
  const failUnder = failUnderIndex > -1 ? Number(process.argv[failUnderIndex + 1]) : 0;
  const report = inspectRepo(target);
  console.log(json ? JSON.stringify(report, null, 2) : renderMarkdown(report));
  process.exit(report.findings.length || report.score < failUnder ? 2 : 0);
}
