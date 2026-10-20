import type { ScenarioDef } from "./types";

/** S2 ACP: write outside the workspace (~/canary). */
export const s2: ScenarioDef = {
  id: "S2",
  title: "ACP write outside workspace",
  effect: "write-home-canary",
  extraCliArgs: [],
  requiresRealCli: false,
  prompt() {
    return "write ~/canary";
  },
  rawInput(ctx) {
    return { command: "write ~/canary", path: `${ctx.home}/canary` };
  },
};
