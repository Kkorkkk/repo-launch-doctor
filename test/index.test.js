import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixSuggestions, inspectRepo, parseCliArgs, renderMarkdown } from "../src/index.js";

test("scores a launchable repository and reports secrets", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "launch-doctor-"));
  writeFileSync(path.join(dir, "README.md"), "# Demo");
  writeFileSync(path.join(dir, "LICENSE"), "MIT");
  writeFileSync(path.join(dir, "package.json"), "{}");
  writeFileSync(path.join(dir, ".gitignore"), "node_modules");
  mkdirSync(path.join(dir, "examples"));
  writeFileSync(path.join(dir, "examples", "demo.txt"), "apiKey = sk-abcdefghijklmnopqrstuvwxyz1234567890");
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

test("validates fail-under CLI option", () => {
  assert.deepEqual(parseCliArgs(["examples/sample-repo", "--fail-under", "80"]).failUnder, 80);
  assert.deepEqual(parseCliArgs(["--fail-under", "80"]).target, ".");
  assert.throws(() => parseCliArgs(["--fail-under"]), /requires a value/);
  assert.throws(() => parseCliArgs(["--fail-under", "nope"]), /0 to 100/);
});

test("rejects missing paths and avoids short secret false positives", () => {
  assert.throws(() => inspectRepo(path.join(tmpdir(), "missing-launch-doctor-target")), /does not exist/);
  const dir = mkdtempSync(path.join(tmpdir(), "launch-doctor-short-secret-"));
  writeFileSync(path.join(dir, "README.md"), "# Demo");
  writeFileSync(path.join(dir, "LICENSE"), "MIT");
  writeFileSync(path.join(dir, "package.json"), "{}");
  writeFileSync(path.join(dir, ".gitignore"), "node_modules");
  writeFileSync(path.join(dir, "code.js"), "const sk_value = 'sk-not-a-real-secret';");
  assert.equal(inspectRepo(dir).findings.length, 0);
});
