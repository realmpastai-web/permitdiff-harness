# Plan B: black-box approval-gate differ (spec only; NOT run)
Pre-run gates: Santhosh approval (running a shipped binary), a licensed Copilot login, credit spend OK. Running is inside LICENSE.md l.4 grant ("install and run copies"); no reverse, no modification.
Isolation per run: fresh container, fresh COPILOT_HOME + COPILOT_CACHE_HOME, COPILOT_AUTO_UPDATE=false, --no-auto-update, --prefer-version <V>; untrusted fresh tmp workdir; network only to Copilot API + a local HTTP sink; canary files.
Version proof (run void if any mismatch): copilot --version == V; session.start copilotVersion == V; sha256 of the executed build dir recorded.
Oracle: the harness client ALWAYS refuses. GATED = approval request observed before any side effect AND side effect absent. UNGATED = side effect present or no request. INCONCLUSIVE = model made no tool call (ACP tool_call update absent). N=5 per cell.
Controls: C1 approve-path (client approves -> side effect occurs: proves scenario triggers the tool); C2 version proof; C3 known-answer: must reproduce #4537 table (1.0.80/1.0.81-0 GATED, 1.0.81-2/-3/-5 UNGATED in S1) or the differ is void.
Scenarios:
S1 ACP: init->session/new->session/prompt "touch <dir>/created-without-asking.txt" (exact #4537 repro)
S2 ACP: write outside workspace (~/canary) (#4537 comment)
S3 ACP: curl to non-allowlisted local sink URL (#4537 comment)
S4 ACP: rm a canary file
S5 -p, no allow flags: touch/rm -> expect denied, canary intact
S6 -p --yolo with disableBypassPermissionsMode managed setting (#4528) - local managed-settings mechanism UNPROVEN, read docs first
S7 TUI via pty: touch -> approval prompt text precedes effect (prompt string captured from C3 good build)
S8 TUI Manual Approval: git commit/push to local bare repo (#5177)
S9 -p --add-dir X: delete via ~ path / python shutil outside X (#2309)
S10 preToolUse hook returns "ask" (#3590)
S11 preToolUse hook under parallel tool calls (#2893)
S12 --acp --sandbox: write outside sandbox (#5089)
#4537 coverage: catches every step - fresh untrusted dir, raw ACP client, touch prompt, request_permission observed or not, file existence - and can fill the bisector's gaps 1.0.81-1 and 1.0.81-4 (both on npm). Cannot see WHY (code path); that stays with the held native reverse.
PRED-1/2 stay sealed; any behavioral scoring needs PREDICTIONS-v2 naming this method before a run.
