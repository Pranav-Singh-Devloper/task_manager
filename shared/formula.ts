/**
 * The small, safe formula language for computed fields (§6.6). A real parser: nothing here uses eval or Function.
 * Operators: + - * /, comparisons, and / or / not. References are field keys.
 */
export type Value = number | string | boolean | null;

export type Ast =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'ref'; key: string }
  | { t: 'call'; name: string; args: Ast[] }
  | { t: 'un'; op: '-' | 'not'; e: Ast }
  | { t: 'bin'; op: string; l: Ast; r: Ast };

/** A formula problem described in plain words, so it can be shown to the person editing the column. */
export class FormulaError extends Error {}

// ---------- tokens ----------

type Token = { k: 'num' | 'str' | 'id' | 'op' | 'end'; v: string; pos: number };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i += 1;
    } else if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+/.exec(src.slice(i)) as RegExpExecArray;
      tokens.push({ k: 'num', v: m[0], pos: i });
      i += m[0].length;
    } else if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new FormulaError('A piece of text is missing its closing quote.');
      tokens.push({ k: 'str', v: src.slice(i + 1, end), pos: i });
      i = end + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)) as RegExpExecArray;
      tokens.push({ k: 'id', v: m[0], pos: i });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (['==', '!=', '<>', '<=', '>='].includes(two)) {
        tokens.push({ k: 'op', v: two, pos: i });
        i += 2;
      } else if ('+-*/(),<>='.includes(c)) {
        tokens.push({ k: 'op', v: c, pos: i });
        i += 1;
      } else {
        throw new FormulaError(`The character "${c}" is not allowed in a formula.`);
      }
    }
  }
  tokens.push({ k: 'end', v: '', pos: src.length });
  return tokens;
}

// ---------- Pratt parser ----------

const COMPARE = new Set(['==', '=', '!=', '<>', '<', '<=', '>', '>=']);
const BINDING: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 4,
  '=': 4,
  '!=': 4,
  '<>': 4,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
};
const NOT_BP = 3;
const NEG_BP = 7;

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i] as Token;
  }
  private next(): Token {
    return this.tokens[this.i++] as Token;
  }

  parse(): Ast {
    if (this.peek().k === 'end') throw new FormulaError('The formula is empty.');
    const ast = this.expr(0);
    if (this.peek().k !== 'end')
      throw new FormulaError(`Unexpected "${this.peek().v}" in the formula.`);
    return ast;
  }

  private infix(t: Token): string | null {
    if (t.k === 'op' && t.v in BINDING) return t.v;
    if (t.k === 'id' && (t.v.toLowerCase() === 'and' || t.v.toLowerCase() === 'or'))
      return t.v.toLowerCase();
    return null;
  }

  private expr(minBp: number): Ast {
    let left = this.prefix();
    for (;;) {
      const op = this.infix(this.peek());
      const bp = op ? (BINDING[op] as number) : 0;
      if (!op || bp <= minBp) break;
      this.next();
      const right = this.expr(bp);
      left = { t: 'bin', op, l: left, r: right };
    }
    return left;
  }

  private prefix(): Ast {
    const tok = this.next();
    if (tok.k === 'num') return { t: 'num', v: Number(tok.v) };
    if (tok.k === 'str') return { t: 'str', v: tok.v };
    if (tok.k === 'op' && tok.v === '-') return { t: 'un', op: '-', e: this.expr(NEG_BP) };
    if (tok.k === 'op' && tok.v === '(') {
      const inner = this.expr(0);
      this.expectClose();
      return inner;
    }
    if (tok.k === 'id') {
      const lower = tok.v.toLowerCase();
      if (lower === 'not') return { t: 'un', op: 'not', e: this.expr(NOT_BP) };
      if (lower === 'true' || lower === 'false') return { t: 'bool', v: lower === 'true' };
      if (this.peek().k === 'op' && this.peek().v === '(') {
        this.next();
        const args: Ast[] = [];
        if (!(this.peek().k === 'op' && this.peek().v === ')')) {
          for (;;) {
            args.push(this.expr(0));
            if (this.peek().k === 'op' && this.peek().v === ',') this.next();
            else break;
          }
        }
        this.expectClose();
        return { t: 'call', name: lower, args };
      }
      return { t: 'ref', key: tok.v };
    }
    throw new FormulaError(
      tok.k === 'end' ? 'The formula ends too soon.' : `Unexpected "${tok.v}" in the formula.`,
    );
  }

  private expectClose(): void {
    const t = this.next();
    if (!(t.k === 'op' && t.v === ')'))
      throw new FormulaError('A bracket is missing its closing bracket.');
  }
}

