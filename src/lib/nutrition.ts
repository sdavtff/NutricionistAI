// Lógica nutricional pura (sem UI e sem persistência) — fácil de testar.
import type { ActivityLevel, MealEntry, MealItem, Nutrients, QuestionnaireAnswers } from '../db/types';

export const NUTRIENT_KEYS = [
  'kcal', 'protein', 'carbs', 'sugars', 'addedSugars', 'fat', 'saturatedFat', 'transFat',
  'monoFat', 'polyFat', 'fiber', 'sodium', 'cholesterol', 'potassium', 'calcium', 'iron',
] as const satisfies readonly (keyof Nutrients)[];

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const NUTRIENT_META: Record<NutrientKey, { label: string; unit: string; indent?: boolean }> = {
  kcal: { label: 'Valor energético', unit: 'kcal' },
  carbs: { label: 'Carboidratos totais', unit: 'g' },
  sugars: { label: 'Açúcares totais', unit: 'g', indent: true },
  addedSugars: { label: 'Açúcares adicionados', unit: 'g', indent: true },
  protein: { label: 'Proteínas', unit: 'g' },
  fat: { label: 'Gorduras totais', unit: 'g' },
  saturatedFat: { label: 'Gorduras saturadas', unit: 'g', indent: true },
  transFat: { label: 'Gorduras trans', unit: 'g', indent: true },
  monoFat: { label: 'Gorduras monoinsaturadas', unit: 'g', indent: true },
  polyFat: { label: 'Gorduras poli-insaturadas', unit: 'g', indent: true },
  fiber: { label: 'Fibra alimentar', unit: 'g' },
  sodium: { label: 'Sódio', unit: 'mg' },
  cholesterol: { label: 'Colesterol', unit: 'mg' },
  potassium: { label: 'Potássio', unit: 'mg' },
  calcium: { label: 'Cálcio', unit: 'mg' },
  iron: { label: 'Ferro', unit: 'mg' },
};

/** Ordem de exibição na tabela nutricional (padrão semelhante ao rótulo brasileiro). */
export const TABLE_ORDER: NutrientKey[] = [
  'kcal', 'carbs', 'sugars', 'addedSugars', 'protein', 'fat', 'saturatedFat', 'transFat',
  'monoFat', 'polyFat', 'fiber', 'sodium', 'cholesterol', 'potassium', 'calcium', 'iron',
];

/**
 * Valores diários de referência para adultos — Instrução Normativa ANVISA nº 75/2020 (Anexo II),
 * base de 2.000 kcal. Nutrientes sem VD de referência (trans, mono, poli, colesterol, açúcares totais)
 * não recebem %VD.
 */
export const DAILY_VALUES: Partial<Record<NutrientKey, number>> = {
  kcal: 2000,
  carbs: 300,
  addedSugars: 50,
  protein: 50,
  fat: 65,
  saturatedFat: 20,
  fiber: 25,
  sodium: 2000,
  calcium: 1000,
  iron: 14,
  potassium: 3500,
};

export const KJ_PER_KCAL = 4.184;

export function emptyNutrients(): Nutrients {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) as unknown as Nutrients;
}

