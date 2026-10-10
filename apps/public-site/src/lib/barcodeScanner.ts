import { BarcodeType, normalizeBarcode, detectBarcodeType, validateBarcode } from './productIdentification';

export interface BarcodeDetectionResult {
  rawValue: string;
  normalizedValue: string;
  detectedFormat: string;
}

export interface ProcessedBarcodeResult {
  isValid: boolean;
  value: string;
  type: BarcodeType;
  error?: string;
  isQrCode?: boolean;
}

/**
 * Mapeia o formato detectado pela API nativa (BarcodeDetector) para um formato interno.
 */
export function mapNativeFormat(nativeFormat: string): string {
  switch (nativeFormat) {
    case 'ean_8': return 'EAN-8';
    case 'upc_a': return 'UPC-A';
    case 'ean_13': return 'EAN-13';
    case 'itf': return 'GTIN-14';
    case 'code_128': return 'OUTRO';
    case 'code_39': return 'OUTRO';
    case 'qr_code': return 'QR_CODE';
    default: return 'OUTRO';
  }
}

/**
 * Mapeia o formato numérico retornado pelo ZXing (BarcodeFormat) para um formato interno.
 */
export function mapZXingFormat(zxingFormatId: number): string {
  // Valores do enum BarcodeFormat no @zxing/library
  switch (zxingFormatId) {
    case 7: return 'EAN-8';
    case 14: return 'UPC-A';
    case 8: return 'EAN-13';
    case 9: return 'GTIN-14'; // ITF
    case 4: return 'OUTRO'; // CODE_128
    case 3: return 'OUTRO'; // CODE_39
    case 11: return 'QR_CODE';
    default: return 'OUTRO';
  }
}

/**
 * Processa a string lida e retorna a validação completa baseada nas regras de produto.
 * Deve ser usado por qualquer fonte: 'manual', 'usb_reader' ou 'camera'.
 */
export function processBarcodeValue(rawValue: string, mappedFormat: string = 'UNKNOWN'): ProcessedBarcodeResult {
  if (!rawValue) {
    return { isValid: false, value: '', type: 'OUTRO', error: 'Código vazio.' };
  }

  const normalized = normalizeBarcode(rawValue);
  
  if (/^0+$/.test(normalized)) {
    return { isValid: false, value: normalized, type: 'OUTRO', error: 'O código de barras não pode ser composto somente por zeros.' };
  }

  // Previne leitura de QR Code como produto (a não ser que a lógica mude no futuro)
  if (mappedFormat === 'QR_CODE') {
    return { 
      isValid: false, 
      value: normalized, 
      type: 'OUTRO', 
      isQrCode: true,
      error: 'Foi identificado um QR Code. Aponte para o código de barras EAN, UPC ou GTIN do produto.' 
    };
  }

  // Se for muito longo e for detectado como OUTRO ou QR_CODE fallback, rejeitamos
  if (normalized.length > 50 || normalized.startsWith('http')) {
    return { 
      isValid: false, 
      value: normalized, 
      type: 'OUTRO', 
      error: 'O formato lido não parece ser um código de produto (URL ou texto longo).' 
    };
  }

  const detectedType = detectBarcodeType(normalized);
  const localValidation = validateBarcode(normalized, detectedType);

  if (!localValidation.isValid) {
    return { 
      isValid: false, 
      value: normalized, 
      type: detectedType, 
      error: localValidation.error || 'Código inválido.' 
    };
  }

  return {
    isValid: true,
    value: normalized,
    type: detectedType,
  };
}
