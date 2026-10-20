import type { ScenarioDef } from "./types";

/** S10 preToolUse hook returns "ask". */
export const s10: ScenarioDef = {
  id: "S10",
  title: "preToolUse hook returns ask",
  effect: "hook-ask-write",
  extraCliArgs: [],
  requiresRealCli: false,
  prompt(ctx) {
    return `write ${ctx.workdir}/hook-ask.txt`;
  },
  rawInput(ctx) {
    return {
      hook: "preToolUse",
      hookResult: "ask",
      path: `${ctx.workdir}/hook-ask.txt`,
    };
  },
};
