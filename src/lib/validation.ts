// Validações de formulário reutilizáveis. Retornam a mensagem de erro (pt-BR) ou null.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | null {
  const v = email.trim();
  if (!v) return 'Informe seu e-mail.';
  if (v.length > 254 || !EMAIL_RE.test(v)) return 'Digite um e-mail válido (ex.: nome@exemplo.com).';
  return null;
}

export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('ao menos 8 caracteres');
  if (!/[a-zà-ú]/.test(pw)) issues.push('uma letra minúscula');
  if (!/[A-ZÀ-Ú]/.test(pw)) issues.push('uma letra maiúscula');
  if (!/\d/.test(pw)) issues.push('um número');
  if (pw.length > 128) issues.push('no máximo 128 caracteres');
  return issues;
}

export function validatePassword(pw: string): string | null {
  if (!pw) return 'Informe uma senha.';
  const issues = passwordIssues(pw);
  return issues.length ? `A senha precisa ter ${issues.join(', ')}.` : null;
}

export function validateName(name: string): string | null {
  const v = name.trim();
  if (!v) return 'Informe seu nome.';
  if (v.length < 2) return 'O nome precisa ter ao menos 2 letras.';
  if (v.length > 80) return 'O nome pode ter no máximo 80 caracteres.';
  return null;
}

export function validateNumber(
  value: unknown,
  { min, max, label, required = true, integer = false }: { min: number; max: number; label: string; required?: boolean; integer?: boolean },
): string | null {
  if (value === '' || value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) {
    return required ? `Informe ${label}.` : null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return `${capitalize(label)} deve ser um número.`;
  if (integer && !Number.isInteger(n)) return `${capitalize(label)} deve ser um número inteiro.`;
  if (n < min || n > max) return `${capitalize(label)} deve estar entre ${min} e ${max}.`;
  return null;
}

export function cleanText(s: string | undefined, max = 500): string {
  return (s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseDecimal(input: string): number {
  return Number(String(input).replace(',', '.'));
}
