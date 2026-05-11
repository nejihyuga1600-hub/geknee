'use client';
import { useEffect, useState } from 'react';

interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  note?: string | null;
}

const CATEGORIES = [
  { value: 'food', label: '🍜 Food' },
  { value: 'lodging', label: '🏨 Lodging' },
  { value: 'transport', label: '🚕 Transport' },
  { value: 'activities', label: '🎟️ Activities' },
  { value: 'shopping', label: '🛍️ Shopping' },
  { value: 'other', label: '✨ Other' },
] as const;

const CAT_COLOR: Record<string, string> = {
  food: '#fb923c', lodging: '#60a5fa', transport: '#34d399',
  activities: '#a78bfa', shopping: '#fbbf24', other: '#94a3b8',
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BudgetTracker({ tripId }: { tripId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('food');
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trips/${tripId}/expenses`)
      .then(r => r.ok ? r.json() : { expenses: [] })
      .then((d: { expenses: Expense[] }) => { if (!cancelled) setExpenses(d.expenses ?? []); })
      .catch(() => { /* leave empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tripId]);

  async function add() {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    const res = await fetch(`/api/trips/${tripId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayISO(), amount: n, category, note: note.trim() || undefined }),
    });
    if (res.ok) {
      const e = await res.json() as Expense;
      setExpenses(prev => [e, ...prev]);
      setAmount(''); setNote(''); setAdding(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/trips/${tripId}/expenses?expenseId=${id}`, { method: 'DELETE' });
    if (res.ok) setExpenses(prev => prev.filter(e => e.id !== id));
  }

  const today = todayISO();
  const todayTotal = expenses.filter(e => e.date === today).reduce((a, e) => a + e.amount, 0);
  const tripTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const byCat: Record<string, number> = {};
  for (const e of expenses) byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;

  return (
    <section style={{
      background: 'rgba(13,13,36,0.85)',
      border: '1px solid rgba(167,139,250,0.25)',
      borderRadius: 14, padding: 18,
      fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
      color: '#e2e8f0',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: '#a8a8c0', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
            Live Budget
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-display, Georgia, serif)', marginTop: 2 }}>
            ${todayTotal.toFixed(2)} <span style={{ fontSize: 12, color: '#a8a8c0', fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontWeight: 400 }}>today</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#6b6b85' }}>TRIP TOTAL</div>
          <div style={{ fontSize: 16, color: '#cbd5e1', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
            ${tripTotal.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Category breakdown stack-bar */}
      {tripTotal > 0 && (
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
          {CATEGORIES.map(c => {
            const pct = (byCat[c.value] ?? 0) / tripTotal * 100;
            return pct > 0 ? <div key={c.value} title={`${c.label.replace(/^\S+\s/, '')} $${byCat[c.value].toFixed(2)}`}
              style={{ width: `${pct}%`, background: CAT_COLOR[c.value] }} /> : null;
          })}
        </div>
      )}

      {!adding ? (
        <button onClick={() => setAdding(true)} style={{
          width: '100%', padding: '11px 14px', borderRadius: 10,
          background: 'rgba(167,139,250,0.16)', border: '1px solid rgba(167,139,250,0.4)',
          color: '#c7d2fe', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>+ Log expense for today</button>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, color: '#a8a8c0', fontSize: 14 }}>$</span>
            <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, fontFamily: 'inherit' }} />
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: 13, fontFamily: 'inherit' }}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value} style={{ background: '#0a0a1f' }}>{c.label}</option>)}
            </select>
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" maxLength={200}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(167,139,250,0.18)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setAdding(false); setAmount(''); setNote(''); }} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#a8a8c0', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={add} style={{ flex: 2, padding: '8px 0', borderRadius: 8, background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)', color: '#0a0a1f', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 12, fontSize: 11, color: '#6b6b85' }}>Loading…</div>
      ) : expenses.length === 0 ? (
        <div style={{ marginTop: 12, fontSize: 11, color: '#6b6b85', textAlign: 'center', padding: 8 }}>
          No expenses logged yet. Tap above to add your first one.
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
          {expenses.slice(0, 8).map(e => {
            const cat = CATEGORIES.find(c => c.value === e.category);
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLOR[e.category] }} />
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ color: '#cbd5e1' }}>{cat?.label.replace(/^\S+\s/, '') ?? e.category}</span>
                  {e.note && <span style={{ color: '#6b6b85' }}> · {e.note}</span>}
                </span>
                <span style={{ color: '#a8a8c0', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>${e.amount.toFixed(2)}</span>
                <button onClick={() => remove(e.id)} aria-label="Delete" style={{ background: 'transparent', border: 'none', color: '#6b6b85', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