export function parseFormula(src: string): Ast {
  return new Parser(tokenize(src)).parse();
}

// ---------- checking ----------

const ARITY: Record<string, [number, number]> = {
  today: [0, 0],
  now: [0, 0],
  months_between: [2, 2],
  days_between: [2, 2],
  coalesce: [1, Infinity],
  if: [3, 3],
  concat: [1, Infinity],
  upper: [1, 1],
  lower: [1, 1],
  round: [1, 2],
  count_same: [1, 1],
};

/**
 * Checks an expression as an admin saves it. Returns a plain-language problem, or null when it is fine.
 * `storedKeys` are the fields a formula may use. Computed fields cannot use each other, which rules out loops.
 */
export function checkFormula(src: string, storedKeys: ReadonlySet<string>): string | null {
  let ast: Ast;
  try {
    ast = parseFormula(src);
  } catch (err) {
    return err instanceof FormulaError ? err.message : 'The formula could not be read.';
  }
  const problems: string[] = [];
  const walk = (a: Ast): void => {
    if (a.t === 'ref') {
      if (!storedKeys.has(a.key))
        problems.push(`"${a.key}" is not a column that can be used in a formula.`);
    } else if (a.t === 'call') {
      const arity = ARITY[a.name];
      if (!arity) {
        problems.push(`"${a.name}" is not a known function.`);
      } else if (a.args.length < arity[0] || a.args.length > arity[1]) {
        problems.push(
          `${a.name}() takes ${arity[0] === arity[1] ? arity[0] : `${arity[0]} to ${arity[1]}`} value(s), not ${a.args.length}.`,
        );
      } else if (a.name === 'count_same' && a.args[0]?.t !== 'ref') {
        problems.push('count_same() needs a column name, for example count_same(case_id).');
      }
      a.args.forEach(walk);
    } else if (a.t === 'un') {
      walk(a.e);
    } else if (a.t === 'bin') {
      walk(a.l);
      walk(a.r);
    }
  };
  walk(ast);
  return problems[0] ?? null;
}

// ---------- evaluation ----------

export interface EvalContext {
  get(key: string): Value;
  /** Today, YYYY-MM-DD, in the configured timezone. */
  today(): string;
  /** Now as an ISO string, in the configured timezone. */
  now(): string;
  /** Rows in this category (not deleted) whose value for `key` equals this row's value, this row included. */
  countSame(key: string): number;
}

const isDateString = (v: Value): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

function ymd(v: Value): [number, number, number] | null {
  if (!isDateString(v)) return null;
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
    ? [y, m, d]
    : null;
}

/** Whole months from a to b, rounded down. Negative when b is earlier. */
export function monthsBetween(a: Value, b: Value): number | null {
  const from = ymd(a);
  const to = ymd(b);
  if (!from || !to) return null;
  const sign = to[0] * 372 + to[1] * 31 + to[2] < from[0] * 372 + from[1] * 31 + from[2] ? -1 : 1;
  const [s, e] = sign === 1 ? [from, to] : [to, from];
  let months = (e[0] - s[0]) * 12 + (e[1] - s[1]);
  if (e[2] < s[2]) months -= 1;
  return sign * months;
}

