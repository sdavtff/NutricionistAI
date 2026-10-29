// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server: Server;
let last: { headers: Record<string, unknown>; body: any } | null = null;
let reply: (body: any) => { status: number; json: unknown } = () => ({ status: 200, json: {} });
let ai: typeof import('../server/ai');

const ok = (content: string, finish = 'stop') => ({ status: 200, json: { choices: [{ message: { content }, finish_reason: finish }] } });

beforeAll(async () => {
  server = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      last = { headers: req.headers, body: JSON.parse(b) };
      const r = reply(last.body);
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.OPENROUTER_BASE_URL = `http://localhost:${(server.address() as AddressInfo).port}/api/v1`;
  process.env.OPENROUTER_API_KEY = 'sk-or-teste';
  process.env.OPENROUTER_MODEL = 'anthropic/claude-opus-5.5';
  ai = await import('../server/ai');
});
afterAll(() => server.close());

const analysis = {
  isFood: true, dishName: 'Arroz', overallConfidence: 'alta', totalKcalEstimate: 128, uncertainties: [],
  items: [{ name: 'Arroz', matchedFoodId: 'taco:arroz-branco-cozido', candidates: [], estimatedGrams: 100, portionDescription: '', visibleIngredients: [], probableIngredients: [], preparation: null, brand: null, brandEvidence: null, confidence: 'alta', estimatedPer100g: null }],
};

describe('integração OpenRouter', () => {
  it('envia imagem como data URL, JSON Schema e autenticação; valida a resposta', async () => {
    reply = () => ok('```json\n' + JSON.stringify(analysis) + '\n```');
    const r = await ai.analyzeImage({ imageBase64: 'A'.repeat(200), mediaType: 'image/jpeg', catalog: [{ id: 'taco:arroz-branco-cozido', name: 'Arroz' }] });
    expect(r.items[0].matchedFoodId).toBe('taco:arroz-branco-cozido');
    expect(last!.headers.authorization).toBe('Bearer sk-or-teste');
    expect(last!.body.model).toBe('anthropic/claude-opus-5.5');
    expect(last!.body.response_format.type).toBe('json_schema');
    expect(last!.body.response_format.json_schema.strict).toBe(true);
    const user = last!.body.messages[1].content;
    expect(user[0].type).toBe('image_url');
    expect(user[0].image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(last!.body.messages[0].role).toBe('system');
  });

  it('rejeita JSON fora do esquema', async () => {
    reply = () => ok(JSON.stringify({ ...analysis, overallConfidence: 'talvez' }));
    await expect(ai.analyzeImage({ imageBase64: 'A'.repeat(200), mediaType: 'image/jpeg', catalog: [] })).rejects.toThrow(/validação/);
  });

  it('chat devolve o texto e começa pela mensagem do usuário', async () => {
    reply = () => ok('Olá! Posso ajudar.');
    const r = await ai.chat({ messages: [{ role: 'assistant', content: 'oi' }, { role: 'user', content: 'Como montar um prato?' }], profile: null });
    expect(r).toBe('Olá! Posso ajudar.');
    expect(last!.body.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
    expect(last!.body.response_format).toBeUndefined();
  });

  it('traduz erros da OpenRouter para mensagens claras', async () => {
    const msgs = { role: 'user' as const, content: 'oi' };
    reply = () => ({ status: 401, json: { error: { code: 401, message: 'bad key' } } });
    await expect(ai.chat({ messages: [msgs] })).rejects.toThrow(/Chave da OpenRouter inválida/);
    reply = () => ({ status: 402, json: { error: { code: 402, message: 'credits' } } });
    await expect(ai.chat({ messages: [msgs] })).rejects.toThrow(/Créditos insuficientes/);
    reply = () => ({ status: 429, json: { error: { code: 429 } } });
    await expect(ai.chat({ messages: [msgs] })).rejects.toThrow(/Limite/);
    reply = () => ok('texto cortado', 'length');
    await expect(ai.chat({ messages: [msgs] })).rejects.toThrow(/incompleta/);
    reply = () => ({ status: 200, json: { error: { code: 502, message: 'provider down' } } });
    await expect(ai.chat({ messages: [msgs] })).rejects.toThrow(/erro/);
  });
});
