import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getConsent, getQuestionnaire, getSettings, saveSettings } from '../db/repo';
import type { Consent, Questionnaire, Settings, User } from '../db/types';
import { currentUser, logout as doLogout } from '../services/auth';
import { applyNativeTheme, initNative } from '../services/native';
import { setDirectAIConfig } from '../services/ai';
import { startReminderLoop, stopReminderLoop } from '../services/reminders';

interface AppState {
  loading: boolean;
  user: User | null;
  settings: Settings | null;
  consent: Consent | null;
  questionnaire: Questionnaire | null;
  refresh: () => Promise<void>;
  /** Carrega perfil/configurações ANTES de expor o usuário, evitando redirecionamentos indevidos. */
  setUser: (u: User | null) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AppState | null>(null);

/** Ativa o modo direto da OpenRouter quando há chave própria salva (antes de qualquer tela consultar a IA). */
function applyAI(s: Settings | null) {
  setDirectAIConfig(s?.openrouterKey ? { apiKey: s.openrouterKey, model: s.openrouterModel, visionModel: s.openrouterVisionModel } : null);
}

function applyTheme(theme: Settings['theme'] | undefined) {
  const dark = theme === 'escuro' || (theme !== 'claro' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1511' : '#14513c');
  void applyNativeTheme(dark);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);

  const load = useCallback(async (u: User | null) => {
    if (!u) {
      setSettings(null);
      setConsent(null);
      setQuestionnaire(null);
      applyAI(null);
      applyTheme(undefined);
      return;
    }
    const [s, c, q] = await Promise.all([getSettings(u.id), getConsent(u.id), getQuestionnaire(u.id)]);
    applyAI(s);
    setSettings(s);
    setConsent(c ?? null);
    setQuestionnaire(q ?? null);
    applyTheme(s.theme);
  }, []);

  const refresh = useCallback(async () => {
    const u = await currentUser();
    setUser(u);
    await load(u);
  }, [load]);

  useEffect(() => {
    initNative();
    refresh()
      .catch((e) => console.error('Falha ao abrir o banco local', e))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    startReminderLoop(user.id);
    return () => stopReminderLoop();
  }, [user]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const fn = () => applyTheme(settings?.theme);
    mq?.addEventListener?.('change', fn);
    return () => mq?.removeEventListener?.('change', fn);
  }, [settings?.theme]);

  const value = useMemo<AppState>(() => ({
    loading, user, settings, consent, questionnaire, refresh,
    setUser: async (u) => {
      await load(u);
      setUser(u);
    },
    updateSettings: async (patch) => {
      if (!settings) return;
      const next = { ...settings, ...patch };
      await saveSettings(next);
      applyAI(next);
      setSettings(next);
      applyTheme(next.theme);
    },
    logout: () => {
      doLogout();
      setUser(null);
      void load(null);
    },
  }), [loading, user, settings, consent, questionnaire, refresh, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppProvider');
  return v;
}

/** Para páginas autenticadas: garante usuário não nulo. */
export function useUser(): User {
  const { user } = useApp();
  if (!user) throw new Error('Usuário não autenticado');
  return user;
}
