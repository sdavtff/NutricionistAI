// Base local de composição de alimentos (por 100 g de parte comestível).
//
// Fonte: valores baseados na Tabela Brasileira de Composição de Alimentos — TACO, 4ª edição
// (NEPA/UNICAMP, 2011), de uso livre com citação da fonte. Esta é uma seleção reduzida para uso
// educativo/offline; nutrientes não transcritos ficam como `null` (desconhecido) e nunca são
// preenchidos com valores inventados. Para uso profissional, consulte a tabela oficial:
// https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/  — ou a TBCA (USP/FoRC): https://www.tbca.net.br/
import type { Food, Nutrients } from '../db/types';
import { normalizeNutrients } from './nutrition';

export const TACO_LABEL = 'Base TACO 4ª ed. (NEPA/UNICAMP)';

type Row = [
  id: string, name: string, category: string,
  kcal: number, protein: number, carbs: number, fat: number, fiber: number | null, sodium: number | null,
  extra?: Partial<Nutrients> & { unit?: [string, number]; kw?: string[] },
];

const ROWS: Row[] = [
  // Cereais e derivados
  ['arroz-branco-cozido', 'Arroz branco cozido', 'Cereais', 128, 2.5, 28.1, 0.2, 1.6, 1, { calcium: 4, iron: 0.1, potassium: 15, unit: ['colher de servir', 45], kw: ['arroz'] }],
  ['arroz-integral-cozido', 'Arroz integral cozido', 'Cereais', 124, 2.6, 25.8, 1.0, 2.7, 1, { calcium: 5, iron: 0.3, potassium: 75, unit: ['colher de servir', 45], kw: ['arroz integral'] }],
  ['pao-frances', 'Pão francês', 'Cereais', 300, 8.0, 58.6, 3.1, 2.3, 648, { calcium: 16, iron: 1.0, unit: ['unidade', 50], kw: ['pão', 'pao', 'pãozinho'] }],
  ['pao-forma-integral', 'Pão de forma integral', 'Cereais', 253, 9.4, 49.9, 3.7, 6.9, 506, { unit: ['fatia', 25], kw: ['pão integral', 'pão de forma'] }],
  ['aveia-flocos', 'Aveia em flocos crua', 'Cereais', 394, 13.9, 66.6, 8.5, 9.1, 5, { calcium: 48, iron: 4.4, unit: ['colher de sopa', 15], kw: ['aveia'] }],
  ['cuscuz-milho', 'Cuscuz de milho cozido com sal', 'Cereais', 113, 2.2, 25.3, 0.7, 2.1, 247, { unit: ['porção', 100], kw: ['cuscuz'] }],
  ['farinha-mandioca-torrada', 'Farinha de mandioca torrada', 'Cereais', 365, 1.2, 89.2, 0.3, 6.5, 10, { unit: ['colher de sopa', 16], kw: ['farofa', 'farinha'] }],
  // Leguminosas
  ['feijao-carioca-cozido', 'Feijão carioca cozido', 'Leguminosas', 76, 4.8, 13.6, 0.5, 8.5, 2, { calcium: 27, iron: 1.3, potassium: 255, unit: ['concha', 86], kw: ['feijão', 'feijao'] }],
  ['feijao-preto-cozido', 'Feijão preto cozido', 'Leguminosas', 77, 4.5, 14.0, 0.5, 8.4, 2, { calcium: 29, iron: 1.5, potassium: 256, unit: ['concha', 86], kw: ['feijão preto', 'feijoada'] }],
  ['lentilha-cozida', 'Lentilha cozida', 'Leguminosas', 93, 6.3, 16.3, 0.5, 7.9, 1, { iron: 1.5, unit: ['concha', 86], kw: ['lentilha'] }],
  // Carnes, ovos e peixes
  ['frango-peito-grelhado', 'Peito de frango sem pele grelhado', 'Carnes e ovos', 159, 32.0, 0, 2.5, null, 50, { cholesterol: 89, unit: ['filé médio', 100], kw: ['frango', 'peito de frango', 'galinha'] }],
  ['patinho-grelhado', 'Carne bovina, patinho, grelhado', 'Carnes e ovos', 219, 35.9, 0, 7.3, null, null, { unit: ['bife médio', 100], kw: ['carne', 'bife', 'patinho'] }],
  ['acem-moido-cozido', 'Carne bovina, acém moído, cozido', 'Carnes e ovos', 212, 26.7, 0, 10.9, null, null, { unit: ['colher de sopa', 25], kw: ['carne moída', 'moida'] }],
  ['ovo-cozido', 'Ovo de galinha inteiro cozido', 'Carnes e ovos', 146, 13.3, 0.6, 9.5, null, 146, { cholesterol: 397, calcium: 49, iron: 1.5, unit: ['unidade', 50], kw: ['ovo', 'ovos'] }],
  ['atum-conserva-oleo', 'Atum em conserva em óleo', 'Carnes e ovos', 166, 26.2, 0, 6.0, null, 362, { unit: ['lata drenada', 120], kw: ['atum'] }],
  ['sardinha-conserva-oleo', 'Sardinha em conserva em óleo', 'Carnes e ovos', 285, 15.9, 0, 24.0, null, 666, { unit: ['lata drenada', 84], kw: ['sardinha'] }],
  // Laticínios
  ['leite-integral', 'Leite de vaca integral', 'Laticínios', 61, 2.9, 4.3, 3.2, null, 64, { calcium: 123, cholesterol: 10, unit: ['copo (200 ml)', 206], kw: ['leite'] }],
  ['iogurte-natural', 'Iogurte natural integral', 'Laticínios', 51, 4.1, 1.9, 3.0, null, 52, { calcium: 143, unit: ['pote', 170], kw: ['iogurte'] }],
  ['queijo-minas-frescal', 'Queijo minas frescal', 'Laticínios', 264, 17.4, 3.2, 20.2, null, null, { unit: ['fatia', 30], kw: ['queijo', 'minas'] }],
  ['requeijao-cremoso', 'Requeijão cremoso', 'Laticínios', 257, 9.6, 2.4, 23.4, null, 558, { unit: ['colher de sopa', 30], kw: ['requeijão'] }],
  ['manteiga-com-sal', 'Manteiga com sal', 'Óleos e gorduras', 726, 0.4, 0.1, 82.4, null, 579, { unit: ['ponta de faca', 5], kw: ['manteiga'] }],
  // Hortaliças e tubérculos
  ['alface-crespa', 'Alface crespa crua', 'Hortaliças', 11, 1.3, 1.7, 0.2, 1.8, 3, { calcium: 38, unit: ['folha', 10], kw: ['alface', 'salada'] }],
  ['tomate-cru', 'Tomate cru', 'Hortaliças', 15, 1.1, 3.1, 0.2, 1.2, 1, { potassium: 222, unit: ['unidade média', 100], kw: ['tomate'] }],
  ['cenoura-crua', 'Cenoura crua', 'Hortaliças', 34, 1.3, 7.7, 0.2, 3.2, 3, { unit: ['unidade média', 70], kw: ['cenoura'] }],
  ['brocolis-cozido', 'Brócolis cozido', 'Hortaliças', 25, 2.1, 4.4, 0.5, 3.4, 2, { calcium: 51, unit: ['ramo', 20], kw: ['brócolis', 'brocolis'] }],
  ['abobrinha-cozida', 'Abobrinha italiana cozida', 'Hortaliças', 15, 1.1, 3.0, 0.2, 1.6, null, { kw: ['abobrinha'] }],
  ['pepino-cru', 'Pepino cru', 'Hortaliças', 10, 0.9, 2.0, 0, 1.1, null, { kw: ['pepino'] }],
  ['couve-refogada', 'Couve-manteiga refogada', 'Hortaliças', 90, 1.7, 8.7, 6.6, 5.7, null, { unit: ['colher de servir', 40], kw: ['couve'] }],
  ['batata-inglesa-cozida', 'Batata inglesa cozida', 'Tubérculos', 52, 1.2, 11.9, 0, 1.3, 2, { unit: ['unidade média', 130], kw: ['batata'] }],
  ['batata-doce-cozida', 'Batata-doce cozida', 'Tubérculos', 77, 0.6, 18.4, 0.1, 2.2, 3, { unit: ['unidade média', 150], kw: ['batata doce', 'batata-doce'] }],
  ['mandioca-cozida', 'Mandioca cozida', 'Tubérculos', 125, 0.6, 30.1, 0.3, 1.6, 1, { unit: ['pedaço', 100], kw: ['mandioca', 'aipim', 'macaxeira'] }],
  // Frutas
  ['banana-prata', 'Banana prata crua', 'Frutas', 98, 1.3, 26.0, 0.1, 2.0, null, { potassium: 358, unit: ['unidade', 55], kw: ['banana'] }],
  ['maca-fuji', 'Maçã Fuji com casca', 'Frutas', 56, 0.3, 15.2, 0, 1.3, null, { potassium: 75, unit: ['unidade média', 130], kw: ['maçã', 'maca'] }],
  ['mamao-papaia', 'Mamão papaia cru', 'Frutas', 40, 0.5, 10.4, 0.1, 1.0, null, { unit: ['meia unidade', 140], kw: ['mamão', 'mamao'] }],
  ['laranja-pera', 'Laranja pera crua', 'Frutas', 37, 1.0, 8.9, 0.1, 0.8, null, { unit: ['unidade', 140], kw: ['laranja'] }],
  ['melancia', 'Melancia crua', 'Frutas', 33, 0.9, 8.1, 0, 0.1, null, { unit: ['fatia', 200], kw: ['melancia'] }],
  ['morango', 'Morango cru', 'Frutas', 30, 0.9, 6.8, 0.3, 1.7, null, { unit: ['unidade', 12], kw: ['morango'] }],
  ['abacate', 'Abacate cru', 'Frutas', 96, 1.2, 6.0, 8.4, 6.3, null, { unit: ['colher de sopa', 30], kw: ['abacate'] }],
  // Oleaginosas, óleos e açúcares
  ['amendoim-torrado-salgado', 'Amendoim torrado salgado', 'Oleaginosas', 606, 22.5, 18.7, 54.0, 7.8, 376, { unit: ['punhado', 20], kw: ['amendoim'] }],
  ['castanha-do-para', 'Castanha-do-pará crua', 'Oleaginosas', 643, 14.5, 15.1, 63.5, 7.9, null, { unit: ['unidade', 4], kw: ['castanha'] }],
  ['azeite-oliva', 'Azeite de oliva extravirgem', 'Óleos e gorduras', 884, 0, 0, 100, null, null, { unit: ['colher de sopa', 13], kw: ['azeite'] }],
  ['oleo-soja', 'Óleo de soja', 'Óleos e gorduras', 884, 0, 0, 100, null, null, { unit: ['colher de sopa', 13], kw: ['óleo', 'oleo', 'fritura'] }],
  ['acucar-refinado', 'Açúcar refinado', 'Açúcares', 387, 0.3, 99.5, 0, null, null, { unit: ['colher de chá', 5], kw: ['açúcar', 'acucar'] }],
  ['mel', 'Mel de abelha', 'Açúcares', 309, 0, 84.0, 0, null, null, { unit: ['colher de sopa', 20], kw: ['mel'] }],
  ['cafe-infusao', 'Café, infusão 10%', 'Bebidas', 9, 0.7, 1.5, 0.1, null, null, { unit: ['xícara', 50], kw: ['café', 'cafe'] }],
];

