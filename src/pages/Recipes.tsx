import { Clock, Heart, NotebookPen, Search, ShoppingCart, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NutritionTable } from '../components/NutritionTable';
import { Button, Empty, Modal } from '../components/ui';
import { useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getOrCreateWeekList, listFavorites, saveMeal, saveShoppingList, toggleFavorite, uid } from '../db/repo';
import { nowTime, todayISO, weekStart } from '../lib/date';
import { normalizeText } from '../lib/foods';
import { fmt } from '../lib/format';
import { MEAL_LABELS } from '../lib/nutrition';
import { getRecipe, RECIPES, recipeItems, recipePerServing, TAG_LABELS, type Recipe, type RecipeTag } from '../lib/recipes';

function Art({ r, big }: { r: Recipe; big?: boolean }) {
  return (
    <div className="recipe-art" style={{ background: `linear-gradient(140deg, ${r.gradient[0]}, ${r.gradient[1]})`, fontSize: big ? '4.5rem' : undefined }} role="img" aria-label={`Ilustração: ${r.title}`}>
      <span aria-hidden>{r.emoji}</span>
      <span className="tag">Ilustração</span>
    </div>
  );
}

export function RecipesPage() {
  const user = useUser();
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<RecipeTag[]>([]);
  const [maxTime, setMaxTime] = useState<number>(0);
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const open = params.get('r') ? getRecipe(params.get('r')!) : undefined;

  useEffect(() => {
    void listFavorites(user.id).then((f) => setFavs(new Set(f.map((x) => x.recipeId))));
  }, [user.id]);

  const list = useMemo(() => {
    const terms = normalizeText(q).split(/[\s,]+/).filter(Boolean);
    return RECIPES.filter((r) =>
      tags.every((t) => r.tags.includes(t)) &&
      (!maxTime || r.timeMin <= maxTime) &&
      (!onlyFav || favs.has(r.id)) &&
      terms.every((t) => normalizeText(r.title).includes(t) || r.ingredients.some((i) => normalizeText(i.name).includes(t))));
  }, [tags, maxTime, q, onlyFav, favs]);

  async function fav(id: string) {
    const on = await toggleFavorite(user.id, id);
    setFavs((s) => {
      const n = new Set(s);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
    toast(on ? 'Adicionada aos favoritos.' : 'Removida dos favoritos.');
  }

  async function toShopping(r: Recipe) {
    const l = await getOrCreateWeekList(user.id, weekStart(todayISO()));
    const items = r.ingredients.map((i) => ({ id: uid(), name: i.name, quantity: i.qty, category: i.category, checked: false }));
    await saveShoppingList({ ...l, items: [...l.items, ...items] });
    toast(`${items.length} ingredientes adicionados à lista da semana.`);
  }

  async function logServing(r: Recipe) {
    const items = recipeItems(r).map((i) => ({ ...i, id: uid() }));
    const m = await saveMeal({
      id: uid(), userId: user.id, date: todayISO(), time: nowTime(), mealType: r.mealType, name: `${r.title} (1 porção)`,
      items, createdAt: Date.now(), updatedAt: Date.now(),
    });
    toast('1 porção registrada no diário de hoje.');
    nav(`/diario?data=${m.date}`);
  }

  return (
    <div className="page stack">
      <div className="page-header">
        <div><h1>Receitas</h1><p>Receitas simples e brasileiras, com estimativa nutricional por porção.</p></div>
      </div>

      <div className="card stack">
        <div className="input-group">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou ingredientes que você tem (ex.: ovo, tomate)" aria-label="Buscar receitas" />
          <span className="addon"><Search size={18} className="muted" style={{ marginRight: 10 }} /></span>
        </div>
        <div className="row-wrap" role="group" aria-label="Filtrar por preferência">
          {(Object.keys(TAG_LABELS) as RecipeTag[]).map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={tags.includes(t)} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{TAG_LABELS[t]}</button>
          ))}
          <button type="button" className="chip" aria-pressed={onlyFav} onClick={() => setOnlyFav((v) => !v)}><Heart size={14} />Favoritas</button>
        </div>
        <div className="row-wrap" role="group" aria-label="Tempo de preparo">
          <span className="small muted">Tempo:</span>
          {[0, 10, 15, 30].map((m) => <button key={m} type="button" className="chip" aria-pressed={maxTime === m} onClick={() => setMaxTime(m)}>{m ? `até ${m} min` : 'Qualquer'}</button>)}
        </div>
      </div>

      {list.length ? (
        <div className="grid-3">
          {list.map((r) => {
            const { totals } = recipePerServing(r);
            return (
              <article key={r.id} className="card stack-sm" style={{ padding: 12 }}>
                <button type="button" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setParams({ r: r.id })} aria-label={`Abrir receita ${r.title}`}>
                  <Art r={r} />
                </button>
                <div className="row between">
                  <h3>{r.title}</h3>
                  <Button size="icon" variant="ghost" aria-label={favs.has(r.id) ? 'Remover dos favoritos' : 'Favoritar'} aria-pressed={favs.has(r.id)} onClick={() => fav(r.id)}>
                    <Heart size={20} fill={favs.has(r.id) ? 'var(--danger)' : 'none'} color={favs.has(r.id) ? 'var(--danger)' : 'currentColor'} />
                  </Button>
                </div>
                <div className="row-wrap tiny muted"><Clock size={14} />{r.timeMin} min <Users size={14} />{r.servings} porç. · ≈{fmt(totals.kcal, 0)} kcal/porção</div>
                <div className="row-wrap">{r.tags.slice(0, 3).map((t) => <span key={t} className="badge green">{TAG_LABELS[t]}</span>)}</div>
                <Button size="sm" variant="soft" onClick={() => setParams({ r: r.id })}>Ver receita</Button>
              </article>
            );
          })}
        </div>
      ) : <Empty title="Nenhuma receita encontrada">Tente remover alguns filtros.</Empty>}

      <Modal open={!!open} onClose={() => setParams({})} title={open?.title ?? ''}>
        {open ? (
          <div className="stack">
            <Art r={open} big />
            <div className="row-wrap small muted"><Clock size={16} />{open.timeMin} min · <Users size={16} />{open.servings} porção(ões) · {MEAL_LABELS[open.mealType]}</div>
            <div className="row-wrap">
              <Button size="sm" onClick={() => fav(open.id)}><Heart size={16} fill={favs.has(open.id) ? 'var(--danger)' : 'none'} />{favs.has(open.id) ? 'Favorita' : 'Favoritar'}</Button>
              <Button size="sm" variant="soft" onClick={() => toShopping(open)}><ShoppingCart size={16} />Adicionar à lista de compras</Button>
              <Button size="sm" onClick={() => logServing(open)}><NotebookPen size={16} />Registrar 1 porção</Button>
            </div>
            <div>
              <h3>Ingredientes</h3>
              <ul style={{ paddingLeft: 18, margin: '6px 0 0' }}>{open.ingredients.map((i) => <li key={i.name}>{i.name} — <span className="muted">{i.qty}</span></li>)}</ul>
            </div>
            <div>
              <h3>Modo de preparo</h3>
              <ol style={{ paddingLeft: 18, margin: '6px 0 0' }} className="stack-sm">{open.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
            <NutritionTable items={recipeItems(open)} title="Estimativa por porção" />
            {recipePerServing(open).uncounted.length ? <p className="tiny muted">Não contabilizados (sem dados ou quantidade a gosto): {recipePerServing(open).uncounted.join(', ')}.</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
