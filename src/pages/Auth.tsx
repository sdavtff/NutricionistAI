import { Eye, EyeOff, KeyRound, ShieldCheck, Sparkles, Camera, NotebookPen } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Layout';
import { Alert, Button, TextInput } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { passwordIssues, validateEmail, validateName, validatePassword } from '../lib/validation';
import { AuthError, currentUser, login, register, resetPasswordWithCode } from '../services/auth';

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <section className="auth-art" aria-hidden>
        <Brand />
        <div className="stack" style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: '2.4rem', color: '#fff' }}>Entenda sua alimentação e crie hábitos que cabem na sua rotina.</h1>
          <div className="stack" style={{ color: 'rgba(255,255,255,.85)' }}>
            <span className="row"><Camera size={20} /> Analise refeições por foto com IA</span>
            <span className="row"><NotebookPen size={20} /> Diário alimentar com tabela nutricional completa</span>
            <span className="row"><Sparkles size={20} /> Plano educativo personalizado</span>
            <span className="row"><ShieldCheck size={20} /> Seus dados ficam no seu dispositivo</span>
          </div>
        </div>
        <p className="tiny" style={{ color: 'rgba(255,255,255,.7)' }}>Ferramenta educativa. Não substitui acompanhamento com nutricionista.</p>
      </section>
      <section className="auth-form">
        <div className="stack">
          <div className="hide-desktop" style={{ marginBottom: 8 }}><Brand /></div>
          {children}
        </div>
      </section>
    </div>
  );
}

function PasswordInput({ label, value, onChange, error, autoComplete, hint }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; autoComplete: string; hint?: ReactNode }) {
  const [show, setShow] = useState(false);
  const id = label.replace(/\W/g, '-').toLowerCase();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-group">
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} aria-invalid={error ? true : undefined} maxLength={128} />
        <span className="addon">
          <Button size="icon" variant="ghost" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </Button>
        </span>
      </div>
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

const LOCAL_NOTICE = (
  <Alert kind="info" title="Conta local">
    Sua conta e seus dados ficam salvos apenas neste navegador/dispositivo (IndexedDB). Não há sincronização entre dispositivos
    nem envio de e-mails — isso exigiria um serviço externo de autenticação.
  </Alert>
);

export function LoginPage() {
  const { setUser } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const u = await login(email, password);
      await setUser(u);
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div>
        <h1>Bem-vindo(a) de volta</h1>
        <p className="muted">Entre para continuar cuidando da sua alimentação.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <TextInput label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordInput label="Senha" value={password} onChange={setPassword} autoComplete="current-password" />
        {error ? <Alert kind="danger">{error}</Alert> : null}
        <Button type="submit" variant="primary" block loading={loading}>Entrar</Button>
      </form>
      <div className="row between small">
        <Link to="/recuperar-senha">Esqueci minha senha</Link>
        <Link to="/cadastro" className="strong">Criar conta</Link>
      </div>
      {LOCAL_NOTICE}
    </AuthShell>
  );
}

