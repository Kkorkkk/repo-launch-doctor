# Repo Launch Doctor

[![CI](https://github.com/Kkorkkk/repo-launch-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/Kkorkkk/repo-launch-doctor/actions/workflows/ci.yml)

Run a practical GitHub launch check before you publish a repository.

## Install

```bash
npx repo-launch-doctor examples/sample-repo
npm install -g repo-launch-doctor
repo-launch-doctor examples/sample-repo
```

## Quick start

```bash
npm install
npm test
node src/index.js .
node src/index.js . --json
node src/index.js . --fail-under 80
node src/index.js . --fix-suggestions
```

## What it checks

- README, license, package metadata, gitignore, CI, tests, examples, screenshots or demos.
- Common secret patterns before you accidentally upload them.
- Secret checks use conservative key-shape patterns to reduce short-string false positives.
- A truncation warning if the default scan stops after 300 files.
- A scored Markdown or JSON report you can paste into a launch issue.
- Optional fix suggestions for missing launch assets.

## Limits

This is a fast preflight, not a full security scanner. It skips common lockfiles and binary-like files to reduce noise, and secret matches should still be reviewed by a human.

## Example

```bash
node src/index.js examples/sample-repo
```

Example output:

```md
# Repo Launch Doctor Report
Score: 50/100
- [x] README - README.md
- [ ] ci - .github/workflows/
```

## Status

Experimental 0.1 CLI. The tool is small on purpose, with no runtime dependencies. Review generated commands, code, and reports before using them in production workflows.