export function normalizeNutrients(partial: Partial<Record<string, unknown>> | null | undefined): Nutrients {
  const out = emptyNutrients();
  if (!partial) return out;
  for (const k of NUTRIENT_KEYS) {
    const v = partial[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** Escala valores por 100 g para uma porção em gramas. Desconhecidos permanecem null. */
export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const out = emptyNutrients();
  const f = Math.max(0, grams) / 100;
  for (const k of NUTRIENT_KEYS) {
    const v = per100g[k];
    out[k] = v === null ? null : round(v * f, k === 'kcal' || isMg(k) ? 0 : 1);
  }
  return out;
}

/** Nutrientes em mg com valores grandes (arredondados a inteiros). Ferro fica com 1 casa decimal. */
function isMg(k: NutrientKey) {
  return NUTRIENT_META[k].unit === 'mg' && k !== 'iron';
}

export function displayDigits(k: NutrientKey) {
  return k === 'kcal' || isMg(k) ? 0 : 1;
}

export function round(v: number, digits = 1) {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

export interface Totals {
  values: Nutrients;
  /** Para cada nutriente, quantos itens não tinham dado (o total é parcial). */
  missing: Record<NutrientKey, number>;
  itemCount: number;
  grams: number;
}

/**
 * Soma itens evitando contagem dupla: itens com o mesmo id são considerados uma vez.
 * Um total é exibido mesmo se parcial, mas `missing` informa quantos itens não tinham o dado.
 */
export function sumItems(items: MealItem[]): Totals {
  const seen = new Set<string>();
  const values = emptyNutrients();
  const missing = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<NutrientKey, number>;
  let grams = 0;
  let count = 0;
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    count++;
    grams += item.grams;
    const scaled = scaleNutrients(item.per100g, item.grams);
    for (const k of NUTRIENT_KEYS) {
      const v = scaled[k];
      if (v === null) missing[k]++;
      else values[k] = round((values[k] ?? 0) + v, k === 'kcal' || isMg(k) ? 0 : 1);
    }
  }
  return { values, missing, itemCount: count, grams };
}

export function sumMeals(meals: MealEntry[]): Totals {
  const seenMeals = new Set<string>();
  const items: MealItem[] = [];
  for (const m of meals) {
    if (seenMeals.has(m.id)) continue;
    seenMeals.add(m.id);
    items.push(...m.items);
  }
  return sumItems(items);
}

export function percentDV(key: NutrientKey, amount: number | null): number | null {
  const ref = DAILY_VALUES[key];
  if (!ref || amount === null) return null;
  return Math.round((amount / ref) * 100);
}

// ---------------- Energia ----------------

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  muito_intenso: 1.9,
};

/** Taxa metabólica basal estimada (Mifflin-St Jeor). Retorna null sem dados suficientes. */
export function estimateBMR(a: QuestionnaireAnswers): number | null {
  if (!a.age || !a.heightCm || !a.weightKg) return null;
  const base = 10 * a.weightKg + 6.25 * a.heightCm - 5 * a.age;
  if (a.sex === 'masculino') return Math.round(base + 5);
  if (a.sex === 'feminino') return Math.round(base - 161);
  // Sem sexo informado: média das duas equações (menos precisa — avisado na interface).
  return Math.round(base - 78);
}

export function estimateTDEE(a: QuestionnaireAnswers): number | null {
  const bmr = estimateBMR(a);
  if (bmr === null || !a.activityLevel) return null;
  return Math.round(bmr * ACTIVITY_FACTORS[a.activityLevel]);
}

export interface SafetyAssessment {
  restrictive: boolean; // se metas restritivas devem ser evitadas
  reasons: string[];
}

export function assessSafety(a: QuestionnaireAnswers): SafetyAssessment {
  const reasons: string[] = [];
  if (a.age !== undefined && a.age < 18) {
    reasons.push('Para menores de 18 anos, as necessidades variam com o crescimento. Procure um(a) nutricionista ou pediatra antes de mudar a alimentação.');
  }
  if (a.pregnantOrBreastfeeding) {
    reasons.push('Gestação e amamentação aumentam as necessidades nutricionais. Não faça restrição calórica sem acompanhamento profissional.');
  }
  if (a.eatingDisorderHistory) {
    reasons.push('Como você informou histórico de transtorno alimentar, o app não mostrará metas de restrição. Um acompanhamento com profissionais de saúde é o caminho mais seguro.');
  }
  if (a.healthConditions && a.healthConditions.trim().length > 0) {
    reasons.push('Você informou uma condição de saúde. As sugestões são gerais e educativas; converse com seu médico(a) ou nutricionista sobre ajustes específicos.');
  }
  if (a.age !== undefined && a.age >= 65) {
    reasons.push('A partir dos 65 anos, a manutenção de massa muscular e a ingestão de proteínas merecem atenção especial — um profissional pode ajustar as recomendações.');
  }
  const restrictive = Boolean(
    (a.age !== undefined && a.age < 18) || a.pregnantOrBreastfeeding || a.eatingDisorderHistory,
  );
  return { restrictive, reasons };
}

export function bmi(a: QuestionnaireAnswers): number | null {
  if (!a.heightCm || !a.weightKg) return null;
  const m = a.heightCm / 100;
  return round(a.weightKg / (m * m), 1);
}

/**
 * Faixa calórica orientativa. Nunca abaixo da TMB estimada nem de pisos de segurança;
 * déficit/superávit moderados (máx. ~15%). Para perfis sensíveis, retorna apenas manutenção.
 */
export function calorieRange(a: QuestionnaireAnswers): { min: number; max: number; tdee: number; bmr: number } | null {
  const tdee = estimateTDEE(a);
  const bmr = estimateBMR(a);
  if (tdee === null || bmr === null) return null;
  const safety = assessSafety(a);
  let min = tdee * 0.95;
  let max = tdee * 1.05;
  if (!safety.restrictive) {
    if (a.goal === 'emagrecer') {
      min = tdee * 0.85;
      max = tdee * 0.92;
    } else if (a.goal === 'ganhar_massa') {
      min = tdee * 1.05;
      max = tdee * 1.12;
    }
  }
  const floor = Math.max(bmr, a.sex === 'masculino' ? 1500 : 1200);
  min = Math.max(min, floor);
  max = Math.max(max, min + 100);
  const r50 = (v: number) => Math.round(v / 50) * 50;
  return { min: r50(min), max: r50(max), tdee, bmr };
}

/** Meta orientativa de proteína (g/dia), faixa conservadora. */
export function proteinRange(a: QuestionnaireAnswers): { min: number; max: number } | null {
  if (!a.weightKg) return null;
  const [lo, hi] = a.goal === 'ganhar_massa' ? [1.4, 1.8] : a.goal === 'emagrecer' ? [1.2, 1.6] : [0.8, 1.2];
  return { min: Math.round(a.weightKg * lo), max: Math.round(a.weightKg * hi) };
}

/** Água orientativa: ~35 ml/kg, limitada a uma faixa razoável. */
export function waterGoalMl(a: QuestionnaireAnswers): number {
  if (!a.weightKg) return 2000;
  return Math.min(3500, Math.max(1500, Math.round((a.weightKg * 35) / 100) * 100));
}

export function macroSplit(t: Nutrients): { protein: number; carbs: number; fat: number } {
  const p = (t.protein ?? 0) * 4;
  const c = (t.carbs ?? 0) * 4;
  const f = (t.fat ?? 0) * 9;
  const total = p + c + f;
  if (!total) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: Math.round((p / total) * 100), carbs: Math.round((c / total) * 100), fat: Math.round((f / total) * 100) };
}

export const MEAL_LABELS: Record<MealEntry['mealType'], string> = {
  cafe: 'Café da manhã',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  outras: 'Outras refeições',
};

export function guessMealType(d = new Date()): MealEntry['mealType'] {
  const h = d.getHours();
  if (h >= 5 && h < 10) return 'cafe';
  if (h >= 11 && h < 15) return 'almoco';
  if (h >= 15 && h < 18) return 'lanche';
  if (h >= 18 && h < 22) return 'jantar';
  return 'outras';
}
