import { Produto } from '../types';

/**
 * Normaliza o código de barras, removendo espaços, hífens e pontos.
 * Preserva zeros à esquerda e não converte para número.
 */
export function normalizeBarcode(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[\s\.\-]/g, '').trim();
}

export type BarcodeType = 'EAN-8' | 'UPC-A' | 'EAN-13' | 'GTIN-14' | 'OUTRO';

/**
 * Detecta automaticamente o tipo de código de barras baseado no tamanho
 * e se contém apenas números.
 */
export function detectBarcodeType(value: string): BarcodeType {
  const norm = normalizeBarcode(value);
  if (!norm) return 'OUTRO';

  // Se tem letras ou tamanho não padrão, é OUTRO
  if (!/^\d+$/.test(norm)) return 'OUTRO';

  switch (norm.length) {
    case 8: return 'EAN-8';
    case 12: return 'UPC-A';
    case 13: return 'EAN-13';
    case 14: return 'GTIN-14';
    default: return 'OUTRO';
  }
}

/**
 * Calcula o dígito verificador padrão para EAN/UPC/GTIN (Módulo 10)
 */
export function calculateGtinCheckDigit(valueWithoutCheckDigit: string): string {
  if (!/^\d+$/.test(valueWithoutCheckDigit)) return '';
  
  let sum = 0;
  // A lógica do GTIN calcula da direita para a esquerda:
  // Posições ímpares multiplicam por 3 (para 13 dígitos) ou 1
  // Para generalizar independentemente do tamanho:
  // Começamos do final e alternamos multiplicadores 3 e 1
  let multiplier = 3;
  for (let i = valueWithoutCheckDigit.length - 1; i >= 0; i--) {
    sum += parseInt(valueWithoutCheckDigit[i]) * multiplier;
    multiplier = multiplier === 3 ? 1 : 3;
  }

  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return checkDigit.toString();
}

/**
 * Valida o código de barras inteiro, incluindo o dígito verificador se for padrão.
 */
export function validateBarcode(value: string, type?: BarcodeType): { isValid: boolean; error?: string } {
  const norm = normalizeBarcode(value);
  if (!norm) return { isValid: false, error: 'Código vazio.' };
  if (/^0+$/.test(norm)) return { isValid: false, error: 'O código de barras não pode ser composto somente por zeros.' };

  const detectedType = type || detectBarcodeType(norm);

  if (detectedType !== 'OUTRO') {
    if (!/^\d+$/.test(norm)) {
      return { isValid: false, error: 'Formatos EAN/UPC/GTIN devem conter apenas números.' };
    }

    const expectedLength = detectedType === 'EAN-8' ? 8 : detectedType === 'UPC-A' ? 12 : detectedType === 'EAN-13' ? 13 : 14;
    if (norm.length !== expectedLength) {
      return { isValid: false, error: `Tamanho incorreto para ${detectedType} (esperado ${expectedLength} dígitos).` };
    }

    const valueWithoutCheckDigit = norm.slice(0, -1);
    const providedCheckDigit = norm.slice(-1);
    const calculatedCheckDigit = calculateGtinCheckDigit(valueWithoutCheckDigit);

    if (providedCheckDigit !== calculatedCheckDigit) {
      return { isValid: false, error: 'O código de barras informado possui dígito verificador inválido.' };
    }
  } else {
    // Validações básicas para OUTRO
    if (norm.length < 2) return { isValid: false, error: 'Código muito curto.' };
    if (norm.length > 50) return { isValid: false, error: 'Código muito longo.' };
  }

  return { isValid: true };
}

/**
 * Retorna o código que deve ser exibido visualmente.
 */
export function getProductDisplayCode(product?: Partial<Produto> | null): string {
  if (!product) return '';
  if (product.identificador_preferencial === 'codigo_barras' && product.codigo_barras) {
    return product.codigo_barras;
  }
  return product.codigo_produto || '';
}

/**
 * Retorna o rótulo do código que está sendo exibido.
 */
export function getProductDisplayCodeLabel(product?: Partial<Produto> | null): string {
  if (!product) return 'Código interno';
  if (product.identificador_preferencial === 'codigo_barras' && product.codigo_barras) {
    return product.tipo_codigo_barras && product.tipo_codigo_barras !== 'OUTRO' 
      ? product.tipo_codigo_barras 
      : 'Código de barras';
  }
  return 'Código interno';
}
