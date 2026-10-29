import { Bell, ClipboardEdit, LogOut, Moon, Palette, User as UserIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Field, Segmented, TextInput } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { saveReminder } from '../db/repo';
import type { Reminder } from '../db/types';
import { AuthError, changePassword, updateProfile } from '../services/auth';
import { ensureReminders, notificationSupport, requestNotificationPermission, testNotification } from '../services/reminders';

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function SettingsPage() {
  const user = useUser();
  const { settings, updateSettings, setUser, logout } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const [profile, setProfile] = useState({ name: user.name, email: user.email });
  const [pErr, setPErr] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [perm, setPerm] = useState(notificationSupport());

  useEffect(() => { void ensureReminders(user.id).then(setReminders); }, [user.id]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setPErr(null);
    try {
      await setUser(await updateProfile(user.id, profile.name, profile.email));
      toast('Perfil atualizado.');
    } catch (err) {
      setPErr(err instanceof AuthError ? err.message : 'Não foi possível salvar.');
    }
  }
  async function savePw(e: FormEvent) {
    e.preventDefault();
    setPwErr(null);
    try {
      await changePassword(user.id, pw.current, pw.next, pw.confirm);
      setPw({ current: '', next: '', confirm: '' });
      toast('Senha alterada.');
    } catch (err) {
      setPwErr(err instanceof AuthError ? err.message : 'Não foi possível alterar a senha.');
    }
  }
  async function updateReminder(r: Reminder) {
    if (r.enabled && perm !== 'granted') {
      const p = await requestNotificationPermission();
      setPerm(p);
      if (p !== 'granted') {
        toast(p === 'unsupported' ? 'Este navegador não suporta notificações.' : 'Permissão de notificação negada.', 'error');
        return;
      }
    }
    await saveReminder(r);
    setReminders((rs) => rs.map((x) => (x.id === r.id ? r : x)));
  }

  if (!settings) return null;

  return (
    <div className="page stack" style={{ maxWidth: 820 }}>
      <div className="page-header"><div><h1>Perfil e configurações</h1><p>Seus dados ficam salvos apenas neste dispositivo.</p></div></div>

      <form className="card stack" onSubmit={saveProfile}>
        <div className="row"><UserIcon color="var(--primary)" /><h2>Perfil</h2></div>
        <div className="grid-2">
          <TextInput label="Nome" value={profile.name} maxLength={80} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          <TextInput label="E-mail" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} hint="Usado apenas como login local." />
        </div>
        {pErr ? <Alert kind="danger">{pErr}</Alert> : null}
        <div className="row-wrap">
          <Button type="submit" variant="primary">Salvar perfil</Button>
          <Link to="/questionario?editar=1" className="btn"><ClipboardEdit size={18} />Editar questionário nutricional</Link>
          <Link to="/perfil-nutricional" className="btn btn-ghost">Ver análise do perfil</Link>
        </div>
      </form>

      <div className="card stack">
        <div className="row"><Palette color="var(--primary)" /><h2>Aparência e preferências</h2></div>
        <Field label="Tema" id="theme">
          <Segmented label="Tema" value={settings.theme} onChange={(t) => updateSettings({ theme: t })} options={[{ value: 'claro', label: 'Claro' }, { value: 'escuro', label: 'Escuro' }, { value: 'sistema', label: 'Sistema' }]} />
        </Field>
        <label className="check"><input type="checkbox" checked={settings.hideCalories} onChange={(e) => updateSettings({ hideCalories: e.target.checked })} />Ocultar calorias e metas calóricas no início, diário e plano</label>
        <label className="check"><input type="checkbox" checked={settings.hideWeight} onChange={(e) => updateSettings({ hideWeight: e.target.checked })} />Ocultar peso, IMC e metas de peso</label>
        <label className="check"><input type="checkbox" checked={settings.weightTrackingEnabled} onChange={(e) => updateSettings({ weightTrackingEnabled: e.target.checked })} />Ativar acompanhamento de peso</label>
        <TextInput label="Meta orientativa de água (ml/dia)" type="number" min={500} max={6000} step={100} value={settings.waterGoalMl}
          onChange={(e) => { const v = Number(e.target.value); if (v >= 500 && v <= 6000) void updateSettings({ waterGoalMl: v }); }} />
      </div>

      <div className="card stack">
        <div className="row"><Bell color="var(--primary)" /><h2>Lembretes</h2></div>
        <Alert kind="info">
          Os lembretes usam as notificações do navegador e <strong>só funcionam enquanto o app estiver aberto</strong> (em uma aba ou instalado).
          Notificações com o app fechado exigiriam um servidor de push, que não faz parte desta versão.
        </Alert>
        <div className="row-wrap small">
          <span>Permissão: <strong>{perm === 'granted' ? 'concedida' : perm === 'denied' ? 'negada (altere nas configurações do navegador)' : perm === 'unsupported' ? 'não suportada neste navegador' : 'ainda não solicitada'}</strong></span>
          {perm === 'default' ? <Button size="sm" variant="soft" onClick={async () => setPerm(await requestNotificationPermission())}>Permitir notificações</Button> : null}
          {perm === 'granted' ? <Button size="sm" onClick={() => testNotification()}>Enviar teste</Button> : null}
        </div>
        {reminders.map((r) => (
          <div key={r.id} className="card flat stack-sm" style={{ padding: 14 }}>
            <label className="check"><input type="checkbox" checked={r.enabled} disabled={perm === 'unsupported'} onChange={(e) => updateReminder({ ...r, enabled: e.target.checked })} /><strong>{r.label}</strong></label>
            {r.intervalMin ? (
              <div className="row-wrap small">
                A cada
                <select className="input" style={{ width: 'auto', minHeight: 36 }} value={r.intervalMin} onChange={(e) => updateReminder({ ...r, intervalMin: Number(e.target.value) })} aria-label="Intervalo">
                  {[30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
                entre
                <input type="time" className="input" style={{ width: 'auto', minHeight: 36 }} value={r.windowStart} onChange={(e) => updateReminder({ ...r, windowStart: e.target.value })} aria-label="Início" />
                e
                <input type="time" className="input" style={{ width: 'auto', minHeight: 36 }} value={r.windowEnd} onChange={(e) => updateReminder({ ...r, windowEnd: e.target.value })} aria-label="Fim" />
              </div>
            ) : (
              <div className="row-wrap small">
                Horários:
                {r.times.map((t, i) => (
                  <input key={i} type="time" className="input" style={{ width: 'auto', minHeight: 36 }} value={t} aria-label={`Horário ${i + 1}`}
                    onChange={(e) => updateReminder({ ...r, times: r.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                ))}
                {r.times.length < 6 ? <Button size="sm" variant="ghost" onClick={() => updateReminder({ ...r, times: [...r.times, '12:00'] })}>+ horário</Button> : null}
                {r.times.length > 1 ? <Button size="sm" variant="ghost" onClick={() => updateReminder({ ...r, times: r.times.slice(0, -1) })}>− remover</Button> : null}
              </div>
            )}
            <div className="row-wrap" role="group" aria-label="Dias da semana">
              {DAY_LABELS.map((d, i) => (
                <button key={i} type="button" className="chip" style={{ width: 38, justifyContent: 'center', padding: '6px 0' }} aria-pressed={r.days.includes(i)}
                  aria-label={['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][i]}
                  onClick={() => updateReminder({ ...r, days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i].sort() })}>{d}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form className="card stack" onSubmit={savePw}>
        <div className="row"><Moon color="var(--primary)" /><h2>Alterar senha</h2></div>
        <TextInput label="Senha atual" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <div className="grid-2">
          <TextInput label="Nova senha" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} hint="Mínimo de 8 caracteres, com maiúscula, minúscula e número." />
          <TextInput label="Confirmar nova senha" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        </div>
        {pwErr ? <Alert kind="danger">{pwErr}</Alert> : null}
        <Button type="submit">Alterar senha</Button>
      </form>

      <div className="row-wrap">
        <Link to="/privacidade" className="btn">Privacidade e dados</Link>
        <Button variant="danger" onClick={() => { logout(); nav('/login'); }}><LogOut size={18} />Sair da conta</Button>
      </div>
    </div>
  );
}
