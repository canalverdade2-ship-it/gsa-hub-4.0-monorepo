import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const formatCurrency = (value: any) => {
  const num = Number(value);
  const safeValue = isNaN(num) ? 0 : num;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(safeValue);
};

export const formatShortId = (prefix: string, rawId?: string | null) => {
  if (!rawId) return '—';
  const str = String(rawId).trim();
  if (str.length >= 32) {
    const clean = str.replaceAll('-', '').toUpperCase();
    return `${prefix}-${clean.slice(0, 8)}`;
  }
  return str.toUpperCase().startsWith(prefix.toUpperCase()) ? str.toUpperCase() : `${prefix}-${str.toUpperCase()}`;
};

export const formatLancamentoDescricao = (rawDescricao?: string | null): { titulo: string; autor?: string; detalhe?: string } => {
  if (!rawDescricao || !rawDescricao.trim()) {
    return { titulo: 'Lançamento de Pontos' };
  }

  let text = rawDescricao.trim();
  let autor: string | undefined;

  // Extrair [POR: Nome / Cargo] se existir
  const porMatch = text.match(/\[POR:\s*([^\]]+)\]/i);
  if (porMatch) {
    autor = porMatch[1].trim();
    text = text.replace(/\[POR:[^\]]+\]/gi, '').trim();
  }

  // Limpar prefixos e sufixos técnicos feios
  text = text.replace(/\(Admin\)/gi, '').trim();
  text = text.replace(/^Ajuste manual de pontos$/i, 'Ajuste de Pontos');
  text = text.replace(/^Ajuste manual de saldo$/i, 'Ajuste de Saldo');
  text = text.replace(/^Lancamento manual de credito$/i, 'Crédito Adicionado');
  text = text.replace(/^Lancamento manual de debito$/i, 'Débito Realizado');

  // Se ficou vazio após limpeza
  if (!text) {
    text = 'Ajuste de Pontos';
  }

  return {
    titulo: text,
    autor: autor && autor !== 'Administrador' && autor !== 'admin' ? autor : undefined
  };
};

export const formatDate = (date: string | Date | null | undefined) => {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';

    // Se a string é só data (yyyy-MM-dd), interpreta como local para não sofrer deslocamento de fuso
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-').map(Number);
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }

    // Para timestamps com fuso, renderiza no timezone de Brasília (UTC-3)
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch (e) {
    return '-';
  }
};

export const formatDateTime = (date: string | Date | null | undefined) => {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';

    // Renderiza data e hora sempre no fuso de Brasília para evitar deslocamento UTC
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return '-';
  }
};

export const maskCPF = (value: string | null | undefined) => {
  if (!value) return '';
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

export const maskCNPJ = (value: string | null | undefined) => {
  if (!value) return '';
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

export const maskPhone = (value: string | null | undefined) => {
  if (!value) return '';
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
};

export const maskCEP = (value: string | null | undefined) => {
  if (!value) return '';
  return value
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{3})\d+?$/, '$1');
};

function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error('maxExclusive deve ser positivo');
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    const buffer = new Uint32Array(1);
    do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
    return buffer[0] % maxExclusive;
  }
  throw new Error('Gerador criptográfico indisponível neste ambiente.');
}

export const generateSecureNumericCode = (length = 8) => {
  if (!Number.isInteger(length) || length < 6 || length > 12) throw new Error('Comprimento de credencial inválido.');
  return Array.from({ length }, () => String(secureRandomInt(10))).join('');
};

export const generateCode = (prefix: string) => {
  const random = generateSecureNumericCode(8);
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}-${timestamp}${random}`;
};

export const generateSequentialCode = (prefix: string, count: number) => {
  return `${prefix}-${(count + 1).toString().padStart(6, '0')}`;
};

export const generateUUID = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    // Fallback if randomUUID fails for some reason (e.g. non-secure HTTP context)
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const handleError = (error: any, defaultMessage: string) => {
  console.error('Erro detalhado:', error);
  const message = error?.message || error?.details || error?.hint || 'Erro desconhecido';
  return `${defaultMessage}: ${message}`;
};

export const copyToClipboard = async (text: string) => {
  if (!text) return false;
  
  // Try modern API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Modern clipboard API failed:', err);
    }
  }

  // Fallback to execCommand
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Ensure the textarea is off-screen
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback clipboard copy failed:', err);
    return false;
  }
};

export const getMonthYearFromDate = (date: string | Date | null | undefined) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, 'MM/yyyy', { locale: ptBR });
};

export const playPremiumBeep = () => {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // Mi 5
    oscillator.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.1); // La 4

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.warn('Áudio não suportado ou bloqueado pelo navegador:', e);
  }
};
export const maskCurrency = (value: number | string) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

export const unmaskCurrency = (value: string): number => {
  if (!value) return 0;
  const cleanValue = value.replace(/\D/g, '');
  return parseInt(cleanValue, 10) / 100;
};

export const handleCurrencyInputChange = (value: string, callback: (num: number) => void) => {
  // Remove tudo que não é dígito
  const digits = value.replace(/\D/g, '');
  
  // Se não houver dígitos, define como 0
  if (!digits || digits === '') {
    callback(0);
    return;
  }

  // Converte para número dividindo por 100 para manter os centavos
  const numericValue = parseInt(digits, 10) / 100;
  callback(numericValue);
};

export const isLocalDevHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.lan')
  ) {
    return true;
  }
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
};


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
