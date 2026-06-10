import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { MongoClient } from 'mongodb';
import { Connection, Model } from 'mongoose';

import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';

import { ChatOllama } from '@langchain/ollama';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';

import { Order } from './schemas/order.schema';
import { DRINKS } from 'src/lib/utils/constants/menu_data';
import {
  extractJsonResponse,
  nullStr,
  safeQty,
  NO_DECLINE_PATTERNS,
  isValidCustomerName,
  userMentioned,
  buildQuestionMap,
} from './agent-utils';

import {
  createSweetenersSummary,
  availableToppingsSummary,
  createAvailableMilksSummary,
  createSyrupsSummary,
  createSizesSummary,
  createDrinkItemSummary,
} from 'src/lib/summaries';

const CHECKPOINT_DB_NAME = 'drinks_db';

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => [...x, ...y],
  }),
});

@Injectable()
export class ChatService {
  private readonly agent: ReturnType<
    InstanceType<typeof StateGraph<any, any, any, any>>['compile']
  >;
  private readonly llm: ChatOllama;

  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectConnection() private connection: Connection,
  ) {
    this.llm = new ChatOllama({
      model: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
      temperature: 0,
      baseUrl: (
        process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
      ).replace('/v1', ''),
      format: 'json',
    });

    // Reuse the Mongoose connection's underlying driver client for LangGraph
    // checkpoints instead of opening a second connection.
    const checkpointer = new MongoDBSaver({
      client: this.connection.getClient() as unknown as MongoClient,
      dbName: CHECKPOINT_DB_NAME,
    });

    this.agent = new StateGraph(GraphState)
      .addNode('agent', (state, config) => this.callModel(state, config))
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ checkpointer });
  }

  getOrders() {
    return this.orderModel
      .find({ status: { $ne: 'delivered' } })
      .sort({ _id: -1 })
      .lean()
      .exec();
  }

  deliverOrder(id: string) {
    return this.orderModel
      .findByIdAndUpdate(id, { status: 'delivered' }, { new: true })
      .exec();
  }

  private async callModel(
    state: typeof GraphState.State,
    config: RunnableConfig,
  ) {
    const knownOrder: Record<string, any> =
      config?.configurable?.knownOrder ?? {};
    const sessionStart: number = config?.configurable?.sessionStart ?? 0;

    // Escape braces so LangChain template doesn't treat JSON keys as variables
    const knownOrderJson = JSON.stringify(knownOrder)
      .replace(/\{/g, '{{')
      .replace(/\}/g, '}}');

    // Compute exactly which fields still need to be collected for this drink,
    // and inject them as an explicit ordered list so the model can't ask for
    // wrong or unsupported fields.
    const drinkMeta = DRINKS.find(
      (d) => d.name.toLowerCase() === (knownOrder.drink ?? '').toLowerCase(),
    );
    const stillNeeded: string[] = [];
    if (!knownOrder.name)
      stillNeeded.push("name — greet and ask for the customer's name");
    if (!knownOrder.drink) stillNeeded.push('drink — ask which drink');
    if (drinkMeta?.supportSize && !knownOrder.size) stillNeeded.push('size');
    if (drinkMeta?.supportMilk && !knownOrder.milk) stillNeeded.push('milk');
    if (drinkMeta?.supportSyrup && !knownOrder.syrup) stillNeeded.push('syrup');
    if (drinkMeta?.supportSweeteners && !knownOrder.sweeteners)
      stillNeeded.push('sweeteners');
    if (drinkMeta?.supportTopping && !knownOrder.toppings)
      stillNeeded.push('toppings');
    if (knownOrder.drink && !knownOrder.quantity) stillNeeded.push('quantity');

    const nextFieldInstruction =
      stillNeeded.length > 0
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

    // Only pass messages from the current order session so the model
    // doesn't inherit context from a completed previous order.
    const formattedPrompt = await prompt.formatMessages({
      messages: state.messages.slice(sessionStart),
    });

    const result = await this.llm.invoke(formattedPrompt);
    return { messages: [result] };
  }

  chatWithAgent = async ({
    thread_id,
    query,
  }: {
    thread_id: string;
    query: string;
  }) => {
    // ─── Read previous conversation state before this turn ───────────────────
    const threadConfig = { configurable: { thread_id } };
    const prevState = await this.agent.getState(threadConfig);
    const prevMessages: BaseMessage[] =
      (prevState?.values as any)?.messages ?? [];

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
      } catch {
        /* not a structured message */
      }
    }

    // Rebuild the authoritative current_order by scanning session messages in
    // chronological order — AI messages supply confirmed values, human messages
    // supply explicit declines (e.g. "No Toppings") that the model may have omitted.
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
            if (k === 'name' && !isValidCustomerName(strV)) continue;
            knownOrder[k] = v;
          }
        } catch {
          /* skip */
        }
      }
    }

    // ─── Run the graph ────────────────────────────────────────────────────────
    const finalState = await this.agent.invoke(
      { messages: [new HumanMessage(query)] },
      { configurable: { thread_id, knownOrder, sessionStart } },
    );

    const allMessages: BaseMessage[] = finalState.messages;
    const lastMessage = allMessages.at(-1) as AIMessage;
    let response: any;
    try {
      response = extractJsonResponse(lastMessage.content);
    } catch (err) {
      // The model produced unparseable output. The garbage message is already
      // checkpointed (and tolerated by the session-rebuild loop), so recover
      // gracefully instead of returning a 500.
      console.error('Unparseable model output:', err);
      return {
        message: "Sorry, I didn't quite catch that — could you say it again?",
        current_order: knownOrder,
        suggestions: [],
        progress: 'in_progress',
      };
    }
    if (!response.progress) response.progress = 'in_progress';

    // Update knownOrder with values from this turn's response,
    // but only accept field values the user actually said in the CURRENT session
    // (prevents inheriting values like "Grande"/"Oat Milk" from a prior order).
    const humanMsgs = allMessages
      .slice(sessionStart)
      .filter((m) => m instanceof HumanMessage)
      .map((m) => String(m.content).toLowerCase());

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
        const msg = (
          extractJsonResponse(last.content)?.message ?? ''
        ).toLowerCase();
        return msg.includes('name') || msg.includes('call you');
      } catch {
        return false;
      }
    })();

    if (response.current_order) {
      for (const [k, v] of Object.entries(
        response.current_order as Record<string, any>,
      )) {
        if (v === null || v === 'null' || v === undefined) continue;
        const strV = String(v).trim();
        if (!strV) continue;
        if (k === 'quantity') {
          knownOrder[k] = v;
          continue;
        }
        if (k === 'name') {
          if (prevBotAskedForName && isValidCustomerName(strV)) {
            knownOrder.name = v;
          }
          continue;
        }
        if (userMentioned(humanMsgs, strV)) knownOrder[k] = v;
      }
    }

    // Apply decline fallback for the current turn's human message — the rebuild
    // loop handles previous turns; this covers the just-submitted message.
    const latestHuman = String(
      (allMessages.filter((m) => m instanceof HumanMessage).at(-1) as any)
        ?.content ?? '',
    ).toLowerCase();
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
    const questionMap = buildQuestionMap(knownOrder.drink);

    if (knownOrder.drink || !knownOrder.name) {
      const drinkMeta = DRINKS.find(
        (d) => d.name.toLowerCase() === (knownOrder.drink ?? '').toLowerCase(),
      );
      const uncollected: string[] = [];
      if (!knownOrder.name) uncollected.push('name');
      if (knownOrder.name && !knownOrder.drink) uncollected.push('drink');
      if (drinkMeta?.supportSize && !knownOrder.size) uncollected.push('size');
      if (drinkMeta?.supportMilk && !knownOrder.milk) uncollected.push('milk');
      if (drinkMeta?.supportSyrup && !knownOrder.syrup)
        uncollected.push('syrup');
      if (drinkMeta?.supportSweeteners && !knownOrder.sweeteners)
        uncollected.push('sweeteners');
      if (drinkMeta?.supportTopping && !knownOrder.toppings)
        uncollected.push('toppings');
      if (knownOrder.drink && !knownOrder.quantity)
        uncollected.push('quantity');

      if (uncollected.length > 0 && response.progress === 'completed') {
        // Block premature completion — ask for the first uncollected field.
        const next = questionMap[uncollected[0]];
        const guardPayload = {
          message: next.msg,
          current_order: knownOrder,
          suggestions: next.opts,
          progress: 'in_progress',
        };
        await this.agent.updateState(threadConfig, {
          messages: [new AIMessage(JSON.stringify(guardPayload))],
        });
        return guardPayload;
      }

      if (uncollected.length === 0 && response.progress !== 'completed') {
        // All fields collected but model returned in_progress — force completion.
        response.progress = 'completed';
        // Persist a completed message to LangGraph so next turn's sessionStart
        // calculation correctly finds this completion boundary.
        await this.agent.updateState(threadConfig, {
          messages: [
            new AIMessage(
              JSON.stringify({ ...response, progress: 'completed' }),
            ),
          ],
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
        await this.agent.updateState(threadConfig, {
          messages: [new AIMessage(JSON.stringify(nameGuard))],
        });
        return nameGuard;
      }
    }

    // ─── Save order on completion ─────────────────────────────────────────────
    if (response.progress === 'completed' && knownOrder.drink) {
      // De-duplication: only scan the CURRENT session — if a completed message
      // already exists in this session, this order was saved on a prior turn.
      // (Scanning all history would let a previous order's completion suppress
      // saving a new one.)
      const alreadySaved = allMessages.slice(sessionStart, -1).some((m) => {
        if (!(m instanceof AIMessage)) return false;
        try {
          return extractJsonResponse(m.content)?.progress === 'completed';
        } catch {
          return false;
        }
      });

      if (!alreadySaved) {
        try {
          await this.orderModel.create({
            name: knownOrder.name,
            drink: knownOrder.drink,
            size: nullStr(knownOrder.size),
            milk: nullStr(knownOrder.milk),
            syrup: nullStr(knownOrder.syrup),
            sweetener: nullStr(knownOrder.sweeteners),
            toppings: nullStr(knownOrder.toppings),
            quantity: safeQty(knownOrder.quantity),
          });
        } catch (err) {
          console.error('Failed to save order:', err);
        }
      }

      // Build deterministic completion message from knownOrder
      const customerName = knownOrder.name ? `, ${knownOrder.name}` : '';
      const lines: string[] = [
        `Your order has been placed${customerName}! ☕`,
        '',
      ];
      const qty = safeQty(knownOrder.quantity);
      const sz = nullStr(knownOrder.size) ? knownOrder.size + ' ' : '';
      lines.push(`Drink: ${qty > 1 ? `${qty}x ` : ''}${sz}${knownOrder.drink}`);
      if (nullStr(knownOrder.milk)) lines.push(`Milk: ${knownOrder.milk}`);
      if (nullStr(knownOrder.syrup)) lines.push(`Syrup: ${knownOrder.syrup}`);
      if (nullStr(knownOrder.sweeteners))
        lines.push(`Sweetener: ${knownOrder.sweeteners}`);
      if (nullStr(knownOrder.toppings))
        lines.push(`Toppings: ${knownOrder.toppings}`);
      lines.push('', 'Would you like to order something else?');
      response.message = lines.join('\n');
      response.current_order = knownOrder as any;
      response.suggestions = ['Yes, order another drink', "No, that's all"];
    }

    return response;
  };
}
