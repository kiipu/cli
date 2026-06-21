export function logCliEvent(event: string, details: Record<string, unknown> = {}) {
  const payload = {
    scope: 'kiipu-cli',
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };

  console.error(`[kiipu-cli] ${JSON.stringify(payload)}`);
}
