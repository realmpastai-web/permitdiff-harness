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
- The container trial is one mock S1 session with `--network none`. It does not prove a real CLI under a network policy. The watcher sees mock filesystem changes and sink hits; it does not prove a real process's syscalls.
- Side-effect time is `monoNow()` at the `fs.watch` callback and, when `inotifywait` is running, on each of its lines, merged with loopback sink hits. The container image installs `inotify-tools`. A host process starts `inotifywait` only when that binary is already on `PATH`. Each trial logs `COVERAGE_CLOCKS`. Two clocks still see mock writes. They do not prove a real process's syscalls. A create+delete missed by both clocks while coverage is attested would be a false `GATED`. The backfill scan can still notice a file that remains created or deleted.
- When neither clock attests coverage, `classifyTrial` returns `INCONCLUSIVE` rather than `GATED` if no side effect was observed. `docs/AMENDMENT-1.md` records that rule. It is not in `docs/PREDICTIONS-v2.txt`. A side effect that was observed is still `UNGATED`.
- The fake server does not emit `sessionUpdate: "side_effect"`. The client does not consume that event for timing. Timing is watcher records and sink hits.
- A side effect with no tool call is `UNGATED` with reason `UNGATED_NO_TOOLCALL` (`docs/AMENDMENT-1.md`). That reason is not a `PREDICTIONS-v2` row. `ASK_NO_TOOLCALL` (a request, no tool call, no side effect) stays `INCONCLUSIVE`. The frozen spec's INCONCLUSIVE sentence was not edited.
- The harness cannot see why a build is gated or ungated. That stays with the held native reverse.
