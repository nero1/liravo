import { buildPgProjection } from './relations';
import type { PendingQuery, Row, ParameterOrJSON, SerializableParameter } from 'postgres';
import { getSql } from './pg';

type QueryResult<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number };

function queryError(error: unknown): { message: string; code?: string } {
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String(error.message), ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}) };
  }
  return { message: String(error) };
}

type FilterOp = { col: string; op: string; val: unknown };

type MutationType = 'insert' | 'update' | 'delete' | 'upsert';

interface MutationState {
  type: MutationType;
  data?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  ignoreDuplicates?: boolean;
  returning: boolean;
}

export class PgQueryBuilder<T = Record<string, unknown>> {
  private _table: string;
  private _selectCols: string = '*';
  private _filters: FilterOp[] = [];
  private _orFragment: unknown = null;
  private _orderCol: string | null = null;
  private _orders: Array<{ column: string; ascending: boolean }> = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _isSingle: boolean = false;
  private _isMaybeSingle: boolean = false;
  private _countOnly: boolean = false;
  private _head: boolean = false;
  private _mutation: MutationState | null = null;

  constructor(table: string) {
    this._table = table;
  }

  select(columns: string = '*', options?: { count?: 'exact'; head?: boolean }) {
    this._selectCols = columns;
    if (this._mutation) this._mutation.returning = true;
    if (options?.count === 'exact') this._countOnly = true;
    if (options?.head) this._head = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this._filters.push({ col: column, op: '=', val: value });
    return this;
  }

  neq(column: string, value: unknown) {
    this._filters.push({ col: column, op: '!=', val: value });
    return this;
  }

  gt(column: string, value: unknown) {
    this._filters.push({ col: column, op: '>', val: value });
    return this;
  }

  gte(column: string, value: unknown) {
    this._filters.push({ col: column, op: '>=', val: value });
    return this;
  }

  lt(column: string, value: unknown) {
    this._filters.push({ col: column, op: '<', val: value });
    return this;
  }

  lte(column: string, value: unknown) {
    this._filters.push({ col: column, op: '<=', val: value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this._filters.push({ col: column, op: 'IN', val: values });
    return this;
  }

  is(column: string, value: null | boolean) {
    this._filters.push({ col: column, op: 'IS', val: value });
    return this;
  }

  not(column: string, operator: string, value: null | boolean) {
    if (operator !== 'is') throw new Error('Unsupported negated filter');
    this._filters.push({ col: column, op: 'IS NOT', val: value });
    return this;
  }

  contains(column: string, value: unknown[] | Record<string, unknown>) {
    this._filters.push({ col: column, op: '@>', val: value });
    return this;
  }

  ilike(column: string, pattern: string) {
    this._filters.push({ col: column, op: 'ILIKE', val: pattern });
    return this;
  }

  or(filter: string) {
    this._orFragment = filter;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this._orderCol = column;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) throw new Error('Invalid sort column');
    this._orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this._limit = count;
    return this;
  }

  range(from: number, to: number) {
    this._offset = from;
    this._limit = to - from + 1;
    return this;
  }

  single() {
    this._isSingle = true;
    return this;
  }

  maybeSingle() {
    this._isMaybeSingle = true;
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this._mutation = { type: 'insert', data, returning: false };
    return this;
  }

  update(data: Record<string, unknown>) {
    this._mutation = { type: 'update', data, returning: false };
    return this;
  }

  delete() {
    this._mutation = { type: 'delete', returning: false };
    return this;
  }

  upsert(
    data: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean }
  ) {
    this._mutation = {
      type: 'upsert',
      data,
      onConflict: options?.onConflict,
      ignoreDuplicates: options?.ignoreDuplicates,
      returning: false,
    };
    return this;
  }

  // .select() chained after insert/update → RETURNING *
  // We overload the terminal select for post-mutation RETURNING
  returning() {
    if (this._mutation) this._mutation.returning = true;
    return this;
  }

  private buildWhere() {
    const sql = getSql();
    const parts: PendingQuery<Row[]>[] = [];

    for (const f of this._filters) {
      switch (f.op) {
        case '=':   parts.push(sql`${sql(f.col)} = ${f.val as SerializableParameter<never>}`); break;
        case '!=':  parts.push(sql`${sql(f.col)} != ${f.val as SerializableParameter<never>}`); break;
        case '>':   parts.push(sql`${sql(f.col)} > ${f.val as SerializableParameter<never>}`); break;
        case '>=':  parts.push(sql`${sql(f.col)} >= ${f.val as SerializableParameter<never>}`); break;
        case '<':   parts.push(sql`${sql(f.col)} < ${f.val as SerializableParameter<never>}`); break;
        case '<=':  parts.push(sql`${sql(f.col)} <= ${f.val as SerializableParameter<never>}`); break;
        case 'IN':  parts.push(sql`${sql(f.col)} = ANY(${f.val as SerializableParameter<never>[]})`); break;
        case '@>': parts.push(sql`${sql(f.col)} @> ${f.val as SerializableParameter<never>}`); break;
        case 'ILIKE': parts.push(sql`${sql(f.col)} ILIKE ${f.val as string}`); break;
        case 'IS NOT':
          if (f.val === null) parts.push(sql`${sql(f.col)} IS NOT NULL`);
          else if (f.val === true) parts.push(sql`${sql(f.col)} IS NOT TRUE`);
          else if (f.val === false) parts.push(sql`${sql(f.col)} IS NOT FALSE`);
          break;
        case 'IS':
          if (f.val === null)       parts.push(sql`${sql(f.col)} IS NULL`);
          else if (f.val === true)  parts.push(sql`${sql(f.col)} IS TRUE`);
          else if (f.val === false) parts.push(sql`${sql(f.col)} IS FALSE`);
          break;
      }
    }

    if (this._orFragment) {
      parts.push(sql`(${sql.unsafe(this._buildOrSql(this._orFragment as string))})`);
    }

    if (parts.length === 0) return sql``;
    return parts.reduce((acc, cur) => sql`${acc} AND ${cur}`);
  }

