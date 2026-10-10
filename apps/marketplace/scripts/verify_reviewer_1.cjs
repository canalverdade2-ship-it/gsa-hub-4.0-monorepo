const fs = require('fs');

const req = fs.readFileSync('.agents/ORIGINAL_REQUEST.md', 'utf8');
const report = fs.readFileSync('scripts/audit_realtime_report.md', 'utf8');

const startIdx = req.indexOf('AcessosModule.tsx');
const endIdx = req.indexOf('ViagensCategoriasModule.tsx') + 'ViagensCategoriasModule.tsx'.length;
const rawList = req.substring(startIdx, endIdx);
const reqFiles = rawList.split(/[,\s\r\n]+/).map(s => s.replace(//g, '').trim()).filter(Boolean);

const lines = report.split(/\r?\n/);
const headers = [];
for (const line of lines) {
  if (line.startsWith('### [')) {
    const m = line.match(/### \[\d+\] ([^]+)/);
    if (m) headers.push(m[1]);
  }
}

console.log('Target files in request:', reqFiles.length);
console.log('Cards in report:', headers.length);

const missing = reqFiles.filter(f => !headers.includes(f));
const extra = headers.filter(f => !reqFiles.includes(f));
console.log('Missing in report:', missing);
console.log('Extra in report:', extra);