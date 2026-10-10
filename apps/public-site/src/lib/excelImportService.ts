import * as XLSX from 'xlsx';
import { ProductImportCandidate } from '../types/productImport';

// Helper to sanitize headers
const sanitizeHeader = (h: string) => h.toLowerCase().trim();

// Aliases detection
const ALIASES = {
  nome: ['produto', 'nome', 'nome do produto', 'item', 'descrição do produto', 'title'],
  descricao: ['descrição', 'detalhes', 'observação', 'description'],
  custo: ['custo', 'preço', 'preço de custo', 'valor', 'valor unitário', 'price', 'cost'],
  url: ['url', 'link', 'endereço', 'página do produto'],
  imagens: ['imagem', 'foto', 'image', 'image_url', 'imagens'],
  fornecedor: ['fornecedor', 'loja', 'site', 'supplier'],
  sku: ['sku', 'código', 'cod', 'referência'],
  categoria: ['categoria', 'departamento', 'seção'],
};

export function detectColumnMapping(headers: string[]) {
  const mapping: Record<string, string> = {};
  
  headers.forEach(originalHeader => {
    const clean = sanitizeHeader(originalHeader);
    
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(clean)) {
        if (!mapping[field]) mapping[field] = originalHeader;
        break;
      }
    }
  });
  
  return mapping;
}

export function parseNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  
  // string parsing
  let s = String(val).trim();
  s = s.replace(/R\$\s*/gi, ''); // remove R$
  // 1.234,56 -> 1234.56
  if (s.match(/^\d{1,3}(?:\.\d{3})*,\d{2}$/)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.match(/^\d+,\d+$/)) {
    s = s.replace(',', '.');
  }
  
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export async function processExcelFile(
  file: File, 
  sheetName: string, 
  headerRowIndex: number, 
  mapping: Record<string, string>
): Promise<ProductImportCandidate[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays first to skip rows before header
        const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Skip up to header row
        const dataRows = json.slice(headerRowIndex + 1);
        const headers = json[headerRowIndex] || [];
        
        const candidates: ProductImportCandidate[] = [];
        const fingerprintBase = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.name + file.lastModified));
        const hashBaseStr = Array.from(new Uint8Array(fingerprintBase)).map(b => b.toString(16).padStart(2, '0')).join('');

        dataRows.forEach((row, rowIndex) => {
          // Construct object based on headers
          const rowObj: any = {};
          headers.forEach((h, i) => {
            if (h) rowObj[h] = row[i];
          });
          
          // Skip completely empty rows
          if (Object.keys(rowObj).length === 0) return;

          const nome = mapping.nome ? String(rowObj[mapping.nome] || '').trim() : null;
          if (!nome) return; // Ignore rows without name

          const desc = mapping.descricao ? String(rowObj[mapping.descricao] || '').trim() : null;
          const custoRaw = mapping.custo ? rowObj[mapping.custo] : null;
          const custo = parseNumber(custoRaw);
          const url = mapping.url ? String(rowObj[mapping.url] || '').trim() : null;
          const fornecedor = mapping.fornecedor ? String(rowObj[mapping.fornecedor] || '').trim() : null;
          const sku = mapping.sku ? String(rowObj[mapping.sku] || '').trim() : null;
          const cat = mapping.categoria ? String(rowObj[mapping.categoria] || '').trim() : null;
          
          // Handle images (comma, semicolon, pipe, newline separated)
          let imagens: string[] = [];
          if (mapping.imagens && rowObj[mapping.imagens]) {
            const imgStr = String(rowObj[mapping.imagens]);
            imagens = imgStr.split(/[;,|\n]/).map(s => s.trim()).filter(s => s.startsWith('http'));
          }

          const fingerprint = `${hashBaseStr}-${sheetName}-${rowIndex}`;

          candidates.push({
            client_id: crypto.randomUUID(),
            source_type: 'excel',
            source_reference: file.name,
            source_fingerprint: fingerprint,
            nome,
            descricao: desc || null,
            valor_custo: custo,
            moeda: 'BRL', // default
            imagens,
            url_produto: url || null,
            nome_fornecedor: fornecedor || null,
            categoria_sugerida: cat || null,
            sku: sku || null,
            selecionado: true,
            completo: !!(nome && custo !== null && custo > 0),
            avisos: custo === null || custo === 0 ? ['Custo zerado ou inválido'] : [],
            evidence: {
              planilha: sheetName,
              linha: headerRowIndex + 1 + rowIndex + 1 // 1-indexed
            }
          });
        });

        resolve(candidates);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}

export async function readExcelMetadata(file: File): Promise<{sheets: string[], headers: string[][], preview: any[][]}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        const sheets = workbook.SheetNames;
        const headers: string[][] = [];
        const preview: any[][] = [];
        
        // For first sheet, get headers and preview
        if (sheets.length > 0) {
          const ws = workbook.Sheets[sheets[0]];
          const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          preview.push(...json.slice(0, 10)); // Top 10 rows
          
          // Find first row with most columns (likely header)
          let maxCols = 0;
          let headerRow = 0;
          json.slice(0, 20).forEach((row, i) => {
            const validCols = row.filter(c => c && String(c).trim() !== '').length;
            if (validCols > maxCols) {
              maxCols = validCols;
              headerRow = i;
            }
          });
          
          headers.push(json[headerRow] ? json[headerRow].map(String) : []);
        }
        
        resolve({ sheets, headers, preview });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
