// Biblioteca de receitas simples. A estimativa nutricional por porção é CALCULADA a partir da base
// local (TACO) para os ingredientes que têm correspondência; temperos e itens sem dados não entram
// na soma, e isso é informado na tela.
import type { MealItem, Nutrients } from '../db/types';
import { getBaseFood } from './foods';
import { sumItems } from './nutrition';

export type RecipeTag = 'vegetariana' | 'vegana' | 'sem_lactose' | 'sem_gluten' | 'rica_proteina' | 'economica';

export interface RecipeIngredient {
  name: string;
  qty: string;
  category: string;
  foodId?: string;
  grams?: number;
}

export interface Recipe {
  id: string;
  title: string;
  emoji: string;
  gradient: [string, string];
  mealType: 'cafe' | 'almoco' | 'lanche' | 'jantar';
  timeMin: number;
  servings: number;
  tags: RecipeTag[];
  ingredients: RecipeIngredient[];
  steps: string[];
}

export const TAG_LABELS: Record<RecipeTag, string> = {
  vegetariana: 'Vegetariana',
  vegana: 'Vegana',
  sem_lactose: 'Sem lactose',
  sem_gluten: 'Sem glúten',
  rica_proteina: 'Rica em proteína',
  economica: 'Econômica',
};

export const RECIPES: Recipe[] = [
  {
    id: 'mingau-aveia-banana', title: 'Mingau de aveia com banana', emoji: '🥣', gradient: ['#f6e7c8', '#e9c46a'],
    mealType: 'cafe', timeMin: 10, servings: 1, tags: ['vegetariana', 'economica'],
    ingredients: [
      { name: 'Aveia em flocos', qty: '3 colheres de sopa (45 g)', category: 'Cereais e grãos', foodId: 'taco:aveia-flocos', grams: 45 },
      { name: 'Leite integral', qty: '1 copo (200 ml)', category: 'Laticínios', foodId: 'taco:leite-integral', grams: 206 },
      { name: 'Banana prata', qty: '1 unidade', category: 'Frutas', foodId: 'taco:banana-prata', grams: 55 },
      { name: 'Canela em pó', qty: 'a gosto', category: 'Temperos' },
    ],
    steps: ['Aqueça o leite em fogo baixo.', 'Adicione a aveia e mexa por 3 a 5 minutos até engrossar.', 'Sirva com a banana em rodelas e canela.'],
  },
  {
    id: 'omelete-legumes', title: 'Omelete de legumes', emoji: '🍳', gradient: ['#fff3c4', '#f4a261'],
    mealType: 'cafe', timeMin: 12, servings: 1, tags: ['vegetariana', 'sem_gluten', 'rica_proteina', 'sem_lactose'],
    ingredients: [
      { name: 'Ovos', qty: '2 unidades', category: 'Proteínas', foodId: 'taco:ovo-cozido', grams: 100 },
      { name: 'Tomate', qty: '1/2 unidade', category: 'Hortifrúti', foodId: 'taco:tomate-cru', grams: 50 },
      { name: 'Cenoura ralada', qty: '2 colheres de sopa', category: 'Hortifrúti', foodId: 'taco:cenoura-crua', grams: 25 },
      { name: 'Azeite', qty: '1 colher de chá', category: 'Óleos e temperos', foodId: 'taco:azeite-oliva', grams: 4 },
      { name: 'Sal e cheiro-verde', qty: 'a gosto', category: 'Temperos' },
    ],
    steps: ['Bata os ovos com sal.', 'Misture o tomate picado e a cenoura.', 'Unte a frigideira com azeite e cozinhe em fogo baixo, virando na metade.'],
  },
  {
    id: 'prato-brasileiro', title: 'Prato feito equilibrado', emoji: '🍛', gradient: ['#d8f3dc', '#52b788'],
    mealType: 'almoco', timeMin: 40, servings: 1, tags: ['sem_lactose', 'sem_gluten', 'rica_proteina', 'economica'],
    ingredients: [
      { name: 'Arroz branco cozido', qty: '4 colheres de sopa (100 g)', category: 'Cereais e grãos', foodId: 'taco:arroz-branco-cozido', grams: 100 },
      { name: 'Feijão carioca cozido', qty: '1 concha (86 g)', category: 'Cereais e grãos', foodId: 'taco:feijao-carioca-cozido', grams: 86 },
      { name: 'Peito de frango grelhado', qty: '1 filé (100 g)', category: 'Proteínas', foodId: 'taco:frango-peito-grelhado', grams: 100 },
      { name: 'Alface', qty: '5 folhas', category: 'Hortifrúti', foodId: 'taco:alface-crespa', grams: 50 },
      { name: 'Tomate', qty: '1 unidade', category: 'Hortifrúti', foodId: 'taco:tomate-cru', grams: 100 },
      { name: 'Azeite', qty: '1 colher de chá', category: 'Óleos e temperos', foodId: 'taco:azeite-oliva', grams: 4 },
    ],
    steps: ['Tempere o frango com alho, limão e sal; grelhe 5 minutos de cada lado.', 'Monte o prato: metade com salada, um quarto com arroz e feijão, um quarto com o frango.', 'Regue a salada com azeite.'],
  },
  {
    id: 'lentilha-legumes', title: 'Lentilha com legumes', emoji: '🥘', gradient: ['#ffe5d9', '#e76f51'],
    mealType: 'almoco', timeMin: 35, servings: 3, tags: ['vegana', 'vegetariana', 'sem_lactose', 'sem_gluten', 'rica_proteina', 'economica'],
    ingredients: [
      { name: 'Lentilha cozida', qty: '3 xícaras (480 g)', category: 'Cereais e grãos', foodId: 'taco:lentilha-cozida', grams: 480 },
      { name: 'Cenoura', qty: '1 unidade', category: 'Hortifrúti', foodId: 'taco:cenoura-crua', grams: 70 },
      { name: 'Abobrinha', qty: '1 unidade', category: 'Hortifrúti', foodId: 'taco:abobrinha-cozida', grams: 200 },
      { name: 'Tomate', qty: '2 unidades', category: 'Hortifrúti', foodId: 'taco:tomate-cru', grams: 200 },
      { name: 'Azeite', qty: '1 colher de sopa', category: 'Óleos e temperos', foodId: 'taco:azeite-oliva', grams: 13 },
      { name: 'Alho, cebola e cominho', qty: 'a gosto', category: 'Temperos' },
    ],
    steps: ['Refogue alho e cebola no azeite.', 'Junte cenoura e abobrinha em cubos e o tomate picado; cozinhe 10 minutos.', 'Acrescente a lentilha cozida, tempere e deixe apurar por 5 minutos.'],
  },
  {
    id: 'salada-atum', title: 'Salada completa com atum', emoji: '🥗', gradient: ['#e0f2e9', '#2a9d8f'],
    mealType: 'jantar', timeMin: 15, servings: 1, tags: ['sem_lactose', 'sem_gluten', 'rica_proteina'],
    ingredients: [
      { name: 'Atum em conserva (drenado)', qty: '1/2 lata (60 g)', category: 'Proteínas', foodId: 'taco:atum-conserva-oleo', grams: 60 },
      { name: 'Alface', qty: '6 folhas', category: 'Hortifrúti', foodId: 'taco:alface-crespa', grams: 60 },
      { name: 'Tomate', qty: '1 unidade', category: 'Hortifrúti', foodId: 'taco:tomate-cru', grams: 100 },
      { name: 'Pepino', qty: '1/2 unidade', category: 'Hortifrúti', foodId: 'taco:pepino-cru', grams: 80 },
      { name: 'Batata cozida', qty: '1 unidade', category: 'Hortifrúti', foodId: 'taco:batata-inglesa-cozida', grams: 130 },
      { name: 'Azeite e limão', qty: '1 colher de chá', category: 'Óleos e temperos', foodId: 'taco:azeite-oliva', grams: 4 },
    ],
    steps: ['Cozinhe a batata em cubos até ficar macia.', 'Corte os vegetais e misture tudo em uma tigela.', 'Tempere com azeite, limão e sal.'],
  },
  {
    id: 'cuscuz-ovo', title: 'Cuscuz nordestino com ovo', emoji: '🌽', gradient: ['#fff1b6', '#e9c46a'],
    mealType: 'jantar', timeMin: 15, servings: 1, tags: ['vegetariana', 'sem_gluten', 'sem_lactose', 'economica'],
    ingredients: [
      { name: 'Cuscuz de milho cozido', qty: '1 porção (150 g)', category: 'Cereais e grãos', foodId: 'taco:cuscuz-milho', grams: 150 },
      { name: 'Ovos', qty: '2 unidades', category: 'Proteínas', foodId: 'taco:ovo-cozido', grams: 100 },
      { name: 'Tomate', qty: '1/2 unidade', category: 'Hortifrúti', foodId: 'taco:tomate-cru', grams: 50 },
    ],
    steps: ['Hidrate a farinha de milho com água e sal por 10 minutos e cozinhe na cuscuzeira.', 'Cozinhe ou mexa os ovos.', 'Sirva com tomate picado.'],
  },
  {
    id: 'batata-doce-frango', title: 'Batata-doce com frango e brócolis', emoji: '🍠', gradient: ['#ffd6c0', '#d1495b'],
    mealType: 'almoco', timeMin: 30, servings: 2, tags: ['sem_lactose', 'sem_gluten', 'rica_proteina'],
    ingredients: [
      { name: 'Batata-doce', qty: '2 unidades médias', category: 'Hortifrúti', foodId: 'taco:batata-doce-cozida', grams: 300 },
      { name: 'Peito de frango', qty: '2 filés', category: 'Proteínas', foodId: 'taco:frango-peito-grelhado', grams: 200 },
      { name: 'Brócolis', qty: '1 maço pequeno', category: 'Hortifrúti', foodId: 'taco:brocolis-cozido', grams: 200 },
      { name: 'Azeite', qty: '1 colher de sopa', category: 'Óleos e temperos', foodId: 'taco:azeite-oliva', grams: 13 },
    ],
    steps: ['Cozinhe a batata-doce em cubos por 15 minutos.', 'Grelhe o frango temperado.', 'Cozinhe o brócolis no vapor por 5 minutos e regue tudo com azeite.'],
  },
  {
    id: 'iogurte-frutas', title: 'Iogurte com frutas e aveia', emoji: '🍓', gradient: ['#ffe3ec', '#ef476f'],
    mealType: 'lanche', timeMin: 5, servings: 1, tags: ['vegetariana', 'rica_proteina'],
    ingredients: [
      { name: 'Iogurte natural', qty: '1 pote (170 g)', category: 'Laticínios', foodId: 'taco:iogurte-natural', grams: 170 },
      { name: 'Morangos', qty: '5 unidades', category: 'Frutas', foodId: 'taco:morango', grams: 60 },
      { name: 'Aveia em flocos', qty: '1 colher de sopa', category: 'Cereais e grãos', foodId: 'taco:aveia-flocos', grams: 15 },
      { name: 'Mel', qty: '1 colher de chá (opcional)', category: 'Mercearia', foodId: 'taco:mel', grams: 7 },
    ],
    steps: ['Coloque o iogurte em uma tigela.', 'Adicione os morangos picados e a aveia.', 'Finalize com mel, se desejar.'],
  },
  {
    id: 'feijao-tropeiro-leve', title: 'Arroz, feijão preto e couve', emoji: '🥬', gradient: ['#dcedc8', '#386641'],
    mealType: 'jantar', timeMin: 25, servings: 2, tags: ['vegana', 'vegetariana', 'sem_lactose', 'sem_gluten', 'economica'],
    ingredients: [
      { name: 'Arroz integral cozido', qty: '8 colheres de sopa', category: 'Cereais e grãos', foodId: 'taco:arroz-integral-cozido', grams: 200 },
      { name: 'Feijão preto cozido', qty: '2 conchas', category: 'Cereais e grãos', foodId: 'taco:feijao-preto-cozido', grams: 172 },
      { name: 'Couve refogada', qty: '2 colheres de servir', category: 'Hortifrúti', foodId: 'taco:couve-refogada', grams: 80 },
      { name: 'Laranja (sobremesa)', qty: '2 unidades', category: 'Frutas', foodId: 'taco:laranja-pera', grams: 280 },
    ],
    steps: ['Aqueça o arroz e o feijão.', 'Refogue a couve fatiada fininha com alho por 2 minutos.', 'Sirva com laranja de sobremesa (a vitamina C favorece a absorção do ferro do feijão).'],
  },
  {
    id: 'vitamina-mamao', title: 'Vitamina de mamão com aveia', emoji: '🥤', gradient: ['#ffe8cc', '#f77f00'],
    mealType: 'lanche', timeMin: 5, servings: 1, tags: ['vegetariana', 'economica'],
    ingredients: [
      { name: 'Mamão papaia', qty: '1/2 unidade', category: 'Frutas', foodId: 'taco:mamao-papaia', grams: 140 },
      { name: 'Leite integral', qty: '1 copo (200 ml)', category: 'Laticínios', foodId: 'taco:leite-integral', grams: 206 },
      { name: 'Aveia em flocos', qty: '1 colher de sopa', category: 'Cereais e grãos', foodId: 'taco:aveia-flocos', grams: 15 },
    ],
    steps: ['Bata tudo no liquidificador.', 'Sirva em seguida, sem coar.'],
  },
  {
    id: 'mandioca-sardinha', title: 'Mandioca com sardinha e salada', emoji: '🐟', gradient: ['#d7e3fc', '#3a86ff'],
    mealType: 'almoco', timeMin: 30, servings: 2, tags: ['sem_lactose', 'sem_gluten', 'rica_proteina', 'economica'],
    ingredients: [
      { name: 'Mandioca cozida', qty: '2 pedaços', category: 'Hortifrúti', foodId: 'taco:mandioca-cozida', grams: 200 },
      { name: 'Sardinha em conserva (drenada)', qty: '1 lata', category: 'Proteínas', foodId: 'taco:sardinha-conserva-oleo', grams: 84 },
      { name: 'Tomate', qty: '2 unidades', category: 'Hortifrúti', foodId: 'taco:tomate-cru', grams: 200 },
      { name: 'Alface', qty: '1 pé pequeno', category: 'Hortifrúti', foodId: 'taco:alface-crespa', grams: 100 },
    ],
    steps: ['Cozinhe a mandioca na panela de pressão por 15 minutos.', 'Escorra a sardinha e desfie.', 'Sirva com a salada temperada com limão.'],
  },
  {
    id: 'pao-ovo-abacate', title: 'Torrada integral com ovo e abacate', emoji: '🥑', gradient: ['#e9f5db', '#90a955'],
    mealType: 'cafe', timeMin: 10, servings: 1, tags: ['vegetariana', 'sem_lactose', 'rica_proteina'],
    ingredients: [
      { name: 'Pão de forma integral', qty: '2 fatias', category: 'Padaria', foodId: 'taco:pao-forma-integral', grams: 50 },
      { name: 'Abacate amassado', qty: '2 colheres de sopa', category: 'Frutas', foodId: 'taco:abacate', grams: 60 },
      { name: 'Ovo', qty: '1 unidade', category: 'Proteínas', foodId: 'taco:ovo-cozido', grams: 50 },
    ],
    steps: ['Toste o pão.', 'Espalhe o abacate amassado com sal e limão.', 'Cubra com o ovo cozido ou mexido.'],
  },
];

export function getRecipe(id: string) {
  return RECIPES.find((r) => r.id === id);
}

export function recipeItems(r: Recipe, servingsFactor = 1): MealItem[] {
  return r.ingredients.flatMap((ing, i) => {
    const food = ing.foodId ? getBaseFood(ing.foodId) : undefined;
    if (!food || !ing.grams) return [];
    return [{
      id: `${r.id}:${i}`,
      foodId: food.id,
      name: food.name,
      grams: Math.round((ing.grams / r.servings) * servingsFactor),
      per100g: food.per100g,
      source: food.source,
      sourceLabel: food.sourceLabel,
    }];
  });
}

export function recipePerServing(r: Recipe): { totals: Nutrients; uncounted: string[] } {
  const totals = sumItems(recipeItems(r)).values;
  const uncounted = r.ingredients.filter((i) => !i.foodId || !i.grams).map((i) => i.name);
  return { totals, uncounted };
}

