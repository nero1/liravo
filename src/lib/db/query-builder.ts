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
      const [rawCol, op, ...rest] = part.split('.');
      // Sanitize column name — only allow valid SQL identifier chars
      const col = `"${rawCol.replace(/[^a-zA-Z0-9_]/g, '')}"`;
      const val = rest.join('.');
      const escaped = val.replace(/'/g, "''");
      switch (op) {
        case 'eq':  return `${col} = '${escaped}'`;
        case 'neq': return `${col} != '${escaped}'`;
        case 'gt':  return `${col} > '${escaped}'`;
        case 'gte': return `${col} >= '${escaped}'`;
        case 'lt':  return `${col} < '${escaped}'`;
        case 'lte': return `${col} <= '${escaped}'`;
        case 'is':  return val === 'null' ? `${col} IS NULL` : `${col} IS ${val === 'true' ? 'TRUE' : 'FALSE'}`;
        default:    return `${col} = '${escaped}'`;
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

      // Build join fragments with properly quoted identifiers.
      // selectJoinSql: extra expressions added to the SELECT list.
      // fromJoinSql: JOIN clauses appended to the FROM clause.
      let selectJoinSql = '';
      let fromJoinSql = '';
      for (const j of joins) {
        // Sanitize all identifiers — these come from application code, not user input.
        const jTable = j.table.replace(/[^a-zA-Z0-9_]/g, '');
        const jAlias = j.alias.replace(/[^a-zA-Z0-9_]/g, '');
        const jFk    = j.fk.replace(/[^a-zA-Z0-9_]/g, '');
        const mainTbl = this._table.replace(/[^a-zA-Z0-9_]/g, '');

        if (j.cols === 'count') {
          // Correlated COUNT subquery in the SELECT list
          selectJoinSql += `, (SELECT COUNT(*) FROM "${jTable}" WHERE "${jTable}"."${jFk}" = "${mainTbl}".id) AS "${jAlias}"`;
        } else {
          // LATERAL join — JSON object returned as a named column
          const fields = j.cols.split(',').map((f) => f.trim().replace(/[^a-zA-Z0-9_]/g, ''));
          const jsonPairs = fields.flatMap((f) => [`'${f}'`, `"${jTable}"."${f}"`]).join(', ');
          fromJoinSql += ` LEFT JOIN LATERAL (SELECT json_build_object(${jsonPairs}) AS data FROM "${jTable}" WHERE "${jTable}"."${jFk}" = "${mainTbl}".id LIMIT 1) AS "${jAlias}_sub" ON true`;
          selectJoinSql += `, "${jAlias}_sub".data AS "${jAlias}"`;
        }
      }

      const selectExpr = plainCols + selectJoinSql;

      let query: unknown;

      if (hasWhere) {
        if (this._orderCol && this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} WHERE ${where} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._orderCol && this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} WHERE ${where} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')} LIMIT ${this._limit}`;
        } else if (this._orderCol) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} WHERE ${where} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')}`;
        } else if (this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} WHERE ${where} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} WHERE ${where} LIMIT ${this._limit}`;
        } else {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} WHERE ${where}`;
        }
      } else {
        if (this._orderCol && this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._orderCol && this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')} LIMIT ${this._limit}`;
        } else if (this._orderCol) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} ORDER BY ${sql(this._orderCol)} ${sql.unsafe(this._orderAsc ? 'ASC' : 'DESC')}`;
        } else if (this._limit !== null && this._offset !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} LIMIT ${this._limit} OFFSET ${this._offset}`;
        } else if (this._limit !== null) {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)} LIMIT ${this._limit}`;
        } else {
          query = sql`SELECT ${sql.unsafe(selectExpr)} FROM ${sql(this._table)}${sql.unsafe(fromJoinSql)}`;
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

          // Build conflict and SET clauses using double-quoted identifiers.
          // Column names come from application data objects, not user input.
          const safeId = (c: string) => `"${c.replace(/[^a-zA-Z0-9_]/g, '')}"`;
          const conflictExpr = conflictCols.map(safeId).join(', ');
          const updateExpr = updateCols.length > 0
            ? `DO UPDATE SET ${updateCols.map((c) => `${safeId(c)} = EXCLUDED.${safeId(c)}`).join(', ')}`
            : 'DO NOTHING';

          if (m.returning) {
            const result = await sql.unsafe(
              `INSERT INTO "${this._table}" (${keys.map(safeId).join(', ')}) VALUES (${rows.map((_, i) => keys.map((k, j) => `$${i * keys.length + j + 1}`).join(', ')).join('), (')}) ON CONFLICT (${conflictExpr}) ${updateExpr} RETURNING *`,
              rows.flatMap((r) => keys.map((k) => r[k]))
            );
            return { data: (rows.length === 1 ? result[0] : result) as unknown as T, error: null };
          }
          await sql.unsafe(
            `INSERT INTO "${this._table}" (${keys.map(safeId).join(', ')}) VALUES (${rows.map((_, i) => keys.map((k, j) => `$${i * keys.length + j + 1}`).join(', ')).join('), (')}) ON CONFLICT (${conflictExpr}) ${updateExpr}`,
            rows.flatMap((r) => keys.map((k) => r[k]))
          );
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
