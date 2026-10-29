// Orquestra a criação de planos (regras locais ou IA) e dos hábitos iniciais.
import { listHabits, saveHabit, savePlan, uid } from '../db/repo';
import type { NutritionPlan, QuestionnaireAnswers } from '../db/types';
import { assessSafety } from '../lib/nutrition';
import { generateLocalPlan } from '../lib/planGenerator';
import { generateAIPlan } from './ai';

const HABIT_ICONS = ['💧', '🍎', '🥗', '🚶', '😴', '🧘', '🍳', '📓'];

export async function ensureHabits(userId: string, titles: string[]) {
  const existing = await listHabits(userId);
  if (existing.length) return existing;
  for (const [i, title] of titles.slice(0, 5).entries()) {
    await saveHabit({ id: uid(), userId, title, icon: HABIT_ICONS[i % HABIT_ICONS.length], targetPerWeek: 7, active: true, createdAt: Date.now() + i });
  }
  return listHabits(userId);
}

export async function createPlanForUser(userId: string, answers: QuestionnaireAnswers, customization?: string): Promise<NutritionPlan> {
  const plan = generateLocalPlan(userId, answers, Date.now(), customization);
  await savePlan(plan);
  await ensureHabits(userId, plan.habits);
  return plan;
}

/** Perfil enviado à IA: somente campos úteis, sem nome/e-mail. */
export function profileForAI(a: QuestionnaireAnswers): Record<string, unknown> {
  return {
    idade: a.age, sexo: a.sex, alturaCm: a.heightCm, pesoKg: a.weightKg, pesoDesejadoKg: a.targetWeightKg ?? null,
    objetivo: a.goal, nivelAtividade: a.activityLevel, exerciciosPorSemana: a.exerciseDaysPerWeek, rotina: a.routine,
    refeicoesPorDia: a.mealsPerDay, naoGosta: a.dislikedFoods || null, alergiasIntolerancias: a.allergies || null,
    preferencia: a.dietPreference, orcamento: a.budget, orcamentoMensalBRL: a.budgetMonthlyBRL ?? null,
    tempoParaCozinhar: a.cookingTime, sono: a.sleepQuality, gestanteOuAmamentando: !!a.pregnantOrBreastfeeding,
    historicoTranstornoAlimentar: !!a.eatingDisorderHistory, condicoesDeSaude: a.healthConditions || null,
  };
}

export async function createAIPlanForUser(userId: string, answers: QuestionnaireAnswers, customization?: string): Promise<NutritionPlan> {
  const base = generateLocalPlan(userId, answers, Date.now(), customization);
  const safety = assessSafety(answers);
  const { result, model } = await generateAIPlan({
    profile: profileForAI(answers),
    computed: {
      bmr: base.energy?.bmr ?? null, tdee: base.energy?.tdee ?? null,
      rangeMin: base.energy?.rangeMin ?? null, rangeMax: base.energy?.rangeMax ?? null, restrictive: safety.restrictive,
    },
    customization,
  });
  const counters: Record<string, number> = {};
  const plan: NutritionPlan = {
    ...base,
    generator: 'ia',
    model,
    summary: `${result.summary}\n\nPlano gerado por IA a partir das suas respostas. É educativo, pode conter imprecisões e não substitui um(a) nutricionista.`,
    meals: result.meals.map((m) => {
      counters[m.mealType] = (counters[m.mealType] ?? 0) + 1;
      return { ...m, key: `${m.mealType}-${counters[m.mealType] - 1}`, approxKcal: null };
    }),
    substitutions: result.substitutions,
    shoppingList: result.shoppingList,
    recipes: result.recipes,
    recommendations: result.recommendations,
    lifestyle: { hydration: result.hydration, sleep: result.sleep, activity: result.activity },
    weeklyGoals: result.weeklyGoals,
    habits: result.habits,
  };
  await savePlan(plan);
  await ensureHabits(userId, plan.habits);
  return plan;
}
