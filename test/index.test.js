import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixSuggestions, inspectRepo, renderMarkdown } from "../src/index.js";

test("scores a launchable repository and reports secrets", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "launch-doctor-"));
  writeFileSync(path.join(dir, "README.md"), "# Demo");
  writeFileSync(path.join(dir, "LICENSE"), "MIT");
  writeFileSync(path.join(dir, "package.json"), "{}");
  writeFileSync(path.join(dir, ".gitignore"), "node_modules");
  mkdirSync(path.join(dir, "examples"));
  writeFileSync(path.join(dir, "examples", "demo.txt"), "apiKey = sk-thislookssecretbutfake123456");
  const report = inspectRepo(dir);
  assert.equal(report.checks.find((check) => check.id === "README").ok, true);
  assert.equal(report.findings.length >= 1, true);
  assert.match(renderMarkdown(report), /Score:/);
  assert.match(renderMarkdown(report, { fixSuggestions: true }), /Fix Suggestions/);
  assert.equal(fixSuggestions(report).some((item) => /workflow|CI/i.test(item)), true);
});

test("skips noisy lockfiles during secret scanning", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "launch-doctor-lock-"));
  writeFileSync(path.join(dir, "README.md"), "# Demo");
  writeFileSync(path.join(dir, "LICENSE"), "MIT");
  writeFileSync(path.join(dir, "package.json"), "{}");
  writeFileSync(path.join(dir, ".gitignore"), "node_modules");
  writeFileSync(path.join(dir, "package-lock.json"), "token = sk-thislookssecretbutfake123456");
  const report = inspectRepo(dir);
  assert.equal(report.findings.length, 0);
});
