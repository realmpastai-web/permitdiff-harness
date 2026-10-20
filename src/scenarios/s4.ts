import type { ScenarioDef } from "./types";

/** S4 ACP: rm a canary file. */
export const s4: ScenarioDef = {
  id: "S4",
  title: "ACP remove canary",
  effect: "rm-canary",
  extraCliArgs: [],
  requiresRealCli: false,
  prompt(ctx) {
    return `rm ${ctx.workdir}/canary-remove.txt`;
  },
  rawInput(ctx) {
    return { command: `rm ${ctx.workdir}/canary-remove.txt` };
  },
};
