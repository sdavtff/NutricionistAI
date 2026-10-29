// Lembretes locais.
// - App Android (Capacitor): agendados no sistema via Local Notifications — chegam com o app fechado.
// - Navegador: Notification API; sem servidor de push, só disparam com o app aberto (informado na tela).
import { LocalNotifications } from '@capacitor/local-notifications';
import { listReminders, saveReminder, uid } from '../db/repo';
import { isNative } from '../lib/platform';
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

export type NotifPermission = 'unsupported' | NotificationPermission;

export function notificationSupport(): NotifPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function mapNative(p: string): NotifPermission {
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'default';
}

export async function notificationPermission(): Promise<NotifPermission> {
  if (isNative()) return mapNative((await LocalNotifications.checkPermissions()).display);
  return notificationSupport();
}

export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (isNative()) return mapNative((await LocalNotifications.requestPermissions()).display);
  if (notificationSupport() === 'unsupported') return 'unsupported';
  return Notification.requestPermission();
}

/** Horários (HH:MM) em que o lembrete dispara, expandindo intervalos dentro da janela. */
export function reminderTimes(r: Reminder): string[] {
  if (r.intervalMin && r.windowStart && r.windowEnd) {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const out: string[] = [];
    for (let m = toMin(r.windowStart); m <= toMin(r.windowEnd); m += r.intervalMin) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    return out;
  }
  return [...new Set(r.times)].filter((t) => /^\d{2}:\d{2}$/.test(t));
}

/** Reagenda no Android todos os lembretes ativos (repetição semanal por dia/horário). */
export async function syncNativeReminders(userId: string) {
  if (!isNative()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if ((await notificationPermission()) !== 'granted') return;
  const reminders = (await listReminders(userId)).filter((r) => r.enabled);
  const notifications = [];
  let id = 1;
  for (const r of reminders) {
    for (const day of r.days) {
      for (const t of reminderTimes(r)) {
        notifications.push({
          id: id++,
          title: 'Nutricionist AI',
          body: MESSAGES[r.kind],
          // weekday no Capacitor: 1 = domingo ... 7 = sábado
          schedule: { on: { weekday: day + 1, hour: Number(t.slice(0, 2)), minute: Number(t.slice(3, 5)) }, allowWhileIdle: true },
        });
      }
    }
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications: notifications.slice(0, 400) });
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
  if (isNative()) {
    void syncNativeReminders(userId).catch(() => undefined);
    return;
  }
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
  if (isNative()) {
    await LocalNotifications.schedule({ notifications: [{ id: 999999, title: 'Nutricionist AI', body: 'Notificações ativadas! Este é um teste.', schedule: { at: new Date(Date.now() + 1500) } }] });
    return;
  }
  await show('Nutricionist AI', 'Notificações ativadas! Este é um teste.');
}
