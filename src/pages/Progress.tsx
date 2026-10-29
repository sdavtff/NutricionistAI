import { Download, Plus, Scale, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart, LineChart } from '../components/charts';
import { Alert, Button, Empty, Field, Segmented, TextInput, useConfirm } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import {
  deleteHabit, deleteMeasurement, deleteWeight, listHabitLogsInRange, listHabits, listMealsInRange, listMeasurements, listWeights,
  saveHabit, saveMeasurement, saveWeight, setHabitLog, uid,
} from '../db/repo';
import type { Habit, HabitLog, MealEntry, MeasurementLog, WeightLog } from '../db/types';
import { addDays, formatDateShort, fromISODate, rangeDays, todayISO, weekStart } from '../lib/date';
import { fmt } from '../lib/format';
import { sumMeals } from '../lib/nutrition';
import { parseDecimal } from '../lib/validation';

type Tab = 'peso' | 'medidas' | 'nutrientes' | 'habitos';

export function ProgressPage() {
  const loc = useLocation();
  const [tab, setTab] = useState<Tab>(loc.hash === '#habitos' ? 'habitos' : 'peso');
  useEffect(() => {
    if (loc.hash === '#habitos') setTab('habitos');
  }, [loc.hash]);
  return (
    <div className="page stack">
      <div className="page-header">
        <div><h1>Progresso</h1><p>Acompanhe sua evolução no seu ritmo. Todos os registros são opcionais.</p></div>
        <Link to="/privacidade#exportar" className="btn btn-sm"><Download size={16} />Exportar meus dados</Link>
      </div>
      <div className="tabs">
        <Segmented label="Seção" value={tab} onChange={setTab} options={[
          { value: 'peso', label: 'Peso' }, { value: 'medidas', label: 'Medidas' }, { value: 'nutrientes', label: 'Nutrientes' }, { value: 'habitos', label: 'Hábitos' },
        ]} />
      </div>
      {tab === 'peso' ? <WeightTab /> : tab === 'medidas' ? <MeasuresTab /> : tab === 'nutrientes' ? <NutrientsTab /> : <HabitsTab />}
    </div>
  );
}

