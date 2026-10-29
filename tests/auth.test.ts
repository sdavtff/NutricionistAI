import { describe, expect, it } from 'vitest';
import { findUserByEmail, getConsent } from '../src/db/repo';
import { AuthError, changePassword, currentUser, login, logout, register, resetPasswordWithCode } from '../src/services/auth';

const base = { name: 'Ana Souza', email: 'Ana@Exemplo.com', password: 'Senha123', confirm: 'Senha123', consent: { personalData: true, aiProcessing: false } };

describe('autenticação local', () => {
  it('valida campos do cadastro', async () => {
    await expect(register({ ...base, email: 'invalido' })).rejects.toThrow(/e-mail válido/);
    await expect(register({ ...base, password: 'curta', confirm: 'curta' })).rejects.toThrow(/8 caracteres/);
    await expect(register({ ...base, confirm: 'Outra123' })).rejects.toThrow(/não coincidem/);
    await expect(register({ ...base, name: '' })).rejects.toThrow(/nome/);
    await expect(register({ ...base, consent: { personalData: false, aiProcessing: false } })).rejects.toThrow(/aceitar/);
  });

  it('cadastra sem guardar a senha em texto puro e inicia sessão', async () => {
    const { user, recoveryCode } = await register(base);
    expect(user.email).toBe('ana@exemplo.com');
    const stored = await findUserByEmail('ana@exemplo.com');
    expect(JSON.stringify(stored)).not.toContain('Senha123');
    expect(JSON.stringify(stored)).not.toContain(recoveryCode);
    expect(stored!.passwordHash).toHaveLength(44);
    expect((await currentUser())?.id).toBe(user.id);
    expect((await getConsent(user.id))?.aiProcessing).toBe(false);
  });

  it('impede e-mail duplicado', async () => {
    await register(base);
    await expect(register({ ...base, email: 'ana@exemplo.com' })).rejects.toThrow(/Já existe/);
  });

  it('faz login, rejeita senha errada com mensagem genérica e bloqueia após 5 tentativas', async () => {
    await register(base);
    logout();
    expect(await currentUser()).toBeNull();
    await expect(login('ana@exemplo.com', 'Errada123')).rejects.toThrow('E-mail ou senha incorretos.');
    await expect(login('naoexiste@exemplo.com', 'Errada123')).rejects.toThrow('E-mail ou senha incorretos.');
    const u = await login('ANA@exemplo.com', 'Senha123');
    expect(u.name).toBe('Ana Souza');
    for (let i = 0; i < 5; i++) await login('ana@exemplo.com', 'Errada123').catch(() => undefined);
    await expect(login('ana@exemplo.com', 'Senha123')).rejects.toThrow(/Muitas tentativas/);
  }, 30_000);

  it('recupera a senha com o código local e invalida o código antigo', async () => {
    const { recoveryCode } = await register(base);
    logout();
    await expect(resetPasswordWithCode('ana@exemplo.com', 'AAAA-BBBB-CCCC-DDDD', 'Nova1234', 'Nova1234')).rejects.toBeInstanceOf(AuthError);
    const newCode = await resetPasswordWithCode('ana@exemplo.com', recoveryCode.toLowerCase(), 'Nova1234', 'Nova1234');
    expect(newCode).not.toBe(recoveryCode);
    await expect(login('ana@exemplo.com', 'Senha123')).rejects.toThrow();
    await login('ana@exemplo.com', 'Nova1234');
    await expect(resetPasswordWithCode('ana@exemplo.com', recoveryCode, 'Outra1234', 'Outra1234')).rejects.toThrow();
  }, 30_000);

  it('altera a senha exigindo a senha atual', async () => {
    const { user } = await register(base);
    await expect(changePassword(user.id, 'errada', 'Nova1234', 'Nova1234')).rejects.toThrow(/atual/);
    await changePassword(user.id, 'Senha123', 'Nova1234', 'Nova1234');
    logout();
    await login('ana@exemplo.com', 'Nova1234');
  }, 30_000);
});
