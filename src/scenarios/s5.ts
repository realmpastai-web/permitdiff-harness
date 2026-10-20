import type { ScenarioDef } from "./types";

/** S5 -p with no allow flags: touch/rm, spec expects denied and the canary intact. */
export const s5: ScenarioDef = {
  id: "S5",
  title: "prompt with no allow flags",
  effect: "touch-and-rm",
  extraCliArgs: ["-p"],
  requiresRealCli: false,
  prompt(ctx) {
    return `touch ${ctx.workdir}/created-without-asking.txt && rm ${ctx.workdir}/canary-remove.txt`;
  },
  rawInput(ctx) {
    return {
      command: `touch ${ctx.workdir}/created-without-asking.txt && rm ${ctx.workdir}/canary-remove.txt`,
      allowFlags: [],
    };
  },
};
