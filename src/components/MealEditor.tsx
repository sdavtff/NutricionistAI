import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { saveMeal, uid } from '../db/repo';
import type { MealEntry, MealItem, MealType } from '../db/types';
import { nowTime, todayISO } from '../lib/date';
import { fmt } from '../lib/format';
import { guessMealType, MEAL_LABELS, scaleNutrients, sumItems } from '../lib/nutrition';
import { parseDecimal } from '../lib/validation';
import { FoodPicker } from './FoodPicker';
import { Alert, Button, Field, Modal, SourceBadge, StoredImg, TextInput } from './ui';
import { useToast } from '../context/ToastContext';

export function newMeal(userId: string, date = todayISO(), mealType?: MealType): MealEntry {
  return {
    id: uid(), userId, date, time: nowTime(), mealType: mealType ?? guessMealType(), name: '', items: [],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

/** Editor de refeição: nome, tipo, data/hora, itens e porções. */
export function MealEditor({ meal, open, onClose, onSaved }: { meal: MealEntry | null; open: boolean; onClose: () => void; onSaved: (m: MealEntry) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<MealEntry | null>(meal);
  const [picker, setPicker] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(meal);
    setErr(null);
  }, [meal, open]);

  if (!draft) return null;
  const totals = sumItems(draft.items);

  function setItem(id: string, patch: Partial<MealItem>) {
    setDraft((d) => d && { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }

  async function save() {
    if (!draft) return;
    setErr(null);
    if (!draft.items.length) return setErr('Adicione ao menos um alimento.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return setErr('Data inválida.');
    if (!/^\d{2}:\d{2}$/.test(draft.time)) return setErr('Horário inválido.');
    setSaving(true);
    try {
      const name = draft.name.trim() || draft.items.map((i) => i.name.split(',')[0]).slice(0, 3).join(', ');
      const saved = await saveMeal({ ...draft, name: name.slice(0, 120) });
      toast('Refeição salva no diário.');
      onSaved(saved);
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal open={open && !picker} onClose={onClose} title={meal?.items.length ? 'Editar refeição' : 'Nova refeição'}
        footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={save}>Salvar refeição</Button></>}>
        <div className="stack">
          {draft.imageId ? <StoredImg id={draft.imageId} alt="Foto da refeição" className="photo" /> : null}
          <TextInput label="Nome da refeição (opcional)" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Almoço em casa" />
          <div className="grid-2">
            <Field label="Refeição" id="meal-type">
              <select id="meal-type" className="input" value={draft.mealType} onChange={(e) => setDraft({ ...draft, mealType: e.target.value as MealType })}>
                {Object.entries(MEAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <TextInput label="Data" type="date" value={draft.date} max={todayISO()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              <TextInput label="Horário" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
            </div>
          </div>

          <div className="stack-sm">
            <div className="row between"><span className="label">Alimentos</span><Button size="sm" variant="soft" onClick={() => setPicker(true)}><Plus size={16} />Adicionar alimento</Button></div>
            {!draft.items.length ? <p className="small muted">Nenhum alimento ainda.</p> : null}
            {draft.items.map((it) => {
              const s = scaleNutrients(it.per100g, it.grams);
              return (
                <div key={it.id} className="list-item">
                  <div className="grow">
                    <div className="strong small">{it.name}</div>
                    <div className="row-wrap tiny muted"><SourceBadge source={it.source} />{fmt(s.kcal, 0)} kcal · P {fmt(s.protein)} g · C {fmt(s.carbs)} g · G {fmt(s.fat)} g</div>
                  </div>
                  <input className="input" style={{ width: 92, minHeight: 40 }} inputMode="decimal" aria-label={`Gramas de ${it.name}`}
                    defaultValue={it.grams} onBlur={(e) => {
                      const g = parseDecimal(e.target.value);
                      if (g > 0 && g <= 5000) setItem(it.id, { grams: Math.round(g) });
                      else e.target.value = String(it.grams);
                    }} />
                  <span className="tiny muted">g</span>
                  <Button size="icon" variant="ghost" aria-label={`Remover ${it.name}`} onClick={() => setDraft({ ...draft, items: draft.items.filter((x) => x.id !== it.id) })}><Trash2 size={18} /></Button>
                </div>
              );
            })}
          </div>
          {draft.items.length ? (
            <div className="card flat small">
              Total: <strong>{fmt(totals.values.kcal, 0)} kcal</strong> · Proteínas {fmt(totals.values.protein)} g · Carboidratos {fmt(totals.values.carbs)} g · Gorduras {fmt(totals.values.fat)} g
            </div>
          ) : null}
          {err ? <Alert kind="danger">{err}</Alert> : null}
        </div>
      </Modal>
      <FoodPicker open={picker} onClose={() => setPicker(false)} userId={draft.userId}
        onPick={(item) => setDraft((d) => d && { ...d, items: [...d.items, item] })} />
    </>
  );
}
