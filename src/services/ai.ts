// Cliente do front-end para o servidor de IA. Nunca contém chaves: tudo passa pelo backend (/api).
import type { AIIdentifiedItem, NutritionPlan, PlanMeal } from '../db/types';
import { apiConfigured, apiUrl } from '../lib/platform';
import {
  AIServiceError, analyzeImage as orAnalyze, chat as orChat, generatePlan as orPlan, modelOf, visionModelOf, type OpenRouterConfig,
} from '../../shared/openrouter';

// Modo direto: quando o usuário salva a própria chave da OpenRouter, o app chama a OpenRouter
// diretamente (sem servidor). Sem chave, usa o servidor intermediário (/api).
let direct: OpenRouterConfig | null = null;
export function setDirectAIConfig(cfg: OpenRouterConfig | null) {
  direct = cfg?.apiKey ? cfg : null;
}
export function directAIEnabled() {
  return direct !== null;
}

async function viaDirect<T>(fn: (cfg: OpenRouterConfig) => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AIError('Você está offline. A IA precisa de conexão com a internet.');
  try {
    return await fn(direct!);
  } catch (e) {
    if (e instanceof AIServiceError) throw new AIError(e.message, e.status);
    if (e instanceof AIError) throw e;
    throw new AIError('Não foi possível falar com a OpenRouter. Verifique a internet.');
  }
}

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
  /** App nativo sem chave própria nem URL do servidor. */
  needsServerUrl?: boolean;
  /** Usando a chave própria da OpenRouter salva no dispositivo. */
  direct?: boolean;
}

export async function getAIStatus(): Promise<AIStatus> {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (!online) return { online, serverReachable: false, configured: false, model: null };
  if (direct) return { online, serverReachable: true, configured: true, model: modelOf(direct), direct: true };
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AIError('Você está offline. A IA precisa de conexão com a internet.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    if (!apiConfigured()) throw new AIError('Informe sua chave da OpenRouter (ou o endereço de um servidor) em Perfil e configurações.');
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
}): Promise<AnalysisResponse> {
  if (direct) return viaDirect(async (cfg) => ({ result: await orAnalyze(cfg, body), model: visionModelOf(cfg) }));
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
}): Promise<AIPlanResponse> {
  if (direct) return viaDirect(async (cfg) => ({ result: await orPlan(cfg, body), model: modelOf(cfg) }));
  return post<AIPlanResponse>('/api/ai/plan', body, 180_000);
}

export function sendChat(body: { messages: { role: 'user' | 'assistant'; content: string }[]; profile: Record<string, unknown> | null }): Promise<{ reply: string; model: string }> {
  if (direct) return viaDirect(async (cfg) => ({ reply: await orChat(cfg, body), model: modelOf(cfg) }));
  return post<{ reply: string; model: string }>('/api/ai/chat', body);
}
