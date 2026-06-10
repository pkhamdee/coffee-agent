import type { Order } from '../types';

interface Props {
  order: Order | null;
  progress: 'in_progress' | 'completed' | null;
}

const fields: { key: keyof Order; label: string }[] = [
  { key: 'name', label: 'Customer Name' },
  { key: 'drink', label: 'Drink' },
  { key: 'size', label: 'Size' },
  { key: 'milk', label: 'Milk' },
  { key: 'syrup', label: 'Syrup' },
  { key: 'sweeteners', label: 'Sweetener' },
  { key: 'toppings', label: 'Toppings' },
  { key: 'quantity', label: 'Quantity' },
];

export default function OrderSidebar({ order, progress }: Props) {
  const isCompleted = progress === 'completed';

  return (
    <aside className="w-64 shrink-0 bg-[#1E3932] text-white flex flex-col">
      <div className="p-5 border-b border-white/10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-green-300">
          Current Order
        </h2>
        {isCompleted && (
          <span className="inline-block mt-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-400 text-[#1E3932]">
            Completed
          </span>
        )}
      </div>

      <div className="flex-1 p-5 space-y-3 overflow-y-auto">
        {!order ? (
          <p className="text-sm text-white/40 italic">No order yet. Start chatting!</p>
        ) : (
          fields.map(({ key, label }) => {
            const value = order[key];
            const filled = value !== null && value !== undefined;
            return (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest text-white/40">{label}</span>
                <span
                  className={`text-sm font-medium ${filled ? 'text-white' : 'text-white/25 italic'}`}
                >
                  {filled ? String(value) : '—'}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="p-5 border-t border-white/10 text-[10px] text-white/30 uppercase tracking-widest">
        Coffee Order Bot
      </div>
    </aside>
  );
}
