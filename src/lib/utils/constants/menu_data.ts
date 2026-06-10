import {
  Drink,
  Size,
  Milk,
  Syrup,
  SupportSweetener,
  Topping,
} from '../../schemas/drinks';

/** Single source of truth for the drink menu and its customisation options. */
export const DRINKS: Drink[] = [
  {
    name: 'Espresso',
    description: 'Strong concentrated coffee shot.',
    supportMilk: false,
    supportSweeteners: true,
    supportSyrup: true,
    supportTopping: false,
    supportSize: false,
  },
  {
    name: 'Latte',
    description: 'Espresso with steamed milk, smooth and creamy.',
    supportMilk: true,
    supportSweeteners: true,
    supportSyrup: true,
    supportTopping: true,
    supportSize: true,
  },
  {
    name: 'Cappuccino',
    description: 'Espresso with steamed milk and a deep layer of foam.',
    supportMilk: true,
    supportSweeteners: true,
    supportSyrup: true,
    supportTopping: true,
    supportSize: true,
  },
  {
    name: 'Cold Brew',
    description: 'Smooth, cold-steeped coffee served over ice.',
    supportMilk: true,
    supportSweeteners: true,
    supportSyrup: true,
    supportTopping: false,
    supportSize: true,
  },
  {
    name: 'Frappuccino',
    description: 'Blended iced coffee drink with flavors and toppings.',
    supportMilk: true,
    supportSweeteners: true,
    supportSyrup: true,
    supportTopping: true,
    supportSize: true,
  },
];

export const SIZES: Size[] = [
  { name: 'Tall', description: '12 fl oz (small)' },
  { name: 'Grande', description: '16 fl oz (medium)' },
  { name: 'Venti', description: '20 fl oz (large for hot, 24 fl oz for cold)' },
  { name: 'Trenta', description: '31 fl oz (cold drinks only)' },
];

export const MILKS: Milk[] = [
  { name: 'Whole Milk', description: 'Rich, full-bodied dairy milk.' },
  { name: '2% Milk', description: 'Reduced fat milk option.' },
  { name: 'Nonfat Milk', description: 'Fat-free dairy milk.' },
  { name: 'Oat Milk', description: 'Smooth, plant-based oat milk.' },
  { name: 'Soy Milk', description: 'Plant-based soy milk.' },
  { name: 'Almond Milk', description: 'Nutty, plant-based almond milk.' },
  { name: 'Coconut Milk', description: 'Creamy, tropical plant-based milk.' },
];

export const SYRUPS: Syrup[] = [
  { name: 'Vanilla Syrup', description: 'Classic sweet vanilla flavor.' },
  { name: 'Caramel Syrup', description: 'Rich caramel sweetness.' },
  { name: 'Hazelnut Syrup', description: 'Nutty, sweet hazelnut flavor.' },
  { name: 'Mocha Syrup', description: 'Chocolate syrup for coffee drinks.' },
  {
    name: 'Pumpkin Spice Syrup',
    description: 'Seasonal pumpkin spice flavor.',
  },
];

export const SWEETENERS: SupportSweetener[] = [
  { name: 'Classic Syrup', description: 'Standard liquid sweetener.' },
  { name: 'Raw Sugar', description: 'Natural cane sugar.' },
  { name: 'Stevia', description: 'Zero-calorie natural sweetener.' },
  { name: 'Honey', description: 'Natural honey sweetener.' },
  { name: 'Splenda', description: 'Low-calorie artificial sweetener.' },
];

export const TOPPINGS: Topping[] = [
  { name: 'Whipped Cream', description: 'Fluffy whipped topping.' },
  { name: 'Caramel Drizzle', description: 'Sweet caramel sauce topping.' },
  { name: 'Mocha Drizzle', description: 'Chocolate drizzle topping.' },
  { name: 'Cinnamon Powder', description: 'Warm spice powder.' },
  { name: 'Vanilla Bean Powder', description: 'Sweet vanilla topping.' },
  { name: 'Caramel Crunch', description: 'Crunchy caramelized sugar bits.' },
];
