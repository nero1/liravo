import { getSql } from './pg';

type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number };

type FilterOp = { col: string; op: string; val: unknown };

type MutationType = 'insert' | 'update' | 'delete' | 'upsert';

interface MutationState {
  type: MutationType;
  data?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  returning: boolean;
}

// Parse OR filter string like "col1.eq.val1,col2.gte.val2"
function parseOrFilter(filter: string): string {
  const sql = getSql();
  const parts = filter.split(',').map((part) => {
    const dotIdx = part.indexOf('.');
    const col = part.slice(0, dotIdx);
    const rest = part.slice(dotIdx + 1);
    const opIdx = rest.indexOf('.');
    const op = rest.slice(0, opIdx);
    const val = rest.slice(opIdx + 1);
    switch (op) {
      case 'eq': return sql`${sql(col)} = ${val}`;
      case 'neq': return sql`${sql(col)} != ${val}`;
      case 'gt': return sql`${sql(col)} > ${val}`;
      case 'gte': return sql`${sql(col)} >= ${val}`;
      case 'lt': return sql`${sql(col)} < ${val}`;
      case 'lte': return sql`${sql(col)} <= ${val}`;
      case 'is': return val === 'null' ? sql`${sql(col)} IS NULL` : sql`${sql(col)} IS ${sql.unsafe(val)}`;
      default: return sql`${sql(col)} = ${val}`;
    }
  });
  // Combine with OR — postgres.js doesn't support array join of fragments directly,
  // so we build it recursively
  if (parts.length === 1) return parts[0] as unknown as string;
  return parts.reduce((acc, cur) => sql`${acc as unknown as ReturnType<typeof sql>} OR ${cur as unknown as ReturnType<typeof sql>}`) as unknown as string;
}

export class PgQueryBuilder<T = Record<string, unknown>> {
  private _table: string;
  private _selectCols: string = '*';
  private _filters: FilterOp[] = [];
  private _orFragment: unknown = null;
  private _orderCol: string | null = null;
  private _orderAsc: boolean = true;
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

  or(filter: string) {
    this._orFragment = filter;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this._orderCol = column;
    this._orderAsc = options?.ascending !== false;
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
    this._limit = 1;
    return this;
  }

