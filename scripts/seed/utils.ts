export interface SeedResult {
  inserted: number;
  skipped: number;
  errors: string[];
  repaired?:number;
  pending?:number;
}

export const isDryRun = process.argv.includes('--dry-run');

export function getOnlyFlag(): string | null {
  const flag = process.argv.find((a) => a.startsWith('--only='));
  return flag ? flag.replace('--only=', '') : null;
}

export async function step<T extends SeedResult>(label: string, fn: () => Promise<T>): Promise<T> {
  process.stdout.write(`  ${label}...`);
  try {
    const result = await fn();
    const parts: string[] = [];
    if (result.inserted > 0) parts.push(`${result.inserted} inserted`);
    if (result.repaired) parts.push(`${result.repaired} repaired`);
    if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
    const summary = parts.length ? ` (${parts.join(', ')})` : '';
    console.log(` ${result.errors.length?'incomplete':'done'}${summary}`);
    if (result.errors.length > 0) {
      result.errors.forEach((e) => console.warn(`    WARN: ${e}`));
      throw new Error('Seed incomplete; retry after resolving the reported errors');
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(` FAILED: ${msg}`);
    throw err;
  }
}

export function dryLog(action: string, count: number) {
  console.log(`  [dry-run] Would ${action}: ${count} record(s)`);
}
