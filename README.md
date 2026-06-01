# Repo Launch Doctor

Run a practical GitHub launch check before you publish a repository.

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
- A truncation warning if the default scan stops after 300 files.
- A scored Markdown or JSON report you can paste into a launch issue.
- Optional fix suggestions for missing launch assets.

## Limits

This is a fast preflight, not a full security scanner. It skips common lockfiles and binary-like files to reduce noise, and secret matches should still be reviewed by a human.

## Example

```bash
node src/index.js examples/sample-repo
```
