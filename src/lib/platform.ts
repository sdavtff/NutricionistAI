// Detecção de plataforma e endereço do servidor de IA.
// No navegador, a API fica na mesma origem (/api). No app Android (Capacitor), a página é servida
// de https://localhost, então é preciso informar a URL do servidor intermediário.
import { Capacitor } from '@capacitor/core';

const API_KEY = 'nutri.apiBase';

export const isNative = () => Capacitor.isNativePlatform();

export function getApiBase(): string {
  try {
    const saved = localStorage.getItem(API_KEY);
    if (saved) return saved;
  } catch {
    /* ignora */
  }
  return (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
}

export function setApiBase(url: string) {
  const clean = url.trim().replace(/\/+$/, '');
  try {
    if (clean) localStorage.setItem(API_KEY, clean);
    else localStorage.removeItem(API_KEY);
  } catch {
    /* ignora */
  }
}

export function validateApiBase(url: string): string | null {
  const v = url.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Use um endereço http:// ou https://.';
    return null;
  } catch {
    return 'Endereço inválido. Exemplo: https://meu-servidor.com';
  }
}

/** URL completa de uma rota da API. */
export function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}

/** No app nativo, sem servidor configurado, não há como chegar à IA. */
export function apiConfigured(): boolean {
  return !isNative() || getApiBase() !== '';
}
