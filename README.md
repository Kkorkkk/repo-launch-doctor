# Repo Launch Doctor

Run a practical GitHub launch check before you publish a repository.

## Quick start

```bash
npm install
npm test
node src/index.js .
node src/index.js . --json
node src/index.js . --fail-under 80
```

## What it checks

- README, license, package metadata, gitignore, CI, tests, examples, screenshots or demos.
- Common secret patterns before you accidentally upload them.
- A scored Markdown or JSON report you can paste into a launch issue.

## Example

```bash
node src/index.js examples/sample-repo
```
