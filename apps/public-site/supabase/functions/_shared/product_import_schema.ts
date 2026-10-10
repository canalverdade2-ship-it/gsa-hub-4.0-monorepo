export interface ExtractedProduct {
  name: string;
  description: string | null;
  cost: number | null;
  currency: string | null;
  supplier: string | null;
  product_url: string | null;
  sku: string | null;
  barcode: string | null;
  page: number | null;
  confidence: number;
  evidence: string | null;
}

export interface ExtractedPayload {
  products: ExtractedProduct[];
  warnings: string[];
}

export const PRODUCT_IMPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          cost: { type: ["number", "null"], minimum: 0 },
          currency: { type: ["string", "null"] },
          supplier: { type: ["string", "null"] },
          product_url: { type: ["string", "null"] },
          sku: { type: ["string", "null"] },
          barcode: { type: ["string", "null"] },
          page: { type: ["integer", "null"], minimum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: { type: ["string", "null"] }
        },
        required: ["name", "confidence"],
        additionalProperties: false
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["products"],
  additionalProperties: false
};

const WINDOWS_1252_BYTE_BY_CODE_POINT = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function windows1252Bytes(value: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return null;

    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const mapped = WINDOWS_1252_BYTE_BY_CODE_POINT.get(codePoint);
    if (mapped === undefined) return null;
    bytes.push(mapped);
  }
  return new Uint8Array(bytes);
}

// Repara textos UTF-8 que foram decodificados indevidamente como Windows-1252.
// A conversão só é aceita quando o resultado é UTF-8 válido, sem caractere de
// substituição, evitando alterar textos Unicode que já estejam corretos.
export function fixUtf8Encoding(value: string): string {
  if (!/[ÃÂ]/.test(value)) return value;

  try {
    const bytes = windows1252Bytes(value);
    if (!bytes) return value;

    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded.includes("\uFFFD") ? value : decoded;
  } catch {
    return value;
  }
}

export function validateAndNormalizeProducts(raw: any): ExtractedPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error("Payload retornado não é um objeto válido.");
  }

  const productsRaw = raw.products;
  if (!Array.isArray(productsRaw)) {
    throw new Error("A propriedade 'products' deve ser uma lista.");
  }

  const normalizedProducts: ExtractedProduct[] = [];
  const warnings: string[] = Array.isArray(raw.warnings) ? raw.warnings.map((w: any) => fixUtf8Encoding(String(w))) : [];

  for (let i = 0; i < productsRaw.length; i++) {
    const p = productsRaw[i];
    if (!p || typeof p !== 'object') continue;

    // Check required fields
    if (typeof p.name !== 'string' || !p.name.trim()) {
      continue; // Skip products without a valid name
    }

    let confidence = Number(p.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      confidence = 0.5; // fallback default
    }

    // Clean and validate cost
    let cost: number | null = null;
    if (p.cost !== undefined && p.cost !== null) {
      if (typeof p.cost === 'number') {
        if (p.cost >= 0) cost = p.cost;
      } else {
        let str = String(p.cost).trim();
        str = str.replace(/R\$\s?/gi, ''); // remove currency symbol
        // clean up thousands/decimals formatting
        if (str.includes(',') && !str.includes('.')) {
          str = str.replace(',', '.');
        } else if (str.includes(',') && str.includes('.')) {
          if (str.indexOf('.') < str.indexOf(',')) {
            str = str.replace(/\./g, '').replace(',', '.');
          } else {
            str = str.replace(/,/g, '');
          }
        }
        const val = parseFloat(str);
        if (!isNaN(val) && val >= 0) {
          cost = val;
        }
      }
    }

    // Clean page
    let page: number | null = null;
    if (p.page !== undefined && p.page !== null) {
      const val = parseInt(p.page, 10);
      if (!isNaN(val) && val >= 1) {
        page = val;
      }
    }

    // Clean string values, sanitize HTML/script tags if present
    const cleanString = (val: any): string | null => {
      if (val === undefined || val === null) return null;
      let str = String(val).trim();
      str = str.replace(/<[^>]*>/g, ''); // Simple script/HTML stripping
      return fixUtf8Encoding(str);
    };

    // Clean barcode
    let barcode = cleanString(p.barcode || p.ean);
    if (barcode) {
      // Basic EAN validation helper
      barcode = barcode.replace(/[^0-9]/g, '');
      if (barcode.length < 8 || barcode.length > 14) {
        barcode = null; // invalid barcode size
      }
    }

    normalizedProducts.push({
      name: fixUtf8Encoding(p.name.trim()).substring(0, 150),
      description: cleanString(p.description)?.substring(0, 500) || null,
      cost: cost,
      currency: cleanString(p.currency)?.substring(0, 3) || "BRL",
      supplier: cleanString(p.supplier)?.substring(0, 100) || null,
      product_url: cleanString(p.product_url)?.substring(0, 500) || null,
      sku: cleanString(p.sku)?.substring(0, 50) || null,
      barcode: barcode,
      page: page,
      confidence: confidence,
      evidence: cleanString(p.evidence)?.substring(0, 500) || null
    });
  }

  // Cap products at 500 to protect application performance
  const cappedProducts = normalizedProducts.slice(0, 500);

  return {
    products: cappedProducts,
    warnings
  };
}
