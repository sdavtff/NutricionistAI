// Núcleo da integração com a OpenRouter (https://openrouter.ai), compartilhado entre:
// - o servidor intermediário (server/), com a chave em variável de ambiente; e
// - o app (modo "chave própria"), com a chave que o usuário salvou no próprio dispositivo.
// Não lê variáveis de ambiente nem armazenamento: toda configuração chega por parâmetro.
import { z } from 'zod';

export const DEFAULT_MODEL = 'anthropic/claude-opus-5.5';
export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  /** Modelo só para fotos; se vazio, usa `model`. */
  visionModel?: string;
  baseUrl?: string;
  /** Cabeçalhos opcionais de identificação do app no painel da OpenRouter. */
  siteUrl?: string;
}

const modelOf = (c: OpenRouterConfig) => c.model?.trim() || DEFAULT_MODEL;
export const visionModelOf = (c: OpenRouterConfig) => c.visionModel?.trim() || modelOf(c);
export { modelOf };

export class AIServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const SAFETY_RULES = `Regras obrigatórias:
- Você é um assistente EDUCATIVO de nutrição do app "Nutricionist AI". Escreva em português do Brasil, em linguagem simples.
- Não faça diagnósticos, não prescreva tratamentos, medicamentos ou suplementos, e não dê recomendações clínicas individualizadas.
- Nunca recomende dietas extremas, jejum prolongado/perigoso, desidratação, purgação, emagrecimento acelerado ou ingestão calórica abaixo do gasto basal.
- Identifique estimativas como estimativas. Não invente números, marcas ou precisão laboratorial.
- Para menores de idade, gestação, amamentação, histórico de transtorno alimentar ou condições clínicas, evite metas restritivas e oriente a procurar um(a) nutricionista ou médico(a).
- Se a pessoa relatar sinais de transtorno alimentar ou risco à saúde, acolha com empatia e recomende ajuda profissional (no Brasil, o CVV atende 24h pelo telefone 188).
- Respeite as preferências, alergias e restrições informadas.`;

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };

interface CompletionResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[];
  error?: { code?: number | string; message?: string };
}

