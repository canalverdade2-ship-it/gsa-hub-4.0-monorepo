const fs = require('fs');
let content = fs.readFileSync('src/components/admin/AdminOrders.tsx', 'utf8');

// Replace window.confirm
content = content.replace(/if\s*\(\s*window\.confirm\(\s*'([^']+)'\s*\)\s*\)\s*([^{]+?);/g, 
  "setConfirmState({ open: true, title: 'Confirmar ação', message: '$1', action: () => { $2; setConfirmState(prev => ({...prev, open: false})); }});"
);

// Specifically handle the block window.confirm calls that might have braces
content = content.replace(/if\s*\(\s*window\.confirm\(\s*'([^']+)'\s*\)\s*\)\s*\{([^}]+)\}/g, 
  "setConfirmState({ open: true, title: 'Confirmar ação', message: '$1', action: () => { $2; setConfirmState(prev => ({...prev, open: false})); }});"
);

// Replace window.prompt
content = content.replace(/const\s+(\w+)\s*=\s*window\.prompt\(\s*'([^']+)'(?:,\s*([^)]+))?\s*\);\s*if\s*\(\s*\1\?\.trim\(\)\s*\)\s*\{([^}]+)\}/g, 
  "setPromptState({ open: true, title: '$2', label: '$2', value: $3 || '', action: ($1) => { if ($1?.trim()) { $4; } setPromptState(prev => ({...prev, open: false})); }});"
);

// Replace the single line prompt without braces
content = content.replace(/const\s+(\w+)\s*=\s*window\.prompt\(\s*'([^']+)'(?:,\s*([^)]+))?\s*\);\s*if\s*\(\s*\1\?\.trim\(\)\s*\)\s*([^{]+?);/g, 
  "setPromptState({ open: true, title: '$2', label: '$2', value: $3 || '', action: ($1) => { if ($1?.trim()) { $4; } setPromptState(prev => ({...prev, open: false})); }});"
);

fs.writeFileSync('src/components/admin/AdminOrders.tsx', content);