  private _buildOrSql(filter: string): string {
    const split = (value: string) => {
      const parts: string[] = [];
      let depth = 0, start = 0;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '(') depth++;
        if (value[i] === ')') depth--;
        if (depth < 0) throw new Error('Invalid filter');
        if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
      }
      if (depth !== 0) throw new Error('Invalid filter');
      return [...parts, value.slice(start)];
    };
    const parse = (part: string): string => {
      const group = part.match(/^(and|or)\((.*)\)$/);
      if (group) return `(${split(group[2]).map(parse).join(group[1] === 'and' ? ' AND ' : ' OR ')})`;
      const [column, op, ...rest] = part.split('.');
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) throw new Error('Invalid filter column');
      const value = rest.join('.');
      const operators: Record<string, string> = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      if (op === 'is' && ['null','true','false'].includes(value)) return `"${column}" IS ${value.toUpperCase()}`;
      if (!operators[op]) throw new Error('Invalid filter operator');
      return `"${column}" ${operators[op]} '${value.replace(/'/g, "''")}'`;
    };
    return split(filter).map(parse).join(' OR ');
  }

  private mutationResult(rows: Row[]): QueryResult<T> {
    if ((this._isSingle && rows.length !== 1) || (this._isMaybeSingle && rows.length > 1)) {
      return { data: null, error: { message: 'Expected one row', code: 'PGRST116' } };
    }
    return { data: (this._isSingle || this._isMaybeSingle ? rows[0] ?? null : rows) as T, error: null };
  }

  async execute(): Promise<QueryResult<T>> {
    const sql = getSql();
    try {
      if (this._mutation) {
        return await this._executeMutation(sql);
      }

      let count: number | undefined;
      if (this._countOnly) {
        const where = this.buildWhere();
        const hasWhere = this._filters.length > 0 || this._orFragment;
        const rows = hasWhere
          ? await sql`SELECT COUNT(*) AS count FROM ${sql(this._table)} WHERE ${where}`
          : await sql`SELECT COUNT(*) AS count FROM ${sql(this._table)}`;
        count = parseInt(rows[0]?.count ?? '0', 10);
        if (this._head) return { data: null, error: null, count };
      }

      const selectExpr = await buildPgProjection(sql, this._table, this._selectCols);
      const hasWhere = this._filters.length > 0 || this._orFragment;
      const where = this.buildWhere();

      let query: unknown;

      if (hasWhere) {
        if (this._orderCol && this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} WHERE ${where} ORDER BY ${sql.unsafe(this._orders.map(o => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', '))} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._orderCol && this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} WHERE ${where} ORDER BY ${sql.unsafe(this._orders.map(o => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', '))} LIMIT ${this._limit}`;
        } else if (this._orderCol) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} WHERE ${where} ORDER BY ${sql.unsafe(this._orders.map(o => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', '))}`;
        } else if (this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} WHERE ${where} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} WHERE ${where} LIMIT ${this._limit}`;
        } else {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} WHERE ${where}`;
        }
      } else {
        if (this._orderCol && this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} ORDER BY ${sql.unsafe(this._orders.map(o => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', '))} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._orderCol && this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} ORDER BY ${sql.unsafe(this._orders.map(o => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', '))} LIMIT ${this._limit}`;
        } else if (this._orderCol) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} ORDER BY ${sql.unsafe(this._orders.map(o => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', '))}`;
        } else if (this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)} LIMIT ${this._limit}`;
        } else {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}`;
        }
      }

      const rows = await (query as ReturnType<typeof sql>);

      if (this._head) return { data: null, error: null };
      if (this._isSingle) {
        if (rows.length !== 1) return { data: null, error: { message: 'Expected one row', code: 'PGRST116' } };
        return { data: rows[0] as T, error: null, count };
      }
      if (this._isMaybeSingle) {
        if (rows.length > 1) return { data: null, error: { message: 'Expected at most one row', code: 'PGRST116' } };
        return { data: rows.length > 0 ? rows[0] as T : null, error: null, count };
      }
      return { data: rows as unknown as T, error: null, count };
    } catch (err) {
      return { data: null, error: queryError(err) };
    }
  }

  private async _executeMutation(sql: ReturnType<typeof getSql>): Promise<QueryResult<T>> {
    const m = this._mutation!;
    const returning = m.returning ? await buildPgProjection(sql, this._table, this._selectCols) : '';
    const hasWhere = this._filters.length > 0 || this._orFragment;
    const where = this.buildWhere();

    try {
      switch (m.type) {
        case 'insert': {
          const rows = Array.isArray(m.data) ? m.data : [m.data!];
          if (m.returning) {
            const result = await sql`INSERT INTO ${sql(this._table)} ${sql(rows)} RETURNING ${sql.unsafe(returning)}`;
            return this.mutationResult(result);
          }
          await sql`INSERT INTO ${sql(this._table)} ${sql(rows)}`;
          return { data: null, error: null };
        }

        case 'upsert': {
          const rows = Array.isArray(m.data) ? m.data : [m.data!];
          const keys = Object.keys(rows[0]);
          const conflictCols = m.onConflict
            ? m.onConflict.split(',').map((c) => c.trim())
            : [keys[0]];
          const updateCols = keys.filter((k) => !conflictCols.includes(k));

          // Build conflict and SET clauses using double-quoted identifiers.
          // Column names come from application data objects, not user input.
          const safeId = (c: string) => `"${c.replace(/[^a-zA-Z0-9_]/g, '')}"`;
          const conflictExpr = conflictCols.map(safeId).join(', ');
          const updateExpr = !m.ignoreDuplicates && updateCols.length > 0
            ? `DO UPDATE SET ${updateCols.map((c) => `${safeId(c)} = EXCLUDED.${safeId(c)}`).join(', ')}`
            : 'DO NOTHING';

          if (m.returning) {
            const result = await sql.unsafe(
              `INSERT INTO "${this._table}" (${keys.map(safeId).join(', ')}) VALUES (${rows.map((_, i) => keys.map((k, j) => `$${i * keys.length + j + 1}`).join(', ')).join('), (')}) ON CONFLICT (${conflictExpr}) ${updateExpr} RETURNING ${returning}`,
              rows.flatMap((r) => keys.map((k) => r[k])) as ParameterOrJSON<never>[]
            );
            return this.mutationResult(result);
          }
          await sql.unsafe(
            `INSERT INTO "${this._table}" (${keys.map(safeId).join(', ')}) VALUES (${rows.map((_, i) => keys.map((k, j) => `$${i * keys.length + j + 1}`).join(', ')).join('), (')}) ON CONFLICT (${conflictExpr}) ${updateExpr}`,
            rows.flatMap((r) => keys.map((k) => r[k])) as ParameterOrJSON<never>[]
          );
          return { data: null, error: null };
        }

        case 'update': {
          if (!hasWhere) throw new Error('update() requires at least one filter');
          if (m.returning) {
            const result = await sql`UPDATE ${sql(this._table)} SET ${sql(m.data as Record<string, unknown>)} WHERE ${where} RETURNING ${sql.unsafe(returning)}`;
            return this.mutationResult(result);
          }
          await sql`UPDATE ${sql(this._table)} SET ${sql(m.data as Record<string, unknown>)} WHERE ${where}`;
          return { data: null, error: null };
        }

        case 'delete': {
          if (!hasWhere) throw new Error('delete() requires at least one filter');
          if (m.returning) {
            const result = await sql`DELETE FROM ${sql(this._table)} WHERE ${where} RETURNING ${sql.unsafe(returning)}`;
            return this.mutationResult(result);
          }
          await sql`DELETE FROM ${sql(this._table)} WHERE ${where}`;
          return { data: null, error: null };
        }
      }
    } catch (err) {
      return { data: null, error: queryError(err) };
    }
    return { data: null, error: null };
  }

  // Thenable — allows `await builder` without explicit .execute()
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

}

export function getPgQueryBuilderFactory() {
  return {
    from<T = Record<string, unknown>>(table: string) {
      return new PgQueryBuilder<T>(table);
    },
    async rpc<T = Record<string, unknown>>(
      fnName: string,
      params?: Record<string, unknown>
    ): Promise<QueryResult<T>> {
      const sql = getSql();
      try {
        const entries = Object.entries(params ?? {});
        if (![fnName, ...entries.map(([key]) => key)].every(name => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))) throw new Error('Invalid RPC identifier');
        const args = entries.map(([key], i) => `"${key}" => $${i + 1}`).join(', ');
        const values = entries.map(([, value]) => value);
        const rows = await sql.unsafe(`SELECT * FROM "${fnName}"(${args})`, values as ParameterOrJSON<never>[]);
        const scalar = rows.length === 1 && Object.prototype.hasOwnProperty.call(rows[0], fnName);
        return { data: (scalar ? rows[0][fnName] : rows) as T, error: null };
      } catch (err) {
        return { data: null, error: queryError(err) };
      }
    },
  };
}
