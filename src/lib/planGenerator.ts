// Gerador de plano educativo por REGRAS LOCAIS (funciona offline, sem IA).
// O plano gerado por IA (opcional) usa o mesmo formato `NutritionPlan` e é validado no servidor.
import type { MealType, NutritionPlan, PlanMeal, QuestionnaireAnswers } from '../db/types';
import { uid } from '../db/index';
import { normalizeText } from './foods';
import { assessSafety, calorieRange, estimateBMR, estimateTDEE, proteinRange, waterGoalMl } from './nutrition';

type Diet = 'onivora' | 'vegetariana' | 'vegana' | 'pescetariana';

interface Option {
  title: string;
  description: string;
  diets: Diet[]; // dietas compatíveis
  contains: string[]; // termos para checar alergias/aversões (sem acento)
  quick: boolean;
}

const ALL: Diet[] = ['onivora', 'vegetariana', 'vegana', 'pescetariana'];
const VEG: Diet[] = ['onivora', 'vegetariana', 'pescetariana'];

const OPTIONS: Record<Exclude<MealType, 'outras'>, Option[]> = {
  cafe: [
    { title: 'Pão integral com ovo e fruta', description: '2 fatias de pão integral, 1 a 2 ovos mexidos e 1 fruta (mamão, banana ou laranja).', diets: VEG, contains: ['pao', 'gluten', 'trigo', 'ovo'], quick: true },
    { title: 'Mingau de aveia com banana', description: 'Aveia cozida no leite (ou bebida vegetal) com banana e canela.', diets: VEG, contains: ['aveia', 'leite', 'lactose', 'banana', 'gluten'], quick: true },
    { title: 'Cuscuz com ovo', description: 'Uma porção de cuscuz de milho com ovo e tomate.', diets: VEG, contains: ['milho', 'ovo', 'tomate'], quick: true },
    { title: 'Tapioca com pasta de grão-de-bico', description: 'Tapioca recheada com pasta de grão-de-bico e tomate; 1 fruta.', diets: ALL, contains: ['tapioca', 'grao-de-bico', 'tomate'], quick: true },
    { title: 'Iogurte com frutas e aveia', description: 'Iogurte natural com frutas picadas e 1 colher de aveia.', diets: VEG, contains: ['iogurte', 'leite', 'lactose', 'aveia'], quick: true },
    { title: 'Vitamina de frutas com aveia', description: 'Bebida vegetal batida com mamão ou banana e aveia.', diets: ALL, contains: ['aveia', 'mamao', 'banana'], quick: true },
  ],
  almoco: [
    { title: 'Arroz, feijão, frango grelhado e salada', description: 'Metade do prato com salada e legumes, 1/4 com arroz e feijão, 1/4 com frango.', diets: ['onivora'], contains: ['arroz', 'feijao', 'frango'], quick: false },
    { title: 'Arroz, feijão, peixe e legumes', description: 'Filé de peixe assado, legumes cozidos, arroz e feijão.', diets: ['onivora', 'pescetariana'], contains: ['arroz', 'feijao', 'peixe'], quick: false },
    { title: 'Arroz integral, lentilha e legumes refogados', description: 'Lentilha com cenoura e abobrinha, arroz integral e salada verde.', diets: ALL, contains: ['arroz', 'lentilha', 'cenoura', 'abobrinha'], quick: false },
    { title: 'Batata-doce, carne magra e brócolis', description: 'Batata-doce cozida, patinho grelhado e brócolis no vapor.', diets: ['onivora'], contains: ['batata', 'carne', 'brocolis'], quick: false },
    { title: 'Omelete de legumes com arroz e salada', description: 'Omelete de 2 ovos com legumes, arroz e salada colorida.', diets: VEG, contains: ['ovo', 'arroz'], quick: true },
    { title: 'Grão-de-bico com legumes e arroz', description: 'Grão-de-bico refogado com tomate e legumes, arroz e folhas.', diets: ALL, contains: ['grao-de-bico', 'tomate', 'arroz'], quick: true },
  ],
  lanche: [
    { title: 'Fruta com punhado de castanhas', description: '1 fruta da estação e um punhado pequeno de castanhas ou amendoim.', diets: ALL, contains: ['castanha', 'amendoim', 'oleaginosas'], quick: true },
    { title: 'Iogurte natural com fruta', description: 'Iogurte natural com fruta picada.', diets: VEG, contains: ['iogurte', 'leite', 'lactose'], quick: true },
    { title: 'Sanduíche natural', description: 'Pão integral com queijo branco ou pasta de grão-de-bico, tomate e folhas.', diets: VEG, contains: ['pao', 'gluten', 'queijo', 'leite', 'lactose'], quick: true },
    { title: 'Vitamina de banana', description: 'Leite ou bebida vegetal batida com banana e aveia.', diets: ALL, contains: ['banana', 'aveia'], quick: true },
    { title: 'Ovo cozido e fruta', description: '1 a 2 ovos cozidos e uma fruta.', diets: VEG, contains: ['ovo'], quick: true },
  ],
  jantar: [
    { title: 'Salada completa com atum', description: 'Folhas, tomate, pepino, batata cozida e atum.', diets: ['onivora', 'pescetariana'], contains: ['atum', 'peixe', 'batata'], quick: true },
    { title: 'Sopa de legumes com frango desfiado', description: 'Sopa caseira com legumes variados e frango.', diets: ['onivora'], contains: ['frango'], quick: false },
    { title: 'Sopa de lentilha com legumes', description: 'Sopa de lentilha com cenoura e tomate.', diets: ALL, contains: ['lentilha', 'cenoura', 'tomate'], quick: false },
    { title: 'Cuscuz com ovos e salada', description: 'Cuscuz de milho, ovos mexidos e salada.', diets: VEG, contains: ['milho', 'ovo'], quick: true },
    { title: 'Arroz, feijão preto e couve', description: 'Prato simples com arroz, feijão, couve refogada e uma laranja.', diets: ALL, contains: ['arroz', 'feijao', 'couve', 'laranja'], quick: true },
    { title: 'Mandioca com sardinha e salada', description: 'Mandioca cozida, sardinha e salada de tomate.', diets: ['onivora', 'pescetariana'], contains: ['mandioca', 'sardinha', 'peixe'], quick: false },
  ],
};

