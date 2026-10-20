# Skeptic

This harness does not prove real Copilot CLI behaviour. Nothing here logged in, spent credits, or executed a Copilot binary.

- The C3 table is reproduced because `fixtures/known-answer-4537.json` tells the fake server which cells are GATED. The classifier then reads permission and side-effect observations. That checks the pipeline. It does not discover the table from a shipped build.
- S6, S7, and S8 are skipped in the CI sweep. S6 needs a real managed-settings file (`disableBypassPermissionsMode` is UNPROVEN in the spec). S7 and S8 need a real pty TUI. The S7 row in the known-answer artifact is the fake transport, not a pty session.
- The S7 approval-prompt string is the constant `MOCK_APPROVAL_PROMPT`. It was not captured from a C3 good build.
- S5's spec expectation is "denied, canary intact". The known-answer fixture does not mark S5 GATED, so the fake server performs touch/rm. The mock does not establish that denial.
- S10 and S11 put `preToolUse` / `ask` on the tool-call payload. The fixture does not mark those cells GATED, so the mock does not request permission for them.
- BPRED-6 through BPRED-9 in `docs/PREDICTIONS-v2.txt` are not scored. The file is a sealed holdout and was not edited.
- The #4402 / #4534 disagreement about `COPILOT_AUTO_UPDATE` is unresolved. The mock returns `--prefer-version`; it does not show which flag a real binary obeys.
- The build-dir sha256 is the hash of `fixtures/`, not of a Copilot package directory. `copilot --version` is the prefer-version argument, not a binary's stdout.
- The ACP messages are the methods named in the spec. They are not a claim of wire compatibility with a production ACP schema.
- CI does not build the container image, so there is no image-build log. The Dockerfile is inspected as text. The only HTTP client in the mock refuses every host other than `127.0.0.1`; that is not a trace of a real process's sockets.
- The harness cannot see why a build is gated or ungated. That stays with the held native reverse.
