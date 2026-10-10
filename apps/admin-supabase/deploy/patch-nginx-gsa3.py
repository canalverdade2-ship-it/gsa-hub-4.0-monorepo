from pathlib import Path
from datetime import datetime, timezone
import os
import shutil

config = Path('/etc/nginx/nginx.conf')
snippet = Path('/tmp/gsa3-locations.conf').read_text(encoding='utf-8').rstrip()
text = config.read_text(encoding='utf-8')
marker = "        location / {\n            return 404;\n        }\n"
gsa3_anchor = "        # GSA HUB 3.0 isolated under /gsa3/;"
api_anchor = "        location /api/ {"

if snippet in text and text.count(api_anchor) == 1:
    print('GSA3_NGINX_LOCATIONS_ALREADY_PRESENT')
    raise SystemExit(0)

if gsa3_anchor in text:
    start = text.index(gsa3_anchor)
    end = text.index(marker, start)
    replacement = f'{snippet}\n\n'
    updated = text[:start] + replacement + text[end:]
else:
    if text.count(marker) != 1:
        raise SystemExit(f'Expected one API server marker, found {text.count(marker)}')
    updated = text.replace(marker, f'{snippet}\n\n{marker}', 1)

stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = config.with_name(f'nginx.conf.before-gsa3-{stamp}')
shutil.copy2(config, backup)
temporary = config.with_name('nginx.conf.gsa3.tmp')
temporary.write_text(updated, encoding='utf-8')
os.chmod(temporary, config.stat().st_mode & 0o777)
os.replace(temporary, config)
print(f'GSA3_NGINX_LOCATIONS_INSTALLED backup={backup}')
