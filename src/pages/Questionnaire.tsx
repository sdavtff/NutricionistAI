import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brand } from '../components/Layout';
import { Alert, Button, PageLoading } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getQuestionnaire, saveQuestionnaire } from '../db/repo';
import type { QuestionnaireAnswers } from '../db/types';
import { brl } from '../lib/format';
import { cleanText, parseDecimal, validateNumber } from '../lib/validation';
import { createPlanForUser } from '../services/plans';

type A = QuestionnaireAnswers;

interface Step {
  key: string;
  title: string;
  subtitle?: string;
  optional?: boolean;
  render: (a: A, set: (patch: Partial<A>) => void) => ReactNode;
  validate?: (a: A) => string | null;
}

function Choice<T extends string | number>({ value, onChange, options, two }: { value: T | undefined; onChange: (v: T) => void; options: { value: T; label: string; emoji?: string; desc?: string }[]; two?: boolean }) {
  return (
    <div className={`options${two ? ' two' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} aria-pressed={value === o.value} className="option" onClick={() => onChange(o.value)}>
          {o.emoji ? <span className="emoji" aria-hidden>{o.emoji}</span> : null}
          <span>{o.label}{o.desc ? <small>{o.desc}</small> : null}</span>
        </button>
      ))}
    </div>
  );
}

function NumberQ({ value, onChange, unit, placeholder }: { value: number | null | undefined; onChange: (v: number | undefined) => void; unit: string; placeholder?: string }) {
  const [text, setText] = useState(value === undefined || value === null ? '' : String(value).replace('.', ','));
  return (
    <div className="input-group" style={{ maxWidth: 260 }}>
      <input className="input" inputMode="decimal" value={text} placeholder={placeholder} autoFocus aria-label={`Valor em ${unit}`}
        style={{ fontSize: '1.4rem', fontWeight: 700, minHeight: 58 }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseDecimal(e.target.value);
          onChange(e.target.value.trim() === '' || !Number.isFinite(n) ? undefined : n);
        }} />
      <span className="addon muted strong" style={{ marginRight: 14 }}>{unit}</span>
    </div>
  );
}

const ALLERGY_CHIPS = ['Lactose', 'Glúten', 'Amendoim', 'Castanhas', 'Ovo', 'Frutos do mar', 'Soja', 'Peixe'];

const STEPS: Step[] = [
  {
    key: 'age', title: 'Qual é a sua idade?',
    render: (a, set) => <NumberQ value={a.age} unit="anos" onChange={(v) => set({ age: v })} placeholder="Ex.: 30" />,
    validate: (a) => validateNumber(a.age, { min: 10, max: 110, label: 'a idade', integer: true }),
  },
  {
    key: 'sex', title: 'Sexo biológico (para a estimativa de energia)',
    subtitle: 'As equações de gasto energético usam esse dado. Você pode preferir não informar — a estimativa ficará menos precisa.',
    render: (a, set) => <Choice value={a.sex} onChange={(v) => set({ sex: v })} options={[
      { value: 'feminino', label: 'Feminino' }, { value: 'masculino', label: 'Masculino' }, { value: 'nao_informar', label: 'Prefiro não informar' },
    ]} />,
    validate: (a) => (a.sex ? null : 'Escolha uma opção.'),
  },
  {
    key: 'height', title: 'Qual é a sua altura em centímetros?',
    render: (a, set) => <NumberQ value={a.heightCm} unit="cm" onChange={(v) => set({ heightCm: v })} placeholder="Ex.: 168" />,
    validate: (a) => validateNumber(a.heightCm, { min: 100, max: 250, label: 'a altura' }),
  },
  {
    key: 'weight', title: 'Qual é o seu peso atual?',
    render: (a, set) => <NumberQ value={a.weightKg} unit="kg" onChange={(v) => set({ weightKg: v })} placeholder="Ex.: 70" />,
    validate: (a) => validateNumber(a.weightKg, { min: 25, max: 350, label: 'o peso' }),
  },
  {
    key: 'target', title: 'Qual é o seu peso desejado, se houver?', optional: true,
    subtitle: 'Opcional. Você pode pular e também ocultar metas de peso depois.',
    render: (a, set) => <NumberQ value={a.targetWeightKg} unit="kg" onChange={(v) => set({ targetWeightKg: v ?? null })} placeholder="Opcional" />,
    validate: (a) => validateNumber(a.targetWeightKg, { min: 25, max: 350, label: 'o peso desejado', required: false }),
  },
  {
    key: 'goal', title: 'Qual é o seu objetivo?',
    render: (a, set) => <Choice two value={a.goal} onChange={(v) => set({ goal: v })} options={[
      { value: 'emagrecer', label: 'Emagrecer', emoji: '🌿', desc: 'De forma gradual e saudável' },
      { value: 'manter', label: 'Manter o peso', emoji: '⚖️' },
      { value: 'ganhar_massa', label: 'Ganhar massa muscular', emoji: '💪' },
      { value: 'melhorar_alimentacao', label: 'Melhorar a alimentação', emoji: '🥗' },
    ]} />,
    validate: (a) => (a.goal ? null : 'Escolha um objetivo.'),
  },
  {
    key: 'activity', title: 'Qual é o seu nível de atividade física?',
    render: (a, set) => <Choice value={a.activityLevel} onChange={(v) => set({ activityLevel: v })} options={[
      { value: 'sedentario', label: 'Sedentário', desc: 'Pouco ou nenhum exercício' },
      { value: 'leve', label: 'Levemente ativo', desc: 'Exercício leve 1–3 dias/semana' },
      { value: 'moderado', label: 'Moderadamente ativo', desc: 'Exercício moderado 3–5 dias/semana' },
      { value: 'intenso', label: 'Muito ativo', desc: 'Exercício intenso 6–7 dias/semana' },
      { value: 'muito_intenso', label: 'Extremamente ativo', desc: 'Treino pesado diário ou trabalho físico' },
    ]} />,
    validate: (a) => (a.activityLevel ? null : 'Escolha um nível.'),
  },
  {
    key: 'exercise', title: 'Quantas vezes por semana você pratica exercícios?',
    render: (a, set) => <Choice value={a.exerciseDaysPerWeek} onChange={(v) => set({ exerciseDaysPerWeek: v })} options={[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n === 0 ? 'Nenhuma' : `${n}× por semana` }))} two />,
    validate: (a) => (a.exerciseDaysPerWeek === undefined ? 'Escolha uma opção.' : null),
  },
  {
    key: 'routine', title: 'Como é sua rotina diária?',
    render: (a, set) => <Choice value={a.routine} onChange={(v) => set({ routine: v })} options={[
      { value: 'Trabalho/estudo sentado a maior parte do dia', label: 'Sentado(a) a maior parte do dia', emoji: '💻' },
      { value: 'Trabalho em pé ou em movimento', label: 'Em pé ou em movimento', emoji: '🚶' },
      { value: 'Horários irregulares ou turnos', label: 'Horários irregulares / turnos', emoji: '🌙' },
      { value: 'Rotina em casa, flexível', label: 'Em casa, horários flexíveis', emoji: '🏠' },
    ]} />,
    validate: (a) => (a.routine ? null : 'Escolha uma opção.'),
  },
  {
    key: 'meals', title: 'Quantas refeições você costuma fazer por dia?',
    render: (a, set) => <Choice value={a.mealsPerDay} onChange={(v) => set({ mealsPerDay: v })} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: n === 6 ? '6 ou mais' : `${n}` }))} two />,
    validate: (a) => (a.mealsPerDay ? null : 'Escolha uma opção.'),
  },
  {
    key: 'dislikes', title: 'Existem alimentos de que você não gosta?', optional: true,
    subtitle: 'Separe por vírgulas. Evitaremos esses alimentos nas sugestões.',
    render: (a, set) => <textarea className="input" value={a.dislikedFoods ?? ''} maxLength={300} placeholder="Ex.: fígado, jiló, berinjela" onChange={(e) => set({ dislikedFoods: e.target.value })} aria-label="Alimentos de que não gosta" />,
  },
  {
    key: 'allergies', title: 'Possui alergias ou intolerâncias alimentares?', optional: true,
    subtitle: 'Toque para marcar ou escreva outras. Alergias graves devem ser acompanhadas por um médico.',
    render: (a, set) => {
      const list = (a.allergies ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const toggle = (c: string) => set({ allergies: (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]).join(', ') });
      return (
        <div className="stack">
          <div className="row-wrap">{ALLERGY_CHIPS.map((c) => <button key={c} type="button" className="chip" aria-pressed={list.includes(c)} onClick={() => toggle(c)}>{c}</button>)}</div>
          <input className="input" value={a.allergies ?? ''} maxLength={300} placeholder="Outras (separe por vírgulas)" onChange={(e) => set({ allergies: e.target.value })} aria-label="Alergias e intolerâncias" />
        </div>
      );
    },
  },
  {
    key: 'diet', title: 'Segue alguma preferência alimentar?',
    render: (a, set) => <Choice two value={a.dietPreference} onChange={(v) => set({ dietPreference: v })} options={[
      { value: 'nenhuma', label: 'Nenhuma / onívora', emoji: '🍽️' }, { value: 'vegetariana', label: 'Vegetariana', emoji: '🥚' },
      { value: 'vegana', label: 'Vegana', emoji: '🌱' }, { value: 'pescetariana', label: 'Pescetariana', emoji: '🐟' },
      { value: 'sem_lactose', label: 'Sem lactose', emoji: '🥛' }, { value: 'sem_gluten', label: 'Sem glúten', emoji: '🌾' },
    ]} />,
    validate: (a) => (a.dietPreference ? null : 'Escolha uma opção.'),
  },
  {
    key: 'budget', title: 'Qual é o seu orçamento aproximado para alimentação?',
    render: (a, set) => (
      <div className="stack">
        <Choice value={a.budget} onChange={(v) => set({ budget: v })} options={[
          { value: 'baixo', label: 'Econômico', desc: 'Prioridade em custo-benefício' },
          { value: 'medio', label: 'Moderado' },
          { value: 'alto', label: 'Flexível' },
        ]} />
        <label className="field">
          <span className="label">Valor mensal aproximado (opcional)</span>
          <input className="input" inputMode="decimal" placeholder="Ex.: 800" defaultValue={a.budgetMonthlyBRL ?? ''} style={{ maxWidth: 220 }}
            onChange={(e) => { const n = parseDecimal(e.target.value); set({ budgetMonthlyBRL: e.target.value && Number.isFinite(n) ? n : null }); }} />
          {a.budgetMonthlyBRL ? <span className="hint">{brl(a.budgetMonthlyBRL)} por mês</span> : null}
        </label>
      </div>
    ),
    validate: (a) => (a.budget ? validateNumber(a.budgetMonthlyBRL, { min: 0, max: 100000, label: 'o valor', required: false }) : 'Escolha uma opção.'),
  },
  {
    key: 'cooking', title: 'Quanto tempo você tem disponível para cozinhar?',
    render: (a, set) => <Choice two value={a.cookingTime} onChange={(v) => set({ cookingTime: v })} options={[
      { value: 'menos_15', label: 'Menos de 15 min', emoji: '⚡' }, { value: '15_30', label: '15 a 30 min', emoji: '⏱️' },
      { value: '30_60', label: '30 a 60 min', emoji: '🍲' }, { value: 'mais_60', label: 'Mais de 1 hora', emoji: '👩‍🍳' },
    ]} />,
    validate: (a) => (a.cookingTime ? null : 'Escolha uma opção.'),
  },
  {
    key: 'sleep', title: 'Como você avalia a qualidade do seu sono?',
    render: (a, set) => <Choice two value={a.sleepQuality} onChange={(v) => set({ sleepQuality: v })} options={[
      { value: 'ruim', label: 'Ruim', emoji: '😫' }, { value: 'regular', label: 'Regular', emoji: '😐' },
      { value: 'boa', label: 'Boa', emoji: '🙂' }, { value: 'otima', label: 'Ótima', emoji: '😴' },
    ]} />,
    validate: (a) => (a.sleepQuality ? null : 'Escolha uma opção.'),
  },
  {
    key: 'health', title: 'Existe alguma condição de saúde relevante que gostaria de informar?', optional: true,
    subtitle: 'Totalmente voluntário. Usamos apenas para evitar sugestões inadequadas — não fazemos diagnósticos.',
    render: (a, set) => (
      <div className="stack">
        <label className="check"><input type="checkbox" checked={!!a.pregnantOrBreastfeeding} onChange={(e) => set({ pregnantOrBreastfeeding: e.target.checked })} />Estou gestante ou amamentando</label>
        <label className="check"><input type="checkbox" checked={!!a.eatingDisorderHistory} onChange={(e) => set({ eatingDisorderHistory: e.target.checked })} />Tenho ou tive transtorno alimentar</label>
        <textarea className="input" value={a.healthConditions ?? ''} maxLength={300} placeholder="Opcional. Ex.: diabetes, hipertensão…" onChange={(e) => set({ healthConditions: e.target.value })} aria-label="Condições de saúde" />
      </div>
    ),
  },
];

export function QuestionnairePage() {
  const user = useUser();
  const { refresh } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editing = params.get('editar') === '1';
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<A>({});
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    getQuestionnaire(user.id).then((q) => {
      if (q) {
        setAnswers(q.answers);
        setStep(editing || q.completed ? 0 : Math.min(q.step, STEPS.length - 1));
      }
      setLoading(false);
    });
  }, [user.id, editing]);

  const current = STEPS[step];
  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  const set = (patch: Partial<A>) => {
    setAnswers((a) => ({ ...a, ...patch }));
    setError(null);
  };
  const minorWarning = useMemo(() => answers.age !== undefined && answers.age < 18, [answers.age]);

  async function next() {
    const err = current.validate?.(answers) ?? null;
    if (err) return setError(err);
    const clean: A = {
      ...answers,
      dislikedFoods: cleanText(answers.dislikedFoods, 300),
      allergies: cleanText(answers.allergies, 300),
      healthConditions: cleanText(answers.healthConditions, 300),
    };
    if (step < STEPS.length - 1) {
      await saveQuestionnaire(user.id, clean, step + 1, editing);
      setStep(step + 1);
      return;
    }
    setFinishing(true);
    try {
      await saveQuestionnaire(user.id, clean, step, true);
      await createPlanForUser(user.id, clean);
      await refresh();
      toast(editing ? 'Respostas atualizadas e plano refeito.' : 'Perfil criado! Veja sua análise.');
      nav('/perfil-nutricional', { replace: true });
    } catch (e) {
      setError((e as Error).message || 'Não foi possível salvar.');
    } finally {
      setFinishing(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <div className="row between" style={{ marginBottom: 18 }}>
        <Brand small />
        {editing ? <Button size="sm" variant="ghost" onClick={() => nav(-1)}>Cancelar</Button> : <span className="small muted">Suas respostas são salvas a cada etapa</span>}
      </div>
      <div className="stack-sm">
        <div className="row between small"><span className="muted">Pergunta {step + 1} de {STEPS.length}</span><span className="strong">{pct}%</span></div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do questionário"><span style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="card mt stack" key={current.key} style={{ animation: 'fadeUp .25s ease' }}>
        <div className="stack-sm">
          <h1 style={{ fontSize: '1.4rem' }}>{current.title}</h1>
          {current.subtitle ? <p className="muted small">{current.subtitle}</p> : null}
          {current.optional ? <span className="badge">Opcional</span> : null}
        </div>
        {current.render(answers, set)}
        {current.key === 'age' && minorWarning ? (
          <Alert kind="warning" title="Menores de 18 anos">O app não mostrará metas restritivas. Procure um(a) nutricionista ou pediatra para orientação individual.</Alert>
        ) : null}
        {current.key === 'health' && (answers.pregnantOrBreastfeeding || answers.eatingDisorderHistory) ? (
          <Alert kind="info">Obrigado por compartilhar. Não mostraremos metas de restrição calórica, e recomendamos acompanhamento profissional. Se precisar conversar, o CVV atende 24h pelo 188.</Alert>
        ) : null}
        {error ? <Alert kind="danger">{error}</Alert> : null}
      </div>

      <div className="row between mt">
        <Button onClick={() => { setError(null); setStep(Math.max(0, step - 1)); }} disabled={step === 0}><ArrowLeft size={18} />Voltar</Button>
        <div className="row">
          {current.optional && step < STEPS.length - 1 ? <Button variant="ghost" onClick={() => { setError(null); setStep(step + 1); }}>Pular</Button> : null}
          <Button variant="primary" onClick={next} loading={finishing}>
            {step === STEPS.length - 1 ? <><Check size={18} />Concluir</> : <>Continuar<ArrowRight size={18} /></>}
          </Button>
        </div>
      </div>
      <p className="tiny muted center mt">Coletamos apenas o necessário para personalizar as sugestões. Você pode editar ou excluir tudo depois.</p>
    </div>
  );
}
