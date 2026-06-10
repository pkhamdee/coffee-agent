import z from 'zod';

// Imports the 'StructuredOutputParser' from 'langchain/output_parsers'.
// This is critical for connecting our strict TypeScript data definitions with
// the text-based outputs of AI models.
// Remember: AI models operate on text, not directly on TypeScript types or Zod schemas.
import { StructuredOutputParser } from 'langchain/output_parsers';

/**
 * @description Zod schema defining the structure for a single customer order.
 * This schema dictates the precise format and types expected for an order object.
 */
export const OrderSchema = z.object({
  name: z.string(),
  drink: z.string(),
  size: z.string().nullable(),
  milk: z.string().nullable(),
  syrup: z.string().nullable(),
  sweeteners: z.string().nullable(),
  toppings: z.string().nullable(),
  quantity: z.number().min(1).max(10),
});

/**
 * @description TypeScript type inferred from OrderSchema.
 * This type provides strong type-checking for order objects throughout the application.
 */
export type OrderType = z.infer<typeof OrderSchema>;

/**
 * @description StructuredOutputParser for parsing unstructured text from an AI model
 * into a single, validated Order object.
 *
 * **CRITICAL FOR AI INTEGRATION:**
 *
 * The `StructuredOutputParser` here is vital because an AI model, such as a Large Language Model (LLM),
 * cannot directly understand or generate TypeScript types or Zod schemas. LLMs process and output plain text.
 *
 * This parser enables two key functionalities for working with AI:
 *
 * 1.  **Prompt Instruction Generation:** The `OrderParser` can generate a textual prompt
 * (often a JSON schema string) that you can send to the AI model. This prompt tells the AI
 * *exactly* what format its output should take—for instance, "Your response must be a JSON object
 * with keys 'drink', 'size', 'mil', 'syrup', 'sweeteners', 'toppings' (all strings),
 * and 'quantity' (a number between 1 and 10)." This helps guide the AI to produce structured data.
 *
 * 2.  **Output Validation and Transformation:** After the AI model generates its response (which,
 * if prompted correctly, should be a JSON string), the `OrderParser` takes this raw text.
 * It then attempts to parse this text into a JavaScript object and validates that
 * object against the `OrderSchema`. If the parsing and validation are successful,
 * it transforms the raw text into a type-safe `Order` object that can be used
 * directly in your TypeScript application. If the AI's output is malformed or
 * doesn't meet the schema's requirements (e.g., quantity is 0 or 11), the parser
 * will throw an error, preventing invalid data from corrupting your application.
 *
 * In essence, `OrderParser` acts as a crucial bridge, translating between the AI's
 * text-based world and our application's type-safe, structured data requirements.
 */
export const OrderParser = StructuredOutputParser.fromZodSchema(
  OrderSchema as any, // 'as any' is a TypeScript type assertion, commonly used with external libraries for flexibility.
);
