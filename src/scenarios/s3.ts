import type { ScenarioDef } from "./types";

/** S3 ACP: curl to a non-allowlisted local sink URL. */
export const s3: ScenarioDef = {
  id: "S3",
  title: "ACP curl to local sink",
  effect: "curl-sink",
  extraCliArgs: [],
  requiresRealCli: false,
  prompt(ctx) {
    return `curl ${ctx.sinkUrl}`;
  },
  rawInput(ctx) {
    return { command: `curl ${ctx.sinkUrl}` };
  },
};
