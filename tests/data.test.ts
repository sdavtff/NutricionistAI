import { describe, expect, it } from 'vitest';
import {
  deleteAllUserData, deleteMeal, duplicateMeal, exportUserData, getLatestPlan, getQuestionnaire, listHabits, listMealsByDate,
  saveAnalysis, saveImage, saveMeal, saveQuestionnaire, saveWeight, listWeights, getUser, uid,
} from '../src/db/repo';
import type { MealEntry, QuestionnaireAnswers } from '../src/db/types';
import { getBaseFood } from '../src/lib/foods';
import { foodToItem } from '../src/components/FoodPicker';
import { createPlanForUser } from '../src/services/plans';
import { register } from '../src/services/auth';
import { isDue } from '../src/services/reminders';

async function newUser(email = 'bia@exemplo.com') {
  return (await register({ name: 'Bia', email, password: 'Senha123', confirm: 'Senha123', consent: { personalData: true, aiProcessing: false } })).user;
}

function meal(userId: string, extra: Partial<MealEntry> = {}): MealEntry {
  return {
    id: uid(), userId, date: '2026-10-20', time: '12:30', mealType: 'almoco', name: 'Almoço',
    items: [foodToItem(getBaseFood('taco:arroz-branco-cozido')!, 100), foodToItem(getBaseFood('taco:feijao-carioca-cozido')!, 86)],
    createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  };
}

const answers: QuestionnaireAnswers = {
  age: 28, sex: 'masculino', heightCm: 178, weightKg: 80, goal: 'emagrecer', activityLevel: 'leve', exerciseDaysPerWeek: 2,
  routine: 'Sentado', mealsPerDay: 3, dietPreference: 'vegana', allergies: 'Amendoim, Castanhas', dislikedFoods: 'lentilha',
  budget: 'baixo', cookingTime: '15_30', sleepQuality: 'regular',
};

describe('questionário e plano', () => {
  it('salva respostas parciais, conclui e gera plano respeitando preferências e restrições', async () => {
    const u = await newUser();
    await saveQuestionnaire(u.id, { age: 28 }, 1, false);
    expect((await getQuestionnaire(u.id))?.step).toBe(1);
    await saveQuestionnaire(u.id, answers, 16, true);
    const plan = await createPlanForUser(u.id, answers);
    expect((await getLatestPlan(u.id))?.id).toBe(plan.id);
    const text = JSON.stringify(plan.meals).toLowerCase();
    expect(text).not.toMatch(/frango|peixe|atum|ovo|iogurte|castanha|amendoim|lentilha/);
    expect(plan.energy?.rangeMin).toBeGreaterThanOrEqual(plan.energy!.bmr!);
    expect(plan.generator).toBe('regras_locais');
    expect((await listHabits(u.id)).length).toBeGreaterThan(0);
  });
});

describe('diário alimentar', () => {
  it('salva, lista por data, duplica e exclui refeições', async () => {
    const u = await newUser();
    const m = await saveMeal(meal(u.id));
    expect(await listMealsByDate(u.id, '2026-10-20')).toHaveLength(1);
    const copy = await duplicateMeal(m.id, '2026-10-21', '08:00');
    expect(copy.id).not.toBe(m.id);
    expect(copy.items[0].id).not.toBe(m.items[0].id);
    expect(await listMealsByDate(u.id, '2026-10-21')).toHaveLength(1);
    await deleteMeal(m.id);
    expect(await listMealsByDate(u.id, '2026-10-20')).toHaveLength(0);
  });

  it('não duplica a refeição de uma mesma análise de foto (evita contagem dupla)', async () => {
    const u = await newUser();
    const img = await saveImage(u.id, new Blob(['x'], { type: 'image/jpeg' }), 10, 10);
    const analysisId = uid();
    await saveAnalysis({ id: analysisId, userId: u.id, imageId: img.id, createdAt: Date.now(), dishName: 'Prato', overallConfidence: 'media', items: [], uncertainties: [], totalKcalEstimate: null, model: 't' });
    await saveMeal(meal(u.id, { analysisId, imageId: img.id }));
    await saveMeal(meal(u.id, { analysisId, imageId: img.id, name: 'Atualizada' }));
    const list = await listMealsByDate(u.id, '2026-10-20');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Atualizada');
  });

  it('valida porções', async () => {
    const u = await newUser();
    await expect(saveMeal(meal(u.id, { items: [] }))).rejects.toThrow(/ao menos um/);
    const bad = meal(u.id);
    bad.items[0].grams = 0;
    await expect(saveMeal(bad)).rejects.toThrow(/porções/);
  });
});

describe('exportação e exclusão de dados', () => {
  it('exporta e exclui todos os dados de um usuário sem afetar outro', async () => {
    const a = await newUser('a@exemplo.com');
    const b = await newUser('b@exemplo.com');
    await saveMeal(meal(a.id));
    await saveMeal(meal(b.id));
    await saveWeight(a.id, '2026-10-20', 70);
    await saveQuestionnaire(a.id, answers, 16, true);
    const exp = await exportUserData(a.id, false);
    expect((exp.meals as unknown[]).length).toBe(1);
    expect(JSON.stringify(exp)).not.toContain('passwordHash');

    await deleteAllUserData(a.id);
    expect(await getUser(a.id)).toBeUndefined();
    expect(await listMealsByDate(a.id, '2026-10-20')).toHaveLength(0);
    expect(await listWeights(a.id)).toHaveLength(0);
    expect(await getQuestionnaire(a.id)).toBeUndefined();
    expect(await listMealsByDate(b.id, '2026-10-20')).toHaveLength(1);
    expect(await getUser(b.id)).toBeDefined();
  });
});

describe('lembretes', () => {
  const r = { id: '1', userId: 'u', kind: 'refeicao' as const, label: 'x', enabled: true, times: ['12:30'], days: [0, 1, 2, 3, 4, 5, 6] };
  it('dispara apenas no horário configurado e uma vez por minuto', () => {
    const at = new Date(2026, 9, 20, 12, 30, 10);
    expect(isDue(r, at)).toBe(true);
    expect(isDue({ ...r, lastFiredAt: at.getTime() }, at)).toBe(false);
    expect(isDue(r, new Date(2026, 9, 20, 12, 31))).toBe(false);
    expect(isDue({ ...r, enabled: false }, at)).toBe(false);
  });
  it('respeita intervalo e janela', () => {
    const w = { ...r, kind: 'agua' as const, times: [], intervalMin: 90, windowStart: '08:00', windowEnd: '21:00' };
    expect(isDue(w, new Date(2026, 9, 20, 9, 30))).toBe(true);
    expect(isDue(w, new Date(2026, 9, 20, 9, 31))).toBe(false);
    expect(isDue(w, new Date(2026, 9, 20, 6, 30))).toBe(false);
  });
});

describe('agendamento nativo de lembretes', () => {
  it('expande intervalos dentro da janela e remove horários duplicados', async () => {
    const { reminderTimes } = await import('../src/services/reminders');
    const base = { id: '1', userId: 'u', kind: 'agua' as const, label: 'x', enabled: true, days: [1] };
    expect(reminderTimes({ ...base, times: [], intervalMin: 90, windowStart: '08:00', windowEnd: '12:00' })).toEqual(['08:00', '09:30', '11:00']);
    expect(reminderTimes({ ...base, times: ['12:30', '12:30', 'xx'] })).toEqual(['12:30']);
  });
});
