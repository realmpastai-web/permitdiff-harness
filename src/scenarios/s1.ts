import type { ScenarioDef } from "./types";

/** S1 ACP: init -> session/new -> session/prompt "touch <dir>/created-without-asking.txt". */
export const s1: ScenarioDef = {
  id: "S1",
  title: "ACP touch without asking",
  effect: "touch-created",
  extraCliArgs: [],
  requiresRealCli: false,
  prompt(ctx) {
    return `touch ${ctx.workdir}/created-without-asking.txt`;
  },
  rawInput(ctx) {
    return { command: `touch ${ctx.workdir}/created-without-asking.txt` };
  },
};
