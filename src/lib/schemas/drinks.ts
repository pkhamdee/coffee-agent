import z from 'zod';

export const DrinkSchema = z.object({
  name: z.string(),
  description: z.string(),
  supportMilk: z.boolean(),
  supportSweeteners: z.boolean(),
  supportSyrup: z.boolean(),
  supportTopping: z.boolean(),
  supportSize: z.boolean(),
  image: z.string().url().optional(),
});

// Sweeteners, syrups, toppings, sizes and milks all share the same shape.
export const MenuOptionSchema = z.object({
  name: z.string(),
  description: z.string(),
  image: z.string().url().optional(),
});

export const SweetenerSchema = MenuOptionSchema;
export const SyrupSchema = MenuOptionSchema;
export const ToppingSchema = MenuOptionSchema;
export const SizeSchema = MenuOptionSchema;
export const MilkSchema = MenuOptionSchema;

export const DrinksSchema = z.array(DrinkSchema);

export type Drink = z.infer<typeof DrinkSchema>;
export type SupportSweetener = z.infer<typeof SweetenerSchema>;
export type Syrup = z.infer<typeof SyrupSchema>;
export type Topping = z.infer<typeof ToppingSchema>;
export type Size = z.infer<typeof SizeSchema>;
export type Milk = z.infer<typeof MilkSchema>;
export type Drinks = z.infer<typeof DrinksSchema>;
