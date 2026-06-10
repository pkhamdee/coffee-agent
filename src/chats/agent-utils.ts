import {
  DRINKS,
  MILKS,
  SYRUPS,
  SWEETENERS,
  TOPPINGS,
  SIZES,
} from 'src/lib/utils/constants/menu_data';

/**
 * Extracts the JSON payload from an LLM message. Handles plain JSON,
 * fenced ```json blocks, and reasoning models that emit <think> tags.
 */
export function extractJsonResponse(content: any): any {
  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((c: any) => (typeof c === 'string' ? c : (c.text ?? '')))
      .join('');
  } else {
    throw new Error('Unexpected content type');
  }
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1].trim());
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw?.[0]) return JSON.parse(raw[0]);
  throw new Error(`No JSON block found: ${text.slice(0, 200)}`);
}

export const nullStr = (v: any): string | null =>
  v === null || v === 'null' || v === undefined || String(v).trim() === ''
    ? null
    : String(v);

export const safeQty = (v: any): number => {
  if (v === null || v === 'null' || v === undefined) return 1;
  const n = Number(v);
  return isNaN(n) ? 1 : Math.min(10, Math.max(1, n));
};

// [field, pattern to detect in the user message, canonical stored value]
export const NO_DECLINE_PATTERNS: Array<[string, string, string]> = [
  ['toppings', 'no topping', 'No Toppings'],
  ['milk', 'no milk', 'No Milk'],
  ['syrup', 'no syrup', 'No Syrup'],
  ['sweeteners', 'no sweetener', 'No Sweetener'],
];

// Words that must never be accepted as a customer name — the menu vocabulary
// plus common English words the model might hallucinate into the name field.
export const INVALID_NAME_TERMS = new Set([
  ...DRINKS.map((d) => d.name.toLowerCase()),
  ...SIZES.map((s) => s.name.toLowerCase()),
  ...MILKS.map((m) => m.name.toLowerCase()),
  ...SYRUPS.map((s) => s.name.toLowerCase()),
  ...SWEETENERS.map((s) => s.name.toLowerCase()),
  ...TOPPINGS.map((t) => t.name.toLowerCase()),
  ...NO_DECLINE_PATTERNS.map(([, , canonical]) => canonical.toLowerCase()),
  // English stop words and common phrases unlikely to be a person's name
  'i',
  'me',
  'my',
  'mine',
  'we',
  'us',
  'you',
  'your',
  'he',
  'she',
  'it',
  'they',
  'them',
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'so',
  'for',
  'in',
  'on',
  'at',
  'to',
  'of',
  'with',
  'want',
  'would',
  'like',
  'need',
  'please',
  'can',
  'could',
  'will',
  'shall',
  'may',
  'might',
  'have',
  'has',
  'had',
  'am',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'get',
  'got',
  'give',
  'take',
  'make',
  'do',
  'go',
  'come',
  'say',
  'tell',
  'ask',
  'know',
  'one',
  'two',
  'three',
  'some',
  'any',
  'all',
  'just',
  'more',
  'very',
  'not',
  'also',
  'yes',
  'no',
  'ok',
  'okay',
  'sure',
  'fine',
  'thanks',
  'thank',
  'hi',
  'hello',
  'order',
  'drink',
  'coffee',
  'cup',
  'large',
  'small',
  'medium',
]);

export const isValidCustomerName = (name: string): boolean => {
  const n = name.trim().toLowerCase();
  return n.length >= 2 && !INVALID_NAME_TERMS.has(n);
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Did the user actually say this value in one of their messages?
 * Matches either the full value as a substring, or the value's first word
 * as a whole word (so "vanilla" accepts "Vanilla Syrup"). Whole-word
 * matching prevents short fragments like "2" validating "2% Milk".
 */
export const userMentioned = (humanMsgs: string[], val: string): boolean => {
  const v = val.trim().toLowerCase();
  if (!v) return false;
  const firstWord = escapeRegex(v.split(/\s+/)[0]);
  const wordRe = new RegExp(`\\b${firstWord}\\b`);
  return humanMsgs.some((msg) => msg.includes(v) || wordRe.test(msg));
};

const optionNames = (items: { name: string }[], count: number): string[] =>
  items.slice(0, count).map((i) => i.name);

/**
 * Deterministic fallback questions used by the server-side guards when the
 * model skips a required field. Suggestions are derived from the menu data
 * so they cannot drift from the actual menu.
 */
export const buildQuestionMap = (
  drink?: string,
): Record<string, { msg: string; opts: string[] }> => ({
  name: { msg: 'Welcome! May I have your name for the order?', opts: [] },
  drink: {
    msg: 'What drink would you like?',
    opts: optionNames(DRINKS, 3),
  },
  size: {
    msg: `What size would you like for your ${drink}?`,
    opts: optionNames(SIZES, 3),
  },
  milk: {
    msg: `What milk would you like in your ${drink}?`,
    opts: [...optionNames(MILKS, 3), 'No Milk'],
  },
  syrup: {
    msg: `Would you like any syrup in your ${drink}?`,
    opts: [...optionNames(SYRUPS, 2), 'No Syrup'],
  },
  sweeteners: {
    msg: 'Would you like a sweetener?',
    opts: [...optionNames(SWEETENERS, 2), 'No Sweetener'],
  },
  toppings: {
    msg: 'Would you like any toppings?',
    opts: [...optionNames(TOPPINGS, 2), 'No Toppings'],
  },
  quantity: { msg: 'How many would you like?', opts: ['1', '2', '3'] },
});
