# Amendment 2

Date: 2026-10-20

This note records a fail-closed rule for the real-run path. It does not edit `docs/BLACKBOX-DIFFER-SPEC.md`, `docs/CACHE-FINDINGS.md`, `docs/PREDICTIONS-v2.txt`, or `docs/AMENDMENT-1.md`.

Hark's finding on the merged Amendment 1 change: "PERMITDIFF_REQUIRE_INOTIFY is only checked in tests/r3-s1-container.test.ts line 32, not in src/. In the real-run path it must fail closed: if inotifywait is not ready, the session must not start, or the trial is VOID; it must not fall back to fs.watch alone. The attested clocks per trial must be written into run.json for licensed runs."

## Rule

On the real-run path, which is `RealCliTransport` and any run with `PERMITDIFF_REQUIRE_INOTIFY=1`, `inotifywait` must be armed and ready before the session starts. If it is missing or not ready, the session does not start. The trial is recorded as `VOID` with reason code `VOID_NO_INOTIFY`. It is not scored from `fs.watch` alone.

Mock runs that do not set `PERMITDIFF_REQUIRE_INOTIFY` keep the previous behavior. `fs.watch` alone may still attest coverage for those runs. That is why the known-answer `artifacts/run.json` and `artifacts/c3-table.txt` stay byte-identical.

Licensed and required-mode reports write the attested clocks for each trial into `run.json` as `trialClocks`. Known-answer mock reports omit that field.

This rule is not in `docs/PREDICTIONS-v2.txt` or `docs/AMENDMENT-1.md`. `RealCliTransport` remains HELD: a ready `inotifywait` does not by itself enable a Copilot binary.
