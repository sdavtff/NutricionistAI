import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, Utensils } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MacroBar } from '../components/charts';
import { MealEditor, newMeal } from '../components/MealEditor';
import { NutritionTable } from '../components/NutritionTable';
import { Button, Empty, Modal, PageLoading, StoredImg, TextInput, useConfirm } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { deleteMeal, duplicateMeal, listMealsByDate } from '../db/repo';
import type { MealEntry, MealType } from '../db/types';
import { addDays, formatDateLong, nowTime, todayISO } from '../lib/date';
import { fmt } from '../lib/format';
import { MEAL_LABELS, sumItems, sumMeals } from '../lib/nutrition';

const ORDER: MealType[] = ['cafe', 'almoco', 'lanche', 'jantar', 'outras'];

export function DiaryPage() {
  const user = useUser();
  const { settings } = useApp();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [params, setParams] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('data') ?? '') ? params.get('data')! : todayISO();
  const [meals, setMeals] = useState<MealEntry[] | null>(null);
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const [dup, setDup] = useState<MealEntry | null>(null);
  const [dupDate, setDupDate] = useState(todayISO());
  const [details, setDetails] = useState<MealEntry | null>(null);

  const load = useCallback(() => listMealsByDate(user.id, date).then(setMeals), [user.id, date]);
  useEffect(() => {
    setMeals(null);
    void load();
  }, [load]);

  const go = (d: string) => setParams({ data: d });
  const hideCal = settings?.hideCalories;

  if (!meals) return <PageLoading />;
  const totals = sumMeals(meals);
  const t = totals.values;

  return (
    <div className="page stack">
      {node}
      <div className="page-header">
        <div>
          <h1>Diário alimentar</h1>
          <p>{formatDateLong(date).replace(/^./, (c) => c.toUpperCase())}{date === todayISO() ? ' · hoje' : ''}</p>
        </div>
        <div className="row">
          <Button size="icon" aria-label="Dia anterior" onClick={() => go(addDays(date, -1))}><ChevronLeft size={20} /></Button>
          <input type="date" className="input" style={{ width: 170 }} value={date} max={todayISO()} aria-label="Escolher data" onChange={(e) => e.target.value && go(e.target.value)} />
          <Button size="icon" aria-label="Próximo dia" disabled={date >= todayISO()} onClick={() => go(addDays(date, 1))}><ChevronRight size={20} /></Button>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h2>Total do dia</h2><span className="small muted">{totals.itemCount} alimento(s)</span></div>
        <div className="grid-2">
          <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
            {!hideCal ? <div className="kpi"><span className="value">{fmt(t.kcal ?? 0, 0)}</span><span className="label">kcal</span></div> : null}
            <div className="kpi"><span className="value">{fmt(t.protein ?? 0, 0)} g</span><span className="label">proteínas</span></div>
            <div className="kpi"><span className="value">{fmt(t.carbs ?? 0, 0)} g</span><span className="label">carboidratos</span></div>
            <div className="kpi"><span className="value">{fmt(t.fat ?? 0, 0)} g</span><span className="label">gorduras</span></div>
          </div>
          <div className="stack-sm">
            <MacroBar label="Fibras" value={t.fiber} max={25} color="var(--c-fiber)" />
            <MacroBar label="Sódio" value={t.sodium} max={2000} unit="mg" color="var(--accent)" />
            {totals.missing.sodium > 0 || totals.missing.fiber > 0 ? <p className="tiny muted">Alguns alimentos não têm dados de fibras ou sódio; os totais podem estar incompletos.</p> : null}
          </div>
        </div>
      </div>

      {ORDER.map((type) => {
        const list = meals.filter((m) => m.mealType === type);
        const sub = sumMeals(list).values;
        return (
          <section key={type} className="card" aria-labelledby={`sec-${type}`}>
            <div className="card-title">
              <div>
                <h2 id={`sec-${type}`}>{MEAL_LABELS[type]}</h2>
                {list.length && !hideCal ? <span className="tiny muted">{fmt(sub.kcal, 0)} kcal · P {fmt(sub.protein, 0)} g · C {fmt(sub.carbs, 0)} g · G {fmt(sub.fat, 0)} g</span> : null}
              </div>
              <Button size="sm" variant="soft" onClick={() => setEditing(newMeal(user.id, date, type))}><Plus size={16} />Adicionar</Button>
            </div>
            {list.length ? list.map((m) => {
              const mt = sumItems(m.items).values;
              return (
                <div key={m.id} className="list-item">
                  <button type="button" className="row grow" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 0 }} onClick={() => setDetails(m)}>
                    <div className="thumb"><StoredImg id={m.imageId} alt={m.name} fallback={<Utensils size={20} />} /></div>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="strong truncate">{m.name}</div>
                      <div className="tiny muted truncate">{m.time} · {m.items.map((i) => `${i.name.split(',')[0]} (${i.grams} g)`).join(', ')}</div>
                      <div className="tiny">{hideCal ? '' : `${fmt(mt.kcal, 0)} kcal · `}P {fmt(mt.protein)} g · C {fmt(mt.carbs)} g · G {fmt(mt.fat)} g</div>
                    </div>
                  </button>
                  <div className="row" style={{ gap: 2 }}>
                    <Button size="icon" variant="ghost" aria-label={`Editar ${m.name}`} onClick={() => setEditing(m)}><Pencil size={18} /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Duplicar ${m.name}`} onClick={() => { setDup(m); setDupDate(todayISO()); }}><Copy size={18} /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Excluir ${m.name}`} onClick={async () => {
                      if (await ask('Excluir refeição?', `“${m.name}” será removida do diário.`, { danger: true, confirm: 'Excluir' })) {
                        await deleteMeal(m.id);
                        toast('Refeição excluída.');
                        void load();
                      }
                    }}><Trash2 size={18} /></Button>
                  </div>
                </div>
              );
            }) : <p className="small muted">Nada registrado.</p>}
          </section>
        );
      })}

      {!meals.length ? <Empty title="Dia sem registros" action={<Button variant="primary" onClick={() => setEditing(newMeal(user.id, date))}><Plus size={18} />Registrar refeição</Button>}>Adicione alimentos manualmente ou use o analisador de fotos.</Empty> : null}

      <MealEditor open={!!editing} meal={editing} onClose={() => setEditing(null)} onSaved={(m) => (m.date === date ? void load() : go(m.date))} />

      <Modal open={!!dup} onClose={() => setDup(null)} title="Duplicar refeição" footer={<>
        <Button onClick={() => setDup(null)}>Cancelar</Button>
        <Button variant="primary" onClick={async () => {
          if (!dup) return;
          await duplicateMeal(dup.id, dupDate, dupDate === todayISO() ? nowTime() : dup.time);
          toast('Refeição duplicada.');
          setDup(null);
          if (dupDate === date) void load(); else go(dupDate);
        }}>Duplicar</Button>
      </>}>
        <div className="stack">
          <p className="small muted">Uma cópia independente de “{dup?.name}” será criada na data escolhida. Você poderá editar as quantidades depois.</p>
          <TextInput label="Data da cópia" type="date" value={dupDate} max={todayISO()} onChange={(e) => setDupDate(e.target.value)} />
        </div>
      </Modal>

      <Modal open={!!details} onClose={() => setDetails(null)} title={details?.name ?? ''} footer={<Button variant="primary" onClick={() => { setEditing(details); setDetails(null); }}><Pencil size={16} />Editar</Button>}>
        {details ? (
          <div className="stack">
            {details.imageId ? <StoredImg id={details.imageId} alt={details.name} className="photo" /> : null}
            <p className="small muted">{MEAL_LABELS[details.mealType]} · {details.time}</p>
            <NutritionTable items={details.items} title="Nutrientes da refeição" />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
