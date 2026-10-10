import fs from 'fs';
import path from 'path';

const clientDir = path.resolve('src/components/client');
const projectRoot = path.resolve('.');

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

console.log('--- REPLACEMENT CHAR CHECK (\\uFFFD) ---');
for (const filePath of clientFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('\uFFFD')) {
    console.log(`FOUND \\uFFFD in ${path.relative(projectRoot, filePath)}`);
  }
}

console.log('\n--- MOJIBAKE CHECK ---');
const mojibakeRegex = /(Ã¡|Ã©|Ã­|Ã³|Ãº|Ã£|Ãµ|Ã¢|Ãª|Ã´|Ã§|Ã€|Ã|Ã‰|Ã|Ã“|Ãš|Ãƒ|Ã•|Ã‚|ÃŠ|Ã”|Ã‡|â‚¬|â€™|â€œ|â€|Âº|Âª)/g;
for (const filePath of clientFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches = [];
  lines.forEach((l, idx) => {
    // Only flag if it's not a regex literal or inside a decoding function
    if (l.includes('mojibake') || l.includes('decodeURIComponent') || l.includes('replace')) return;
    const m = l.match(mojibakeRegex);
    if (m) {
      matches.push({ line: idx + 1, matched: m, text: l.trim() });
    }
  });
  if (matches.length > 0) {
    console.log(`Mojibake in ${path.relative(projectRoot, filePath)}: ${matches.length} occurrences`);
    matches.forEach(m => console.log(`  Line ${m.line}: ${m.text.substring(0, 100)}`));
  }
}

console.log('\n--- INPUTMODE ARTIFACT CHECK ---');
for (const filePath of clientFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('inputMode="numeric">') || content.includes('= inputMode')) {
    console.log(`FOUND inputMode artifact in ${path.relative(projectRoot, filePath)}`);
  }
}
