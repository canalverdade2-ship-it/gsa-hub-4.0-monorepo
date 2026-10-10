import fs from 'fs';
import path from 'path';

const clientDir = path.resolve('src/components/client');
const projectRoot = path.resolve('.');

console.log('=== ADVERSARIAL STRESS TEST: FRONTEND CLIENT COMPONENTS ===');
console.log('Target directory:', clientDir);

const results = {
  totalFiles: 0,
  replacementCharMatches: [],
  mojibakeMatches: [],
  syntaxArtifacts: [],
  unresolvedImports: [],
  unbalancedTags: [],
  suspiciousMapCalls: [],
  brokenFragments: []
};

function getAllFiles(dir, exts = ['.ts', '.tsx']) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const clientFiles = getAllFiles(clientDir);
results.totalFiles = clientFiles.length;
console.log(`Found ${clientFiles.length} client files (.ts, .tsx).`);

const mojibakeRegex = /(Ã¡|Ã©|Ã­|Ã³|Ãº|Ã£|Ãµ|Ã¢|Ãª|Ã´|Ã§|Ã€|Ã|Ã‰|Ã|Ã“|Ãš|Ãƒ|Ã•|Ã‚|ÃŠ|Ã”|Ã‡|â‚¬|â€™|â€œ|â€|Âº|Âª)/g;
const artifactRegexes = [
  { name: 'inputMode artifact', regex: /=\s*inputMode\s*=\s*"[^"]*">/g },
  { name: 'Git conflict marker', regex: /^(<{7}|={7}|>{7})/m },
  { name: 'Dangling JSX assignment', regex: /<\w+[^>]*\s+=\s*(?:>|\s)/g },
];

for (const filePath of clientFiles) {
  const relPath = path.relative(projectRoot, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 1. Unicode replacement character check
  if (content.includes('\uFFFD')) {
    const matches = [];
    lines.forEach((line, idx) => {
      if (line.includes('\uFFFD')) {
        matches.push({ line: idx + 1, content: line.trim() });
      }
    });
    results.replacementCharMatches.push({ file: relPath, count: matches.length, lines: matches.slice(0, 5) });
  }

  // 2. Mojibake pattern check
  const mojibakeFound = [];
  lines.forEach((line, idx) => {
    // Exclude comments or regex literals if possible, but let's check matches
    const m = line.match(mojibakeRegex);
    if (m) {
      mojibakeFound.push({ line: idx + 1, matched: m, snippet: line.trim() });
    }
  });
  if (mojibakeFound.length > 0) {
    results.mojibakeMatches.push({ file: relPath, count: mojibakeFound.length, details: mojibakeFound.slice(0, 5) });
  }

  // 3. Syntax artifacts check
  for (const art of artifactRegexes) {
    if (art.regex.test(content)) {
      results.syntaxArtifacts.push({ file: relPath, artifact: art.name });
    }
  }

  // 4. Broken fragments (<> vs </>)
  const openFrags = (content.match(/<>|<React\.Fragment>/g) || []).length;
  const closeFrags = (content.match(/<\/>|<\/React\.Fragment>/g) || []).length;
  if (openFrags !== closeFrags) {
    results.brokenFragments.push({ file: relPath, open: openFrags, close: closeFrags });
  }

  // 5. Import resolution check
  const importLines = content.match(/import\s+(?:[\w\s{},*]+from\s+)?['"][^'"]+['"]/g) || [];
  for (const imp of importLines) {
    const fromMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
    if (fromMatch) {
      const importPath = fromMatch[1];
      if (importPath.startsWith('.')) {
        // Relative import
        const targetBase = path.resolve(path.dirname(filePath), importPath);
        const possibleTargets = [
          targetBase,
          targetBase + '.ts',
          targetBase + '.tsx',
          targetBase + '.js',
          targetBase + '.jsx',
          path.join(targetBase, 'index.ts'),
          path.join(targetBase, 'index.tsx'),
          path.join(targetBase, 'index.js'),
        ];
        const exists = possibleTargets.some(t => fs.existsSync(t));
        if (!exists) {
          results.unresolvedImports.push({ file: relPath, importStatement: imp, target: importPath });
        }
      }
    }
  }
}

console.log('\n--- SCAN RESULTS ---');
console.log('Total files inspected:', results.totalFiles);
console.log('Replacement characters (\\uFFFD):', results.replacementCharMatches.length === 0 ? 'CLEAN (0 found)' : results.replacementCharMatches);
console.log('Mojibake sequences:', results.mojibakeMatches.length === 0 ? 'CLEAN (0 found)' : results.mojibakeMatches);
console.log('Syntax artifacts:', results.syntaxArtifacts.length === 0 ? 'CLEAN (0 found)' : results.syntaxArtifacts);
console.log('Broken fragments:', results.brokenFragments.length === 0 ? 'CLEAN (0 found)' : results.brokenFragments);
console.log('Unresolved relative imports:', results.unresolvedImports.length === 0 ? 'CLEAN (0 found)' : results.unresolvedImports);

if (
  results.replacementCharMatches.length > 0 ||
  results.mojibakeMatches.length > 0 ||
  results.syntaxArtifacts.length > 0 ||
  results.brokenFragments.length > 0 ||
  results.unresolvedImports.length > 0
) {
  console.log('\n>>> STATUS: DEFECTS_DETECTED <<<');
  process.exit(1);
} else {
  console.log('\n>>> STATUS: ALL_CLIENT_FILES_CLEAN <<<');
  process.exit(0);
}
