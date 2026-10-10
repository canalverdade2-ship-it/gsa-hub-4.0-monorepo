import Papa from 'papaparse';
import { ProductImportCandidate } from '../types/productImport';
import { detectColumnMapping, parseNumber } from './excelImportService';

export async function processCsvText(
  file: File, 
  mapping: Record<string, string>,
  delimiter: string = ''
): Promise<ProductImportCandidate[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: delimiter,
      complete: async (results) => {
        try {
          const candidates: ProductImportCandidate[] = [];
          const fingerprintBase = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.name + file.lastModified));
          const hashBaseStr = Array.from(new Uint8Array(fingerprintBase)).map(b => b.toString(16).padStart(2, '0')).join('');

          results.data.forEach((rowObj: any, rowIndex) => {
            const nome = mapping.nome ? String(rowObj[mapping.nome] || '').trim() : null;
            if (!nome) return;

            const desc = mapping.descricao ? String(rowObj[mapping.descricao] || '').trim() : null;
            const custoRaw = mapping.custo ? rowObj[mapping.custo] : null;
            const custo = parseNumber(custoRaw);
            const url = mapping.url ? String(rowObj[mapping.url] || '').trim() : null;
            const fornecedor = mapping.fornecedor ? String(rowObj[mapping.fornecedor] || '').trim() : null;
            const sku = mapping.sku ? String(rowObj[mapping.sku] || '').trim() : null;
            const cat = mapping.categoria ? String(rowObj[mapping.categoria] || '').trim() : null;

            let imagens: string[] = [];
            if (mapping.imagens && rowObj[mapping.imagens]) {
              const imgStr = String(rowObj[mapping.imagens]);
              imagens = imgStr.split(/[;,|\n]/).map(s => s.trim()).filter(s => s.startsWith('http'));
            }

            candidates.push({
              client_id: crypto.randomUUID(),
              source_type: 'txt',
              source_reference: file.name,
              source_fingerprint: `${hashBaseStr}-csv-${rowIndex}`,
              nome,
              descricao: desc || null,
              valor_custo: custo,
              moeda: 'BRL',
              imagens,
              url_produto: url || null,
              nome_fornecedor: fornecedor || null,
              categoria_sugerida: cat || null,
              sku: sku || null,
              selecionado: true,
              completo: !!(nome && custo !== null && custo > 0),
              avisos: custo === null || custo === 0 ? ['Custo zerado ou inválido'] : [],
              evidence: {
                linha: rowIndex + 1
              }
            });
          });
          resolve(candidates);
        } catch (err) {
          reject(err);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

export async function processBlockText(
  file: File
): Promise<ProductImportCandidate[]> {
  const text = await file.text();
  const lines = text.split('\n').map(l => l.trim());
  
  const candidates: ProductImportCandidate[] = [];
  let currentObj: any = null;
  let currentLines: string[] = [];
  
  const fingerprintBase = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.name + file.lastModified));
  const hashBaseStr = Array.from(new Uint8Array(fingerprintBase)).map(b => b.toString(16).padStart(2, '0')).join('');

  let index = 0;

  const pushCurrent = () => {
    if (currentObj && currentObj.nome) {
      const custo = parseNumber(currentObj.preco || currentObj.custo || currentObj.valor);
      
      let imagens: string[] = [];
      if (currentObj.imagem) {
        imagens = [currentObj.imagem];
      }

      candidates.push({
        client_id: crypto.randomUUID(),
        source_type: 'txt',
        source_reference: file.name,
        source_fingerprint: `${hashBaseStr}-block-${index}`,
        nome: currentObj.nome || currentObj.produto,
        descricao: currentObj.descricao || currentObj.detalhes || null,
        valor_custo: custo,
        moeda: 'BRL',
        imagens,
        url_produto: currentObj.url || currentObj.link || null,
        nome_fornecedor: currentObj.fornecedor || null,
        categoria_sugerida: currentObj.categoria || null,
        sku: currentObj.sku || null,
        selecionado: true,
        completo: !!(currentObj.nome && custo !== null && custo > 0),
        avisos: custo === null || custo === 0 ? ['Custo zerado ou inválido'] : [],
        evidence: {
          trecho: currentLines.join('\n')
        }
      });
      index++;
    }
    currentObj = {};
    currentLines = [];
  };

  pushCurrent();

  for (const line of lines) {
    if (!line) {
      if (currentLines.length > 0) pushCurrent();
      continue;
    }
    
    currentLines.push(line);
    
    const match = line.match(/^([^:]+):\s*(.*)$/i);
    if (match) {
      const key = match[1].toLowerCase().trim();
      const val = match[2].trim();
      currentObj[key] = val;
    }
  }
  pushCurrent();

  return candidates;
}