function WeightTab() {
  const user = useUser();
  const { settings, updateSettings, questionnaire } = useApp();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [list, setList] = useState<WeightLog[]>([]);
  const [date, setDate] = useState(todayISO());
  const [w, setW] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<'semanal' | 'mensal' | 'registros'>('registros');
  const load = useCallback(() => listWeights(user.id).then(setList), [user.id]);
  useEffect(() => { void load(); }, [load]);

  if (!settings?.weightTrackingEnabled || settings.hideWeight) {
    return (
      <div className="card">
        <Empty icon={<Scale size={28} />} title="Acompanhamento de peso desativado" action={<Button variant="soft" onClick={() => updateSettings({ weightTrackingEnabled: true, hideWeight: false })}>Ativar acompanhamento</Button>}>
          Você pode cuidar da alimentação sem registrar peso. Ative quando e se quiser.
        </Empty>
      </div>
    );
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await saveWeight(user.id, date, parseDecimal(w));
      setW('');
      toast('Peso registrado.');
      void load();
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }

  const groupAvg = (keyFn: (d: string) => string, labelFn: (k: string) => string) => {
    const m = new Map<string, number[]>();
    for (const x of list) m.set(keyFn(x.date), [...(m.get(keyFn(x.date)) ?? []), x.weightKg]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([k, v]) => ({ label: labelFn(k), value: Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 }));
  };
  const points = view === 'semanal'
    ? groupAvg(weekStart, (k) => formatDateShort(k))
    : view === 'mensal'
      ? groupAvg((d) => d.slice(0, 7), (k) => fromISODate(`${k}-01`).toLocaleDateString('pt-BR', { month: 'short' }))
      : list.slice(-20).map((x) => ({ label: formatDateShort(x.date), value: x.weightKg }));
  const first = list[0];
  const last = list[list.length - 1];
  const target = questionnaire?.answers.targetWeightKg;

  return (
    <div className="stack">
      {node}
      <form className="card row-wrap" onSubmit={add} style={{ alignItems: 'flex-end' }}>
        <TextInput label="Data" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        <TextInput label="Peso (kg)" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="Ex.: 70,5" />
        <Button type="submit" variant="primary"><Plus size={18} />Registrar</Button>
        <Button variant="ghost" onClick={() => updateSettings({ weightTrackingEnabled: false })}>Desativar acompanhamento</Button>
        {err ? <div style={{ width: '100%' }}><Alert kind="danger">{err}</Alert></div> : null}
      </form>
      <div className="card">
        <div className="card-title">
          <h2>Evolução</h2>
          <Segmented label="Período" value={view} onChange={setView} options={[{ value: 'registros', label: 'Registros' }, { value: 'semanal', label: 'Semanal' }, { value: 'mensal', label: 'Mensal' }]} />
        </div>
        {list.length ? (
          <>
            <LineChart points={points} label="Peso" unit=" kg" />
            <p className="small muted">
              {list.length} registro(s). {first && last && first !== last ? `Variação desde ${formatDateShort(first.date)}: ${last.weightKg - first.weightKg > 0 ? '+' : ''}${fmt(last.weightKg - first.weightKg)} kg.` : ''}
              {target ? ` Peso desejado informado: ${fmt(target)} kg.` : ''} Oscilações diárias são normais (água, intestino, sal) — observe a tendência.
            </p>
          </>
        ) : <Empty icon={<Scale size={26} />} title="Sem registros">Registre com a frequência que for confortável para você — uma vez por semana já é suficiente.</Empty>}
      </div>
      {list.length ? (
        <div className="card">
          <h3>Histórico</h3>
          {[...list].reverse().map((x) => (
            <div key={x.id} className="list-item">
              <span className="grow">{formatDateShort(x.date)}/{x.date.slice(0, 4)}</span><strong>{fmt(x.weightKg)} kg</strong>
              <Button size="icon" variant="ghost" aria-label="Excluir registro" onClick={async () => { if (await ask('Excluir registro?', 'Este registro de peso será apagado.', { danger: true, confirm: 'Excluir' })) { await deleteWeight(x.id); void load(); } }}><Trash2 size={16} /></Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MEASURES: [keyof MeasurementLog, string][] = [['waistCm', 'Cintura'], ['hipCm', 'Quadril'], ['chestCm', 'Tórax'], ['armCm', 'Braço'], ['thighCm', 'Coxa']];

function MeasuresTab() {
  const user = useUser();
  const [list, setList] = useState<MeasurementLog[]>([]);
  const [date, setDate] = useState(todayISO());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => listMeasurements(user.id).then(setList), [user.id]);
  useEffect(() => { void load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const rec: Record<string, number> = {};
    for (const [k] of MEASURES) {
      if (!vals[k]) continue;
      const n = parseDecimal(vals[k]);
      if (!(n >= 10 && n <= 300)) return setErr('As medidas devem estar entre 10 e 300 cm.');
      rec[k] = n;
    }
    if (!Object.keys(rec).length) return setErr('Preencha ao menos uma medida.');
    await saveMeasurement({ userId: user.id, date, ...rec });
    setVals({});
    void load();
  }

  return (
    <div className="stack">
      <form className="card stack" onSubmit={add}>
        <h2>Registrar medidas (opcional)</h2>
        <div className="grid-3">
          <TextInput label="Data" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          {MEASURES.map(([k, l]) => <TextInput key={k} label={`${l} (cm)`} inputMode="decimal" value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />)}
        </div>
        {err ? <Alert kind="danger">{err}</Alert> : null}
        <Button type="submit" variant="primary"><Plus size={18} />Salvar medidas</Button>
      </form>
      <div className="card" style={{ overflowX: 'auto' }}>
        <h2>Histórico de medidas</h2>
        {list.length ? (
          <table className="ntable mt">
            <thead><tr><th>Data</th>{MEASURES.map(([k, l]) => <th key={k}>{l}</th>)}<th /></tr></thead>
            <tbody>
              {[...list].reverse().map((m) => (
                <tr key={m.id}>
                  <td>{formatDateShort(m.date)}/{m.date.slice(2, 4)}</td>
                  {MEASURES.map(([k]) => <td key={k}>{m[k] ? `${fmt(m[k] as number)} cm` : '—'}</td>)}
                  <td><Button size="icon" variant="ghost" aria-label="Excluir medidas" onClick={async () => { await deleteMeasurement(m.id); void load(); }}><Trash2 size={16} /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="small muted mt-sm">Nenhuma medida registrada.</p>}
      </div>
    </div>
  );
}

function NutrientsTab() {
  const user = useUser();
  const { settings } = useApp();
  const [days, setDays] = useState<'7' | '30'>('7');
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const n = Number(days);
  const end = todayISO();
  const start = addDays(end, -(n - 1));
  const prevStart = addDays(start, -n);
  useEffect(() => {
    void listMealsInRange(user.id, prevStart, end).then(setMeals);
  }, [user.id, prevStart, end]);

  const cur = meals.filter((m) => m.date >= start);
  const prev = meals.filter((m) => m.date < start);
  const daily = rangeDays(start, end).map((d) => ({ d, t: sumMeals(cur.filter((m) => m.date === d)).values, count: cur.filter((m) => m.date === d).length }));
  const avg = (list: MealEntry[]) => {
    const loggedDays = new Set(list.map((m) => m.date)).size || 1;
    const t = sumMeals(list).values;
    return { kcal: (t.kcal ?? 0) / loggedDays, protein: (t.protein ?? 0) / loggedDays, carbs: (t.carbs ?? 0) / loggedDays, fat: (t.fat ?? 0) / loggedDays, fiber: (t.fiber ?? 0) / loggedDays, days: new Set(list.map((m) => m.date)).size };
  };
  const a = avg(cur);
  const b = avg(prev);
  const rows: [string, keyof typeof a, string][] = [['Energia', 'kcal', 'kcal'], ['Proteínas', 'protein', 'g'], ['Carboidratos', 'carbs', 'g'], ['Gorduras', 'fat', 'g'], ['Fibras', 'fiber', 'g']];
  const hideCal = settings?.hideCalories;

  return (
    <div className="stack">
      <div className="row between">
        <Segmented label="Período" value={days} onChange={setDays} options={[{ value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }]} />
        <span className="small muted">{a.days} dia(s) com registros</span>
      </div>
      <div className="card">
        <h2>{hideCal ? 'Proteínas por dia' : 'Energia por dia'}</h2>
        <BarChart data={daily.map((x) => ({ label: n === 7 ? fromISODate(x.d).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3) : x.d.slice(8), value: x.count ? Math.round(hideCal ? x.t.protein ?? 0 : x.t.kcal ?? 0) : null }))}
          label={hideCal ? 'Proteínas por dia' : 'Calorias por dia'} unit={hideCal ? ' g' : ' kcal'} />
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <h2>Comparação entre períodos</h2>
        <p className="small muted">Média diária nos dias com registro: últimos {n} dias × {n} dias anteriores.</p>
        <table className="ntable mt">
          <thead><tr><th>Nutriente</th><th>Período atual</th><th>Período anterior</th><th>Diferença</th></tr></thead>
          <tbody>
            {rows.filter(([, k]) => !(hideCal && k === 'kcal')).map(([l, k, u]) => {
              const diff = (a[k] as number) - (b[k] as number);
              return (
                <tr key={k}>
                  <td>{l}</td><td>{a.days ? `${fmt(a[k] as number, 0)} ${u}` : '—'}</td><td>{b.days ? `${fmt(b[k] as number, 0)} ${u}` : '—'}</td>
                  <td>{a.days && b.days ? `${diff > 0 ? '+' : ''}${fmt(diff, 0)} ${u}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="tiny muted mt-sm">Os valores dependem do que foi registrado. Dias sem registro não entram na média.</p>
      </div>
      <div className="card">
        <h2>Histórico de refeições</h2>
        {cur.length ? [...cur].sort((x, y) => y.date.localeCompare(x.date) || y.time.localeCompare(x.time)).slice(0, 30).map((m) => (
          <Link key={m.id} to={`/diario?data=${m.date}`} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="grow truncate">{formatDateShort(m.date)} {m.time} · {m.name}</span>
            {!hideCal ? <span className="small muted">{fmt(sumMeals([m]).values.kcal, 0)} kcal</span> : null}
          </Link>
        )) : <p className="small muted">Sem refeições no período.</p>}
      </div>
    </div>
  );
}

const ICONS = ['💧', '🍎', '🥗', '🚶', '😴', '🧘', '🍳', '📓', '🏋️', '☀️'];

function HabitsTab() {
  const user = useUser();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [target, setTarget] = useState('7');
  const end = todayISO();
  const start = addDays(end, -6);
  const load = useCallback(async () => {
    setHabits(await listHabits(user.id));
    setLogs(await listHabitLogsInRange(user.id, start, end));
  }, [user.id, start, end]);
  useEffect(() => { void load(); }, [load]);

  const days = rangeDays(start, end);
  async function toggle(h: Habit, d: string) {
    const done = !logs.some((l) => l.habitId === h.id && l.date === d && l.done);
    await setHabitLog({ userId: user.id, habitId: h.id, date: d, done });
    void load();
  }

  return (
    <div className="stack" id="habitos">
      {node}
      <form className="card row-wrap" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (t.length < 2) return toast('Dê um nome ao hábito.', 'error');
        await saveHabit({ id: uid(), userId: user.id, title: t.slice(0, 60), icon, targetPerWeek: Number(target), active: true, createdAt: Date.now() });
        setTitle('');
        void load();
      }}>
        <TextInput label="Novo hábito" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Comer uma fruta no lanche" />
        <Field label="Ícone" id="h-icon"><select id="h-icon" className="input" value={icon} onChange={(e) => setIcon(e.target.value)}>{ICONS.map((i) => <option key={i}>{i}</option>)}</select></Field>
        <Field label="Meta semanal" id="h-target"><select id="h-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}× por semana</option>)}</select></Field>
        <Button type="submit" variant="primary"><Plus size={18} />Criar</Button>
      </form>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h2>Últimos 7 dias</h2>
        {habits.length ? (
          <table className="ntable mt">
            <thead>
              <tr><th>Hábito</th>{days.map((d) => <th key={d} style={{ textAlign: 'center' }}>{fromISODate(d).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}</th>)}<th>Meta</th><th /></tr>
            </thead>
            <tbody>
              {habits.map((h) => {
                const count = logs.filter((l) => l.habitId === h.id && l.done).length;
                return (
                  <tr key={h.id} style={{ opacity: h.active ? 1 : 0.5 }}>
                    <td>{h.icon} {h.title}</td>
                    {days.map((d) => (
                      <td key={d} style={{ textAlign: 'center' }}>
                        <input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} aria-label={`${h.title} em ${formatDateShort(d)}`}
                          checked={logs.some((l) => l.habitId === h.id && l.date === d && l.done)} onChange={() => toggle(h, d)} />
                      </td>
                    ))}
                    <td><span className={`badge ${count >= h.targetPerWeek ? 'green' : ''}`}>{count}/{h.targetPerWeek}</span></td>
                    <td className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                      <Button size="sm" variant="ghost" onClick={async () => { await saveHabit({ ...h, active: !h.active }); void load(); }}>{h.active ? 'Pausar' : 'Ativar'}</Button>
                      <Button size="icon" variant="ghost" aria-label={`Excluir ${h.title}`} onClick={async () => {
                        if (await ask('Excluir hábito?', `“${h.title}” e seu histórico serão apagados.`, { danger: true, confirm: 'Excluir' })) { await deleteHabit(h.id); void load(); }
                      }}><Trash2 size={16} /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty title="Nenhum hábito">Crie hábitos pequenos e realistas — eles fazem diferença com o tempo.</Empty>}
      </div>
    </div>
  );
}