const MEAL_TYPES: Exclude<MealType, 'outras'>[] = ['cafe', 'almoco', 'lanche', 'jantar'];

function dietOf(a: QuestionnaireAnswers): Diet {
  if (a.dietPreference === 'vegana') return 'vegana';
  if (a.dietPreference === 'vegetariana') return 'vegetariana';
  if (a.dietPreference === 'pescetariana') return 'pescetariana';
  return 'onivora';
}

/** Termos que devem ser evitados, combinando alergias, aversões e preferências. */
export function avoidTerms(a: QuestionnaireAnswers): string[] {
  const raw = `${a.allergies ?? ''},${a.dislikedFoods ?? ''}`;
  const terms = raw
    .split(/[,;\n]| e /)
    .map((t) => normalizeText(t))
    .filter((t) => t.length >= 3);
  if (a.dietPreference === 'sem_lactose') terms.push('lactose', 'leite', 'iogurte', 'queijo');
  if (a.dietPreference === 'sem_gluten') terms.push('gluten', 'trigo', 'pao', 'aveia');
  // Sinônimos comuns
  const expanded = new Set(terms);
  for (const t of terms) {
    if (t.includes('lactose') || t.includes('leite')) ['leite', 'lactose', 'iogurte', 'queijo'].forEach((x) => expanded.add(x));
    if (t.includes('gluten') || t.includes('trigo')) ['gluten', 'trigo', 'pao'].forEach((x) => expanded.add(x));
    if (t.includes('castanha') || t.includes('nozes') || t.includes('oleaginosa')) ['castanha', 'oleaginosas'].forEach((x) => expanded.add(x));
    if (t.includes('frutos do mar') || t.includes('peixe')) ['peixe', 'atum', 'sardinha'].forEach((x) => expanded.add(x));
  }
  return [...expanded];
}

