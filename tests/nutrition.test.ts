import { describe, expect, it } from 'vitest';
import type { MealItem } from '../src/db/types';
import { getBaseFood } from '../src/lib/foods';
import { assessSafety, calorieRange, estimateBMR, estimateTDEE, normalizeNutrients, percentDV, scaleNutrients, sumItems } from '../src/lib/nutrition';

const adult = { age: 30, sex: 'feminino' as const, heightCm: 165, weightKg: 65, activityLevel: 'moderado' as const, goal: 'manter' as const };

describe('cálculos nutricionais', () => {
  it('estima TMB (Mifflin-St Jeor) e gasto diário', () => {
    // 10*65 + 6.25*165 - 5*30 - 161 = 1370.25
    expect(estimateBMR(adult)).toBe(1370);
    expect(estimateTDEE(adult)).toBe(Math.round(1370 * 1.55));
    expect(estimateBMR({ age: 30 })).toBeNull();
  });

  it('faixa de emagrecimento é moderada e nunca abaixo da TMB', () => {
    const r = calorieRange({ ...adult, goal: 'emagrecer', activityLevel: 'sedentario' })!;
    expect(r.min).toBeGreaterThanOrEqual(r.bmr - 25);
    expect(r.min).toBeGreaterThanOrEqual(1200);
    expect(r.max).toBeLessThan(r.tdee);
  });

  it('perfis sensíveis não recebem déficit', () => {
    const teen = { ...adult, age: 16, goal: 'emagrecer' as const };
    expect(assessSafety(teen).restrictive).toBe(true);
    const r = calorieRange(teen)!;
    expect(r.min).toBeGreaterThanOrEqual(Math.round((r.tdee * 0.95) / 50) * 50 - 50);
    expect(assessSafety({ ...adult, eatingDisorderHistory: true }).restrictive).toBe(true);
    expect(assessSafety({ ...adult, pregnantOrBreastfeeding: true }).restrictive).toBe(true);
  });

  it('escala nutrientes e mantém desconhecidos como null', () => {
    const arroz = getBaseFood('taco:arroz-branco-cozido')!;
    const s = scaleNutrients(arroz.per100g, 150);
    expect(s.kcal).toBe(192);
    expect(s.carbs).toBeCloseTo(42.2, 1);
    expect(s.cholesterol).toBeNull();
  });

  it('soma itens sem contar duas vezes o mesmo item e informa dados ausentes', () => {
    const a: MealItem = { id: 'a', name: 'A', grams: 100, per100g: normalizeNutrients({ kcal: 100, protein: 10, sodium: 50 }), source: 'base', sourceLabel: 'x' };
    const b: MealItem = { id: 'b', name: 'B', grams: 50, per100g: normalizeNutrients({ kcal: 200, protein: 4 }), source: 'estimativa_ia', sourceLabel: 'y' };
    const t = sumItems([a, b, a]);
    expect(t.itemCount).toBe(2);
    expect(t.values.kcal).toBe(200);
    expect(t.values.protein).toBe(12);
    expect(t.values.sodium).toBe(50);
    expect(t.missing.sodium).toBe(1);
    expect(t.values.fiber).toBeNull();
  });

  it('%VD só existe para nutrientes com referência', () => {
    expect(percentDV('sodium', 1000)).toBe(50);
    expect(percentDV('transFat', 1)).toBeNull();
    expect(percentDV('cholesterol', 100)).toBeNull();
  });
});
