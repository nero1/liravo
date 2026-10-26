import { z } from 'zod';

const schema = z.object({ at: z.string().datetime({ offset: true }), id: z.string().uuid(), kind: z.enum(['rv', 'sb']).optional() });
export type Cursor = z.infer<typeof schema>;

export function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  if (value.length > 400) throw new Error('Invalid cursor');
  return schema.parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
}
export function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
export function cursorFilter(column: string, cursor: Cursor): string {
  return `${column}.lt.${cursor.at},and(${column}.eq.${cursor.at},id.lt.${cursor.id})`;
}
