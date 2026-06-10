import { Drink } from '../schemas/drinks';
import {
  SWEETENERS,
  MILKS,
  SYRUPS,
  SIZES,
  TOPPINGS,
} from '../utils/constants/menu_data';

/**
 * Converts a drink's structured flags into a natural-language sentence the
 * LLM can reason about (e.g. which customisations the drink supports).
 */
export const createDrinkItemSummary = (drink: Drink): string => {
  const parts = [
    `A drink named ${drink.name}`,
    `It is described as ${drink.description}`,
    drink.supportMilk
      ? 'It can be made with milk.'
      : 'It cannot be made with milk.',
    drink.supportSweeteners
      ? 'It can be made with sweeteners.'
      : 'It cannot contain sweeteners.',
    drink.supportSyrup
      ? 'It can be made with syrup.'
      : 'It cannot be made with syrup.',
    drink.supportTopping
      ? 'It can be made with topping.'
      : 'It cannot be made with topping.',
    drink.supportSize
      ? 'It can be made in different sizes.'
      : 'It cannot be made in different sizes.',
  ];
  return parts.join(' ');
};

const listSummary = (
  intro: string,
  items: { name: string; description: string }[],
): string =>
  `${intro}\n${items.map((i) => `- ${i.name}: ${i.description}`).join('\n')}\n`;

export const createSweetenersSummary = (): string =>
  listSummary('Available sweeteners are:', SWEETENERS);

export const createAvailableMilksSummary = (): string =>
  listSummary('Available milks are:', MILKS);

export const createSyrupsSummary = (): string =>
  listSummary('Available syrups are:', SYRUPS);

export const createSizesSummary = (): string =>
  listSummary('Available sizes are:', SIZES);

export const availableToppingsSummary = (): string =>
  listSummary('Available toppings are:', TOPPINGS);
