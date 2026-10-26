import type { getSql } from './pg';

type Sql = ReturnType<typeof getSql>;
interface ForeignKey {
  name: string;
  source_table: string;
  target_table: string;
  source_columns: string[];
  target_columns: string[];
  source_unique: boolean;
}
interface TableInfo { keys: ForeignKey[]; primary: string[] }
const metadata = new WeakMap<Sql, Map<string, Promise<TableInfo>>>();
const identifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

function splitColumns(value: string): string[] {
  let depth = 0, start = 0;
  const columns: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (depth < 0) throw new Error('Invalid relationship selection');
    if (value[i] === ',' && depth === 0) { columns.push(value.slice(start, i).trim()); start = i + 1; }
  }
  if (depth !== 0) throw new Error('Invalid relationship selection');
  return [...columns, value.slice(start).trim()];
}

async function tableInfo(sql: Sql, table: string): Promise<TableInfo> {
  let cache = metadata.get(sql);
  if (!cache) { cache = new Map(); metadata.set(sql, cache); }
  let pending = cache.get(table);
  if (!pending) {
    pending = (async () => {
      const [keys, primary] = await Promise.all([
        sql<ForeignKey[]>`select c.conname as name,s.relname as source_table,t.relname as target_table,
          array(select a.attname from unnest(c.conkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.pos) as source_columns,
          array(select a.attname from unnest(c.confkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.pos) as target_columns,
          exists(select 1 from pg_constraint u where u.conrelid=c.conrelid and u.contype in ('p','u') and cardinality(u.conkey)=cardinality(c.conkey) and u.conkey @> c.conkey) as source_unique
          from pg_constraint c join pg_class s on s.oid=c.conrelid join pg_class t on t.oid=c.confrelid
          join pg_namespace sn on sn.oid=s.relnamespace join pg_namespace tn on tn.oid=t.relnamespace
          where c.contype='f' and sn.nspname='public' and tn.nspname='public' and (s.relname=${table} or t.relname=${table})`,
        sql<{ columns: string[] | null }[]>`select array_agg(a.attname order by k.pos) as columns
          from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
          cross join lateral unnest(c.conkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num
          where c.contype='p' and n.nspname='public' and t.relname=${table}`,
      ]);
      return { keys: [...keys], primary: primary[0]?.columns ?? [] };
    })();
    cache.set(table, pending);
  }
  try { return await pending; }
  catch (error) { cache.delete(table); throw error; }
}

/** Resolves named/FK relationships from the actual schema, preserving object/array cardinality. */
export async function buildPgProjection(sql: Sql, table: string, columns: string): Promise<string> {
  let nextAlias = 0;
  const project = async (parentTable: string, parentAlias: string, selection: string, depth: number): Promise<string> => {
    if (depth > 8 || !identifier.test(parentTable)) throw new Error('Invalid relationship depth or table');
    const fields = await Promise.all(splitColumns(selection).map(async field => {
      if (field === '*') return `${quote(parentAlias)}.*`;
      const relation = field.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?\s*\(([\s\S]*)\)$/);
      if (!relation) {
        const scalar = field.match(/^(?:(\w+):)?(\w+)$/);
        if (!scalar) throw new Error('Unsupported select column');
        return `${quote(parentAlias)}.${quote(scalar[2])}${scalar[1] ? ` AS ${quote(scalar[1])}` : ''}`;
      }
      const [, alias, token, hint, childColumns] = relation;
      const info = await tableInfo(sql, parentTable);
      const matches = info.keys.flatMap(key => {
        if (hint && hint !== key.name && !key.source_columns.includes(hint)) return [];
        const choices: Array<{ key: ForeignKey; reverse: boolean }> = [];
        if (key.source_table === parentTable && (token === key.target_table || key.source_columns.includes(token))) choices.push({key,reverse:false});
        if (key.target_table === parentTable && token === key.source_table) choices.push({key,reverse:true});
        return choices;
      });
      if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous relationship; supply a foreign-key hint' : 'Unknown relationship');
      const {key,reverse} = matches[0];
      const childTable = reverse ? key.source_table : key.target_table;
      const childAlias = `relation_${nextAlias++}`;
      const rowAlias = `${childAlias}_row`;
      const childKeys = reverse ? key.source_columns : key.target_columns;
      const parentKeys = reverse ? key.target_columns : key.source_columns;
      const predicate = childKeys.map((column,index) => `${quote(childAlias)}.${quote(column)}=${quote(parentAlias)}.${quote(parentKeys[index])}`).join(' AND ');
      const many = reverse && !key.source_unique;
      const outputAlias = quote(alias ?? token);
      if (childColumns.trim() === 'count') return `(SELECT jsonb_build_array(jsonb_build_object('count',count(*))) FROM ${quote(childTable)} AS ${quote(childAlias)} WHERE ${predicate}) AS ${outputAlias}`;
      const projection = await project(childTable,childAlias,childColumns,depth+1);
      const childInfo = many ? await tableInfo(sql,childTable) : null;
      const order = childInfo?.primary.length ? ` ORDER BY ${childInfo.primary.map(column => `${quote(childAlias)}.${quote(column)}`).join(',')}` : '';
      const rows = `SELECT ${projection} FROM ${quote(childTable)} AS ${quote(childAlias)} WHERE ${predicate}${order}${many ? '' : ' LIMIT 1'}`;
      return many
        ? `COALESCE((SELECT jsonb_agg(to_jsonb(${quote(rowAlias)})) FROM (${rows}) AS ${quote(rowAlias)}),'[]'::jsonb) AS ${outputAlias}`
        : `(SELECT to_jsonb(${quote(rowAlias)}) FROM (${rows}) AS ${quote(rowAlias)}) AS ${outputAlias}`;
    }));
    return fields.join(', ');
  };
  return project(table,table,columns,0);
}
