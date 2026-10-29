import { Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Field, PageLoading, useConfirm } from '../components/ui';
import { useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { deleteShoppingList, getOrCreateWeekList, listShoppingLists, saveShoppingList, uid } from '../db/repo';
import type { ShoppingItem, ShoppingList } from '../db/types';
import { addDays, todayISO, weekStart } from '../lib/date';
import { brl } from '../lib/format';
import { cleanText, parseDecimal } from '../lib/validation';

const CATEGORIES = ['Hortifrúti', 'Frutas', 'Proteínas', 'Laticínios', 'Cereais e grãos', 'Padaria', 'Mercearia', 'Óleos e temperos', 'Temperos', 'Bebidas', 'Limpeza', 'Outros'];

export function ShoppingPage() {
  const user = useUser();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [params, setParams] = useSearchParams();
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [form, setForm] = useState({ name: '', quantity: '', category: 'Hortifrúti', price: '' });
  const [err, setErr] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);

  const load = useCallback(async () => {
    await getOrCreateWeekList(user.id, weekStart(todayISO()));
    setLists(await listShoppingLists(user.id));
  }, [user.id]);
  useEffect(() => { void load(); }, [load]);

  if (!lists) return <PageLoading />;
  const current = lists.find((l) => l.id === params.get('lista')) ?? lists.find((l) => l.weekStart === weekStart(todayISO())) ?? lists[0];

  async function update(items: ShoppingItem[], extra: Partial<ShoppingList> = {}) {
    const next = { ...current, ...extra, items };
    await saveShoppingList(next);
    setLists((ls) => ls!.map((l) => (l.id === next.id ? next : l)));
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const name = cleanText(form.name, 80);
    if (name.length < 2) return setErr('Informe o nome do item.');
    const price = form.price ? parseDecimal(form.price) : null;
    if (price !== null && !(price >= 0 && price < 100000)) return setErr('Preço inválido.');
    await update([...current.items, { id: uid(), name, quantity: cleanText(form.quantity, 40), category: form.category, checked: false, priceBRL: price }]);
    setForm({ ...form, name: '', quantity: '', price: '' });
  }

  const groups = CATEGORIES.concat([...new Set(current.items.map((i) => i.category))].filter((c) => !CATEGORIES.includes(c)))
    .map((c) => ({ c, items: current.items.filter((i) => i.category === c && (!hideDone || !i.checked)) }))
    .filter((g) => g.items.length);
  const done = current.items.filter((i) => i.checked).length;
  const total = current.items.reduce((s, i) => s + (i.priceBRL ?? 0), 0);

  return (
    <div className="page stack">
      {node}
      <div className="page-header">
        <div><h1>Lista de compras</h1><p>Organizada por categorias e salva por semana.</p></div>
        <div className="row-wrap">
          <select className="input" style={{ width: 'auto' }} value={current.id} onChange={(e) => setParams({ lista: e.target.value })} aria-label="Escolher lista">
            {lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
          <Button onClick={async () => {
            const next = await getOrCreateWeekList(user.id, addDays(weekStart(todayISO()), 7));
            await load();
            setParams({ lista: next.id });
          }}><Plus size={16} />Próxima semana</Button>
        </div>
      </div>

      <form className="card stack" onSubmit={add}>
        <div className="grid-2">
          <Field label="Item" id="sh-name"><input id="sh-name" className="input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Tomate" /></Field>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Quantidade" id="sh-q"><input id="sh-q" className="input" value={form.quantity} maxLength={40} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="Ex.: 1 kg" /></Field>
            <Field label="Preço (R$)" id="sh-p"><input id="sh-p" className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="opcional" /></Field>
          </div>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Categoria" id="sh-c">
            <select id="sh-c" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Button type="submit" variant="primary"><Plus size={18} />Adicionar</Button>
        </div>
        {err ? <Alert kind="danger">{err}</Alert> : null}
      </form>

      <div className="card">
        <div className="card-title">
          <div><h2>{current.title}</h2><span className="small muted">{done} de {current.items.length} comprados{total ? ` · estimativa ${brl(total)}` : ''}</span></div>
          <div className="row-wrap">
            <label className="check small"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Ocultar comprados</label>
            {done ? <Button size="sm" onClick={() => update(current.items.filter((i) => !i.checked))}>Limpar comprados</Button> : null}
            <Button size="sm" variant="ghost" aria-label="Excluir lista" onClick={async () => {
              if (await ask('Excluir lista?', `A lista “${current.title}” será excluída.`, { danger: true, confirm: 'Excluir' })) {
                await deleteShoppingList(current.id);
                setParams({});
                toast('Lista excluída.');
                void load();
              }
            }}><Trash2 size={16} /></Button>
          </div>
        </div>
        {current.items.length ? (
          <>
            <div className="progress"><span style={{ width: `${(done / current.items.length) * 100}%` }} /></div>
            {groups.map((g) => (
              <div key={g.c} className="mt">
                <div className="small strong muted">{g.c}</div>
                {g.items.map((i) => (
                  <div key={i.id} className="list-item">
                    <label className="check grow" style={{ alignItems: 'center' }}>
                      <input type="checkbox" checked={i.checked} onChange={() => update(current.items.map((x) => (x.id === i.id ? { ...x, checked: !x.checked } : x)))} />
                      <span style={{ textDecoration: i.checked ? 'line-through' : undefined, color: i.checked ? 'var(--text-3)' : undefined }}>
                        {i.name}{i.quantity ? <span className="muted"> — {i.quantity}</span> : null}
                      </span>
                    </label>
                    {i.priceBRL ? <span className="small muted">{brl(i.priceBRL)}</span> : null}
                    <input className="input" style={{ width: 120, minHeight: 36 }} aria-label={`Quantidade de ${i.name}`} defaultValue={i.quantity} maxLength={40}
                      onBlur={(e) => e.target.value !== i.quantity && update(current.items.map((x) => (x.id === i.id ? { ...x, quantity: cleanText(e.target.value, 40) } : x)))} />
                    <Button size="icon" variant="ghost" aria-label={`Remover ${i.name}`} onClick={() => update(current.items.filter((x) => x.id !== i.id))}><Trash2 size={16} /></Button>
                  </div>
                ))}
              </div>
            ))}
          </>
        ) : <Empty icon={<ShoppingCart size={26} />} title="Lista vazia">Adicione itens acima, a partir do plano alimentar ou das receitas.</Empty>}
      </div>
    </div>
  );
}
