// Cliente do front-end para o servidor de IA. Nunca contém chaves: tudo passa pelo backend (/api).
import type { AIIdentifiedItem, NutritionPlan, PlanMeal } from '../db/types';
import { apiConfigured, apiUrl } from '../lib/platform';

export class AIError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

export interface AIStatus {
  online: boolean;
  serverReachable: boolean;
  configured: boolean;
  model: string | null;
  /** App nativo sem URL do servidor informada. */
  needsServerUrl?: boolean;
}

export async function getAIStatus(): Promise<AIStatus> {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!online) return { online, serverReachable: false, configured: false, model: null };
  if (!apiConfigured()) return { online, serverReachable: false, configured: false, model: null, needsServerUrl: true };
  try {
    const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
    if (!res.ok) return { online, serverReachable: false, configured: false, model: null };
    const data = (await res.json()) as { ai: boolean; model: string | null };
    return { online, serverReachable: true, configured: data.ai, model: data.model };
  } catch {
    return { online, serverReachable: false, configured: false, model: null };
  }
}

async function post<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new AIError('Você está offline. A IA precisa de conexão com a internet.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    if (!apiConfigured()) throw new AIError('Informe o endereço do servidor de IA em Perfil e configurações.');
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIError((data as { error?: string }).error ?? `Erro ${res.status} no servidor de IA.`, res.status);
    return data as T;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if ((e as Error).name === 'AbortError') throw new AIError('A IA demorou demais para responder. Tente novamente.');
    throw new AIError('Não foi possível falar com o servidor de IA. Verifique se ele está em execução e se o endereço está correto.');
  } finally {
    clearTimeout(t);
  }
}

export interface AnalysisResponse {
  result: {
    isFood: boolean;
    dishName: string;
    overallConfidence: 'alta' | 'media' | 'baixa';
    totalKcalEstimate: number | null;
    uncertainties: string[];
    items: AIIdentifiedItem[];
  };
  model: string;
}

export function analyzeFoodImage(body: {
  imageBase64: string;
  mediaType: 'image/jpeg';
  hints?: { portionText?: string; brand?: string; note?: string };
  catalog: { id: string; name: string }[];
}) {
  return post<AnalysisResponse>('/api/ai/analyze-image', body);
}

export interface AIPlanResponse {
  result: {
    summary: string;
    meals: Pick<PlanMeal, 'mealType' | 'title' | 'description'>[];
    substitutions: NutritionPlan['substitutions'];
    shoppingList: NutritionPlan['shoppingList'];
    recipes: NutritionPlan['recipes'];
    recommendations: string[];
    hydration: string[];
    sleep: string[];
    activity: string[];
    weeklyGoals: string[];
    habits: string[];
  };
  model: string;
}

export function generateAIPlan(body: {
  profile: Record<string, unknown>;
  computed: { bmr: number | null; tdee: number | null; rangeMin: number | null; rangeMax: number | null; restrictive: boolean };
  customization?: string;
}) {
  return post<AIPlanResponse>('/api/ai/plan', body, 180_000);
}

export function sendChat(body: { messages: { role: 'user' | 'assistant'; content: string }[]; profile: Record<string, unknown> | null }) {
  return post<{ reply: string; model: string }>('/api/ai/chat', body);
}