function pick(a: QuestionnaireAnswers, type: Exclude<MealType, 'outras'>, seed: number): Option[] {
  const diet = dietOf(a);
  const avoid = avoidTerms(a);
  const quickOnly = a.cookingTime === 'menos_15';
  let list = OPTIONS[type].filter((o) => o.diets.includes(diet) && !o.contains.some((c) => avoid.some((t) => c.includes(t) || t.includes(c))));
  if (quickOnly && list.some((o) => o.quick)) list = list.filter((o) => o.quick);
  if (!list.length) return [];
  const rotated = [...list.slice(seed % list.length), ...list.slice(0, seed % list.length)];
  return rotated.slice(0, 2);
}

const KCAL_SHARE: Record<Exclude<MealType, 'outras'>, number> = { cafe: 0.25, almoco: 0.35, lanche: 0.12, jantar: 0.28 };

export function generateLocalPlan(userId: string, a: QuestionnaireAnswers, seed = Date.now(), customization?: string): NutritionPlan {
  const safety = assessSafety(a);
  const range = calorieRange(a);
  const prot = proteinRange(a);
  const water = waterGoalMl(a);
  const mid = range ? (range.min + range.max) / 2 : null;
  const hideTargets = safety.restrictive;

  const meals: PlanMeal[] = [];
  MEAL_TYPES.forEach((t, i) => {
    pick(a, t, Math.floor(seed / 1000) + i).forEach((o, j) => {
      meals.push({
        key: `${t}-${j}`,
        mealType: t,
        title: o.title,
        description: o.description,
        approxKcal: mid && !hideTargets ? Math.round((mid * KCAL_SHARE[t]) / 10) * 10 : null,
      });
    });
  });

  const goalText: Record<string, string> = {
    emagrecer: 'reduzir o peso de forma gradual e sustentável',
    manter: 'manter o peso com uma alimentação equilibrada',
    ganhar_massa: 'ganhar massa muscular com apoio da alimentação e do treino',
    melhorar_alimentacao: 'melhorar a qualidade da alimentação',
  };

  const diet = dietOf(a);
  const summaryParts = [
    a.age ? `${a.age} anos` : null,
    a.heightCm ? `${a.heightCm} cm` : null,
    a.weightKg ? `${a.weightKg} kg` : null,
    `objetivo: ${goalText[a.goal ?? 'melhorar_alimentacao']}`,
    diet !== 'onivora' ? `alimentação ${diet}` : null,
  ].filter(Boolean);

  const substitutions = [
    { from: 'Arroz branco', to: 'Arroz integral, quinoa ou batata-doce', why: 'Mais fibras, que ajudam na saciedade e no funcionamento do intestino.' },
    { from: 'Refrigerante ou suco adoçado', to: 'Água com limão, chá gelado sem açúcar ou água com gás', why: 'Reduz o consumo de açúcares adicionados.' },
    { from: 'Biscoito recheado no lanche', to: 'Fruta com castanhas ou iogurte natural', why: 'Mais nutrientes e menos açúcar e gordura saturada.' },
    { from: 'Frituras', to: 'Preparações assadas, grelhadas ou na airfryer', why: 'Menos óleo e calorias por porção.' },
    diet === 'onivora'
      ? { from: 'Carnes processadas (salsicha, presunto)', to: 'Ovos, frango ou carne magra', why: 'Menos sódio e aditivos.' }
      : { from: 'Proteína de origem animal', to: 'Feijões, lentilha, grão-de-bico e tofu', why: 'Boas fontes de proteína vegetal e ferro; combine com vitamina C.' },
    { from: 'Sal em excesso', to: 'Ervas, alho, cebola, limão e especiarias', why: 'Ajuda a reduzir o sódio sem perder sabor.' },
  ].filter((s) => !avoidTerms(a).some((t) => normalizeText(s.to).includes(t)));

  const shopping = buildShopping(meals.map((m) => `${m.title} ${m.description}`).join(' '), diet);

  const recommendations = [
    'Prefira alimentos in natura ou minimamente processados e evite ultraprocessados (Guia Alimentar para a População Brasileira).',
    'Monte o prato com metade de verduras e legumes, um quarto de cereais ou tubérculos e um quarto de proteínas.',
    'Coma devagar, com atenção, e em ambientes tranquilos sempre que possível.',
    'Planeje as compras e as refeições da semana para facilitar escolhas saudáveis.',
  ];
  if (a.mealsPerDay && a.mealsPerDay <= 2) recommendations.push('Você costuma fazer poucas refeições. Experimente incluir um lanche simples se sentir muita fome entre elas.');
  if (a.cookingTime === 'menos_15') recommendations.push('Com pouco tempo, cozinhe feijão, arroz e proteínas em maior quantidade e congele em porções.');
  if (a.budget === 'baixo') recommendations.push('Para economizar: feijão, ovos, frutas da estação, sardinha e feiras costumam ter ótimo custo-benefício.');

  const sleep = [
    'Procure manter horários regulares para dormir e acordar.',
    'Evite refeições muito pesadas e cafeína nas horas antes de dormir.',
  ];
  if (a.sleepQuality === 'ruim' || a.sleepQuality === 'regular') sleep.push('O sono ruim pode aumentar a fome no dia seguinte. Se persistir, converse com um profissional de saúde.');

  const activity = [
    'A OMS recomenda ao menos 150 minutos de atividade física moderada por semana para adultos.',
    a.exerciseDaysPerWeek && a.exerciseDaysPerWeek >= 3
      ? 'Você já se exercita com frequência; mantenha a consistência e inclua treino de força.'
      : 'Comece com caminhadas de 10 a 20 minutos e aumente aos poucos.',
    'Faça pausas a cada hora se ficar muito tempo sentado(a).',
  ];

  const weeklyGoals = [
    'Incluir verduras ou legumes no almoço e no jantar em pelo menos 5 dias.',
    `Beber cerca de ${(water / 1000).toLocaleString('pt-BR')} litros de água por dia (ajuste conforme sede, clima e atividade).`,
    'Registrar as refeições no diário em pelo menos 4 dias.',
    'Preparar ao menos 2 refeições em casa usando as receitas sugeridas.',
  ];

  const habits = ['Beber água ao acordar', 'Comer uma fruta por dia', 'Incluir salada no almoço', 'Caminhar 20 minutos', 'Dormir 7 a 9 horas'];

  return {
    id: uid(),
    userId,
    createdAt: Date.now(),
    generator: 'regras_locais',
    summary: `Perfil: ${summaryParts.join(' · ')}. Este é um plano educativo, gerado por regras nutricionais gerais a partir das suas respostas — não é uma prescrição.`,
    energy: (() => {
      const bmr = estimateBMR(a);
      const tdee = estimateTDEE(a);
      if (bmr === null || tdee === null) return null;
      return {
        bmr,
        tdee,
        rangeMin: hideTargets ? null : range?.min ?? null,
        rangeMax: hideTargets ? null : range?.max ?? null,
        explanation: hideTargets
          ? 'Gasto estimado pela equação de Mifflin-St Jeor multiplicada pelo nível de atividade. Pelo seu perfil, não mostramos metas calóricas: busque orientação profissional.'
          : `Gasto energético estimado pela equação de Mifflin-St Jeor × fator de atividade. É uma ESTIMATIVA: o gasto real varia de pessoa para pessoa. A faixa sugerida é orientativa${a.goal === 'emagrecer' ? ', com redução moderada (sem dietas extremas)' : ''}${prot ? `; proteína orientativa: ${prot.min}–${prot.max} g/dia` : ''}.${a.sex === 'nao_informar' || !a.sex ? ' Como o sexo não foi informado, usamos uma média das equações, o que reduz a precisão.' : ''}`,
      };
    })(),
    safetyNotes: [
      ...safety.reasons,
      'Este plano é educativo e não substitui a avaliação de um(a) nutricionista. Não prometemos resultados.',
    ],
    meals,
    substitutions,
    shoppingList: shopping,
    recipes: [],
    recommendations,
    lifestyle: {
      hydration: [
        `Meta orientativa: cerca de ${water} ml/dia (≈35 ml por kg). Ajuste à sua sede, ao clima e à atividade física.`,
        'Leve uma garrafa de água com você e beba ao longo do dia, sem exageros.',
      ],
      sleep,
      activity,
    },
    weeklyGoals,
    habits,
    customization,
  };
}