export function RegisterPage() {
  const { setUser } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [personalData, setPersonalData] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const errs = {
    name: validateName(form.name),
    email: validateEmail(form.email),
    password: validatePassword(form.password),
    confirm: form.confirm !== form.password ? 'As senhas não coincidem.' : null,
    consent: personalData ? null : 'Para usar o app, aceite o tratamento local dos seus dados.',
  };
  const issues = passwordIssues(form.password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (Object.values(errs).some(Boolean)) return;
    setLoading(true);
    try {
      const { recoveryCode } = await register({ ...form, consent: { personalData, aiProcessing } });
      setCode(recoveryCode);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  if (code) {
    return (
      <AuthShell>
        <div className="stack">
          <span className="brand-mark" style={{ width: 56, height: 56 }}><KeyRound size={28} /></span>
          <h1>Guarde seu código de recuperação</h1>
          <p className="muted">
            Como a conta é local, não podemos enviar e-mails de recuperação. Este código é a <strong>única forma</strong> de
            redefinir a senha neste dispositivo. Ele será exibido apenas agora.
          </p>
          <div className="code-box" aria-label="Código de recuperação">{code}</div>
          <div className="row-wrap">
            <Button onClick={() => navigator.clipboard?.writeText(code).then(() => toast('Código copiado.'), () => toast('Não foi possível copiar.', 'error'))}>Copiar código</Button>
          </div>
          <Alert kind="warning">Anote em um local seguro (por exemplo, um gerenciador de senhas). Não compartilhe com ninguém.</Alert>
          <Button variant="primary" block onClick={async () => {
            await setUser(await currentUser());
            nav('/questionario', { replace: true });
          }}>Já guardei — continuar</Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div>
        <h1>Crie sua conta</h1>
        <p className="muted">Leva menos de um minuto.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <TextInput label="Nome" autoComplete="name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} error={touched ? errs.name : null} />
        <TextInput label="E-mail" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={touched ? errs.email : null} />
        <PasswordInput label="Senha" value={form.password} onChange={(v) => setForm({ ...form, password: v })} autoComplete="new-password"
          error={touched ? errs.password : null}
          hint={form.password ? (issues.length ? `Falta: ${issues.join(', ')}.` : 'Senha forte ✓') : 'Mínimo de 8 caracteres, com maiúscula, minúscula e número.'} />
        <PasswordInput label="Confirmar senha" value={form.confirm} onChange={(v) => setForm({ ...form, confirm: v })} autoComplete="new-password" error={touched ? errs.confirm : null} />

        <div className="card flat stack" style={{ padding: 14 }}>
          <strong className="small">Consentimento (LGPD)</strong>
          <label className="check">
            <input type="checkbox" checked={personalData} onChange={(e) => setPersonalData(e.target.checked)} />
            <span>Autorizo o tratamento dos meus dados pessoais e de saúde (perfil, refeições, peso, fotos) <strong>armazenados somente neste dispositivo</strong>, para o funcionamento do app. <em>(obrigatório)</em></span>
          </label>
          <label className="check">
            <input type="checkbox" checked={aiProcessing} onChange={(e) => setAiProcessing(e.target.checked)} />
            <span>Autorizo enviar fotos de refeições, perguntas do chat e dados do perfil ao serviço de IA (OpenRouter e o provedor do modelo) <strong>somente quando eu usar</strong> os recursos de IA. <em>(opcional — pode mudar depois)</em></span>
          </label>
          {touched && errs.consent ? <span className="field-error">{errs.consent}</span> : null}
          <Link to="/termos" className="tiny">Ler a política de privacidade</Link>
        </div>

        {error ? <Alert kind="danger">{error}</Alert> : null}
        <Button type="submit" variant="primary" block loading={loading}>Criar conta</Button>
      </form>
      <p className="small center">Já tem conta? <Link to="/login" className="strong">Entrar</Link></p>
      {LOCAL_NOTICE}
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setNewCode(await resetPasswordWithCode(email, code, pw, confirm));
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {newCode ? (
        <div className="stack">
          <Alert kind="success" title="Senha redefinida!">Use a nova senha para entrar.</Alert>
          <p className="muted small">Seu código de recuperação anterior foi invalidado. Guarde o novo código:</p>
          <div className="code-box">{newCode}</div>
          <Button onClick={() => navigator.clipboard?.writeText(newCode).then(() => toast('Código copiado.'))}>Copiar código</Button>
          <Button variant="primary" onClick={() => nav('/login')}>Ir para o login</Button>
        </div>
      ) : (
        <>
          <div>
            <h1>Recuperar senha</h1>
            <p className="muted">Use o código de recuperação exibido quando você criou a conta.</p>
          </div>
          <Alert kind="info" title="Por que não enviamos e-mail?">
            O Nutricionist AI funciona com contas locais, sem servidor de e-mail. A recuperação por e-mail e a sincronização entre
            dispositivos exigiriam um serviço externo de autenticação (veja o README para integrar um). Nenhum e-mail é enviado.
          </Alert>
          <form className="stack" onSubmit={submit} noValidate>
            <TextInput label="E-mail da conta" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextInput label="Código de recuperação" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="one-time-code" />
            <PasswordInput label="Nova senha" value={pw} onChange={setPw} autoComplete="new-password" hint="Mínimo de 8 caracteres, com maiúscula, minúscula e número." />
            <PasswordInput label="Confirmar nova senha" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {error ? <Alert kind="danger">{error}</Alert> : null}
            <Button type="submit" variant="primary" block loading={loading}>Redefinir senha</Button>
          </form>
          <p className="small">Perdeu o código? Sem ele não é possível recuperar a conta local; você pode criar uma nova conta com outro e-mail.</p>
          <Link to="/login" className="small">← Voltar ao login</Link>
        </>
      )}
    </AuthShell>
  );
}
