import { buildPgProjection } from './relations';
import type {Row,ParameterOrJSON}from'postgres';
import {sql as dsql,and,eq,ne,gt,gte,lt,lte,inArray,arrayContains,arrayOverlaps,ilike,isNull,isNotNull,asc,desc,getTableColumns,type SQL}from'drizzle-orm';
import type {PgTable,PgColumn}from'drizzle-orm/pg-core';
import {schema,primaryKeys}from'./schema';
import {getSql,getDrizzle,withDatabaseOperation,executeQuery} from './pg';

type QueryResult<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number };

function queryError(error: unknown): { message: string; code?: string } {
  if(error&&typeof error==='object'&&'cause'in error&&error.cause)return queryError(error.cause);
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String(error.message), ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}) };
  }
  return { message: String(error) };
}

type FilterOp = {col:string;op:string;val:unknown;config?:'english'|'simple'};

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
  private _orFragments: string[] = [];
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

  overlaps(column:string,value:unknown[]|string){
    this._filters.push({col:column,op:'&&',val:value});
    return this;
  }

  ilike(column: string, pattern: string) {
    this._filters.push({ col: column, op: 'ILIKE', val: pattern });
    return this;
  }

  textSearch(column:string,query:string,options?:{type?:'plain'|'websearch';config?:string}){
    if(options?.config&&!['english','simple'].includes(options.config))throw new Error('Unsupported search language');
    if(options?.type&&!['plain','websearch'].includes(options.type))throw new Error('Unsupported search mode');
    this._filters.push({col:column,op:options?.type==='websearch'?'@@websearch':'@@plain',val:query,config:options?.config==='simple'?'simple':'english'});
    return this;
  }

  or(filter: string) {
    this._orFragments.push(filter);
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

  private table(){
    const table=(schema as Record<string,PgTable>)[this._table];if(!table)throw Error('Unknown database table');return table;
  }
  private column(name:string){const column=getTableColumns(this.table())[name];if(!column)throw Error('Unknown database column: '+name);return column;}
  private buildWhere():SQL|undefined{
    const parts:SQL[]=[];
    for(const f of this._filters){
      const column=this.column(f.col);
      switch(f.op){
        case '=':parts.push(eq(column,f.val));break;
        case '!=':parts.push(ne(column,f.val));break;
        case '>':parts.push(gt(column,f.val));break;
        case '>=':parts.push(gte(column,f.val));break;
        case '<':parts.push(lt(column,f.val));break;
        case '<=':parts.push(lte(column,f.val));break;
        case 'IN':parts.push(inArray(column,f.val as unknown[]));break;
        case '@>':parts.push(Array.isArray(f.val)?f.val.length?arrayContains(column,f.val):dsql`${column} @> ${dsql.param(f.val,column)}`:dsql`${column} @> ${dsql.param(f.val,column)}`);break;
        case '&&':parts.push(Array.isArray(f.val)?f.val.length?arrayOverlaps(column,f.val):dsql`false`:dsql`${column} && ${f.val}`);break;
        case 'ILIKE':parts.push(ilike(column,String(f.val)));break;
        case 'IS':parts.push(f.val===null?isNull(column):f.val===true?dsql`${column} IS TRUE`:dsql`${column} IS FALSE`);break;
        case 'IS NOT':parts.push(f.val===null?isNotNull(column):f.val===true?dsql`${column} IS NOT TRUE`:dsql`${column} IS NOT FALSE`);break;
        case '@@websearch':parts.push(dsql`${column} @@ websearch_to_tsquery(${f.config??'english'}::regconfig,${f.val})`);break;
        case '@@plain':parts.push(dsql`${column} @@ plainto_tsquery(${f.config??'english'}::regconfig,${f.val})`);break;
        default:throw Error('Unsupported database filter');
      }
    }
    for(const fragment of this._orFragments)parts.push(dsql.raw('('+this._buildOrSql(fragment)+')'));
    return and(...parts);
  }
  private async projection():Promise<Record<string,PgColumn|SQL|SQL.Aliased>>{
    const expression=await buildPgProjection(getSql(),this._table,this._selectCols),fields:Record<string,PgColumn|SQL|SQL.Aliased>={};
    let depth=0,start=0;const parts:string[]=[];
    for(let index=0;index<expression.length;index++){if(expression[index]==='(')depth++;if(expression[index]===')')depth--;if(expression[index]===','&&depth===0){parts.push(expression.slice(start,index).trim());start=index+1;}}
    parts.push(expression.slice(start).trim());
    for(const field of parts){
      if(field===`"${this._table}".*`){Object.assign(fields,getTableColumns(this.table()));continue;}
      const scalar=field.match(/^"\w+"\."(\w+)"$/);if(scalar){fields[scalar[1]]=this.column(scalar[1]);continue;}
      const aliased=field.match(/^([\s\S]*) AS "(\w+)"$/);if(!aliased)throw Error('Invalid database projection');fields[aliased[2]]=dsql.raw(aliased[1]).as(aliased[2]);
    }return fields;
  }
  private async run(query:{execute():Promise<unknown>}):Promise<Row[]>{
    const rows=await query.execute();if(!Array.isArray(rows))throw Error('Invalid database result');
    const normalize=(value:unknown):unknown=>typeof value==='bigint'?value.toString():Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)])):value;
    return rows.map(row=>normalize(row)as Row);
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
      this.column(column);
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

  async execute():Promise<QueryResult<T>>{
    try{return await withDatabaseOperation(()=>this.executeInScope());}catch(error){return {data:null,error:queryError(error)};}
  }

  private async executeInScope():Promise<QueryResult<T>>{
    const db=getDrizzle(),table=this.table(),where=this.buildWhere();let count:number|undefined;
    if(this._mutation){
      const mutation=this._mutation,returning=mutation.returning?await this.projection():null;
      if(mutation.type==='delete'||mutation.type==='update'){
        if(!where)throw Error(mutation.type+'() requires at least one filter');
        if(mutation.type==='update')for(const key of Object.keys(mutation.data??{}))this.column(key);
        if(mutation.type==='delete'){const query=db.delete(table).where(where);if(returning)return this.mutationResult(await this.run(query.returning(returning)));await this.run(query);}
        else{const query=db.update(table).set(mutation.data as Record<string,unknown>).where(where);if(returning)return this.mutationResult(await this.run(query.returning(returning)));await this.run(query);}return {data:null,error:null};
      }
      const rows=Array.isArray(mutation.data)?mutation.data:[mutation.data!];
      if(!rows.length)throw Error('Empty database mutation');for(const row of rows)for(const key of Object.keys(row))this.column(key);
      let query=db.insert(table).values(rows).$dynamic();
      if(mutation.type==='upsert'){
        const keys=Object.keys(rows[0]),conflict:readonly string[]=mutation.onConflict?.split(',').map(key=>key.trim())??primaryKeys.find(key=>key.table_name===this._table)?.columns??[];
        if(!conflict.length)throw Error('Upsert requires a conflict target');
        const target=conflict.map(key=>this.column(key)),updates=keys.filter(key=>!conflict.includes(key));
        query=mutation.ignoreDuplicates||!updates.length?query.onConflictDoNothing({target}):query.onConflictDoUpdate({target,set:Object.fromEntries(updates.map(key=>[key,dsql`excluded.${dsql.identifier(key)}`]))});
      }
      if(returning)return this.mutationResult(await this.run(query.returning(returning)));
      await this.run(query);return {data:null,error:null};
    }
    if(this._countOnly){const rows=await this.run(db.select({count:dsql`count(*)`}).from(table).where(where));count=Number(rows[0]?.count??0);if(this._head)return {data:null,error:null,count};}
    let query=db.select(await this.projection()).from(table).where(where).$dynamic();
    if(this._orders.length)query=query.orderBy(...this._orders.map(order=>order.ascending?asc(this.column(order.column)):desc(this.column(order.column))));
    if(this._limit!==null){if(!Number.isSafeInteger(this._limit)||this._limit<0)throw Error('Invalid query limit');query=query.limit(this._limit);}
    if(this._offset!==null){if(!Number.isSafeInteger(this._offset)||this._offset<0)throw Error('Invalid query offset');query=query.offset(this._offset);}
    const rows=await this.run(query);if(this._head)return {data:null,error:null,count};
    if((this._isSingle&&rows.length!==1)||(this._isMaybeSingle&&rows.length>1))return {data:null,error:{message:'Expected one row',code:'PGRST116'}};
    return {data:(this._isSingle||this._isMaybeSingle?rows[0]??null:rows)as T,error:null,count};
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
      try{return await withDatabaseOperation(async()=>{
        const sql=getSql();
        const entries = Object.entries(params ?? {});
        if (![fnName, ...entries.map(([key]) => key)].every(name => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))) throw new Error('Invalid RPC identifier');
        const args = entries.map(([key], i) => `"${key}" => $${i + 1}`).join(', ');
        const values = entries.map(([, value]) => value);
        const rows = await executeQuery(sql.unsafe(`SELECT * FROM "${fnName}"(${args})`, values as ParameterOrJSON<never>[]));
        const scalar = rows.length === 1 && Object.prototype.hasOwnProperty.call(rows[0], fnName);
        return { data: (scalar ? rows[0][fnName] : rows) as T, error: null };
      });} catch (err) {
        return { data: null, error: queryError(err) };
      }
    },
  };
}
