import json
with open(r'C:\Users\Adriano Farias\.gemini\antigravity\brain\010951f6-0e20-4ea4-9168-0659ce9edfb8\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        if 'content' in data and 'export function AdminContracts' in data['content']:
            content = data['content']
            if 'import React' in content:
                print('Found in content! len:', len(content))
                with open('recovered.txt', 'w', encoding='utf-8') as out:
                    out.write(content)
                break
