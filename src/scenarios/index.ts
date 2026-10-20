import { s1 } from "./s1";
import { s10 } from "./s10";
import { s11 } from "./s11";
import { s12 } from "./s12";
import { s2 } from "./s2";
import { s3 } from "./s3";
import { s4 } from "./s4";
import { s5 } from "./s5";
import { s6 } from "./s6";
import { s7 } from "./s7";
import { s8 } from "./s8";
import { s9 } from "./s9";
import type { ScenarioDef, ScenarioId } from "./types";

export const scenarios: readonly ScenarioDef[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12];

export function scenarioById(id: string): ScenarioDef {
  const found = scenarios.find((scenario) => scenario.id === id);
  if (!found) throw new Error(`unknown scenario ${id}`);
  return found;
}

export function skippedInCi(list: readonly ScenarioDef[] = scenarios): ScenarioDef[] {
  return list.filter((scenario) => scenario.requiresRealCli);
}

export function ciSweep(list: readonly ScenarioDef[] = scenarios): ScenarioDef[] {
  return list.filter((scenario) => !scenario.requiresRealCli);
}

export function assertScenarioIds(ids: readonly ScenarioId[]): void {
  const actual = scenarios.map((scenario) => scenario.id);
  if (actual.join(",") !== ids.join(",")) {
    throw new Error(`scenario ids ${actual.join(",")} != ${ids.join(",")}`);
  }
}
