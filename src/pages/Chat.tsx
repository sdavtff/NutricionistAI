import { MessageCircle, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Spinner, useConfirm } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { clearChats, deleteChat, listChats, saveChat, saveConsent, uid } from '../db/repo';
import type { ChatConversation, ChatMessage } from '../db/types';
import { AIError, getAIStatus, sendChat, type AIStatus } from '../services/ai';
import { profileForAI } from '../services/plans';

const SUGGESTIONS = [
  'O que posso preparar com ovo, tomate e arroz?',
  'Como substituir o pão no café da manhã?',
  'Como montar uma refeição equilibrada?',
  'Quais são os nutrientes do feijão?',
  'Como organizar minhas refeições da semana?',
  'Como adaptar uma receita de bolo para ter menos açúcar?',
];

export function ChatPage() {
  const user = useUser();
  const { consent, questionnaire, refresh } = useApp();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getAIStatus().then(setStatus);
    void listChats(user.id).then((c) => {
      setChats(c);
      setActive(c[0] ?? null);
    });
  }, [user.id]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [active?.messages.length, sending]);

  const canSend = !!consent?.aiProcessing && !!status?.configured;

  async function send(content: string) {
    const msg = content.trim().slice(0, 4000);
    if (!msg || sending) return;
    if (!consent?.aiProcessing) return toast('Autorize o uso da IA para conversar.', 'error');
    let conv: ChatConversation = active ?? { id: uid(), userId: user.id, title: msg.slice(0, 60), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    conv = { ...conv, messages: [...conv.messages, { role: 'user', content: msg, at: Date.now() }] };
    setActive(conv);
    setText('');
    await saveChat(conv);
    setSending(true);
    try {
      const history = conv.messages.filter((m) => !m.error).slice(-20).map(({ role, content: c }) => ({ role, content: c }));
      const profile = consent.aiShareProfile && questionnaire?.answers ? profileForAI(questionnaire.answers) : null;
      const { reply } = await sendChat({ messages: history, profile });
      conv = { ...conv, messages: [...conv.messages, { role: 'assistant', content: reply, at: Date.now() }] };
    } catch (e) {
      const errMsg: ChatMessage = { role: 'assistant', content: e instanceof AIError ? e.message : 'Não foi possível obter resposta.', at: Date.now(), error: true };
      conv = { ...conv, messages: [...conv.messages, errMsg] };
    } finally {
      setSending(false);
    }
    setActive(conv);
    await saveChat(conv);
    setChats(await listChats(user.id));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }

  return (
    <div className="page stack" style={{ maxWidth: 1000 }}>
      {node}
      <div className="page-header">
        <div><h1>Chat com nutricionista de IA</h1><p>Tire dúvidas sobre alimentação, receitas e substituições.</p></div>
        <div className="row-wrap">
          <Button size="sm" onClick={() => setActive(null)}><Plus size={16} />Nova conversa</Button>
          <Button size="sm" variant="ghost" disabled={!chats.length} onClick={async () => {
            if (await ask('Limpar histórico?', 'Todas as conversas salvas neste dispositivo serão apagadas.', { danger: true, confirm: 'Limpar tudo' })) {
              await clearChats(user.id);
              setChats([]);
              setActive(null);
              toast('Histórico apagado.');
            }
          }}><Trash2 size={16} />Limpar histórico</Button>
        </div>
      </div>

      <Alert kind="info">Este chat é <strong>educativo</strong> e não substitui uma nutricionista humana. A IA não faz diagnósticos nem prescreve tratamentos e pode cometer erros.</Alert>

      {status && !status.configured ? (
        <Alert kind="warning" title="IA indisponível">
          {!status.online ? 'Você está offline.' : <>Cole sua chave da OpenRouter em <Link to="/perfil?secao=ia">Perfil e configurações</Link> para conversar.</>} O histórico continua disponível para consulta.
        </Alert>
      ) : null}
      {!consent?.aiProcessing ? (
        <Alert kind="warning" title="Autorização necessária">
          Para conversar, suas mensagens são enviadas ao serviço de IA (OpenRouter e o provedor do modelo escolhido).{' '}
          <button className="btn btn-sm btn-soft" onClick={async () => { if (consent) await saveConsent({ ...consent, aiProcessing: true }); await refresh(); }}>Autorizar</button>
        </Alert>
      ) : (
        <label className="check small">
          <input type="checkbox" checked={!!consent.aiShareProfile} onChange={async (e) => { await saveConsent({ ...consent, aiShareProfile: e.target.checked }); await refresh(); }} />
          Usar meu perfil e preferências alimentares (sem nome e e-mail) para personalizar as respostas
        </label>
      )}

      {chats.length ? (
        <div className="tabs" role="tablist" aria-label="Conversas">
          {chats.map((c) => (
            <span key={c.id} className="row" style={{ gap: 2 }}>
              <button type="button" role="tab" className="chip" aria-pressed={active?.id === c.id} aria-selected={active?.id === c.id} onClick={() => setActive(c)}>
                <MessageCircle size={14} /><span className="truncate" style={{ maxWidth: 160 }}>{c.title}</span>
              </button>
              <Button size="sm" variant="ghost" aria-label={`Excluir conversa ${c.title}`} onClick={async () => {
                await deleteChat(c.id);
                setChats((cs) => cs.filter((x) => x.id !== c.id));
                if (active?.id === c.id) setActive(null);
              }}><Trash2 size={14} /></Button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="card stack" style={{ minHeight: 360, background: 'var(--surface-2)' }}>
        {active?.messages.length ? (
          <div className="stack" aria-live="polite">
            {active.messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}${m.error ? ' error' : ''}`}>
                {m.error ? <strong>Erro: </strong> : null}{m.content}
              </div>
            ))}
            {sending ? <div className="chat-bubble assistant row"><Spinner label="A IA está respondendo" /> <span className="small muted">Pensando…</span></div> : null}
            <div ref={endRef} />
          </div>
        ) : (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 0' }}>
            <span className="brand-mark" style={{ width: 60, height: 60 }}><MessageCircle size={30} /></span>
            <h2>Como posso ajudar?</h2>
            <p className="small muted">Sugestões de perguntas:</p>
            <div className="row-wrap" style={{ justifyContent: 'center' }}>
              {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" disabled={!canSend} onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
      </div>

      <form className="row chat-form" onSubmit={submit} style={{ position: 'sticky', bottom: 16 }}>
        <input className="input" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder={canSend ? 'Escreva sua pergunta…' : 'IA indisponível no momento'} disabled={!canSend || sending} aria-label="Mensagem" />
        <Button type="submit" variant="primary" size="icon" disabled={!canSend || !text.trim()} loading={sending} aria-label="Enviar"><Send size={18} /></Button>
      </form>
      <p className="tiny muted">As conversas ficam salvas apenas neste dispositivo. Em caso de sintomas, procure um serviço de saúde.</p>
    </div>
  );
}
