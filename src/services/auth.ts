// Autenticação 100% local. As contas existem apenas neste dispositivo/navegador.
// Senhas e códigos de recuperação são armazenados somente como hash PBKDF2 com sal aleatório.
import { findUserByEmail, getUser, putUser, saveConsent, saveSettings, defaultSettings, uid } from '../db/repo';
import type { User } from '../db/types';
import { hashPassword, PBKDF2_ITERATIONS, randomSalt, safeEqual } from '../lib/crypto';
import { validateEmail, validateName, validatePassword } from '../lib/validation';

const SESSION_KEY = 'nutri.session';
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

export class AuthError extends Error {}

interface Session {
  userId: string;
  expiresAt: number;
}

export function generateRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function register(input: {
  name: string; email: string; password: string; confirm: string; consent: { personalData: boolean; aiProcessing: boolean };
}): Promise<{ user: User; recoveryCode: string }> {
  const err = validateName(input.name) || validateEmail(input.email) || validatePassword(input.password);
  if (err) throw new AuthError(err);
  if (input.password !== input.confirm) throw new AuthError('As senhas não coincidem.');
  if (!input.consent.personalData) throw new AuthError('É necessário aceitar o tratamento local dos dados para usar o app.');
  const email = input.email.trim().toLowerCase();
  if (await findUserByEmail(email)) throw new AuthError('Já existe uma conta com este e-mail neste dispositivo.');

  const salt = randomSalt();
  const recoveryCode = generateRecoveryCode();
  const recoverySalt = randomSalt();
  const user: User = {
    id: uid(),
    name: input.name.trim(),
    email,
    passwordSalt: salt,
    passwordHash: await hashPassword(input.password, salt),
    passwordIterations: PBKDF2_ITERATIONS,
    recoverySalt,
    recoveryHash: await hashPassword(normalizeCode(recoveryCode), recoverySalt),
    createdAt: Date.now(),
    failedAttempts: 0,
  };
  await putUser(user);
  await saveConsent({
    userId: user.id, personalData: true, aiProcessing: input.consent.aiProcessing, aiShareProfile: input.consent.aiProcessing,
    acceptedAt: Date.now(), version: 1,
  });
  await saveSettings(defaultSettings(user.id));
  startSession(user.id);
  return { user, recoveryCode };
}

export async function login(emailRaw: string, password: string): Promise<User> {
  const emailErr = validateEmail(emailRaw);
  if (emailErr) throw new AuthError(emailErr);
  if (!password) throw new AuthError('Informe sua senha.');
  const user = await findUserByEmail(emailRaw);
  // Mensagem genérica para não revelar se o e-mail existe.
  const generic = 'E-mail ou senha incorretos.';
  if (!user) {
    await hashPassword(password, randomSalt(), 10_000); // reduz diferença de tempo
    throw new AuthError(generic);
  }
  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    const min = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new AuthError(`Muitas tentativas. Tente novamente em ${min} min.`);
  }
  const hash = await hashPassword(password, user.passwordSalt, user.passwordIterations);
  if (!safeEqual(hash, user.passwordHash)) {
    const attempts = user.failedAttempts + 1;
    await putUser({ ...user, failedAttempts: attempts >= MAX_ATTEMPTS ? 0 : attempts, lockedUntil: attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : user.lockedUntil });
    throw new AuthError(generic);
  }
  const updated = { ...user, failedAttempts: 0, lockedUntil: undefined, lastLoginAt: Date.now() };
  await putUser(updated);
  startSession(user.id);
  return updated;
}

export async function resetPasswordWithCode(emailRaw: string, code: string, newPassword: string, confirm: string): Promise<string> {
  const err = validateEmail(emailRaw) || validatePassword(newPassword);
  if (err) throw new AuthError(err);
  if (newPassword !== confirm) throw new AuthError('As senhas não coincidem.');
  const user = await findUserByEmail(emailRaw);
  const generic = 'E-mail ou código de recuperação inválidos.';
  if (!user) throw new AuthError(generic);
  if (user.lockedUntil && user.lockedUntil > Date.now()) throw new AuthError('Muitas tentativas. Aguarde alguns minutos.');
  const h = await hashPassword(normalizeCode(code), user.recoverySalt);
  if (!safeEqual(h, user.recoveryHash)) {
    const attempts = user.failedAttempts + 1;
    await putUser({ ...user, failedAttempts: attempts >= MAX_ATTEMPTS ? 0 : attempts, lockedUntil: attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : user.lockedUntil });
    throw new AuthError(generic);
  }
  // Novo código de recuperação: o antigo deixa de valer.
  const newCode = generateRecoveryCode();
  const salt = randomSalt();
  const recoverySalt = randomSalt();
  await putUser({
    ...user,
    passwordSalt: salt,
    passwordHash: await hashPassword(newPassword, salt),
    passwordIterations: PBKDF2_ITERATIONS,
    recoverySalt,
    recoveryHash: await hashPassword(normalizeCode(newCode), recoverySalt),
    failedAttempts: 0,
    lockedUntil: undefined,
  });
  return newCode;
}

export async function changePassword(userId: string, current: string, next: string, confirm: string) {
  const user = await getUser(userId);
  if (!user) throw new AuthError('Usuário não encontrado.');
  const h = await hashPassword(current, user.passwordSalt, user.passwordIterations);
  if (!safeEqual(h, user.passwordHash)) throw new AuthError('A senha atual está incorreta.');
  const err = validatePassword(next);
  if (err) throw new AuthError(err);
  if (next !== confirm) throw new AuthError('As senhas não coincidem.');
  const salt = randomSalt();
  await putUser({ ...user, passwordSalt: salt, passwordHash: await hashPassword(next, salt), passwordIterations: PBKDF2_ITERATIONS });
}

export async function updateProfile(userId: string, name: string, email: string) {
  const err = validateName(name) || validateEmail(email);
  if (err) throw new AuthError(err);
  const user = await getUser(userId);
  if (!user) throw new AuthError('Usuário não encontrado.');
  const normalized = email.trim().toLowerCase();
  if (normalized !== user.email) {
    const other = await findUserByEmail(normalized);
    if (other && other.id !== userId) throw new AuthError('Já existe uma conta com este e-mail neste dispositivo.');
  }
  const updated = { ...user, name: name.trim(), email: normalized };
  await putUser(updated);
  return updated;
}

function startSession(userId: string) {
  const s: Session = { userId, expiresAt: Date.now() + SESSION_DAYS * 86400000 };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível: sessão dura só enquanto a página estiver aberta */
  }
  memorySession = s;
}

let memorySession: Session | null = null;

export async function currentUser(): Promise<User | null> {
  let s = memorySession;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) s = JSON.parse(raw) as Session;
  } catch {
    /* ignora */
  }
  if (!s || s.expiresAt < Date.now()) return null;
  return (await getUser(s.userId)) ?? null;
}

export function logout() {
  memorySession = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignora */
  }
}
