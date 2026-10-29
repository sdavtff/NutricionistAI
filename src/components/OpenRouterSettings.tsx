import { ExternalLink, Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { checkKey, DEFAULT_MODEL, listModels, type KeyInfo, type ModelInfo } from '../../shared/openrouter';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Alert, Button, Field, useConfirm } from './ui';

const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export function validateOpenRouterKey(key: string): string | null {
  const k = key.trim();
  if (!k) return 'Cole a sua chave da OpenRouter.';
  if (/\s/.test(k)) return 'A chave não pode conter espaços.';
  if (!k.startsWith('sk-or-')) return 'As chaves da OpenRouter começam com “sk-or-”. Confira se copiou a chave certa.';
  if (k.length < 20 || k.length > 200) return 'A chave parece incompleta.';
  return null;
}

/** Cartão de configuração da chave própria da OpenRouter (modo direto). */
export function OpenRouterSettings() {
  const { settings, updateSettings, consent } = useApp();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const saved = settings?.openrouterKey ?? '';
  const [key, setKey] = useState(saved);
  const [show, setShow] = useState(false);
  const [model, setModel] = useState(settings?.openrouterModel || DEFAULT_MODEL);
  const [visionModel, setVisionModel] = useState(settings?.openrouterVisionModel || '');
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [modelsErr, setModelsErr] = useState<string | null>(null);
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger' | 'info' | 'warning'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listModels().then(setModels).catch(() => setModelsErr('Não foi possível carregar a lista de modelos (sem internet?). Você pode digitar o identificador do modelo.'));
  }, []);

  const visionModels = useMemo(() => (models ?? []).filter((m) => m.vision).sort((a, b) => a.name.localeCompare(b.name)), [models]);
  const selected = models?.find((m) => m.id === model);

  async function saveAndTest() {
    setMsg(null);
    setInfo(null);
    const err = validateOpenRouterKey(key);
    if (err) return setMsg({ kind: 'danger', text: err });
    if (!model.trim()) return setMsg({ kind: 'danger', text: 'Escolha um modelo.' });
    setBusy(true);
    try {
      const i = await checkKey({ apiKey: key.trim() });
      setInfo(i);
      await updateSettings({ openrouterKey: key.trim(), openrouterModel: model.trim(), openrouterVisionModel: visionModel.trim() || undefined });
      const warn = selected && !selected.vision ? ' Atenção: este modelo não aceita imagens — a análise de fotos não vai funcionar.' : '';
      setMsg({ kind: warn ? 'warning' : 'success', text: `Chave válida e salva neste dispositivo. A IA está ativa com ${model.trim()}.${warn}` });
      toast('Chave da OpenRouter salva.');
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await ask('Remover chave?', 'A chave será apagada deste dispositivo. Os recursos de IA deixarão de funcionar até você informar outra chave ou um servidor.', { danger: true, confirm: 'Remover' }))) return;
    await updateSettings({ openrouterKey: undefined });
    setKey('');
    setInfo(null);
    setMsg({ kind: 'info', text: 'Chave removida deste dispositivo.' });
  }

  if (!settings) return null;

  return (
    <div className="card stack" id="ia" style={{ scrollMarginTop: 80 }}>
      {node}
      <div className="row between">
        <div className="row"><KeyRound color="var(--primary)" /><h2>IA — chave da OpenRouter</h2></div>
        {saved ? <span className="badge green">Ativa</span> : <span className="badge">Não configurada</span>}
      </div>
      <p className="small muted">
        Cole aqui a sua chave da <strong>OpenRouter</strong> para ativar a análise de fotos, o plano com IA e o chat.
        O app conversa direto com a OpenRouter, sem precisar de servidor.
      </p>
      <a className="small row" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer noopener" style={{ gap: 6 }}>
        Criar uma chave em openrouter.ai/keys <ExternalLink size={14} />
      </a>

      <div className="field">
        <label htmlFor="or-key">Chave da API</label>
        <div className="input-group">
          <input id="or-key" className="input" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)}
            placeholder="sk-or-v1-…" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <span className="addon">
            <Button size="icon" variant="ghost" aria-label={show ? 'Ocultar chave' : 'Mostrar chave'} onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</Button>
          </span>
        </div>
      </div>

      <Field label="Modelo" id="or-model" hint={selected
        ? `${selected.vision ? '✓ aceita imagens' : '✗ não aceita imagens'} · ${selected.structured ? '✓ JSON estruturado' : 'sem JSON estruturado'}${selected.promptPrice !== null ? ` · ${usd(selected.promptPrice)} / ${usd(selected.completionPrice ?? 0)} por 1 milhão de tokens (entrada/saída)` : ''}`
        : 'Escolha um modelo que aceite imagens para analisar fotos.'}>
        {visionModels.length ? (
          <select id="or-model" className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {!visionModels.some((m) => m.id === model) ? <option value={model}>{model}</option> : null}
            {visionModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ) : (
          <input id="or-model" className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} autoCapitalize="off" spellCheck={false} />
        )}
      </Field>
      {modelsErr ? <p className="tiny muted">{modelsErr}</p> : null}

      <details>
        <summary className="small strong" style={{ cursor: 'pointer' }}>Opções avançadas</summary>
        <div className="stack mt-sm">
          <Field label="Modelo só para fotos (opcional)" id="or-vmodel" hint="Use, por exemplo, um modelo de visão mais barato. Se vazio, usa o modelo acima.">
            {visionModels.length ? (
              <select id="or-vmodel" className="input" value={visionModel} onChange={(e) => setVisionModel(e.target.value)}>
                <option value="">Mesmo modelo</option>
                {visionModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : <input id="or-vmodel" className="input" value={visionModel} onChange={(e) => setVisionModel(e.target.value)} autoCapitalize="off" spellCheck={false} />}
          </Field>
        </div>
      </details>

      <div className="row-wrap">
        <Button variant="primary" loading={busy} onClick={saveAndTest}>Salvar e testar chave</Button>
        {saved ? <Button variant="ghost" onClick={remove}><Trash2 size={16} />Remover chave</Button> : null}
      </div>

      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
      {info ? (
        <p className="small muted">
          {info.label ? <>Chave: <strong>{info.label}</strong> · </> : null}
          {info.usage !== null ? <>Uso acumulado: {usd(info.usage)}</> : null}
          {info.limit !== null ? <> · Limite: {usd(info.limit)}{info.limitRemaining !== null ? ` (restam ${usd(info.limitRemaining)})` : ''}</> : <> · Sem limite de gasto definido</>}
          {info.isFreeTier ? ' · Conta gratuita (sem créditos)' : ''}
        </p>
      ) : null}
      {!consent?.aiProcessing ? <Alert kind="info">Você ainda precisa autorizar o envio de dados à IA em Privacidade e dados (ou quando usar um recurso de IA).</Alert> : null}

      <Alert kind="warning" title="Segurança da sua chave">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>A chave fica salva <strong>somente neste dispositivo</strong> e é enviada apenas para <strong>openrouter.ai</strong>. Ela não aparece na exportação de dados.</li>
          <li>Os usos da IA são cobrados na <strong>sua conta</strong> da OpenRouter. Crie uma chave exclusiva para este app e defina um <strong>limite de créditos</strong> nela.</li>
          <li>O armazenamento do app não é criptografado: proteja o aparelho com senha. Se perder o aparelho, revogue a chave no site da OpenRouter.</li>
        </ul>
      </Alert>
    </div>
  );
}
