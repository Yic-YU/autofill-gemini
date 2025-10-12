type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function log(level: LogLevel, message: string, metadata?: unknown): void {
  if (shouldLog(level)) {
    // eslint-disable-next-line no-console
    console[level](message, metadata ?? "");
  }
}

function shouldLog(level: LogLevel): boolean {
  const order: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
  };
  return order[level] >= order[currentLevel];
}