export function daysBetween(a: Value, b: Value): number | null {
  const from = ymd(a);
  const to = ymd(b);
  if (!from || !to) return null;
  return Math.round(
    (Date.UTC(to[0], to[1] - 1, to[2]) - Date.UTC(from[0], from[1] - 1, from[2])) / 86_400_000,
  );
}

const blank = (v: Value) => v === null || v === '';
const num = (v: Value): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function compare(op: string, l: Value, r: Value): boolean {
  if (op === '==' || op === '=') return l === r || (blank(l) && blank(r));
  if (op === '!=' || op === '<>') return !compare('==', l, r);
  if (l === null || r === null) return false;
  const [a, b] = typeof l === typeof r ? [l, r] : [String(l), String(r)];
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  return a >= b;
}

export function evaluate(ast: Ast, ctx: EvalContext): Value {
  switch (ast.t) {
    case 'num':
    case 'str':
    case 'bool':
      return ast.v;
    case 'ref':
      return ctx.get(ast.key);
    case 'un': {
      const v = evaluate(ast.e, ctx);
      if (ast.op === 'not')
        return !(
          v === true ||
          (typeof v === 'number' && v !== 0) ||
          (typeof v === 'string' && v !== '')
        );
      const n = num(v);
      return n === null ? null : -n;
    }
    case 'bin': {
      if (ast.op === 'and' || ast.op === 'or') {
        const truthy = (v: Value) =>
          v === true || (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v !== '');
        const l = truthy(evaluate(ast.l, ctx));
        if (ast.op === 'and') return l && truthy(evaluate(ast.r, ctx));
        return l || truthy(evaluate(ast.r, ctx));
      }
      const l = evaluate(ast.l, ctx);
      const r = evaluate(ast.r, ctx);
      if (COMPARE.has(ast.op)) return compare(ast.op, l, r);
      const a = num(l);
      const b = num(r);
      if (a === null || b === null) return null;
      if (ast.op === '+') return a + b;
      if (ast.op === '-') return a - b;
      if (ast.op === '*') return a * b;
      return b === 0 ? null : a / b;
    }
    case 'call':
      return callFunction(ast, ctx);
  }
}

function callFunction(ast: Extract<Ast, { t: 'call' }>, ctx: EvalContext): Value {
  const arg = (i: number) => evaluate(ast.args[i] as Ast, ctx);
  switch (ast.name) {
    case 'today':
      return ctx.today();
    case 'now':
      return ctx.now();
    case 'months_between':
      return monthsBetween(arg(0), arg(1));
    case 'days_between':
      return daysBetween(arg(0), arg(1));
    case 'coalesce':
      for (let i = 0; i < ast.args.length; i += 1) {
        const v = arg(i);
        if (!blank(v)) return v;
      }
      return null;
    case 'if': {
      const c = arg(0);
      const yes =
        c === true || (typeof c === 'number' && c !== 0) || (typeof c === 'string' && c !== '');
      return yes ? arg(1) : arg(2);
    }
    case 'concat':
      return ast.args
        .map((_, i) => arg(i))
        .filter((v) => v !== null)
        .join('');
    case 'upper': {
      const v = arg(0);
      return v === null ? null : String(v).toUpperCase();
    }
    case 'lower': {
      const v = arg(0);
      return v === null ? null : String(v).toLowerCase();
    }
    case 'round': {
      const n = num(arg(0));
      if (n === null) return null;
      const d = ast.args.length > 1 ? (num(arg(1)) ?? 0) : 0;
      const f = 10 ** d;
      return Math.round((n + Number.EPSILON) * f) / f;
    }
    case 'count_same': {
      const a = ast.args[0];
      return a?.t === 'ref' ? ctx.countSame(a.key) : null;
    }
    default:
      return null;
  }
}

/** Parses and evaluates in one step. Returns null if the formula cannot be read, so a bad formula never breaks a page. */
export function evaluateFormula(src: string, ctx: EvalContext): Value {
  try {
    return evaluate(parseFormula(src), ctx);
  } catch {
    return null;
  }
}
