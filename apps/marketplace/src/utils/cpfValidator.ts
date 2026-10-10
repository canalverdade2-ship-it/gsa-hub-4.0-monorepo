/**
 * Validação de CPF brasileiro
 * Verifica se o CPF tem formato válido e dígitos verificadores corretos
 */
export function validarCPF(cpf: string): boolean {
  // Remove caracteres não numéricos
  const cleaned = cpf.replace(/\D/g, '');

  // Deve ter 11 dígitos
  if (cleaned.length !== 11) return false;

  // Rejeitar CPFs com todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(cleaned)) return false;

  // Validar primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cleaned.charAt(9))) return false;

  // Validar segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cleaned.charAt(10))) return false;

  return true;
}

/**
 * Formatar CPF com máscara: 000.000.000-00
 */
export function formatarCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '');
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Máscara de CPF para input
 */
export function mascararCPF(value: string): string {
  const cleaned = value.replace(/\D/g, '').slice(0, 11);
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
  if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
}

/**
 * Máscara de RG para input
 */
export function mascararRG(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12);
}

/**
 * Máscara de telefone: (00) 00000-0000
 */
export function mascararTelefone(value: string): string {
  const cleaned = value.replace(/\D/g, '').slice(0, 11);
  if (cleaned.length <= 2) return cleaned.length ? `(${cleaned}` : '';
  if (cleaned.length <= 7) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
  return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
}

/**
 * Máscara de CEP: 00000-000
 */
export function mascararCEP(value: string): string {
  const cleaned = value.replace(/\D/g, '').slice(0, 8);
  if (cleaned.length <= 5) return cleaned;
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
}

/**
 * Validação de CNPJ brasileiro
 */
export function validarCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return false;
  
  // Rejeitar CNPJs com todos os dígitos iguais
  if (/^(\d)\1{13}$/.test(cleaned)) return false;

  let size = cleaned.length - 2;
  let numbers = cleaned.substring(0, size);
  const digits = cleaned.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = cleaned.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

/**
 * Validação de E-mail
 */
export function validarEmail(email: string): boolean {
  if (!email) return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.toLowerCase());
}

/**
 * Validação genérica de documento (CPF ou CNPJ)
 */
export function isDocumentValid(value: string): boolean {
  const cleaned = (value || '').replace(/\D/g, '');
  if (cleaned.length === 11) return validarCPF(cleaned);
  if (cleaned.length === 14) return validarCNPJ(cleaned);
  return false;
}