export const BASE_FOODS: Food[] = ROWS.map(([id, name, category, kcal, protein, carbs, fat, fiber, sodium, extra]) => {
  const { unit, kw, ...micro } = extra ?? {};
  return {
    id: `taco:${id}`,
    name,
    category,
    per100g: normalizeNutrients({ kcal, protein, carbs, fat, fiber, sodium, ...micro }),
    source: 'base',
    sourceLabel: TACO_LABEL,
    unitName: unit?.[0],
    unitGrams: unit?.[1],
    keywords: kw,
  };
});

const BASE_BY_ID = new Map(BASE_FOODS.map((f) => [f.id, f]));

export function getBaseFood(id: string): Food | undefined {
  return BASE_BY_ID.get(id);
}

export function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Busca simples por nome/palavras-chave, ordenada por relevância. */
export function searchFoods(query: string, foods: Food[] = BASE_FOODS, limit = 12): Food[] {
  const q = normalizeText(query);
  if (!q) return foods.slice(0, limit);
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = foods
    .map((f) => {
      const name = normalizeText(f.name);
      const kws = (f.keywords ?? []).map(normalizeText);
      let score = 0;
      if (name === q) score += 100;
      if (name.startsWith(q)) score += 40;
      if (kws.includes(q)) score += 60;
      for (const t of terms) {
        if (name.includes(t)) score += 10;
        if (kws.some((k) => k.includes(t))) score += 8;
      }
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.f);
}

/** Lista compacta enviada à IA para que ela relacione o que vê com a base local. */
export function foodCatalogForAI(): { id: string; name: string }[] {
  return BASE_FOODS.map((f) => ({ id: f.id, name: f.name }));
}
