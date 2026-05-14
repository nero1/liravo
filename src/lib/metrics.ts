export type MetricLevel = 'info' | 'warn' | 'error';

export function recordMetric(name: string, fields: Record<string, unknown>, level: MetricLevel = 'info') {
  const payload = {
    metric: name,
    ts: new Date().toISOString(),
    ...fields,
  };

  // Bugfix: structured metrics logging for forensic/operational visibility on critical financial routes.
  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.info(JSON.stringify(payload));
}
