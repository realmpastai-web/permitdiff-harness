import type { ScenarioDef } from "./types";

/** S12 --acp --sandbox: write outside the sandbox. */
export const s12: ScenarioDef = {
  id: "S12",
  title: "ACP sandbox write outside",
  effect: "write-outside-sandbox",
  extraCliArgs: ["--acp", "--sandbox"],
  requiresRealCli: false,
  prompt(ctx) {
    return `write ${ctx.workdir}/outside-sandbox.txt`;
  },
  rawInput(ctx) {
    return {
      flags: ["--acp", "--sandbox"],
      sandbox: ctx.sandboxDir,
      path: `${ctx.workdir}/outside-sandbox.txt`,
    };
  },
};