const SHOP_RULES: [RegExp, string, string][] = [
  [/arroz integral/, 'Cereais e grãos', 'Arroz integral'],
  [/arroz(?! integral)/, 'Cereais e grãos', 'Arroz'],
  [/feij/, 'Cereais e grãos', 'Feijão'],
  [/lentilha/, 'Cereais e grãos', 'Lentilha'],
  [/grao-de-bico|grão-de-bico/, 'Cereais e grãos', 'Grão-de-bico'],
  [/aveia/, 'Cereais e grãos', 'Aveia em flocos'],
  [/cuscuz/, 'Cereais e grãos', 'Flocão de milho (cuscuz)'],
  [/tapioca/, 'Cereais e grãos', 'Goma de tapioca'],
  [/pão|pao/, 'Padaria', 'Pão integral'],
  [/frango/, 'Proteínas', 'Peito de frango'],
  [/peixe/, 'Proteínas', 'Filé de peixe'],
  [/carne|patinho/, 'Proteínas', 'Carne magra (patinho)'],
  [/ovo/, 'Proteínas', 'Ovos'],
  [/atum/, 'Proteínas', 'Atum em lata'],
  [/sardinha/, 'Proteínas', 'Sardinha em lata'],
  [/iogurte/, 'Laticínios', 'Iogurte natural'],
  [/leite(?! vegetal)/, 'Laticínios', 'Leite'],
  [/queijo/, 'Laticínios', 'Queijo branco'],
  [/bebida vegetal/, 'Mercearia', 'Bebida vegetal'],
  [/castanha|amendoim/, 'Mercearia', 'Castanhas ou amendoim'],
  [/banana/, 'Frutas', 'Banana'],
  [/mamão|mamao/, 'Frutas', 'Mamão'],
  [/laranja/, 'Frutas', 'Laranja'],
  [/fruta/, 'Frutas', 'Frutas da estação'],
  [/salada|folhas/, 'Hortifrúti', 'Alface ou folhas verdes'],
  [/tomate/, 'Hortifrúti', 'Tomate'],
  [/cenoura/, 'Hortifrúti', 'Cenoura'],
  [/abobrinha/, 'Hortifrúti', 'Abobrinha'],
  [/brócolis|brocolis/, 'Hortifrúti', 'Brócolis'],
  [/couve/, 'Hortifrúti', 'Couve'],
  [/batata-doce/, 'Hortifrúti', 'Batata-doce'],
  [/batata cozida|batata,/, 'Hortifrúti', 'Batata'],
  [/mandioca/, 'Hortifrúti', 'Mandioca'],
  [/legumes/, 'Hortifrúti', 'Legumes variados'],
  [/pepino/, 'Hortifrúti', 'Pepino'],
];

function buildShopping(text: string, diet: Diet): { category: string; items: string[] }[] {
  const lower = text.toLowerCase();
  const byCat = new Map<string, Set<string>>();
  for (const [re, cat, item] of SHOP_RULES) {
    if (re.test(lower)) {
      if (!byCat.has(cat)) byCat.set(cat, new Set());
      byCat.get(cat)!.add(item);
    }
  }
  const temperos = new Set(['Alho e cebola', 'Limão', 'Azeite', 'Ervas frescas']);
  byCat.set('Óleos e temperos', temperos);
  if (diet === 'vegana') byCat.delete('Laticínios');
  return [...byCat.entries()].map(([category, items]) => ({ category, items: [...items] }));
}
