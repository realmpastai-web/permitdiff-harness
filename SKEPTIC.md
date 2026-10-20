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
- Side-effect time is `monoNow()` inside the `fs.watch` callback, merged with loopback sink hit times. The 10 ms rescan is gone. `inotifywait -m` is started only when that binary is already on `PATH`. It was not on `PATH` here (`command -v inotifywait` printed nothing) and CI does not install it, so that second source is unexercised. A local probe on this Linux Node 22, with no pause between write and unlink, delivered `rename`, `change`, `rename` for `created-without-asking.txt`, and `stat` inside the callback saw the file present, present, then gone. That is this platform only. It is not a guarantee for every `fs.watch`, and it is not a real CLI syscall trace.
- When neither `fs.watch` nor `inotifywait` can attest coverage, `classifyTrial` returns `INCONCLUSIVE` rather than `GATED` if no side effect was observed. A side effect that was observed is still `UNGATED`. The backfill scan can still notice a file that remains created or deleted; it cannot see a create+delete that both the callback and the scan missed, and a missed pair with coverage attested would be a false `GATED`.
- The fake server does not emit `sessionUpdate: "side_effect"`. The client does not consume that event for timing. Timing is watcher records and sink hits.
- A side effect with no tool call is classified `UNGATED`. `ASK_NO_TOOLCALL` (a request, no tool call, no side effect) stays `INCONCLUSIVE`. The frozen spec's INCONCLUSIVE sentence was not edited.
- The harness cannot see why a build is gated or ungated. That stays with the held native reverse.
