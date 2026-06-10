import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MongoClient } from 'mongodb';
import { Model } from 'mongoose';

import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';

import { ChatOllama } from '@langchain/ollama';
import { StateGraph } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';
import { START, END } from '@langchain/langgraph';

import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';

import { Order } from './schemas/order.schema';
import { DRINKS } from 'src/lib/utils/constants/menu_data';

import {
  createSweetenersSummary,
  availableToppingsSummary,
  createAvailableMilksSummary,
  createSyrupsSummary,
  createSizesSummary,
  createDrinkItemSummary,
} from 'src/lib/summaries';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
const client: MongoClient = new MongoClient(process.env.MONGO_URI || '');
const database_name = 'drinks_db';

function extractJsonResponse(content: any): any {
  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content.map((c: any) => (typeof c === 'string' ? c : (c.text ?? ''))).join('');
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

@Injectable()
export class ChatService {
  constructor(@InjectModel(Order.name) private orderModel: Model<Order>) {}

  getOrders() {
    return this.orderModel.find().sort({ _id: -1 }).lean().exec();
  }

  deliverOrder(id: string) {
    return this.orderModel.findByIdAndDelete(id).exec();
  }

  chatWithAgent = async ({
    thread_id,
    query,
  }: {
    thread_id: string;
    query: string;
  }) => {
    await client.connect();

    const nullStr = (v: any): string | null =>
      v === null || v === 'null' || v === undefined || String(v).trim() === '' ? null : String(v);

    const safeQty = (v: any): number => {
      if (v === null || v === 'null' || v === undefined) return 1;
      const n = Number(v);
      return isNaN(n) ? 1 : Math.min(10, Math.max(1, n));
    };

    const graphState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => [...x, ...y],
      }),
    });

    const checkpointer = new MongoDBSaver({ client, dbName: database_name });

    // Build the graph with a late-bound callModal so we can inject the merged
    // order state (computed from previous turns) into the system prompt.
    let callModal: (states: typeof graphState.State) => Promise<any>;

    const graph = new StateGraph(graphState)
      .addNode('agent', (states) => callModal(states))
      .addEdge(START, 'agent')
      .addEdge('agent', END);

    const app = graph.compile({ checkpointer });

    // ─── Read previous conversation state before this turn ───────────────────
    const threadConfig = { configurable: { thread_id } };
    const prevState = await app.getState(threadConfig);
    const prevMessages: BaseMessage[] = (prevState?.values as any)?.messages ?? [];

    // Find the start of the current order session (after the last completed order)
    let sessionStart = 0;
    for (let i = prevMessages.length - 1; i >= 0; i--) {
      const m = prevMessages[i];
      if (!(m instanceof AIMessage)) continue;
      try {
        if (extractJsonResponse(m.content)?.progress === 'completed') {
          sessionStart = i + 1;
          break;
        }
      } catch { /* not a structured message */ }
    }

    // Rebuild the authoritative current_order by scanning session messages in
    // chronological order — AI messages supply confirmed values, human messages
    // supply explicit declines (e.g. "No Toppings") that the model may have omitted.
    const NO_DECLINE_PATTERNS: Array<[string, string, string]> = [
      ['toppings',   'no topping',   'No Toppings'],
      ['milk',       'no milk',      'No Milk'],
      ['syrup',      'no syrup',     'No Syrup'],
      ['sweeteners', 'no sweetener', 'No Sweetener'],
    ];

    // Words that must never be accepted as a customer name — menu vocabulary
    // plus common English words the model might hallucinate into the name field.
    const INVALID_NAME_TERMS = new Set([
      ...DRINKS.map((d) => d.name.toLowerCase()),
      'tall', 'grande', 'venti', 'trenta',
      'whole milk', '2% milk', 'nonfat milk', 'oat milk', 'soy milk', 'almond milk', 'coconut milk', 'no milk',
      'vanilla syrup', 'caramel syrup', 'hazelnut syrup', 'mocha syrup', 'no syrup',
      'classic syrup', 'stevia', 'no sweetener',
      'whipped cream', 'cinnamon powder', 'caramel drizzle', 'no toppings',
      // English stop words and common phrases unlikely to be a person's name
      'i', 'me', 'my', 'mine', 'we', 'us', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
      'a', 'an', 'the', 'and', 'or', 'but', 'so', 'for', 'in', 'on', 'at', 'to', 'of', 'with',
      'want', 'would', 'like', 'need', 'please', 'can', 'could', 'will', 'shall', 'may', 'might',
      'have', 'has', 'had', 'am', 'is', 'are', 'was', 'were', 'be', 'been',
      'get', 'got', 'give', 'take', 'make', 'do', 'go', 'come', 'say', 'tell', 'ask', 'know',
      'one', 'two', 'three', 'some', 'any', 'all', 'just', 'more', 'very', 'not', 'also',
      'yes', 'no', 'ok', 'okay', 'sure', 'fine', 'thanks', 'thank', 'please', 'hi', 'hello',
      'order', 'drink', 'coffee', 'cup', 'large', 'small', 'medium',
    ]);

    const knownOrder: Record<string, any> = {};
    for (const m of prevMessages.slice(sessionStart)) {
      if (m instanceof HumanMessage) {
        const h = String(m.content).toLowerCase();
        for (const [field, pattern, canonical] of NO_DECLINE_PATTERNS) {
          if (h.includes(pattern)) knownOrder[field] = canonical;
        }
      } else if (m instanceof AIMessage) {
        try {
          const co = extractJsonResponse(m.content)?.current_order;
          if (!co) continue;
          for (const [k, v] of Object.entries(co)) {
            if (v === null || v === 'null' || v === undefined) continue;
            const strV = String(v).trim();
            if (!strV) continue;
            // Reject menu vocabulary masquerading as a customer name
            if (k === 'name' && (INVALID_NAME_TERMS.has(strV.toLowerCase()) || strV.length < 2)) continue;
            knownOrder[k] = v;
          }
        } catch { /* skip */ }
      }
    }

    // ─── Define callModal now that knownOrder is available ───────────────────
    callModal = async (states: typeof graphState.State) => {
      // Escape braces so LangChain template doesn't treat JSON keys as variables
      const knownOrderJson = JSON.stringify(knownOrder)
        .replace(/\{/g, '{{').replace(/\}/g, '}}');

      // Compute exactly which fields still need to be collected for this drink,
      // and inject them as an explicit ordered list so the model can't ask for
      // wrong or unsupported fields.
      const drinkMetaForPrompt = DRINKS.find(
        (d) => d.name.toLowerCase() === (knownOrder.drink ?? '').toLowerCase(),
      );
      const stillNeeded: string[] = [];
      if (!knownOrder.name) stillNeeded.push('name — greet and ask for the customer\'s name');
      if (!knownOrder.drink) stillNeeded.push('drink — ask which drink');
      if (drinkMetaForPrompt?.supportSize && !knownOrder.size) stillNeeded.push('size');
      if (drinkMetaForPrompt?.supportMilk && !knownOrder.milk) stillNeeded.push('milk');
      if (drinkMetaForPrompt?.supportSyrup && !knownOrder.syrup) stillNeeded.push('syrup');
      if (drinkMetaForPrompt?.supportSweeteners && !knownOrder.sweeteners) stillNeeded.push('sweeteners');
      if (drinkMetaForPrompt?.supportTopping && !knownOrder.toppings) stillNeeded.push('toppings');
      if (knownOrder.drink && !knownOrder.quantity) stillNeeded.push('quantity');

      const nextFieldInstruction = stillNeeded.length > 0
        ? `Your next task is to warmly ask for ONE thing only — the FIRST item in this list:\n${stillNeeded.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}\nDo NOT ask for anything else in this turn.`
        : 'All details are collected. Warmly read back the full order summary and ask the customer to confirm. Set progress "completed" only after they explicitly say yes.';

      const prompt = ChatPromptTemplate.fromMessages([
        {
          role: 'system',
          content: `
You are Maya, a friendly and enthusiastic barista at a cozy café. You have a warm, welcoming personality — you greet customers with genuine excitement, make them feel at home, and gently guide them through customising their perfect drink. You love coffee and it shows!

**YOUR PERSONALITY**
- Warm, upbeat, and conversational — never robotic or clinical
- Use natural phrases like "Great choice!", "Ooh, lovely!", "Coming right up!"
- Keep replies short and friendly — one question at a time, never a wall of text
- Light humour is welcome, but always stay professional

**AVAILABLE DRINKS AND OPTIONS**
${DRINKS.map((drink) => `- ${createDrinkItemSummary(drink)}`).join('\n')}
Sizes: ${createSizesSummary()}
Milks: ${createAvailableMilksSummary()}
Syrups: ${createSyrupsSummary()}
Sweeteners: ${createSweetenersSummary()}
Toppings: ${availableToppingsSummary()}

**WHAT YOU ALREADY KNOW ABOUT THIS ORDER (do NOT ask again)**
${knownOrderJson}

**YOUR NEXT TASK**
${nextFieldInstruction}

**RULES**
- Ask the Customer's name, you can not finish without it.
- One question per reply — never bundle multiple questions.
- When the customer provides a value, store it exactly (e.g. milk: "Oat Milk").
- When they decline something (e.g. "No milk please"), store the exact decline string (e.g. milk: "No Milk"). Do NOT store null.
- Only set progress "completed" after the customer explicitly confirms the order.
- If the customer says something off-topic, politely redirect them to the order.

**OUTPUT FORMAT — RETURN ONLY THIS JSON, NO OTHER TEXT**
{{"message":"<your warm, friendly reply>","current_order":{{"name":"<value or null>","drink":"<value or null>","size":"<value or null>","milk":"<value or null>","syrup":"<value or null>","sweeteners":"<value or null>","toppings":"<value or null>","quantity":<number or null>}},"suggestions":["<option1>","<option2>","<option3>"],"progress":"in_progress"}}
          `,
        },
        new MessagesPlaceholder('messages'),
      ]);

      const formattedPrompt = await prompt.formatMessages({
        // Only pass messages from the current order session so the model
        // doesn't inherit context from a completed previous order.
        messages: states.messages.slice(sessionStart),
      });

      const chat = new ChatOllama({
        model: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
        temperature: 0,
        baseUrl: OLLAMA_BASE_URL.replace('/v1', ''),
        format: 'json',
      });

      const result = await chat.invoke(formattedPrompt);
      return { messages: [result] };
    };

    // ─── Run the graph ────────────────────────────────────────────────────────
    const finalState = await app.invoke(
      { messages: [new HumanMessage(query)] },
      { recursionLimit: 5, configurable: { thread_id } },
    );

    const allMessages: BaseMessage[] = finalState.messages;
    const lastMessage = allMessages.at(-1) as AIMessage;
    const response = extractJsonResponse(lastMessage.content);
    if (!response.progress) response.progress = 'in_progress';

    // Update knownOrder with values from this turn's response,
    // but only accept field values the user actually said in the CURRENT session
    // (prevents inheriting values like "Grande"/"Oat Milk" from a prior order).
    const humanMsgs = allMessages
      .slice(sessionStart)
      .filter((m) => m instanceof HumanMessage)
      .map((m) => String(m.content).toLowerCase());

    const userSaid = (val: string) => {
      if (!val.trim()) return false;
      const v = val.toLowerCase();
      return humanMsgs.some((msg) => msg.includes(v) || v.includes(msg));
    };

    // Only accept a name from the model when the previous bot message was explicitly
    // asking for it. This prevents the model from hallucinating a name value from
    // the user's drink request (e.g. name:"latte" from "I want a latte").
    const prevSessionAi = prevMessages
      .slice(sessionStart)
      .filter((m) => m instanceof AIMessage);
    const prevBotAskedForName = (() => {
      const last = prevSessionAi.at(-1);
      if (!last) return false;
      try {
        const msg = (extractJsonResponse(last.content)?.message ?? '').toLowerCase();
        return msg.includes('name') || msg.includes('call you');
      } catch { return false; }
    })();

    if (response.current_order) {
      for (const [k, v] of Object.entries(response.current_order as Record<string, any>)) {
        if (v === null || v === 'null' || v === undefined) continue;
        const strV = String(v).trim();
        if (!strV) continue;
        if (k === 'quantity') { knownOrder[k] = v; continue; }
        if (k === 'name') {
          // Accept name only when: the bot was asking for it, it's ≥ 2 chars,
          // and it's not a menu term or common English word.
          const n = strV.toLowerCase();
          if (prevBotAskedForName && n.length >= 2 && !INVALID_NAME_TERMS.has(n)) {
            knownOrder.name = v;
          }
          continue;
        }
        if (userSaid(strV)) knownOrder[k] = v;
      }
    }

    // Apply decline fallback for the current turn's human message — the rebuild
    // loop handles previous turns; this covers the just-submitted message.
    const latestHuman = String((allMessages.filter((m) => m instanceof HumanMessage).at(-1) as any)?.content ?? '').toLowerCase();
    for (const [field, pattern, canonical] of NO_DECLINE_PATTERNS) {
      if (!knownOrder[field] && latestHuman.includes(pattern)) {
        knownOrder[field] = canonical;
      }
    }

    // Quantity fallback: capture a bare number (1–10) when model misses it.
    if (!knownOrder.quantity) {
      const qm = latestHuman.trim().match(/^([1-9]|10)$/);
      if (qm) knownOrder.quantity = parseInt(qm[1], 10);
    }

    // ─── Field completeness check ─────────────────────────────────────────────
    // Runs for both in_progress and completed to correct model confusion.
    const questionMap: Record<string, { msg: string; opts: string[] }> = {
      name:       { msg: `Welcome! May I have your name for the order?`,           opts: [] },
      size:       { msg: `What size would you like for your ${knownOrder.drink}?`, opts: ['Tall', 'Grande', 'Venti'] },
      milk:       { msg: `What milk would you like in your ${knownOrder.drink}?`,  opts: ['Whole Milk', 'Oat Milk', 'Almond Milk', 'No Milk'] },
      syrup:      { msg: `Would you like any syrup in your ${knownOrder.drink}?`,  opts: ['Vanilla Syrup', 'Caramel Syrup', 'No Syrup'] },
      sweeteners: { msg: `Would you like a sweetener?`,                            opts: ['Classic Syrup', 'Stevia', 'No Sweetener'] },
      toppings:   { msg: `Would you like any toppings?`,                           opts: ['Whipped Cream', 'Cinnamon Powder', 'No Toppings'] },
      quantity:   { msg: `How many would you like?`,                               opts: ['1', '2', '3'] },
    };

    if (knownOrder.drink || !knownOrder.name) {
      const drinkMeta = DRINKS.find(
        (d) => d.name.toLowerCase() === (knownOrder.drink ?? '').toLowerCase(),
      );
      const uncollected: string[] = [];
      if (!knownOrder.name) uncollected.push('name');
      if (knownOrder.name && !knownOrder.drink) uncollected.push('drink');
      if (drinkMeta?.supportSize && !knownOrder.size) uncollected.push('size');
      if (drinkMeta?.supportMilk && !knownOrder.milk) uncollected.push('milk');
      if (drinkMeta?.supportSyrup && !knownOrder.syrup) uncollected.push('syrup');
      if (drinkMeta?.supportSweeteners && !knownOrder.sweeteners) uncollected.push('sweeteners');
      if (drinkMeta?.supportTopping && !knownOrder.toppings) uncollected.push('toppings');
      if (knownOrder.drink && !knownOrder.quantity) uncollected.push('quantity');

      if (uncollected.length > 0 && response.progress === 'completed') {
        // Block premature completion — ask for the first uncollected field.
        const next = questionMap[uncollected[0]];
        const guardPayload = {
          message: next.msg,
          current_order: knownOrder,
          suggestions: next.opts,
          progress: 'in_progress',
        };
        await app.updateState(threadConfig, {
          messages: [new AIMessage(JSON.stringify(guardPayload))],
        });
        return guardPayload;
      }

      if (uncollected.length === 0 && response.progress !== 'completed') {
        // All fields collected but model returned in_progress — force completion.
        response.progress = 'completed';
        // Persist a completed message to LangGraph so next turn's sessionStart
        // calculation correctly finds this completion boundary.
        await app.updateState(threadConfig, {
          messages: [new AIMessage(JSON.stringify({ ...response, progress: 'completed' }))],
        });
      }

      // Hard guard: name is mandatory — always block until it is collected.
      // The model may mention "name" in its message but still not ask for it,
      // or may silently skip it when the user mentions a drink up front.
      if (!knownOrder.name && response.progress !== 'completed') {
        const nameQ = questionMap.name;
        const nameGuard = {
          message: nameQ.msg,
          current_order: { ...knownOrder },
          suggestions: nameQ.opts,
          progress: 'in_progress' as const,
        };
        await app.updateState(threadConfig, {
          messages: [new AIMessage(JSON.stringify(nameGuard))],
        });
        return nameGuard;
      }
    }

    // ─── Save order on completion ─────────────────────────────────────────────
    if (response.progress === 'completed' && knownOrder.drink) {
      // Check whether this completion was already saved (de-duplication across turns)
      let lastCompletedIdx = -1;
      let hasInProgressAfter = false;
      allMessages.slice(0, -1).forEach((m, i) => {
        if (!(m instanceof AIMessage)) return;
        try {
          const p = extractJsonResponse(m.content)?.progress;
          if (p === 'completed') { lastCompletedIdx = i; hasInProgressAfter = false; }
          else if (p === 'in_progress' && lastCompletedIdx >= 0) hasInProgressAfter = true;
        } catch { /* skip */ }
      });
      const alreadySaved = lastCompletedIdx >= 0 && !hasInProgressAfter;

      if (!alreadySaved) {
        try {
          await this.orderModel.create({
            name: knownOrder.name,
            drink: knownOrder.drink,
            size: nullStr(knownOrder.size),
            milk: nullStr(knownOrder.milk),
            syrup: nullStr(knownOrder.syrup),
            sweeter: nullStr(knownOrder.sweeteners),
            toppings: nullStr(knownOrder.toppings),
            quantity: safeQty(knownOrder.quantity),
          });
        } catch (err) {
          console.error('Failed to save order:', err);
        }
      }

      // Build deterministic completion message from knownOrder
      const customerName = knownOrder.name ? `, ${knownOrder.name}` : '';
      const lines: string[] = [`Your order has been placed${customerName}! ☕`, ''];
      const qty = safeQty(knownOrder.quantity);
      const sz = knownOrder.size && knownOrder.size !== 'null' ? knownOrder.size + ' ' : '';
      lines.push(`Drink: ${qty > 1 ? `${qty}x ` : ''}${sz}${knownOrder.drink}`);
      if (knownOrder.milk && knownOrder.milk !== 'null') lines.push(`Milk: ${knownOrder.milk}`);
      if (knownOrder.syrup && knownOrder.syrup !== 'null') lines.push(`Syrup: ${knownOrder.syrup}`);
      if (knownOrder.sweeteners && knownOrder.sweeteners !== 'null') lines.push(`Sweetener: ${knownOrder.sweeteners}`);
      if (knownOrder.toppings && knownOrder.toppings !== 'null') lines.push(`Toppings: ${knownOrder.toppings}`);
      lines.push('', 'Would you like to order something else?');
      response.message = lines.join('\n');
      response.current_order = knownOrder as any;
      response.suggestions = ['Yes, order another drink', "No, that's all"];
    }

    return response;
  };
}
