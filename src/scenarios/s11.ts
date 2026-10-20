import type { ScenarioDef } from "./types";

/** S11 preToolUse hook under parallel tool calls. */
export const s11: ScenarioDef = {
  id: "S11",
  title: "preToolUse hook under parallel tool calls",
  effect: "parallel-writes",
  extraCliArgs: [],
  requiresRealCli: false,
  prompt(ctx) {
    return `write ${ctx.workdir}/parallel-a.txt and ${ctx.workdir}/parallel-b.txt`;
  },
  rawInput(ctx) {
    return {
      hook: "preToolUse",
      hookResult: "ask",
      parallel: true,
      paths: [`${ctx.workdir}/parallel-a.txt`, `${ctx.workdir}/parallel-b.txt`],
    };
  },
};
