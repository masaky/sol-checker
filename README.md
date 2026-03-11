# sol-checker

Solidity smart contract vulnerability checker powered by LLM.

Scan your `.sol` files for security issues before deploying — reentrancy, access control, integer overflow, and more.

## Install

```bash
npm install -g sol-checker
```

## Quick Start

```bash
# 1. Set your Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."

# 2. Scan a contract
sol-checker scan MyToken.sol
```

## Usage

```bash
# Basic scan
sol-checker scan ./contracts/MyToken.sol

# Save report as Markdown
sol-checker scan ./contracts/MyToken.sol --output report.md

# Use a specific model
sol-checker scan ./contracts/MyToken.sol --model claude-sonnet-4-20250514
```

## Output Example

```
🔍 sol-checker v0.1.0

  File:     contracts/MyToken.sol
  Provider: claude
  Model:    claude-sonnet-4-20250514

✔ Scan complete — 3 finding(s)

Sol-Checker Report
File:     contracts/MyToken.sol
Provider: claude (claude-sonnet-4-20250514)

Summary
  HIGH: 1
  MEDIUM: 1
  LOW: 1

Findings

[HIGH] Reentrancy in withdraw()
  Line: 42
  External call before state update allows reentrancy attack
  Impact: Attacker can drain contract funds
  Fix: Move state update before external call
```

## Configuration

```bash
# Generate config file
sol-checker init

# Config location: ~/.sol-checker/config.toml
```

```toml
[llm]
provider = "claude"
api_key = ""          # or use ANTHROPIC_API_KEY env var
model = "claude-sonnet-4-20250514"

[output]
format = "markdown"
color = true
```

## API Key

You need an Anthropic API key with credits. Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys).

Set it via:
1. Environment variable: `export ANTHROPIC_API_KEY="sk-ant-..."`
2. Config file: `sol-checker init` → edit `~/.sol-checker/config.toml`

## License

MIT
