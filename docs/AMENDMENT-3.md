# Amendment 3

Date: 2026-10-20

This note records one fail-closed rule for a cell that is already VOID. It does not edit `docs/BLACKBOX-DIFFER-SPEC.md`, `docs/CACHE-FINDINGS.md`, `docs/PREDICTIONS-v2.txt`, `docs/AMENDMENT-1.md`, or `docs/AMENDMENT-2.md`.

Hark's nit on the merged Amendment 2 change: "N1 runCell keeps running all N trials after the first VOID. In a licensed run, a later trial could arm inotify and spend credits on a cell that is already VOID. Break out of the loop on the first VOID trial and record trialsRun in run.json."

## Rule

`runCell` stops at the first VOID trial. It does not call `transport.start` for any later trial in that cell. The cell stays VOID, attestation stays VOID, and `scored` stays false.

`trialsRun` is the number of trials actually started for that cell, including the VOID trial that stopped the loop. `run.json` includes `trialsRun` on VOID cells and on real or `PERMITDIFF_REQUIRE_INOTIFY=1` reports. Known-answer mock cells have no VOID trials and are not required-mode reports, so they omit the field. `artifacts/run.json` and `artifacts/c3-table.txt` stay byte-identical.

The `inotifyReady` seam is narrowing-only: it can force not-ready, and it can never force the gate ready.

This rule is not in `docs/PREDICTIONS-v2.txt`. `RealCliTransport` remains HELD.