  maybeSingle() {
    this._isMaybeSingle = true;
    this._limit = 1;
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
    options?: { onConflict?: string }
  ) {
    this._mutation = {
      type: 'upsert',
      data,
      onConflict: options?.onConflict,
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
    const parts: ReturnType<typeof sql>[] = [];

    for (const f of this._filters) {
      switch (f.op) {
        case '=':   parts.push(sql`${sql(f.col)} = ${f.val}`); break;
        case '!=':  parts.push(sql`${sql(f.col)} != ${f.val}`); break;
        case '>':   parts.push(sql`${sql(f.col)} > ${f.val}`); break;
        case '>=':  parts.push(sql`${sql(f.col)} >= ${f.val}`); break;
        case '<':   parts.push(sql`${sql(f.col)} < ${f.val}`); break;
        case '<=':  parts.push(sql`${sql(f.col)} <= ${f.val}`); break;
        case 'IN':  parts.push(sql`${sql(f.col)} = ANY(${f.val as unknown[]})`); break;
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
    return filter.split(',').map((part) => {
      const [col, op, ...rest] = part.split('.');
      const val = rest.join('.');
      switch (op) {
        case 'eq':  return `${col} = '${val.replace(/'/g, "''")}'`;
        case 'neq': return `${col} != '${val.replace(/'/g, "''")}'`;
        case 'gt':  return `${col} > '${val.replace(/'/g, "''")}'`;
        case 'gte': return `${col} >= '${val.replace(/'/g, "''")}'`;
        case 'lt':  return `${col} < '${val.replace(/'/g, "''")}'`;
        case 'lte': return `${col} <= '${val.replace(/'/g, "''")}'`;
        case 'is':  return val === 'null' ? `${col} IS NULL` : `${col} IS ${val.toUpperCase()}`;
        default:    return `${col} = '${val.replace(/'/g, "''")}'`;
      }
    }).join(' OR ');
  }

  // Parse Supabase join syntax: "alias:table!fk(cols)" or "alias:table!fk(count)"
  private _buildSelectCols(): string {
    if (this._selectCols === '*') return '*';

    const cols = this._selectCols.split(',').map((c) => c.trim());
    const plain: string[] = [];

    for (const col of cols) {
      const joinMatch = col.match(/^(\w+):(\w+)!(\w+)\((.+)\)$/);
      if (joinMatch) {
        // joins are handled separately in _buildJoins
        continue;
      }
      plain.push(col);
    }

    return plain.length > 0 ? plain.join(', ') : '*';
  }

  private _extractJoins(): Array<{ alias: string; table: string; fk: string; cols: string }> {
    if (this._selectCols === '*') return [];
    const cols = this._selectCols.split(',').map((c) => c.trim());
    const joins: Array<{ alias: string; table: string; fk: string; cols: string }> = [];
    for (const col of cols) {
      const m = col.match(/^(\w+):(\w+)!(\w+)\((.+)\)$/);
      if (m) {
        joins.push({ alias: m[1], table: m[2], fk: m[3], cols: m[4] });
      }
    }
    return joins;
  }

  async execute(): Promise<QueryResult<T>> {
    const sql = getSql();
    try {
      if (this._mutation) {
        return await this._executeMutation(sql);
      }

      if (this._countOnly) {
        const where = this.buildWhere();
        const hasWhere = this._filters.length > 0 || this._orFragment;
        const rows = hasWhere
          ? await sql`SELECT COUNT(*) AS count FROM ${sql(this._table)} WHERE ${where}`
          : await sql`SELECT COUNT(*) AS count FROM ${sql(this._table)}`;
        const count = parseInt(rows[0]?.count ?? '0', 10);
        return { data: null, error: null, count };
      }

      const joins = this._extractJoins();
      const plainCols = this._buildSelectCols();
      const hasWhere = this._filters.length > 0 || this._orFragment;
      const where = this.buildWhere();

      // Build join fragments as correlated subqueries/lateral joins
      let joinSql = '';
      for (const j of joins) {
        if (j.cols === 'count') {
          joinSql += `, (SELECT COUNT(*) FROM ${j.table} WHERE ${j.fk} = ${this._table}.id) AS ${j.alias}`;
        } else {
          // Simple LEFT JOIN returning json_build_object
          const fields = j.cols.split(',').map((f) => f.trim());
          const jsonFields = fields.flatMap((f) => [`'${f}'`, `${j.table}.${f}`]).join(', ');
          joinSql += ` LEFT JOIN LATERAL (SELECT json_build_object(${jsonFields}) AS ${j.alias} FROM ${j.table} WHERE ${j.fk} = ${this._table}.id LIMIT 1) AS ${j.alias}_sub ON true`;
        }
      }

      let query: unknown;
      const selectExpr = plainCols + (joins.length > 0 && joins.some((j) => j.cols !== 'count') ? '' : joinSql.startsWith(',') ? joinSql : '');

      if (hasWhere) {
        if (this._orderCol && this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} WHERE ${where} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._orderCol && this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} WHERE ${where} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')} LIMIT ${this._limit}`;
        } else if (this._orderCol) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} WHERE ${where} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')}`;
        } else if (this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} WHERE ${where} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} WHERE ${where} LIMIT ${this._limit}`;
        } else {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} WHERE ${where}`;
        }
      } else {
        if (this._orderCol && this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._orderCol && this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')} LIMIT ${this._limit}`;
        } else if (this._orderCol) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')}`;
        } else if (this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')} LIMIT ${this._limit}`;
        } else {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(joinSql.startsWith(' LEFT') ? joinSql : '')}`;
        }
      }

      const rows = await (query as ReturnType<typeof sql>);

      if (this._head) return { data: null, error: null };
      if (this._isSingle) {
        if (rows.length === 0) return { data: null, error: { message: 'No rows found' } };
        return { data: rows[0] as T, error: null };
      }
      if (this._isMaybeSingle) {
        return { data: rows.length > 0 ? rows[0] as T : null, error: null };
      }
      return { data: rows as unknown as T, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  private async _executeMutation(sql: ReturnType<typeof getSql>): Promise<QueryResult<T>> {
    const m = this._mutation!;
    const hasWhere = this._filters.length > 0 || this._orFragment;
    const where = this.buildWhere();

    try {
      switch (m.type) {
        case 'insert': {
          const rows = Array.isArray(m.data) ? m.data : [m.data!];
          if (m.returning) {
            const result = await sql`INSERT INTO ${sql(this._table)} ${sql(rows)} RETURNING *`;
            return { data: (rows.length === 1 ? result[0] : result) as unknown as T, error: null };
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
          const updateExpr = updateCols.length > 0
            ? sql`DO UPDATE SET ${sql(updateCols.map((c) => sql`${sql(c)} = EXCLUDED.${sql(c)}` as unknown as string).join(', ') as unknown as Parameters<typeof sql>[0])}`
            : sql`DO NOTHING`;

          if (m.returning) {
            const result = await sql`INSERT INTO ${sql(this._table)} ${sql(rows)} ON CONFLICT (${sql(conflictCols)}) ${updateExpr} RETURNING *`;
            return { data: (rows.length === 1 ? result[0] : result) as unknown as T, error: null };
          }
          await sql`INSERT INTO ${sql(this._table)} ${sql(rows)} ON CONFLICT (${sql(conflictCols)}) ${updateExpr}`;
          return { data: null, error: null };
        }

        case 'update': {
          if (!hasWhere) throw new Error('update() requires at least one filter');
          if (m.returning) {
            const result = await sql`UPDATE ${sql(this._table)} SET ${sql(m.data as Record<string, unknown>)} WHERE ${where} RETURNING *`;
            return { data: result[0] as unknown as T, error: null };
          }
          await sql`UPDATE ${sql(this._table)} SET ${sql(m.data as Record<string, unknown>)} WHERE ${where}`;
          return { data: null, error: null };
        }

        case 'delete': {
          if (!hasWhere) throw new Error('delete() requires at least one filter');
          await sql`DELETE FROM ${sql(this._table)} WHERE ${where}`;
          return { data: null, error: null };
        }
      }
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
    return { data: null, error: null };
  }

  // Thenable — allows `await builder` without explicit .execute()
  then<TResult1 = QueryResult<T>>(
    onfulfilled: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null | undefined
  ): Promise<TResult1> {
    return this.execute().then(onfulfilled ?? ((v) => v as unknown as TResult1));
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
        if (params && Object.keys(params).length > 0) {
          const paramStr = Object.entries(params)
            .map(([k, v]) => {
              if (v === null) return `${k} := NULL`;
              if (typeof v === 'string') return `${k} := '${v.replace(/'/g, "''")}'`;
              return `${k} := ${v}`;
            })
            .join(', ');
          const rows = await sql.unsafe(`SELECT * FROM ${fnName}(${paramStr})`);
          return { data: rows as unknown as T, error: null };
        }
        const rows = await sql`SELECT * FROM ${sql(fnName)}()`;
        return { data: rows as unknown as T, error: null };
      } catch (err) {
        return { data: null, error: { message: String(err) } };
      }
    },
  };
}
