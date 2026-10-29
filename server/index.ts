// Servidor intermediário seguro do Nutricionist AI.
// - Mantém a chave da IA fora do navegador.
// - Expõe /api/health, /api/ai/analyze-image, /api/ai/plan e /api/ai/chat.
// - Em produção, também serve o front-end compilado (pasta dist/).
// Este servidor NÃO armazena fotos nem dados: apenas repassa a requisição à IA e devolve a resposta.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import type { ZodType } from 'zod';
import { aiConfigured, analyzeImage, analyzeRequest, chat, chatRequest, generatePlan, HttpError, MODEL, planRequest, PROVIDER, VISION_MODEL } from './ai';

try {
  process.loadEnvFile?.('.env');
} catch {
  /* sem .env — tudo bem */
}

const PORT = Number(process.env.PORT) || 8787;
const PROD = process.env.NODE_ENV === 'production';
const DIST = resolve('dist');
const MAX_BODY = 10 * 1024 * 1024;
// Origens autorizadas (CORS): o app Android (Capacitor) roda em https://localhost.
// Acrescente outras em ALLOWED_ORIGIN, separadas por vírgula.
const ALLOWED_ORIGINS = new Set([
  'https://localhost',
  'capacitor://localhost',
  ...(process.env.ALLOWED_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean),
]);

// Limite simples de requisições por IP (em memória).
const hits = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { count: 1, reset: now + windowMs });
    return false;
  }
  h.count++;
  return h.count > limit;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

async function readJSON<T>(req: IncomingMessage, schema: ZodType<T>): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Requisição grande demais.');
    chunks.push(chunk as Buffer);
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new HttpError(400, 'Dados da requisição inválidos.');
  return parsed.data;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'Proibido.' });
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(DIST, 'index.html'); // SPA fallback
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': file.includes(`${DIST}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    send(res, 404, { error: 'Não encontrado. Rode "npm run build" antes de "npm start".' });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return send(res, 200, { ok: true, ai: aiConfigured(), provider: aiConfigured() ? PROVIDER : null, model: aiConfigured() ? MODEL : null });
    }
    if (url.pathname.startsWith('/api/ai/')) {
      if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (rateLimited(ip)) throw new HttpError(429, 'Muitas requisições. Aguarde um minuto e tente novamente.');
      if (!aiConfigured()) throw new HttpError(503, 'A IA não está configurada no servidor (defina OPENROUTER_API_KEY no arquivo .env).');
      switch (url.pathname) {
        case '/api/ai/analyze-image':
          return send(res, 200, { result: await analyzeImage(await readJSON(req, analyzeRequest)), model: VISION_MODEL });
        case '/api/ai/plan':
          return send(res, 200, { result: await generatePlan(await readJSON(req, planRequest)), model: MODEL });
        case '/api/ai/chat':
          return send(res, 200, { reply: await chat(await readJSON(req, chatRequest)), model: MODEL });
        default:
          throw new HttpError(404, 'Rota não encontrada.');
      }
    }
    if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'Rota não encontrada.');
    if (PROD) return serveStatic(req, res);
    return send(res, 404, { error: 'Em desenvolvimento, acesse o front-end pelo Vite (http://localhost:5173).' });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error('[server] erro inesperado:', err);
    return send(res, 500, { error: 'Erro interno do servidor.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nutricionist AI — API em http://localhost:${PORT} (IA ${aiConfigured() ? `ativa via ${PROVIDER}: ${MODEL}${VISION_MODEL !== MODEL ? ` / fotos: ${VISION_MODEL}` : ''}` : 'NÃO configurada'})`);
});
