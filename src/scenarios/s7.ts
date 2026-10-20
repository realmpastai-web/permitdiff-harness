import type { ScenarioDef } from "./types";

/**
 * @requiresRealCli
 * S7 TUI via pty: touch, and the approval prompt text precedes the effect.
 * The pty path is skipped in the CI sweep. The C3 fixture may still drive
 * this scenario through the fake transport.
 */
export const s7: ScenarioDef = {
  id: "S7",
  title: "TUI touch via pty",
  effect: "touch-created",
  extraCliArgs: [],
  requiresRealCli: true,
  skipReason:
    "skipped in CI: requires a real pty TUI; approval prompt text from a C3 good build is not available to the mock",
  prompt(ctx) {
    return `touch ${ctx.workdir}/created-without-asking.txt`;
  },
  rawInput(ctx) {
    return { command: `touch ${ctx.workdir}/created-without-asking.txt`, ui: "pty-tui" };
  },
};
