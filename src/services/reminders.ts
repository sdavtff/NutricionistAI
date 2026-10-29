// Lembretes locais via Notification API. LIMITAÇÃO: sem um servidor de push, os lembretes só disparam
// enquanto o app estiver aberto (em uma aba ou instalado como aplicativo). Isso é informado na tela.
import { listReminders, saveReminder, uid } from '../db/repo';
import type { Reminder, ReminderKind } from '../db/types';
import { nowTime } from '../lib/date';

export const REMINDER_DEFAULTS: { kind: ReminderKind; label: string; times: string[]; intervalMin?: number; windowStart?: string; windowEnd?: string }[] = [
  { kind: 'refeicao', label: 'Registrar refeições', times: ['08:30', '12:30', '19:30'] },
  { kind: 'agua', label: 'Beber água', times: [], intervalMin: 90, windowStart: '08:00', windowEnd: '21:00' },
  { kind: 'planejamento', label: 'Planejar refeições da semana', times: ['10:00'] },
  { kind: 'habitos', label: 'Registrar hábitos do dia', times: ['21:00'] },
  { kind: 'pausa', label: 'Fazer uma pausa e se movimentar', times: [], intervalMin: 60, windowStart: '09:00', windowEnd: '18:00' },
];

const MESSAGES: Record<ReminderKind, string> = {
  refeicao: 'Que tal registrar sua refeição no diário?',
  agua: 'Hora de um copo de água 💧',
  planejamento: 'Reserve alguns minutos para planejar as refeições da semana.',
  habitos: 'Marque os hábitos que você cumpriu hoje.',
  pausa: 'Levante-se, alongue-se e caminhe um pouco.',
};

export async function ensureReminders(userId: string): Promise<Reminder[]> {
  const existing = await listReminders(userId);
  const missing = REMINDER_DEFAULTS.filter((d) => !existing.some((r) => r.kind === d.kind));
  for (const d of missing) {
    const r: Reminder = {
      id: uid(), userId, kind: d.kind, label: d.label, enabled: false, times: d.times,
      intervalMin: d.intervalMin ?? null, windowStart: d.windowStart, windowEnd: d.windowEnd,
      days: d.kind === 'planejamento' ? [0] : [0, 1, 2, 3, 4, 5, 6],
    };
    await saveReminder(r);
    existing.push(r);
  }
  return existing.sort((a, b) => REMINDER_DEFAULTS.findIndex((d) => d.kind === a.kind) - REMINDER_DEFAULTS.findIndex((d) => d.kind === b.kind));
}

export function notificationSupport(): 'unsupported' | NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<'unsupported' | NotificationPermission> {
  if (notificationSupport() === 'unsupported') return 'unsupported';
  return Notification.requestPermission();
}

/** Decide se o lembrete deve disparar agora (função pura, testável). */
export function isDue(r: Reminder, now: Date): boolean {
  if (!r.enabled || !r.days.includes(now.getDay())) return false;
  const hm = nowTime(now);
  const minuteKey = Math.floor(now.getTime() / 60000);
  const lastKey = r.lastFiredAt ? Math.floor(r.lastFiredAt / 60000) : -1;
  if (minuteKey === lastKey) return false;
  if (r.intervalMin && r.windowStart && r.windowEnd) {
    if (hm < r.windowStart || hm > r.windowEnd) return false;
    const [sh, sm] = r.windowStart.split(':').map(Number);
    const mins = now.getHours() * 60 + now.getMinutes() - (sh * 60 + sm);
    return mins >= 0 && mins % r.intervalMin === 0;
  }
  return r.times.includes(hm);
}

async function show(title: string, body: string) {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) await reg.showNotification(title, { body, icon: '/icon.svg', badge: '/icon.svg', tag: title });
  else new Notification(title, { body, icon: '/icon.svg' });
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startReminderLoop(userId: string) {
  stopReminderLoop();
  const tick = async () => {
    if (notificationSupport() !== 'granted') return;
    const now = new Date();
    for (const r of await listReminders(userId)) {
      if (isDue(r, now)) {
        await saveReminder({ ...r, lastFiredAt: now.getTime() });
        await show('Nutricionist AI', MESSAGES[r.kind]).catch(() => undefined);
      }
    }
  };
  timer = setInterval(tick, 20_000);
  void tick();
}

export function stopReminderLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function testNotification() {
  await show('Nutricionist AI', 'Notificações ativadas! Este é um teste.');
}
