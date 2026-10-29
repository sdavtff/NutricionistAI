import { Download, HardDrive, ShieldAlert, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Layout';
import { Alert, Button, Modal, TextInput, useConfirm } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { clearChats, countUserRecords, deleteAllImages, deleteAllUserData, exportUserData, imageUsage, saveConsent } from '../db/repo';
import { hashPassword, safeEqual } from '../lib/crypto';
import { fmtBytes } from '../lib/format';
import { logout } from '../services/auth';
import { isNative } from '../lib/platform';
import { shareTextFile } from '../services/native';

export function PrivacyPolicy() {
  return (
    <div className="stack small">
      <h3>Política de privacidade (resumo)</h3>
      <p><strong>Onde ficam seus dados:</strong> conta, perfil, respostas do questionário, refeições, fotos, peso, hábitos, conversas e configurações são armazenados <strong>somente neste navegador/dispositivo</strong> (IndexedDB). Não temos um servidor com cópia dos seus dados.</p>
      <p><strong>Quando algo sai do dispositivo:</strong> apenas quando você usa, com autorização, um recurso que depende da internet:</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li><strong>Análise de foto, plano com IA e chat:</strong> a foto comprimida, o texto digitado e, se você permitir, seu perfil (sem nome e e-mail) são enviados à <strong>OpenRouter</strong> — direto do app, quando você usa a sua própria chave, ou pelo servidor do app —, que os encaminha ao provedor do modelo de IA configurado (por padrão, Anthropic/Claude). O servidor do app não guarda esse conteúdo; consulte as políticas de privacidade da OpenRouter e do provedor do modelo.</li>
        <li><strong>Consulta de rótulos:</strong> o termo ou código de barras buscado é enviado ao Open Food Facts.</li>
      </ul>
      <p><strong>Finalidade e base legal (LGPD):</strong> tratamos os dados para oferecer as funcionalidades educativas do app, com base no seu consentimento, que pode ser revogado a qualquer momento.</p>
      <p><strong>Seus direitos:</strong> consultar, exportar, corrigir e excluir seus dados — tudo disponível nesta tela, sem depender de ninguém.</p>
      <p><strong>Limites de segurança:</strong> as senhas são guardadas como hash PBKDF2 com sal, mas os demais dados (incluindo a chave da OpenRouter, se você salvar uma) não são criptografados no armazenamento do navegador. Quem tiver acesso ao seu dispositivo/usuário do sistema pode ler esses dados. Limpar os dados do navegador apaga tudo, e não há backup automático. Use um dispositivo protegido por senha e exporte seus dados periodicamente.</p>
      <p><strong>Não é serviço de saúde:</strong> o app é educativo e não substitui nutricionistas ou médicos.</p>
    </div>
  );
}

export function PublicPolicyPage() {
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <Brand />
      <div className="card"><PrivacyPolicy /></div>
      <Link to="/cadastro">← Voltar ao cadastro</Link>
    </div>
  );
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function PrivacyPage() {
  const user = useUser();
  const { consent, refresh, setUser } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const { ask, node } = useConfirm();
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof countUserRecords>> | null>(null);
  const [quota, setQuota] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [delErr, setDelErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setUsage(await imageUsage(user.id));
    setCounts(await countUserRecords(user.id));
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      setQuota({ usage: e.usage, quota: e.quota, persisted: await navigator.storage.persisted?.() });
    }
  }, [user.id]);
  useEffect(() => { void load(); }, [load]);

  async function doExport(images: boolean) {
    setExporting(true);
    try {
      const data = await exportUserData(user.id, images);
      const name = `nutricionist-ai-dados-${new Date().toISOString().slice(0, 10)}.json`;
      if (isNative()) await shareTextFile(name, JSON.stringify(data, null, 2));
      else download(name, JSON.stringify(data, null, 2));
      toast('Exportação concluída.');
    } catch {
      toast('Falha ao exportar.', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function deleteEverything() {
    setDelErr(null);
    const h = await hashPassword(pw, user.passwordSalt, user.passwordIterations);
    if (!safeEqual(h, user.passwordHash)) return setDelErr('Senha incorreta.');
    await deleteAllUserData(user.id);
    logout();
    await setUser(null);
    nav('/login', { replace: true });
  }

  return (
    <div className="page stack" style={{ maxWidth: 860 }}>
      {node}
      <div className="page-header"><div><h1>Privacidade e dados</h1><p>Você controla seus dados: consulte, exporte e exclua quando quiser.</p></div></div>

      <div className="card stack">
        <h2>Consentimentos</h2>
        <label className="check"><input type="checkbox" checked disabled />Tratamento local dos meus dados pessoais e de saúde (necessário para usar o app — para revogar, exclua sua conta abaixo).</label>
        <label className="check">
          <input type="checkbox" checked={!!consent?.aiProcessing} onChange={async (e) => {
            if (consent) await saveConsent({ ...consent, aiProcessing: e.target.checked, aiShareProfile: e.target.checked ? consent.aiShareProfile : false, acceptedAt: Date.now() });
            await refresh();
            toast(e.target.checked ? 'Uso da IA autorizado.' : 'Autorização da IA revogada. Nada mais será enviado.');
          }} />
          Enviar fotos, mensagens e pedidos ao serviço de IA (OpenRouter e o provedor do modelo) quando eu usar os recursos de IA.
        </label>
        <label className="check">
          <input type="checkbox" checked={!!consent?.aiShareProfile} disabled={!consent?.aiProcessing} onChange={async (e) => { if (consent) await saveConsent({ ...consent, aiShareProfile: e.target.checked }); await refresh(); }} />
          Incluir meu perfil nutricional (sem nome e e-mail) no contexto do chat.
        </label>
      </div>

      <div className="card stack" id="exportar">
        <div className="row"><HardDrive color="var(--primary)" /><h2>Seus dados neste dispositivo</h2></div>
        {counts ? (
          <div className="grid-3 small">
            <span>🍽️ {counts.meals} refeições</span><span>📷 {usage?.count ?? 0} fotos ({fmtBytes(usage?.bytes ?? 0)})</span><span>🔎 {counts.analyses} análises</span>
            <span>💬 {counts.chats} conversas</span><span>⚖️ {counts.weights} registros de peso</span><span>🛒 {counts.lists} listas de compras</span>
          </div>
        ) : null}
        {quota?.quota ? <p className="tiny muted">Armazenamento do navegador usado por este site: {fmtBytes(quota.usage ?? 0)} de ~{fmtBytes(quota.quota)} disponíveis. {quota.persisted ? 'Armazenamento persistente ativo.' : ''}</p> : null}
        {quota && !quota.persisted && navigator.storage?.persist ? (
          <Button size="sm" onClick={async () => { const ok = await navigator.storage.persist(); toast(ok ? 'O navegador manterá seus dados mesmo com pouco espaço.' : 'O navegador não concedeu armazenamento persistente.', ok ? 'success' : 'info'); void load(); }}>Pedir armazenamento persistente</Button>
        ) : null}
        <p className="small muted">As fotos são comprimidas (até 1024 px, JPEG) e limitadas a 150 MB no total.</p>
        <div className="row-wrap">
          <Button variant="primary" loading={exporting} onClick={() => doExport(false)}><Download size={18} />Exportar dados (JSON)</Button>
          <Button loading={exporting} onClick={() => doExport(true)}><Download size={18} />Exportar com fotos</Button>
        </div>
      </div>

      <div className="card stack">
        <h2>Excluir dados</h2>
        <div className="row-wrap">
          <Button onClick={async () => {
            if (await ask('Excluir todas as fotos?', 'As fotos e análises de imagem serão apagadas. As refeições continuam no diário, sem foto.', { danger: true, confirm: 'Excluir fotos' })) {
              await deleteAllImages(user.id); toast('Fotos excluídas.'); void load();
            }
          }}><Trash2 size={18} />Excluir fotos</Button>
          <Button onClick={async () => {
            if (await ask('Excluir conversas?', 'Todo o histórico do chat será apagado.', { danger: true, confirm: 'Excluir conversas' })) {
              await clearChats(user.id); toast('Conversas excluídas.'); void load();
            }
          }}><Trash2 size={18} />Excluir conversas</Button>
          <Link to="/diario" className="btn btn-ghost">Excluir refeições individualmente</Link>
        </div>
        <Alert kind="danger" title="Excluir conta e todos os dados">
          Apaga definitivamente conta, perfil, questionário, planos, refeições, fotos, peso, hábitos, listas, conversas e configurações deste dispositivo. Não há como desfazer.
          <div className="mt-sm"><Button variant="danger" size="sm" onClick={() => { setPw(''); setDelErr(null); setDeleteOpen(true); }}><ShieldAlert size={16} />Excluir tudo</Button></div>
        </Alert>
      </div>

      <div className="card"><PrivacyPolicy /></div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Confirmar exclusão total" footer={<>
        <Button onClick={() => setDeleteOpen(false)}>Cancelar</Button>
        <Button variant="danger" onClick={deleteEverything} disabled={!pw}>Excluir definitivamente</Button>
      </>}>
        <div className="stack">
          <p className="small">Digite sua senha para confirmar. Recomendamos exportar seus dados antes.</p>
          <TextInput label="Senha" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} error={delErr} />
        </div>
      </Modal>
    </div>
  );
}
