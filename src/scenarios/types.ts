import type { EffectKind, RunContext } from "../effects";

export type ScenarioId =
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7"
  | "S8"
  | "S9"
  | "S10"
  | "S11"
  | "S12";

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  effect: EffectKind;
  extraCliArgs: readonly string[];
  requiresRealCli: boolean;
  skipReason?: string;
  prompt: (ctx: RunContext) => string;
  rawInput: (ctx: RunContext) => Record<string, unknown>;
}
