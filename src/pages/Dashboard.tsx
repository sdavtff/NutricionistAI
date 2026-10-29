import { Camera, ChevronRight, Droplets, Minus, Plus, Utensils } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Donut, MacroBar, Ring } from '../components/charts';
import { Empty, PageLoading, StoredImg, EducationalNotice } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { getWater, listHabitLogsInRange, listHabits, listMealsInRange, listRecentMeals, setHabitLog, setWater } from '../db/repo';
import type { Habit, HabitLog, MealEntry } from '../db/types';
import { addDays, formatDateShort, fromISODate, greeting, todayISO } from '../lib/date';
import { fmt } from '../lib/format';
import { assessSafety, calorieRange, macroSplit, MEAL_LABELS, proteinRange, sumItems, sumMeals, waterGoalMl } from '../lib/nutrition';
import { avoidTerms } from '../lib/planGenerator';
import { normalizeText } from '../lib/foods';
import { RECIPES } from '../lib/recipes';

export function DashboardPage() {
  const user = useUser();
  const { questionnaire, settings } = useApp();
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<MealEntry[]>([]);
  const [recent, setRecent] = useState<MealEntry[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [water, setWaterMl] = useState(0);
  const today = todayISO();
  const start = addDays(today, -6);

  const load = useCallback(async () => {
    const [w, r, h, l, wa] = await Promise.all([
      listMealsInRange(user.id, start, today), listRecentMeals(user.id, 5), listHabits(user.id),
      listHabitLogsInRange(user.id, start, today), getWater(user.id, today),
    ]);
    setWeek(w); setRecent(r); setHabits(h.filter((x) => x.active)); setLogs(l); setWaterMl(wa.ml);
    setLoading(false);
  }, [user.id, start, today]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PageLoading />;

  const a = questionnaire?.answers ?? {};
  const todayMeals = week.filter((m) => m.date === today);
  const t = sumMeals(todayMeals).values;
  const safety = assessSafety(a);
  const range = calorieRange(a);
  const hideCal = settings?.hideCalories || safety.restrictive;
  const target = range && !hideCal ? (range.min + range.max) / 2 : null;
  const prot = proteinRange(a);
  const split = macroSplit(t);
  const macroMax = Math.max(t.protein ?? 0, t.carbs ?? 0, t.fat ?? 0, prot?.min ?? 0) || null;
  const waterGoal = settings?.waterGoalMl || waterGoalMl(a);

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const consistency = days.map((d) => ({
    label: fromISODate(d).toLocaleDateString('pt-BR', { weekday: 'narrow' }),
    value: week.filter((m) => m.date === d).length,
  }));
  const daysLogged = consistency.filter((c) => c.value > 0).length;
  const habitDone = logs.filter((l) => l.done && habits.some((h) => h.id === l.habitId)).length;
  const habitTotal = habits.length * 7;

  const avoid = avoidTerms(a);
  const diet = a.dietPreference;
  const suggestions = RECIPES.filter((r) => {
    if (diet === 'vegana' && !r.tags.includes('vegana')) return false;
    if (diet === 'vegetariana' && !r.tags.includes('vegetariana')) return false;
    if (diet === 'sem_lactose' && !r.tags.includes('sem_lactose')) return false;
    if (diet === 'sem_gluten' && !r.tags.includes('sem_gluten')) return false;
    return !r.ingredients.some((i) => avoid.some((t2) => normalizeText(i.name).includes(t2)));
  });
  const dayIndex = Math.floor(fromISODate(today).getTime() / 86400000);
  const suggestion = suggestions.length ? suggestions[dayIndex % suggestions.length] : null;

  async function toggleHabit(h: Habit) {
    const done = !logs.some((l) => l.habitId === h.id && l.date === today && l.done);
    await setHabitLog({ userId: user.id, habitId: h.id, date: today, done });
    setLogs((ls) => [...ls.filter((l) => !(l.habitId === h.id && l.date === today)), { id: `${h.id}|${today}`, userId: user.id, habitId: h.id, date: today, done }]);
  }
  async function addWater(delta: number) {
    const ml = Math.max(0, water + delta);
    setWaterMl(ml);
    await setWater(user.id, today, ml);
  }

  return (
    <div className="page stack">
      <div className="page-header">
        <div>
          <h1>{greeting()}, {user.name.split(' ')[0]} 👋</h1>
          <p>{fromISODate(today).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Link to="/analisar" className="btn btn-primary hide-mobile"><Camera size={18} />Analisar comida</Link>
      </div>

      {!questionnaire?.completed ? (
        <div className="alert info"><span className="alert-body small">Complete o questionário para receber estimativas e um plano personalizado. <Link to="/questionario">Responder agora</Link></span></div>
      ) : null}

      <div className="grid-2">
        <div className="card">
          <div className="card-title"><h2>Resumo de hoje</h2><Link to="/diario" className="small">Ver diário</Link></div>
          <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
            <Ring value={t.kcal ?? 0} max={target ?? Math.max(t.kcal ?? 0, 1)} label={`Calorias consumidas hoje: ${fmt(t.kcal, 0)}`}>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{hideCal ? todayMeals.length : fmt(t.kcal ?? 0, 0)}</div>
                <div className="tiny muted">{hideCal ? 'refeições' : target ? `de ~${fmt(target, 0)} kcal` : 'kcal'}</div>
              </div>
            </Ring>
            <div className="stack-sm" style={{ flex: 1, minWidth: 200 }}>
              <MacroBar label="Proteínas" value={t.protein ?? 0} max={prot ? prot.min : null} color="var(--c-protein)" />
              <MacroBar label="Carboidratos" value={t.carbs ?? 0} color="var(--c-carbs)" max={macroMax} hideMax />
              <MacroBar label="Gorduras" value={t.fat ?? 0} color="var(--c-fat)" max={macroMax} hideMax />
              <MacroBar label="Fibras" value={t.fiber ?? 0} max={25} color="var(--c-fiber)" />
              {t.sodium !== null ? <p className="tiny muted">Sódio: {fmt(t.sodium, 0)} mg (referência: até 2.000 mg/dia)</p> : null}
            </div>
          </div>
          {!hideCal && target ? <p className="tiny muted mt">A meta é uma estimativa orientativa, não um limite obrigatório. Você pode ocultar calorias nas configurações.</p> : null}
        </div>

        <div className="card">
          <div className="card-title"><h2>Distribuição de macronutrientes</h2></div>
          {t.kcal ? (
            <div className="row" style={{ gap: 20 }}>
              <Donut label={`Proteínas ${split.protein}%, carboidratos ${split.carbs}%, gorduras ${split.fat}%`} parts={[
                { name: 'Proteínas', value: split.protein, color: 'var(--c-protein)' },
                { name: 'Carboidratos', value: split.carbs, color: 'var(--c-carbs)' },
                { name: 'Gorduras', value: split.fat, color: 'var(--c-fat)' },
              ]} />
              <div className="stack-sm small">
                <span className="row"><span className="dot" style={{ background: 'var(--c-protein)' }} />Proteínas {split.protein}%</span>
                <span className="row"><span className="dot" style={{ background: 'var(--c-carbs)' }} />Carboidratos {split.carbs}%</span>
                <span className="row"><span className="dot" style={{ background: 'var(--c-fat)' }} />Gorduras {split.fat}%</span>
                <span className="tiny muted">% das calorias vindas de cada macronutriente</span>
              </div>
            </div>
          ) : <Empty icon={<Utensils size={26} />} title="Nada registrado hoje" action={<Link to="/diario" className="btn btn-soft btn-sm">Registrar refeição</Link>}>Registre uma refeição ou analise uma foto.</Empty>}
        </div>
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card-title"><h2>Hábitos de hoje</h2><Link to="/progresso#habitos" className="small">Gerenciar</Link></div>
          {habits.length ? (
            <div className="stack-sm">
              {habits.map((h) => {
                const done = logs.some((l) => l.habitId === h.id && l.date === today && l.done);
                return (
                  <label key={h.id} className="check" style={{ padding: '6px 0' }}>
                    <input type="checkbox" checked={done} onChange={() => toggleHabit(h)} />
                    <span style={{ textDecoration: done ? 'line-through' : undefined, color: done ? 'var(--text-3)' : undefined }}>{h.icon} {h.title}</span>
                  </label>
                );
              })}
            </div>
          ) : <p className="small muted">Nenhum hábito ativo. <Link to="/progresso#habitos">Criar hábitos</Link></p>}
        </div>

        <div className="card">
          <div className="card-title"><h2>Água</h2><Droplets color="var(--info)" /></div>
          <div className="kpi"><span className="value">{(water / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L</span><span className="label">de ~{(waterGoal / 1000).toLocaleString('pt-BR')} L (orientativo)</span></div>
          <div className="progress mt-sm"><span style={{ width: `${Math.min(100, (water / waterGoal) * 100)}%`, background: 'var(--info)' }} /></div>
          <div className="row mt">
            <button className="btn btn-sm" aria-label="Remover 250 ml" onClick={() => addWater(-250)} disabled={water <= 0}><Minus size={16} /></button>
            <button className="btn btn-soft btn-sm" onClick={() => addWater(250)}><Plus size={16} />Copo 250 ml</button>
            <button className="btn btn-sm" onClick={() => addWater(500)}>+500 ml</button>
          </div>
        </div>

        <div className="card">
          <div className="card-title"><h2>Consistência da semana</h2></div>
          <BarChart data={consistency} height={110} label="Refeições registradas por dia" />
          <p className="small muted mt-sm">{daysLogged} de 7 dias com registros{habitTotal ? ` · ${Math.round((habitDone / habitTotal) * 100)}% dos hábitos cumpridos` : ''}.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title"><h2>Refeições recentes</h2><Link to="/diario" className="small">Ver todas</Link></div>
          {recent.length ? recent.map((m) => {
            const tt = sumItems(m.items).values;
            return (
              <Link key={m.id} to={`/diario?data=${m.date}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="thumb"><StoredImg id={m.imageId} alt={m.name} fallback={<Utensils size={20} />} /></div>
                <div className="grow">
                  <div className="strong truncate">{m.name}</div>
                  <div className="tiny muted">{MEAL_LABELS[m.mealType]} · {formatDateShort(m.date)} {m.time}{hideCal ? '' : ` · ${fmt(tt.kcal, 0)} kcal`}</div>
                </div>
                <ChevronRight size={18} className="muted" />
              </Link>
            );
          }) : <Empty icon={<Utensils size={26} />} title="Sem refeições ainda">Suas refeições registradas aparecem aqui.</Empty>}
        </div>

        <div className="stack">
          <Link to="/analisar" className="card hero" style={{ textDecoration: 'none' }}>
            <div className="row between">
              <div className="stack-sm">
                <h2 style={{ color: '#fff' }}>Analise sua refeição por foto</h2>
                <p className="small">Fotografe o prato e veja uma estimativa da tabela nutricional.</p>
              </div>
              <span className="brand-mark" style={{ width: 54, height: 54, background: 'rgba(255,255,255,.18)' }}><Camera size={26} /></span>
            </div>
          </Link>
          {suggestion ? (
            <Link to={`/receitas?r=${suggestion.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row">
                <div className="recipe-art" style={{ width: 84, aspectRatio: '1', fontSize: '2.2rem', background: `linear-gradient(140deg, ${suggestion.gradient[0]}, ${suggestion.gradient[1]})` }} aria-hidden>{suggestion.emoji}</div>
                <div className="grow stack-sm">
                  <span className="badge green" style={{ alignSelf: 'flex-start' }}>Sugestão do dia</span>
                  <strong>{suggestion.title}</strong>
                  <span className="tiny muted">{suggestion.timeMin} min · {MEAL_LABELS[suggestion.mealType]}</span>
                </div>
                <ChevronRight className="muted" />
              </div>
            </Link>
          ) : null}
        </div>
      </div>
      <EducationalNotice />
    </div>
  );
}
