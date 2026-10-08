import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getOrders, deliverOrder } from '../api';
import type { SavedOrder } from '../types';

const DETAIL_ROWS: { key: keyof SavedOrder; label: string }[] = [
  { key: 'name', label: 'Customer' },
  { key: 'drink', label: 'Drink' },
  { key: 'size', label: 'Size' },
  { key: 'milk', label: 'Milk' },
  { key: 'syrup', label: 'Syrup' },
  { key: 'sweetener', label: 'Sweetener' },
  { key: 'toppings', label: 'Toppings' },
  { key: 'quantity', label: 'Quantity' },
];

function OrderDetailModal({
  order,
  onClose,
  onDeliver,
}: {
  order: SavedOrder;
  onClose: () => void;
  onDeliver: () => Promise<void>;
}) {
  const [delivering, setDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);

  const handleDeliver = async () => {
    setDelivering(true);
    setDeliverError(null);
    try {
      await onDeliver();
    } catch {
      setDeliverError('Failed to mark as delivered. Please try again.');
    } finally {
      setDelivering(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="bg-[#1E3932] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#00704A] flex items-center justify-center text-white text-sm font-bold">
              ☕
            </div>
            <h2 className="text-white font-semibold">{order.drink}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Order details */}
        <div className="px-5 py-4 divide-y divide-gray-100">
          {DETAIL_ROWS.filter(({ key }) => key !== 'drink').map(({ key, label }) => {
            const value = order[key];
            const display = value !== null && value !== undefined ? String(value) : '—';
            const isNull = value === null || value === undefined;
            return (
              <div key={key} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-400">{label}</span>
                <span className={`text-sm font-medium ${isNull ? 'text-gray-300' : 'text-gray-800'}`}>
                  {display}
                </span>
              </div>
            );
          })}
        </div>

        {/* Deliver button */}
        <div className="px-5 pb-5">
          {deliverError && (
            <p className="text-xs text-red-600 mb-2">{deliverError}</p>
          )}
          <button
            onClick={handleDeliver}
            disabled={delivering}
            className="w-full bg-[#00704A] hover:bg-[#005c3b] disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {delivering ? 'Delivering…' : 'Mark as Delivered'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  index,
  onClick,
}: {
  order: SavedOrder;
  index: number;
  onClick: () => void;
}) {
  const details = [
    order.size,
    order.milk,
    order.syrup,
    order.sweetener,
    order.toppings,
  ].filter(Boolean);

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 text-left w-full hover:shadow-md hover:border-[#00704A]/30 transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#00704A] text-white text-xs font-bold flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{order.drink}</h2>
            <p className="text-xs text-[#00704A] font-medium">{order.name}</p>
          </div>
        </div>
        <span className="text-xs text-white bg-[#1E3932] px-2.5 py-1 rounded-full">
          x{order.quantity}
        </span>
      </div>

      {details.length > 0 ? (
        <p className="text-xs text-gray-400 truncate">{details.join(' · ')}</p>
      ) : (
        <p className="text-xs text-gray-300 italic">No extras</p>
      )}

      <p className="text-xs text-[#00704A] font-medium">Tap to view details →</p>
    </button>
  );
}

export default function BaristaDashboard() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [selected, setSelected] = useState<SavedOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await getOrders();
      setOrders(data);
      setLastRefreshed(new Date());
      setError(null);
    } catch {
      setError('Failed to load orders. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleDeliver = async () => {
    if (!selected) return;
    await deliverOrder(selected._id);
    setOrders((prev) => prev.filter((o) => o._id !== selected._id));
    setSelected(null);
  };

  return (
    <div className="min-h-screen bg-[#F2F0EB]">
      {/* Header */}
      <header className="bg-[#1E3932] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#00704A] flex items-center justify-center font-bold text-lg">
            B
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">Barista Dashboard</h1>
            <p className="text-xs text-green-300 mt-0.5">Order queue</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50">
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchOrders}
            className="text-xs px-3 py-1.5 rounded-full border border-white/30 text-white/70 hover:bg-white/10 transition-colors"
          >
            Refresh
          </button>
          <Link
          to="/setup"
          className="text-xs px-3 py-1.5 rounded-full border border-white/30 text-white/70 hover:bg-white/10 transition-colors"
          >
          Setup
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            {loading ? 'Loading…' : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
          </h2>
          <span className="text-xs text-gray-400">Auto-refreshes every 10 s</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">☕</p>
            <p className="text-sm">No orders yet. Waiting for customers…</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order, i) => (
            <OrderCard
              key={order._id}
              order={order}
              index={i}
              onClick={() => setSelected(order)}
            />
          ))}
        </div>
      </main>

      {selected && (
        <OrderDetailModal
          order={selected}
          onClose={() => setSelected(null)}
          onDeliver={handleDeliver}
        />
      )}
    </div>
  );
}
