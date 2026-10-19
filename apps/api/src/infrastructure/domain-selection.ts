import { isDeepStrictEqual } from 'node:util';

type Scalar = string | number | boolean | null | undefined;
/** Explicit equality predicates. These are data, never callbacks replayed at commit. */
export type DomainSelector = Record<string, Scalar | readonly Scalar[]>;
export type ReadDependency = { collection: string; where?: DomainSelector };

export function identity(item: unknown): string {
  const record = item as Record<string, unknown>;
  const key = record.id ?? record.eventId ?? record.questionId ?? record.sessionId;
  if (typeof key !== 'string' || !key) throw new Error('Persistent domain records require a stable identity');
  return key;
}

export function validateSelector(where: DomainSelector) {
  for (const [field, value] of Object.entries(where)) {
    if (!/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(field) || field.length > 120) throw new Error('Invalid domain selector field');
    const values = Array.isArray(value) ? value : [value];
    if (values.length > 10000 || values.some(v => v !== null && v !== undefined && !['string', 'number', 'boolean'].includes(typeof v) || typeof v === 'number' && !Number.isFinite(v))) throw new Error('Invalid domain selector value');
    if (field === 'id' && values.some(v => v !== undefined && typeof v !== 'string')) throw new Error('Domain identities must be strings');
  }
}

function fieldReader(field: string) {
  const path = field.split('.');
  return field === 'id' ? identity : (item: unknown) => path.reduce<unknown>((value, key) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, item);
}

export function compileSelector(where: DomainSelector) {
  const fields = Object.entries(where).map(([field, expected]) => ({ read: fieldReader(field), values: new Set(Array.isArray(expected) ? expected : [expected]) }));
  return (item: unknown) => fields.every(field => field.values.has(field.read(item) as Scalar));
}
export function matches(item: unknown, where: DomainSelector): boolean { return compileSelector(where)(item); }

const frozenIndexes = new WeakMap<unknown[], Map<string, Map<unknown, number[]>>>();
/** Only immutable arrays are indexed. Mutable local records are added by the workspace. */
export function indexedPositions(rows: unknown[], where: DomainSelector): number[] | undefined {
  if (!Object.isFrozen(rows) || !Object.keys(where).length) return undefined;
  const indexes = frozenIndexes.get(rows) ?? new Map<string, Map<unknown, number[]>>(); frozenIndexes.set(rows, indexes);
  let candidates: Set<number> | undefined;
  for (const [field, expected] of Object.entries(where)) {
    let index = indexes.get(field);
    if (!index) {
      index = new Map(); const read = fieldReader(field);
      rows.forEach((row, position) => { const value = read(row), group = index!.get(value) ?? []; group.push(position); index!.set(value, group); });
      indexes.set(field, index);
    }
    const positions = new Set<number>();
    for (const value of Array.isArray(expected) ? expected : [expected]) for (const position of index.get(value) ?? []) positions.add(position);
    if (!candidates || positions.size < candidates.size) candidates = positions;
    if (candidates.size <= 1) break;
  }
  return candidates ? [...candidates] : undefined;
}

export function sameRecords(expected: unknown[], actual: unknown[]) { return isDeepStrictEqual(expected, actual); }

/** Parameterized SQL; only validated property paths become SQL identifiers. */
export function selectionSql(collection: string, where: DomainSelector | undefined, postgres: boolean) {
  if (where) validateSelector(where);
  const values: unknown[] = [collection];
  const parameter = (value: unknown) => { values.push(value); return postgres ? `$${values.length}` : '?'; };
  const clauses = Object.entries(where ?? {}).map(([field, expected]) => {
    if (field === 'id') {
      const ids = (Array.isArray(expected) ? expected : [expected]).filter(value => value !== undefined);
      return ids.length ? `record_id IN (${ids.map(value => parameter(value)).join(',')})` : 'FALSE';
    }
    if (Array.isArray(expected) && expected.filter(value => value !== undefined).length > 1) {
      const present = expected.filter(value => value !== undefined), path = postgres ? `(body#>'{${field.split('.').join(',')}}')` : `json_extract(body,'$.${field}')`;
      const valuesParameter = parameter(JSON.stringify(present));
      const predicate = postgres ? `${path} IN (SELECT value FROM jsonb_array_elements(${valuesParameter}::jsonb))` :
        present.every(value => typeof value === 'string') ? `(${path} IN (SELECT value FROM json_each(${valuesParameter})) AND json_type(body,'$.${field}')='text')` :
          `EXISTS(SELECT 1 FROM json_each(${valuesParameter}) selection_values WHERE selection_values.value IS ${path} AND selection_values.type=json_type(body,'$.${field}'))`;
      return expected.includes(undefined) ? `(${predicate} OR ${postgres ? path : `json_type(body,'$.${field}')`} IS NULL)` : predicate;
    }
    const alternatives = (Array.isArray(expected) ? expected : [expected]).map(value => {
      if (value === undefined) return postgres ? `(body#>'{${field.split('.').join(',')}}') IS NULL` : `json_type(body,'$.${field}') IS NULL`;
      const json = JSON.stringify(value);
      if (postgres) return `(body#>'{${field.split('.').join(',')}}')=${parameter(json)}::jsonb`;
      return `(json_extract(body,'$.${field}') ${value === null ? 'IS' : '='} json_extract(${parameter(json)},'$') AND json_type(body,'$.${field}')=json_type(${parameter(json)},'$'))`;
    });
    return alternatives.length ? `(${alternatives.join(' OR ')})` : 'FALSE';
  });
  // SQLite otherwise prefers the broad order index to avoid sorting, even for
  // a single student's answers. The expression keeps the same integer order
  // while allowing selective lookup indexes to determine the access path.
  const order = !postgres && clauses.length ? 'position+0' : 'position';
  return { text: `SELECT body FROM domain_records WHERE collection=${postgres ? '$1' : '?'}${clauses.length ? ' AND ' + clauses.join(' AND ') : ''} ORDER BY ${order},record_id`, values };
}
