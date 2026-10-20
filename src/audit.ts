/** Commands this process actually spawned. The mock harness never records a Copilot binary. */
const spawned: string[] = [];

export function recordSpawn(command: string): void {
  spawned.push(command);
}

export function spawnAudit(): readonly string[] {
  return spawned;
}

export function copilotSpawns(): readonly string[] {
  return spawned.filter((command) => /copilot/i.test(command) || command.includes("@github/copilot"));
}
