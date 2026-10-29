import { Bed, ClipboardList, Droplets, Footprints, Pencil, RefreshCw, ShoppingCart, Sparkles, Target } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, EducationalNotice, Empty, Modal, PageLoading } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getLatestPlan, getOrCreateWeekList, listPlanChecks, saveShoppingList, setPlanCheck, uid } from '../db/repo';
import type { MealType, NutritionPlan, PlanCheck } from '../db/types';
import { todayISO, weekStart } from '../lib/date';
import { fmt } from '../lib/format';
import { MEAL_LABELS } from '../lib/nutrition';
import { AIError, getAIStatus } from '../services/ai';
import { createAIPlanForUser, createPlanForUser } from '../services/plans';

export function PlanPage() {
  const user = useUser();
  const { questionnaire, consent, settings } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const [plan, setPlan] = useState<NutritionPlan | null | undefined>(undefined);
  const [checks, setChecks] = useState<PlanCheck[]>([]);
  const [busy, setBusy] = useState<'local' | 'ai' | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const load = useCallback(async () => {
    const p = await getLatestPlan(user.id);
    setPlan(p ?? null);
    if (p) setChecks(await listPlanChecks(p.id, today));
  }, [user.id, today]);
  useEffect(() => { void load(); }, [load]);

  if (plan === undefined) return <PageLoading />;
  const answers = questionnaire?.answers;
  if (!plan || !answers) {
    return <div className="page"><Empty icon={<ClipboardList size={28} />} title="Você ainda não tem um plano" action={<Link to="/questionario" className="btn btn-primary">Responder questionário</Link>}>Responda ao questionário para gerar um plano educativo personalizado.</Empty></div>;
  }

  async function regenerate(mode: 'local' | 'ai', customization?: string) {
    setError(null);
    setBusy(mode);
    try {
      if (mode === 'ai') {
        if (!consent?.aiProcessing) throw new AIError('Autorize o uso da IA em Privacidade e dados para personalizar com IA.');
        const st = await getAIStatus();
        if (!st.configured) throw new AIError(st.online ? 'A IA não está configurada no servidor. Use o plano por regras locais ou configure a chave (veja o README).' : 'Você está offline.');
        await createAIPlanForUser(user.id, answers!, customization);
      } else {
        await createPlanForUser(user.id, answers!, customization);
      }
      await load();
      setCustomOpen(false);
      toast(mode === 'ai' ? 'Plano personalizado com IA!' : 'Novo plano gerado.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(key: string) {
    const done = !checks.some((c) => c.key === key && c.done);
    await setPlanCheck({ userId: user.id, planId: plan!.id, date: today, key, done });
    setChecks(await listPlanChecks(plan!.id, today));
  }

  async function toShopping() {
    const list = await getOrCreateWeekList(user.id, weekStart(today));
    const existing = new Set(list.items.map((i) => i.name.toLowerCase()));
    const add = plan!.shoppingList.flatMap((c) => c.items.filter((n) => !existing.has(n.toLowerCase())).map((n) => ({ id: uid(), name: n, quantity: '', category: c.category, checked: false })));
    await saveShoppingList({ ...list, items: [...list.items, ...add] });
    toast(`${add.length} item(ns) adicionados à lista da semana.`);
    nav(`/compras?lista=${list.id}`);
  }

  const byType = (['cafe', 'almoco', 'lanche', 'jantar'] as MealType[]).map((t) => ({ t, meals: plan.meals.filter((m) => m.mealType === t) }));
  const doneCount = checks.filter((c) => c.done).length;
  const hideCal = settings?.hideCalories;

  return (
    <div className="page stack">
      <div className="page-header">
        <div>
          <h1>Plano alimentar</h1>
          <p>
            {plan.generator === 'ia' ? <span className="badge amber"><Sparkles size={12} />Gerado por IA</span> : <span className="badge green">Gerado por regras nutricionais locais</span>}
            <span className="small muted"> · {new Date(plan.createdAt).toLocaleDateString('pt-BR')}</span>
          </p>
        </div>
        <div className="row-wrap">
          <Button onClick={() => regenerate('local')} loading={busy === 'local'}><RefreshCw size={18} />Regenerar</Button>
          <Button variant="primary" onClick={() => setCustomOpen(true)}><Sparkles size={18} />Personalizar</Button>
        </div>
      </div>
      {error ? <Alert kind="danger">{error}</Alert> : null}

      <div className="card stack-sm">
        <h2>Resumo</h2>
        <p className="muted" style={{ whiteSpace: 'pre-line' }}>{plan.summary}</p>
        {plan.customization ? <p className="small"><strong>Seu pedido:</strong> {plan.customization}</p> : null}
        <Link to="/questionario?editar=1" className="small"><Pencil size={14} /> Editar minhas respostas</Link>
      </div>

      {plan.safetyNotes.length ? <Alert kind="warning" title="Importante"><ul style={{ margin: 0, paddingLeft: 18 }}>{plan.safetyNotes.map((s) => <li key={s}>{s}</li>)}</ul></Alert> : null}

      {plan.energy && !hideCal ? (
        <div className="card grid-3">
          <div className="kpi"><span className="label">Metabolismo basal (estimativa)</span><span className="value">{fmt(plan.energy.bmr, 0)} kcal</span></div>
          <div className="kpi"><span className="label">Gasto diário (estimativa)</span><span className="value">{fmt(plan.energy.tdee, 0)} kcal</span></div>
          <div className="kpi"><span className="label">Faixa orientativa</span><span className="value">{plan.energy.rangeMin ? `${fmt(plan.energy.rangeMin, 0)}–${fmt(plan.energy.rangeMax, 0)} kcal` : '—'}</span></div>
          <p className="small muted" style={{ gridColumn: '1 / -1' }}>{plan.energy.explanation}</p>
        </div>
      ) : null}

      <div className="card">
        <div className="card-title"><h2>Sugestões de refeições</h2><span className="badge green">{doneCount} concluída(s) hoje</span></div>
        <div className="grid-2">
          {byType.map(({ t, meals }) => (
            <div key={t} className="stack-sm">
              <h3>{MEAL_LABELS[t]}</h3>
              {meals.map((m) => {
                const done = checks.some((c) => c.key === m.key && c.done);
                return (
                  <label key={m.key} className="card flat check" style={{ padding: 12, opacity: done ? 0.7 : 1 }}>
                    <input type="checkbox" checked={done} onChange={() => toggle(m.key)} aria-label={`Marcar ${m.title} como feita hoje`} />
                    <span className="stack-sm">
                      <strong style={{ textDecoration: done ? 'line-through' : undefined }}>{m.title}</strong>
                      <span className="small muted">{m.description}</span>
                      {m.approxKcal && !hideCal ? <span className="tiny muted">≈ {m.approxKcal} kcal (referência aproximada)</span> : null}
                    </span>
                  </label>
                );
              })}
              {!meals.length ? <p className="small muted">Sem sugestões compatíveis com suas restrições — converse com o chat para ideias.</p> : null}
            </div>
          ))}
        </div>
        <p className="tiny muted mt">Marque as refeições que você fez hoje. As opções são intercambiáveis: escolha a que preferir.</p>
      </div>

      <div className="grid-2">
        <div className="card stack-sm">
          <h2>Substituições inteligentes</h2>
          {plan.substitutions.map((s) => (
            <div key={s.from} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow"><strong>{s.from}</strong> → <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{s.to}</span><div className="small muted">{s.why}</div></div>
            </div>
          ))}
        </div>
        <div className="card stack-sm">
          <div className="card-title"><h2>Lista de compras da semana</h2><Button size="sm" variant="soft" onClick={toShopping}><ShoppingCart size={16} />Salvar na lista</Button></div>
          {plan.shoppingList.map((c) => (
            <div key={c.category}>
              <div className="small strong">{c.category}</div>
              <div className="small muted">{c.items.join(' · ')}</div>
            </div>
          ))}
        </div>
      </div>

      {plan.recipes.length ? (
        <div className="card stack">
          <h2>Receitas sugeridas</h2>
          <div className="grid-3">
            {plan.recipes.map((r) => (
              <div key={r.title} className="card flat stack-sm">
                <strong>{r.title}</strong>
                <span className="tiny muted">{r.servings} porção(ões) · {r.timeMin} min</span>
                <div className="small"><strong>Ingredientes</strong><ul style={{ margin: 0, paddingLeft: 18 }}>{r.ingredients.map((i) => <li key={i}>{i}</li>)}</ul></div>
                <div className="small"><strong>Preparo</strong><ol style={{ margin: 0, paddingLeft: 18 }}>{r.steps.map((s) => <li key={s}>{s}</li>)}</ol></div>
              </div>
            ))}
          </div>
          <p className="tiny muted">Receitas geradas pela IA não têm estimativa nutricional verificada. Veja também a <Link to="/receitas">biblioteca de receitas</Link>.</p>
        </div>
      ) : (
        <div className="card row between"><span>Receitas simples com estimativa nutricional estão na biblioteca.</span><Link to="/receitas" className="btn btn-soft btn-sm">Ver receitas</Link></div>
      )}

      <div className="card stack-sm">
        <h2>Recomendações para sua alimentação</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="stack-sm">{plan.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>

      <div className="grid-3">
        <LifeCard icon={<Droplets color="var(--info)" />} title="Hidratação" items={plan.lifestyle.hydration} />
        <LifeCard icon={<Bed color="var(--c-fat)" />} title="Sono" items={plan.lifestyle.sleep} />
        <LifeCard icon={<Footprints color="var(--primary)" />} title="Atividade física" items={plan.lifestyle.activity} />
      </div>

      <div className="grid-2">
        <div className="card stack-sm">
          <div className="row"><Target color="var(--accent)" /><h2>Metas da semana</h2></div>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="stack-sm small">{plan.weeklyGoals.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
        <div className="card stack-sm">
          <h2>Hábitos para acompanhar</h2>
          <div className="row-wrap">{plan.habits.map((h) => <span key={h} className="badge green">{h}</span>)}</div>
          <Link to="/progresso#habitos" className="small">Acompanhar hábitos no Progresso →</Link>
        </div>
      </div>
      <EducationalNotice />

      <Modal open={customOpen} onClose={() => setCustomOpen(false)} title="Personalizar plano" footer={<>
        <Button onClick={() => regenerate('local', custom.trim() || undefined)} loading={busy === 'local'}>Regenerar sem IA</Button>
        <Button variant="primary" onClick={() => regenerate('ai', custom.trim() || undefined)} loading={busy === 'ai'}><Sparkles size={16} />Gerar com IA</Button>
      </>}>
        <div className="stack">
          <label className="field">
            <span className="label">O que você gostaria de ajustar? (opcional)</span>
            <textarea className="input" maxLength={600} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Ex.: mais opções de café da manhã sem pão; marmitas para levar ao trabalho; receitas com frango e legumes." />
          </label>
          <p className="small muted">
            “Gerar com IA” envia suas respostas do questionário (sem nome ou e-mail) ao serviço de IA, se você autorizou. “Regenerar sem IA” usa regras locais e
            {' '}embaralha as opções — seu pedido fica registrado, mas só a IA consegue interpretá-lo.
          </p>
          {busy === 'ai' ? <Alert kind="info">Gerando seu plano com IA… isso pode levar até um minuto.</Alert> : null}
          {error ? <Alert kind="danger">{error}</Alert> : null}
        </div>
      </Modal>
    </div>
  );
}

function LifeCard({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="card stack-sm">
      <div className="row">{icon}<h3>{title}</h3></div>
      <ul style={{ margin: 0, paddingLeft: 18 }} className="small stack-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
