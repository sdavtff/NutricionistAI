import { ArrowRight, Droplets, Flame, HeartPulse, Pencil, Ruler } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, PageLoading } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { getLatestPlan } from '../db/repo';
import type { NutritionPlan } from '../db/types';
import { fmt } from '../lib/format';
import { assessSafety, bmi, calorieRange, proteinRange, waterGoalMl } from '../lib/nutrition';

const GOAL: Record<string, string> = { emagrecer: 'Emagrecer', manter: 'Manter o peso', ganhar_massa: 'Ganhar massa muscular', melhorar_alimentacao: 'Melhorar a alimentação' };

export function ProfileResultPage() {
  const user = useUser();
  const { questionnaire, settings } = useApp();
  const [plan, setPlan] = useState<NutritionPlan | null | undefined>(undefined);
  useEffect(() => {
    getLatestPlan(user.id).then((p) => setPlan(p ?? null));
  }, [user.id]);
  if (plan === undefined) return <PageLoading />;
  const a = questionnaire?.answers;
  if (!a || !questionnaire?.completed) {
    return <div className="page"><Empty title="Questionário não concluído" action={<Link className="btn btn-primary" to="/questionario">Responder agora</Link>}>Responda ao questionário para ver sua análise.</Empty></div>;
  }
  const safety = assessSafety(a);
  const range = calorieRange(a);
  const prot = proteinRange(a);
  const imc = bmi(a);
  const hideCal = settings?.hideCalories || safety.restrictive;
  const hideWeight = settings?.hideWeight;

  return (
    <div className="page stack">
      <div className="card hero stack">
        <span className="badge" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', alignSelf: 'flex-start' }}>Seu perfil nutricional</span>
        <h1 style={{ color: '#fff' }}>Olá, {user.name.split(' ')[0]}! Aqui está sua análise.</h1>
        <p>Objetivo: <strong style={{ color: '#fff' }}>{GOAL[a.goal ?? 'melhorar_alimentacao']}</strong>. As estimativas abaixo são aproximadas e servem como ponto de partida educativo — não são prescrição.</p>
      </div>

      {safety.reasons.length ? (
        <Alert kind="warning" title="Atenção ao seu perfil">
          <ul style={{ margin: 0, paddingLeft: 18 }}>{safety.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </Alert>
      ) : null}

      <div className="grid-3">
        <div className="card stack-sm">
          <div className="row"><Flame color="var(--accent)" /><h3>Gasto energético estimado</h3></div>
          {range ? (
            <>
              <div className="kpi"><span className="value">≈ {fmt(range.tdee, 0)} kcal/dia</span><span className="label">Estimativa (Mifflin-St Jeor × atividade)</span></div>
              <p className="small muted">Metabolismo basal estimado: {fmt(range.bmr, 0)} kcal. O gasto real pode variar ±10–20%.</p>
            </>
          ) : <p className="small muted">Dados insuficientes para estimar.</p>}
        </div>
        <div className="card stack-sm">
          <div className="row"><HeartPulse color="var(--primary)" /><h3>Faixa de ingestão orientativa</h3></div>
          {hideCal ? (
            <p className="small muted">{safety.restrictive ? 'Pelo seu perfil, não exibimos metas calóricas. Foque na qualidade e regularidade das refeições e busque orientação profissional.' : 'Você optou por ocultar calorias. Pode reativar em Perfil e configurações.'}</p>
          ) : range ? (
            <>
              <div className="kpi"><span className="value">{fmt(range.min, 0)}–{fmt(range.max, 0)} kcal</span><span className="label">Faixa sugerida, não um limite obrigatório</span></div>
              {prot ? <p className="small muted">Proteína orientativa: {prot.min}–{prot.max} g/dia.</p> : null}
            </>
          ) : <p className="small muted">Dados insuficientes.</p>}
        </div>
        <div className="card stack-sm">
          <div className="row"><Droplets color="var(--info)" /><h3>Hidratação</h3></div>
          <div className="kpi"><span className="value">≈ {(waterGoalMl(a) / 1000).toLocaleString('pt-BR')} L/dia</span><span className="label">≈35 ml por kg, ajuste à sede e ao clima</span></div>
        </div>
      </div>

      {!hideWeight && imc ? (
        <div className="card row" style={{ alignItems: 'flex-start' }}>
          <Ruler color="var(--primary)" />
          <div className="stack-sm">
            <h3>IMC: {fmt(imc, 1)} kg/m²</h3>
            <p className="small muted">O IMC é um indicador populacional simples: não diferencia músculo de gordura e não avalia a saúde individual. Use apenas como referência.</p>
          </div>
        </div>
      ) : null}

      {plan ? (
        <div className="card stack">
          <h2>Resumo do seu plano</h2>
          <p className="muted" style={{ whiteSpace: 'pre-line' }}>{plan.summary}</p>
          {plan.energy?.explanation ? <p className="small muted">{plan.energy.explanation}</p> : null}
          <div className="row-wrap">
            <Link to="/plano" className="btn btn-primary">Ver plano completo<ArrowRight size={18} /></Link>
            <Link to="/" className="btn">Ir para o início</Link>
            <Link to="/questionario?editar=1" className="btn btn-ghost"><Pencil size={16} />Editar respostas</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
