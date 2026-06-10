import {
  extractJsonResponse,
  nullStr,
  safeQty,
  isValidCustomerName,
  userMentioned,
  buildQuestionMap,
} from './agent-utils';

describe('extractJsonResponse', () => {
  it('parses plain JSON', () => {
    expect(extractJsonResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced ```json blocks', () => {
    expect(extractJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON surrounded by prose', () => {
    expect(extractJsonResponse('Sure! {"a":1} hope that helps')).toEqual({
      a: 1,
    });
  });

  it('strips <think> blocks from reasoning models', () => {
    expect(extractJsonResponse('<think>let me reason</think>{"a":1}')).toEqual({
      a: 1,
    });
  });

  it('joins array content parts', () => {
    expect(extractJsonResponse([{ text: '{"a":' }, { text: '1}' }])).toEqual({
      a: 1,
    });
  });

  it('throws when no JSON is present', () => {
    expect(() => extractJsonResponse('hello there')).toThrow(
      /No JSON block found/,
    );
  });
});

describe('nullStr', () => {
  it.each([null, undefined, 'null', '', '   '])('maps %p to null', (v) => {
    expect(nullStr(v)).toBeNull();
  });

  it('keeps real values as strings', () => {
    expect(nullStr('Oat Milk')).toBe('Oat Milk');
    expect(nullStr(2)).toBe('2');
  });
});

describe('safeQty', () => {
  it('defaults to 1 for null/undefined/NaN', () => {
    expect(safeQty(null)).toBe(1);
    expect(safeQty(undefined)).toBe(1);
    expect(safeQty('abc')).toBe(1);
  });

  it('clamps to the 1–10 range', () => {
    expect(safeQty(0)).toBe(1);
    expect(safeQty(99)).toBe(10);
    expect(safeQty('3')).toBe(3);
  });
});

describe('isValidCustomerName', () => {
  it('accepts ordinary names', () => {
    expect(isValidCustomerName('Alex')).toBe(true);
    expect(isValidCustomerName('Pongsak')).toBe(true);
  });

  it('rejects menu vocabulary and stop words', () => {
    expect(isValidCustomerName('Latte')).toBe(false);
    expect(isValidCustomerName('oat milk')).toBe(false);
    expect(isValidCustomerName('please')).toBe(false);
  });

  it('rejects single characters', () => {
    expect(isValidCustomerName('a')).toBe(false);
  });
});

describe('userMentioned', () => {
  it('matches the full value as a substring', () => {
    expect(userMentioned(['i want oat milk please'], 'Oat Milk')).toBe(true);
  });

  it('matches the first word of the value as a whole word', () => {
    expect(userMentioned(['vanilla please'], 'Vanilla Syrup')).toBe(true);
  });

  it('does not let short fragments validate unrelated values', () => {
    // "2" (a quantity) must not validate "2% Milk"
    expect(userMentioned(['2'], '2% Milk')).toBe(false);
  });

  it('returns false when the user never said it', () => {
    expect(userMentioned(['a latte please'], 'Caramel Syrup')).toBe(false);
  });
});

describe('buildQuestionMap', () => {
  it('covers every guarded field', () => {
    const map = buildQuestionMap('Latte');
    for (const field of [
      'name',
      'drink',
      'size',
      'milk',
      'syrup',
      'sweeteners',
      'toppings',
      'quantity',
    ]) {
      expect(map[field]).toBeDefined();
      expect(typeof map[field].msg).toBe('string');
      expect(Array.isArray(map[field].opts)).toBe(true);
    }
  });

  it('interpolates the drink into follow-up questions', () => {
    expect(buildQuestionMap('Latte').milk.msg).toContain('Latte');
  });

  it('offers a decline option for optional fields', () => {
    const map = buildQuestionMap('Latte');
    expect(map.milk.opts).toContain('No Milk');
    expect(map.syrup.opts).toContain('No Syrup');
    expect(map.toppings.opts).toContain('No Toppings');
  });
});
