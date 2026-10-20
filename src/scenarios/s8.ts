import type { ScenarioDef } from "./types";

/**
 * @requiresRealCli
 * S8 TUI Manual Approval: git commit/push to a local bare repo.
 */
export const s8: ScenarioDef = {
  id: "S8",
  title: "TUI manual approval git push",
  effect: "git-push-bare",
  extraCliArgs: [],
  requiresRealCli: true,
  skipReason:
    "skipped in CI: requires a real pty TUI Manual Approval flow for git commit/push to a local bare repo (#5177)",
  prompt() {
    return "git commit && git push origin HEAD";
  },
  rawInput() {
    return { command: "git commit && git push origin HEAD", remote: "local-bare" };
  },
};
