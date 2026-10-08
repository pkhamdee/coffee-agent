import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { sendMessage } from './api';
import type { ChatMessage, Order, ApiResponse } from './types';
import MessageBubble from './components/MessageBubble';
import SuggestionsBar from './components/SuggestionsBar';
import InputBar from './components/InputBar';
import OrderSidebar from './components/OrderSidebar';

function getOrCreateThreadId(): string {
  const stored = localStorage.getItem('coffee_thread_id');
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem('coffee_thread_id', id);
  return id;
}

export default function App() {
  const threadId = useRef(getOrCreateThreadId());
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: "Hi! I'm your Coffee order assistant. What can I get started for you today? ☕",
      timestamp: new Date(),
    },
  ]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [progress, setProgress] = useState<ApiResponse['progress'] | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSuggestions([]);
    setLoading(true);

    try {
      const data = await sendMessage(threadId.current, text);

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setCurrentOrder(data.current_order);
      setSuggestions(data.suggestions ?? []);
      setProgress(data.progress);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNewOrder = () => {
    const newId = crypto.randomUUID();
    localStorage.setItem('coffee_thread_id', newId);
    threadId.current = newId;
    setMessages([
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "New order started! What can I get for you? ☕",
        timestamp: new Date(),
      },
    ]);
    setCurrentOrder(null);
    setSuggestions([]);
    setProgress(null);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar */}
      <OrderSidebar order={currentOrder} progress={progress} />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 overflow-hidden bg-[#F2F0EB]">
        {/* Header */}
        <header className="bg-[#1E3932] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#00704A] flex items-center justify-center font-bold text-lg">
              S
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none">Coffee Order Bot</h1>
              <p className="text-xs text-green-300 mt-0.5">Powered by AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
            to="/setup"
            className="text-xs px-3 py-1.5 rounded-full border border-white/30 text-white/70 hover:bg-white/10 transition-colors"
          >
            Setup
          </Link>
            <button
              onClick={handleNewOrder}
              className="text-xs px-3 py-1.5 rounded-full border border-white/30 text-white/70 hover:bg-white/10 transition-colors"
            >
              New Order
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {loading && (
            <div className="flex justify-start mb-3">
              <div className="w-8 h-8 rounded-full bg-[#00704A] flex items-center justify-center text-white text-sm font-bold mr-2 mt-1 shrink-0">
                S
              </div>
              <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm border border-gray-100">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions + Input */}
        <div className="shrink-0 bg-white border-t border-gray-200">
          <SuggestionsBar
            suggestions={suggestions}
            onSelect={handleSend}
            disabled={loading}
          />
          <InputBar onSend={handleSend} disabled={loading} />
        </div>
      </div>
    </div>
  );
}