/** Chamada à API de chat completions da OpenRouter, com tradução dos erros para mensagens ao usuário. */
async function complete(cfg: OpenRouterConfig, opts: { model: string; messages: ChatMsg[]; maxTokens: number; schema?: { name: string; schema: Record<string, unknown> } }): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
  };
  if (opts.schema) {
    body.response_format = { type: 'json_schema', json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema } };
  }
  let res: Response;
  try {
    res = await fetch(`${(cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        // Identificação opcional do app nos painéis da OpenRouter.
        'HTTP-Referer': cfg.siteUrl || 'https://github.com/sdavtff/NutricionistAI',
        'X-Title': 'Nutricionist AI',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(170_000),
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new AIServiceError(504, 'A IA demorou demais para responder. Tente novamente.');
    throw new AIServiceError(502, 'Não foi possível conectar à OpenRouter.');
  }
  const data = (await res.json().catch(() => ({}))) as CompletionResponse;
  const code = Number(data.error?.code ?? res.status);
  if (!res.ok || data.error) {
    console.error('[openrouter] erro', res.status, data.error?.message);
    if (code === 401) throw new AIServiceError(503, 'Chave da OpenRouter inválida ou revogada.');
    if (code === 402) throw new AIServiceError(503, 'Créditos insuficientes na conta da OpenRouter.');
    if (code === 403) throw new AIServiceError(422, 'O conteúdo foi bloqueado pela moderação do provedor de IA.');
    if (code === 404) throw new AIServiceError(503, `O modelo "${opts.model}" não está disponível na OpenRouter (ou não aceita os recursos pedidos).`);
    if (code === 429) throw new AIServiceError(429, 'Limite de uso da IA atingido. Tente novamente em instantes.');
    if (code === 408) throw new AIServiceError(504, 'A IA demorou demais para responder. Tente novamente.');
    throw new AIServiceError(502, 'O serviço de IA retornou um erro. Tente novamente.');
  }
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new AIServiceError(422, 'A IA recusou este pedido. Tente reformular ou use outra imagem.');
  if (choice?.finish_reason === 'length') throw new AIServiceError(502, 'A resposta da IA ficou incompleta. Tente novamente.');
  const text = (choice?.message?.content ?? '').trim();
  if (!text) throw new AIServiceError(502, 'A IA não retornou resposta. Tente novamente.');
  return text;
}

/** Extrai JSON mesmo se o modelo envolver a resposta em ```json ... ```. */
export function parseJSONLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(raw.slice(first, last + 1));
    throw new Error('json');
  }
}

async function callJSON<T>(cfg: OpenRouterConfig, opts: {
  system: string;
  content: ContentPart[];
  schemaName: string;
  schema: Record<string, unknown>;
  validator: z.ZodType<T>;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  const text = await complete(cfg, {
    model: opts.model ?? modelOf(cfg),
    maxTokens: opts.maxTokens ?? 8000,
    schema: { name: opts.schemaName, schema: opts.schema },
    messages: [
      { role: 'system', content: `${opts.system}\n\nResponda SOMENTE com um objeto JSON válido que siga o esquema solicitado, sem texto adicional.` },
      { role: 'user', content: opts.content },
    ],
  });
  let parsed: unknown;
  try {
    parsed = parseJSONLoose(text);
  } catch {
    throw new AIServiceError(502, 'A IA retornou um formato inválido. Tente novamente.');
  }
  const result = opts.validator.safeParse(parsed);
  if (!result.success) throw new AIServiceError(502, 'A resposta da IA não passou na validação. Tente novamente.');
  return result.data;
}

// ---------------- Análise de foto ----------------

const nutrientProps = ['kcal', 'protein', 'carbs', 'sugars', 'fat', 'saturatedFat', 'fiber', 'sodium'] as const;
const nullableNumber = { type: ['number', 'null'] };

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['isFood', 'dishName', 'overallConfidence', 'items', 'uncertainties', 'totalKcalEstimate'],
  properties: {
    isFood: { type: 'boolean' },
    dishName: { type: 'string' },
    overallConfidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    totalKcalEstimate: nullableNumber,
    uncertainties: { type: 'array', items: { type: 'string' } },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'matchedFoodId', 'candidates', 'estimatedGrams', 'portionDescription', 'visibleIngredients', 'probableIngredients', 'preparation', 'brand', 'brandEvidence', 'confidence', 'estimatedPer100g'],
        properties: {
          name: { type: 'string' },
          matchedFoodId: { type: ['string', 'null'] },
          candidates: { type: 'array', items: { type: 'string' } },
          estimatedGrams: nullableNumber,
          portionDescription: { type: 'string' },
          visibleIngredients: { type: 'array', items: { type: 'string' } },
          probableIngredients: { type: 'array', items: { type: 'string' } },
          preparation: { type: ['string', 'null'] },
          brand: { type: ['string', 'null'] },
          brandEvidence: { type: ['string', 'null'] },
          confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          estimatedPer100g: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: [...nutrientProps],
                properties: Object.fromEntries(nutrientProps.map((k) => [k, nullableNumber])),
              },
            ],
          },
        },
      },
    },
  },
};

const conf = z.enum(['alta', 'media', 'baixa']);
const nn = z.number().nonnegative().nullable();
const analysisValidator = z.object({
  isFood: z.boolean(),
  dishName: z.string().max(200),
  overallConfidence: conf,
  totalKcalEstimate: nn,
  uncertainties: z.array(z.string().max(400)).max(12),
  items: z.array(z.object({
    name: z.string().max(120),
    matchedFoodId: z.string().nullable(),
    candidates: z.array(z.string().max(120)).max(6),
    estimatedGrams: z.number().positive().max(3000).nullable(),
    portionDescription: z.string().max(200),
    visibleIngredients: z.array(z.string().max(80)).max(20),
    probableIngredients: z.array(z.string().max(80)).max(20),
    preparation: z.string().max(120).nullable(),
    brand: z.string().max(80).nullable(),
    brandEvidence: z.string().max(200).nullable(),
    confidence: conf,
    estimatedPer100g: z.object(Object.fromEntries(nutrientProps.map((k) => [k, nn])) as Record<(typeof nutrientProps)[number], typeof nn>).nullable(),
  })).max(15),
});
export type AnalysisResult = z.infer<typeof analysisValidator>;

export const analyzeRequest = z.object({
  imageBase64: z.string().min(100).max(8_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  hints: z.object({
    portionText: z.string().max(200).optional(),
    brand: z.string().max(80).optional(),
    note: z.string().max(300).optional(),
  }).optional(),
  catalog: z.array(z.object({ id: z.string().max(80), name: z.string().max(120) })).max(500),
});

export async function analyzeImage(cfg: OpenRouterConfig, input: z.infer<typeof analyzeRequest>): Promise<AnalysisResult> {
  const system = `${SAFETY_RULES}

Tarefa: analisar a FOTO de uma refeição/alimento e identificar os itens para cálculo nutricional.
- Liste cada alimento separadamente (ex.: arroz, feijão, frango), com nome em português.
- Para cada item, se houver correspondência razoável no CATÁLOGO fornecido, informe "matchedFoodId" com o id exato; senão use null.
- Em "candidates", liste até 4 alternativas plausíveis quando houver dúvida na identificação.
- Estime o peso em gramas da porção visível (estimatedGrams) a partir de referências visuais (prato, talheres, mão). Se impossível, use null.
- Separe ingredientes VISÍVEIS de ingredientes PROVÁVEIS (ex.: óleo de preparo, sal, molhos ocultos).
- Informe a marca SOMENTE se houver evidência visível na imagem (texto da embalagem/logotipo legível); descreva a evidência em "brandEvidence". Caso contrário, brand = null. Nunca invente marcas.
- "estimatedPer100g": preencha apenas para itens SEM correspondência no catálogo, com valores típicos aproximados por 100 g; use null nos nutrientes que não souber. Para itens com matchedFoodId, use null (o app usará a base de dados).
- "uncertainties": explique as limitações (peso estimado por foto, óleo e ingredientes ocultos, iluminação, ângulo etc.).
- Se a imagem não contiver comida, isFood=false e items=[].
- totalKcalEstimate: estimativa total aproximada do prato, ou null.`;

  const hintText = [
    input.hints?.portionText ? `Porção informada pelo usuário: ${input.hints.portionText}` : null,
    input.hints?.brand ? `Marca/produto informado pelo usuário: ${input.hints.brand}` : null,
    input.hints?.note ? `Observação do usuário: ${input.hints.note}` : null,
  ].filter(Boolean).join('\n');

  return callJSON(cfg, {
    system,
    validator: analysisValidator,
    schemaName: 'analise_refeicao',
    schema: analysisSchema,
    model: visionModelOf(cfg),
    content: [
      { type: 'image_url', image_url: { url: `data:${input.mediaType};base64,${input.imageBase64}` } },
      {
        type: 'text',
        text: `CATÁLOGO (id → nome):\n${input.catalog.map((c) => `${c.id} → ${c.name}`).join('\n')}\n\n${hintText || 'Sem informações adicionais do usuário.'}\n\nAnalise a foto e responda no formato JSON solicitado.`,
      },
    ],
  });
}

// ---------------- Plano personalizado ----------------

const planValidator = z.object({
  summary: z.string().max(1500),
  meals: z.array(z.object({
    mealType: z.enum(['cafe', 'almoco', 'lanche', 'jantar']),
    title: z.string().max(120),
    description: z.string().max(500),
  })).min(4).max(12),
  substitutions: z.array(z.object({ from: z.string().max(120), to: z.string().max(200), why: z.string().max(300) })).max(10),
  shoppingList: z.array(z.object({ category: z.string().max(60), items: z.array(z.string().max(80)).max(30) })).max(12),
  recipes: z.array(z.object({
    title: z.string().max(120),
    servings: z.number().int().min(1).max(12),
    timeMin: z.number().int().min(1).max(240),
    ingredients: z.array(z.string().max(160)).max(25),
    steps: z.array(z.string().max(400)).max(15),
  })).max(5),
  recommendations: z.array(z.string().max(400)).max(10),
  hydration: z.array(z.string().max(300)).max(5),
  sleep: z.array(z.string().max(300)).max(5),
  activity: z.array(z.string().max(300)).max(5),
  weeklyGoals: z.array(z.string().max(300)).max(8),
  habits: z.array(z.string().max(80)).max(8),
});
export type AIPlan = z.infer<typeof planValidator>;

const strArr = { type: 'array', items: { type: 'string' } };
const planSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'meals', 'substitutions', 'shoppingList', 'recipes', 'recommendations', 'hydration', 'sleep', 'activity', 'weeklyGoals', 'habits'],
  properties: {
    summary: { type: 'string' },
    meals: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['mealType', 'title', 'description'],
        properties: { mealType: { type: 'string', enum: ['cafe', 'almoco', 'lanche', 'jantar'] }, title: { type: 'string' }, description: { type: 'string' } },
      },
    },
    substitutions: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'why'], properties: { from: { type: 'string' }, to: { type: 'string' }, why: { type: 'string' } } },
    },
    shoppingList: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['category', 'items'], properties: { category: { type: 'string' }, items: strArr } },
    },
    recipes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'servings', 'timeMin', 'ingredients', 'steps'],
        properties: { title: { type: 'string' }, servings: { type: 'integer' }, timeMin: { type: 'integer' }, ingredients: strArr, steps: strArr },
      },
    },
    recommendations: strArr, hydration: strArr, sleep: strArr, activity: strArr, weeklyGoals: strArr, habits: strArr,
  },
};

export const planRequest = z.object({
  profile: z.record(z.string(), z.unknown()),
  computed: z.object({
    bmr: z.number().nullable(), tdee: z.number().nullable(), rangeMin: z.number().nullable(), rangeMax: z.number().nullable(),
    restrictive: z.boolean(),
  }),
  customization: z.string().max(600).optional(),
});

export async function generatePlan(cfg: OpenRouterConfig, input: z.infer<typeof planRequest>): Promise<AIPlan> {
  const system = `${SAFETY_RULES}

Tarefa: criar um PLANO ALIMENTAR EDUCATIVO personalizado para o perfil abaixo, com comida brasileira do dia a dia,
acessível ao orçamento informado (em reais, R$) e ao tempo disponível para cozinhar.
- As estimativas de energia já foram calculadas pelo app (Mifflin-St Jeor); não as altere e não prometa resultados.
- Sugira 2 opções para cada refeição (café da manhã, almoço, lanche e jantar).
- Inclua substituições, lista de compras semanal por categorias, até 3 receitas simples (ingredientes com quantidades, porções e preparo),
  recomendações para melhorar a alimentação, hidratação, sono, atividade física, metas semanais realistas e hábitos curtos (até 6 palavras).
- Explique o porquê das recomendações em linguagem simples.
${input.computed.restrictive ? '- ATENÇÃO: o perfil exige cautela (menor de idade, gestação/amamentação ou histórico de transtorno alimentar). NÃO proponha déficit calórico nem metas de perda de peso; foque em qualidade alimentar e reforce o acompanhamento profissional.' : ''}`;
  return callJSON(cfg, {
    system,
    validator: planValidator,
    schemaName: 'plano_alimentar',
    schema: planSchema,
    maxTokens: 12000,
    content: [{
      type: 'text',
      text: `PERFIL (respostas do questionário, autorizadas pelo usuário):\n${JSON.stringify(input.profile, null, 2)}\n\nESTIMATIVAS DO APP:\n${JSON.stringify(input.computed)}\n\n${input.customization ? `PEDIDO DE PERSONALIZAÇÃO DO USUÁRIO: ${input.customization}` : ''}`,
    }],
  });
}

// ---------------- Chat ----------------

export const chatRequest = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) })).min(1).max(40),
  profile: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function chat(cfg: OpenRouterConfig, input: z.infer<typeof chatRequest>): Promise<string> {
  const system = `${SAFETY_RULES}

Você conversa com o usuário no chat "Nutricionista de IA". Responda de forma acolhedora, objetiva e prática
(use listas curtas quando ajudar). Você pode sugerir receitas com os ingredientes disponíveis, substituições,
como montar refeições equilibradas, informações gerais sobre nutrientes de alimentos (deixando claro que valores são aproximados)
e organização das refeições da semana. Sempre que a pergunta exigir avaliação clínica, recomende um(a) nutricionista.
${input.profile ? `\nPerfil autorizado pelo usuário (use para personalizar, sem repetir dados sensíveis desnecessariamente):\n${JSON.stringify(input.profile)}` : '\nO usuário não autorizou o compartilhamento do perfil; dê respostas gerais.'}`;

  // A conversa precisa começar com uma mensagem do usuário.
  const msgs = input.messages.slice(input.messages.findIndex((m) => m.role === 'user'));
  return complete(cfg, {
    model: modelOf(cfg),
    maxTokens: 4000,
    messages: [{ role: 'system', content: system }, ...msgs],
  });
}

// ---------------- Chave e modelos ----------------

export interface KeyInfo {
  label: string | null;
  usage: number | null;
  limit: number | null;
  limitRemaining: number | null;
  isFreeTier: boolean;
}

/** Valida a chave consultando /key (não gasta créditos). */
export async function checkKey(cfg: OpenRouterConfig): Promise<KeyInfo> {
  let res: Response;
  try {
    res = await fetch(`${(cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/key`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AIServiceError(502, 'Não foi possível conectar à OpenRouter. Verifique a internet.');
  }
  const data = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { message?: string } };
  if (res.status === 401 || res.status === 403) throw new AIServiceError(401, 'Chave da OpenRouter inválida ou revogada.');
  if (!res.ok || !data.data) throw new AIServiceError(502, 'A OpenRouter não confirmou a chave. Tente novamente.');
  const d = data.data;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    label: typeof d.label === 'string' ? d.label : null,
    usage: num(d.usage),
    limit: num(d.limit),
    limitRemaining: num(d.limit_remaining),
    isFreeTier: Boolean(d.is_free_tier),
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  vision: boolean;
  structured: boolean;
  promptPrice: number | null; // US$ por 1M tokens
  completionPrice: number | null;
}

/** Lista pública de modelos (não exige chave). */
export async function listModels(baseUrl = DEFAULT_BASE_URL): Promise<ModelInfo[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new AIServiceError(502, 'Não foi possível carregar a lista de modelos.');
  const data = (await res.json()) as { data?: { id: string; name?: string; architecture?: { input_modalities?: string[] }; supported_parameters?: string[]; pricing?: { prompt?: string; completion?: string } }[] };
  const per1M = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) * 1_000_000 : null);
  return (data.data ?? []).filter((m) => !m.id.endsWith(':batch')).map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    vision: Boolean(m.architecture?.input_modalities?.includes('image')),
    structured: Boolean(m.supported_parameters?.includes('structured_outputs') || m.supported_parameters?.includes('response_format')),
    promptPrice: per1M(m.pricing?.prompt),
    completionPrice: per1M(m.pricing?.completion),
  }));
}
