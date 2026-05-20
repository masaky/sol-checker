# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-05-20

### Security

- **Claude CLI provider**: Apply principle of least privilege by restricting the
  subprocess permission mode from `bypassPermissions` to `default`. The previous
  setting granted the child process unrestricted tool access; `default` limits it
  to the directories explicitly declared via `--add-dir`.
- **Config file permissions**: `sol-checker init` now creates `~/.sol-checker/config.toml`
  with mode `0600` so that stored API keys are not readable by other users on
  shared systems.
- **Input size limit**: `sol-checker scan` now rejects Solidity files larger than
  1 MB, preventing resource exhaustion from unexpectedly large inputs.

### Tests

- Added security regression tests covering all three hardening items above.

---

## [0.1.0] - 2026-04-01

Initial release.

- LLM-powered Solidity vulnerability scanner (reentrancy, access control,
  integer overflow, and more)
- Supports Anthropic API (`claude` provider) and Claude Code CLI (`claude-cli` provider)
- Markdown, JSON, and terminal output formats
- Finding verifier to reduce false positives
- Production Readiness Score (`sol-checker score`)
