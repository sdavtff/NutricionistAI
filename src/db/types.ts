// Tipos das entidades persistidas no IndexedDB.
// Todas as datas "do dia" usam o formato ISO local AAAA-MM-DD; timestamps usam epoch ms.

export type ID = string;

export interface User {
  id: ID;
  name: string;
  email: string; // sempre minúsculo
  passwordHash: string; // PBKDF2-SHA256, base64
  passwordSalt: string; // base64
  passwordIterations: number;
  /** Código de recuperação local (exibido uma única vez no cadastro), armazenado só como hash. */
  recoveryHash: string;
  recoverySalt: string;
  createdAt: number;
  lastLoginAt?: number;
  failedAttempts: number;
  lockedUntil?: number;
}

export interface Consent {
  userId: ID;
  personalData: boolean; // tratamento de dados pessoais e de saúde no dispositivo
  aiProcessing: boolean; // envio de dados/fotos ao serviço de IA
  aiShareProfile: boolean; // incluir perfil no contexto do chat
  acceptedAt: number;
  version: number;
}

export type Goal = 'emagrecer' | 'manter' | 'ganhar_massa' | 'melhorar_alimentacao';
export type ActivityLevel = 'sedentario' | 'leve' | 'moderado' | 'intenso' | 'muito_intenso';
export type DietPreference = 'nenhuma' | 'vegetariana' | 'vegana' | 'pescetariana' | 'sem_lactose' | 'sem_gluten';
export type Sex = 'feminino' | 'masculino' | 'nao_informar';

export interface QuestionnaireAnswers {
  age?: number;
  sex?: Sex;
  heightCm?: number;
  weightKg?: number;
  targetWeightKg?: number | null;
  goal?: Goal;
  activityLevel?: ActivityLevel;
  exerciseDaysPerWeek?: number;
  routine?: string;
  mealsPerDay?: number;
  dislikedFoods?: string;
  allergies?: string;
  dietPreference?: DietPreference;
  budget?: 'baixo' | 'medio' | 'alto';
  budgetMonthlyBRL?: number | null;
  cookingTime?: 'menos_15' | '15_30' | '30_60' | 'mais_60';
  sleepQuality?: 'ruim' | 'regular' | 'boa' | 'otima';
  pregnantOrBreastfeeding?: boolean;
  eatingDisorderHistory?: boolean;
  healthConditions?: string;
}

export interface Questionnaire {
  userId: ID;
  answers: QuestionnaireAnswers;
  step: number;
  completed: boolean;
  updatedAt: number;
}

export interface Settings {
  userId: ID;
  theme: 'claro' | 'escuro' | 'sistema';
  hideCalories: boolean;
  hideWeight: boolean;
  weightTrackingEnabled: boolean;
  waterGoalMl: number;
  imageQuality: 'economica' | 'padrao';
  /** Chave própria da OpenRouter (modo direto). Fica só neste dispositivo e nunca é exportada. */
  openrouterKey?: string;
  openrouterModel?: string;
  openrouterVisionModel?: string;
  updatedAt: number;
}

export type NutrientSource = 'rotulo' | 'base' | 'estimativa_ia' | 'manual';

/** Nutrientes por 100 g. `null` = desconhecido/indisponível (nunca inventado). */
export interface Nutrients {
  kcal: number | null;
  protein: number | null; // g
  carbs: number | null; // g
  sugars: number | null; // g
  addedSugars: number | null; // g
  fat: number | null; // g
  saturatedFat: number | null; // g
  transFat: number | null; // g
  monoFat: number | null; // g
  polyFat: number | null; // g
  fiber: number | null; // g
  sodium: number | null; // mg
  cholesterol: number | null; // mg
  potassium: number | null; // mg
  calcium: number | null; // mg
  iron: number | null; // mg
}

export interface Food {
  id: ID;
  name: string;
  category: string;
  per100g: Nutrients;
  source: NutrientSource;
  sourceLabel: string; // ex.: "TACO 4ª ed. (NEPA/UNICAMP)", "Rótulo — Open Food Facts"
  unitName?: string; // ex.: "unidade", "fatia"
  unitGrams?: number;
  brand?: string;
  barcode?: string;
  userId?: ID; // alimentos personalizados
  keywords?: string[];
}

export type MealType = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'outras';

export interface MealItem {
  id: ID;
  foodId?: ID;
  name: string;
  grams: number;
  per100g: Nutrients;
  source: NutrientSource;
  sourceLabel: string;
  brand?: string;
}

