import { Barcode, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { listCustomFoods, saveFood, uid } from '../db/repo';
import type { Food, MealItem } from '../db/types';
import { BASE_FOODS, searchFoods } from '../lib/foods';
import { fmt } from '../lib/format';
import { normalizeNutrients, scaleNutrients } from '../lib/nutrition';
import { parseDecimal } from '../lib/validation';
import { lookupBarcode, searchProducts, OFF_LABEL } from '../services/openFoodFacts';
import { Alert, Button, Modal, Segmented, SourceBadge, Spinner, TextInput } from './ui';
import { useToast } from '../context/ToastContext';

type Tab = 'base' | 'meus' | 'rotulo' | 'novo';

export function foodToItem(food: Food, grams: number): MealItem {
  return {
    id: uid(), foodId: food.id, name: food.brand ? `${food.name} (${food.brand})` : food.name, grams,
    per100g: food.per100g, source: food.source, sourceLabel: food.sourceLabel, brand: food.brand,
  };
}

/** Seleção de alimento (base TACO, alimentos próprios, rótulos online ou cadastro manual) + porção. */
export function FoodPicker({
  open, onClose, onPick, userId, title = 'Adicionar alimento', initialQuery = '',
}: { open: boolean; onClose: () => void; onPick: (item: MealItem) => void; userId: string; title?: string; initialQuery?: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('base');
  const [query, setQuery] = useState(initialQuery);
  const [custom, setCustom] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [online, setOnline] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setSelected(null);
      setErr(null);
      setOnline([]);
      listCustomFoods(userId).then(setCustom).catch(() => undefined);
    }
  }, [open, userId, initialQuery]);

  const results = useMemo(() => (tab === 'meus' ? searchFoods(query, custom, 30) : searchFoods(query, BASE_FOODS, 30)), [tab, query, custom]);

  async function searchOnline(barcode: boolean) {
    setBusy(true);
    setErr(null);
    try {
      if (barcode) {
        const f = await lookupBarcode(query);
        setOnline(f ? [f] : []);
        if (!f) setErr('Produto não encontrado ou sem tabela nutricional no Open Food Facts. Você pode cadastrá-lo manualmente.');
      } else {
        const list = await searchProducts(query);
        setOnline(list);
        if (!list.length) setErr('Nenhum produto com tabela nutricional encontrado. Tente o código de barras ou cadastre manualmente.');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={selected ? 'Definir porção' : title}>
      {selected ? (
        <PortionStep food={selected} onBack={() => setSelected(null)} onConfirm={async (grams) => {
          if (selected.source === 'rotulo' && !custom.some((c) => c.id === selected.id)) {
            await saveFood({ ...selected, userId }).catch(() => undefined); // guarda o rótulo para uso offline
          }
          onPick(foodToItem(selected, grams));
          onClose();
        }} />
      ) : (
        <div className="stack">
          <div className="tabs">
            <Segmented label="Fonte do alimento" value={tab} onChange={(t) => { setTab(t); setErr(null); }} options={[
              { value: 'base', label: 'Base TACO' },
              { value: 'meus', label: 'Meus' },
              { value: 'rotulo', label: 'Rótulos' },
              { value: 'novo', label: 'Cadastrar' },
            ]} />
          </div>

          {tab === 'novo' ? (
            <CustomFoodForm userId={userId} onSaved={(f) => { setCustom((c) => [...c, f]); setSelected(f); toast('Alimento salvo em “Meus alimentos”.'); }} />
          ) : (
            <>
              <div className="input-group">
                <input className="input" placeholder={tab === 'rotulo' ? 'Nome, marca ou código de barras' : 'Buscar alimento (ex.: arroz, banana)'}
                  value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar alimento"
                  onKeyDown={(e) => e.key === 'Enter' && tab === 'rotulo' && searchOnline(/^\d{8,14}$/.test(query.trim()))} />
                <span className="addon"><Search size={18} className="muted" style={{ marginRight: 10 }} /></span>
              </div>

              {tab === 'rotulo' ? (
                <>
                  <p className="tiny muted">
                    A busca consulta a internet (Open Food Facts, base colaborativa sob licença ODbL). Apenas o texto digitado é enviado.
                    Confira sempre com o rótulo da embalagem.
                  </p>
                  <div className="row-wrap">
                    <Button size="sm" variant="soft" loading={busy} disabled={query.trim().length < 2} onClick={() => searchOnline(false)}><Search size={16} />Buscar produto</Button>
                    <Button size="sm" loading={busy} disabled={!/^\d{8,14}$/.test(query.trim())} onClick={() => searchOnline(true)}><Barcode size={16} />Código de barras</Button>
                  </div>
                  {busy ? <div className="row"><Spinner /> <span className="small muted">Consultando…</span></div> : null}
                  {err ? <Alert kind="warning">{err}</Alert> : null}
                  <FoodList foods={online} onSelect={setSelected} />
                </>
              ) : (
                <>
                  {tab === 'meus' && !custom.length ? <p className="small muted">Você ainda não cadastrou alimentos. Use a aba “Cadastrar”.</p> : null}
                  <FoodList foods={results} onSelect={setSelected} />
                  {tab === 'base' ? <p className="tiny muted">Valores por 100 g baseados na TACO 4ª ed. (NEPA/UNICAMP). Não encontrou? Use “Rótulos” ou “Cadastrar”.</p> : null}
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function FoodList({ foods, onSelect }: { foods: Food[]; onSelect: (f: Food) => void }) {
  return (
    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
      {foods.map((f) => (
        <button key={f.id} type="button" className="list-item btn-ghost" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }} onClick={() => onSelect(f)}>
          <div className="grow">
            <div className="strong truncate">{f.name}</div>
            <div className="tiny muted">{f.brand ? `${f.brand} · ` : ''}{fmt(f.per100g.kcal, 0)} kcal · P {fmt(f.per100g.protein)} g · C {fmt(f.per100g.carbs)} g · G {fmt(f.per100g.fat)} g por 100 g</div>
          </div>
          <SourceBadge source={f.source} />
        </button>
      ))}
    </div>
  );
}

function PortionStep({ food, onBack, onConfirm }: { food: Food; onBack: () => void; onConfirm: (grams: number) => void }) {
  const [mode, setMode] = useState<'g' | 'un'>(food.unitGrams ? 'un' : 'g');
  const [value, setValue] = useState(food.unitGrams ? '1' : '100');
  const n = parseDecimal(value);
  const grams = mode === 'g' ? n : n * (food.unitGrams ?? 0);
  const valid = Number.isFinite(grams) && grams > 0 && grams <= 5000;
  const preview = valid ? scaleNutrients(food.per100g, grams) : null;
  return (
    <div className="stack">
      <div>
        <div className="strong">{food.name}</div>
        <div className="row-wrap mt-sm"><SourceBadge source={food.source} /><span className="tiny muted">{food.sourceLabel}</span></div>
      </div>
      {food.unitGrams ? (
        <Segmented label="Unidade" value={mode} onChange={(m) => { setMode(m); setValue(m === 'g' ? String(Math.round(grams) || 100) : '1'); }}
          options={[{ value: 'un', label: `${food.unitName} (~${food.unitGrams} g)` }, { value: 'g', label: 'Gramas' }]} />
      ) : null}
      <TextInput label={mode === 'g' ? 'Quantidade em gramas' : `Quantidade (${food.unitName})`} inputMode="decimal" value={value}
        onChange={(e) => setValue(e.target.value)} error={value && !valid ? 'Informe uma quantidade válida (até 5.000 g).' : null}
        hint={mode === 'un' && valid ? `≈ ${fmt(grams, 0)} g (medida caseira aproximada)` : undefined} />
      {preview ? (
        <div className="card flat small">
          <strong>{fmt(preview.kcal, 0)} kcal</strong> · Proteínas {fmt(preview.protein)} g · Carboidratos {fmt(preview.carbs)} g · Gorduras {fmt(preview.fat)} g
          {preview.fiber !== null ? ` · Fibras ${fmt(preview.fiber)} g` : ''}
        </div>
      ) : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onBack}>Voltar</Button>
        <Button variant="primary" disabled={!valid} onClick={() => onConfirm(Math.round(grams))}><Plus size={18} />Adicionar</Button>
      </div>
    </div>
  );
}

function CustomFoodForm({ userId, onSaved }: { userId: string; onSaved: (f: Food) => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [basis, setBasis] = useState('100');
  const [fromLabel, setFromLabel] = useState(true);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const fields: [string, string][] = [
    ['kcal', 'Energia (kcal)'], ['carbs', 'Carboidratos (g)'], ['sugars', 'Açúcares totais (g)'], ['addedSugars', 'Açúcares adicionados (g)'],
    ['protein', 'Proteínas (g)'], ['fat', 'Gorduras totais (g)'], ['saturatedFat', 'Gorduras saturadas (g)'], ['transFat', 'Gorduras trans (g)'],
    ['fiber', 'Fibra alimentar (g)'], ['sodium', 'Sódio (mg)'],
  ];
  function save() {
    const b = parseDecimal(basis);
    if (name.trim().length < 2) return setErr('Informe o nome do alimento.');
    if (!(b > 0 && b <= 2000)) return setErr('Informe o tamanho da porção do rótulo em gramas.');
    const per100: Record<string, number> = {};
    for (const [k] of fields) {
      const raw = vals[k];
      if (raw === undefined || raw === '') continue;
      const v = parseDecimal(raw);
      if (!Number.isFinite(v) || v < 0) return setErr('Os valores nutricionais devem ser números positivos.');
      per100[k] = (v / b) * 100;
    }
    if (per100.kcal === undefined) return setErr('Informe ao menos a energia (kcal).');
    const food: Food = {
      id: `user:${uid()}`, userId, name: name.trim().slice(0, 80), brand: brand.trim().slice(0, 60) || undefined,
      category: 'Meus alimentos', per100g: normalizeNutrients(per100), source: fromLabel ? 'rotulo' : 'manual',
      sourceLabel: fromLabel ? 'Rótulo — transcrito por você' : 'Informado por você', unitName: 'porção', unitGrams: b,
    };
    saveFood(food).then(() => onSaved(food)).catch(() => setErr('Não foi possível salvar.'));
  }
  return (
    <div className="stack">
      <TextInput label="Nome do alimento" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <TextInput label="Marca (opcional)" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} />
      <TextInput label="Porção de referência (g)" inputMode="decimal" value={basis} onChange={(e) => setBasis(e.target.value)} hint="Os valores abaixo correspondem a esta porção (ex.: a porção do rótulo)." />
      <label className="check"><input type="checkbox" checked={fromLabel} onChange={(e) => setFromLabel(e.target.checked)} />Valores copiados do rótulo da embalagem</label>
      <div className="grid-2">
        {fields.map(([k, label]) => (
          <TextInput key={k} label={label} inputMode="decimal" value={vals[k] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} placeholder="deixe vazio se não souber" />
        ))}
      </div>
      {err ? <Alert kind="danger">{err}</Alert> : null}
      <p className="tiny muted">Campos vazios ficam como “não disponível”. Fonte dos rótulos online: {OFF_LABEL}.</p>
      <Button variant="primary" onClick={save}>Salvar e continuar</Button>
    </div>
  );
}