export interface MealEntry {
  id: ID;
  userId: ID;
  date: string; // AAAA-MM-DD
  time: string; // HH:MM
  mealType: MealType;
  name: string;
  items: MealItem[];
  imageId?: ID;
  analysisId?: ID;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredImage {
  id: ID;
  userId: ID;
  blob: Blob;
  bytes: number;
  width: number;
  height: number;
  createdAt: number;
}

export interface AIIdentifiedItem {
  name: string;
  matchedFoodId?: string | null;
  candidates?: string[];
  estimatedGrams: number | null;
  portionDescription?: string;
  visibleIngredients: string[];
  probableIngredients: string[];
  preparation?: string | null;
  brand?: string | null;
  brandEvidence?: string | null;
  confidence: 'alta' | 'media' | 'baixa';
  estimatedPer100g?: Partial<Nutrients> | null;
}

export interface PhotoAnalysis {
  id: ID;
  userId: ID;
  imageId: ID;
  createdAt: number;
  dishName: string;
  overallConfidence: 'alta' | 'media' | 'baixa';
  items: AIIdentifiedItem[];
  uncertainties: string[];
  totalKcalEstimate: number | null;
  model: string;
  confirmedItems?: MealItem[];
  savedMealId?: ID;
}

export interface WeightLog {
  id: ID;
  userId: ID;
  date: string;
  weightKg: number;
  createdAt: number;
}

export interface MeasurementLog {
  id: ID;
  userId: ID;
  date: string;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  createdAt: number;
}

export interface PlanMeal {
  key: string;
  mealType: MealType;
  title: string;
  description: string;
  approxKcal?: number | null;
}

export interface PlanRecipe {
  title: string;
  servings: number;
  timeMin: number;
  ingredients: string[];
  steps: string[];
}

export interface NutritionPlan {
  id: ID;
  userId: ID;
  createdAt: number;
  generator: 'regras_locais' | 'ia';
  model?: string;
  summary: string;
  energy: {
    bmr: number | null;
    tdee: number | null;
    rangeMin: number | null;
    rangeMax: number | null;
    explanation: string;
  } | null;
  safetyNotes: string[];
  meals: PlanMeal[];
  substitutions: { from: string; to: string; why: string }[];
  shoppingList: { category: string; items: string[] }[];
  recipes: PlanRecipe[];
  recommendations: string[];
  lifestyle: { hydration: string[]; sleep: string[]; activity: string[] };
  weeklyGoals: string[];
  habits: string[];
  customization?: string;
}

export interface PlanCheck {
  id: string; // `${planId}|${date}|${key}`
  userId: ID;
  planId: ID;
  date: string;
  key: string;
  done: boolean;
}

export interface Habit {
  id: ID;
  userId: ID;
  title: string;
  icon: string;
  targetPerWeek: number;
  active: boolean;
  createdAt: number;
}

export interface HabitLog {
  id: string; // `${habitId}|${date}`
  userId: ID;
  habitId: ID;
  date: string;
  done: boolean;
}

export interface WaterLog {
  id: string; // `${userId}|${date}`
  userId: ID;
  date: string;
  ml: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  error?: boolean;
}

export interface ChatConversation {
  id: ID;
  userId: ID;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface FavoriteRecipe {
  id: string; // `${userId}|${recipeId}`
  userId: ID;
  recipeId: string;
  createdAt: number;
}

export interface ShoppingItem {
  id: ID;
  name: string;
  quantity: string;
  category: string;
  checked: boolean;
  priceBRL?: number | null;
}

export interface ShoppingList {
  id: ID;
  userId: ID;
  title: string;
  weekStart: string; // AAAA-MM-DD (segunda-feira)
  items: ShoppingItem[];
  createdAt: number;
  updatedAt: number;
}

export type ReminderKind = 'refeicao' | 'agua' | 'planejamento' | 'habitos' | 'pausa';

export interface Reminder {
  id: ID;
  userId: ID;
  kind: ReminderKind;
  label: string;
  enabled: boolean;
  /** Horários fixos HH:MM, ou intervalo em minutos (água/pausa) dentro de uma janela. */
  times: string[];
  intervalMin?: number | null;
  windowStart?: string;
  windowEnd?: string;
  days: number[]; // 0=domingo ... 6=sábado
  lastFiredAt?: number;
}
