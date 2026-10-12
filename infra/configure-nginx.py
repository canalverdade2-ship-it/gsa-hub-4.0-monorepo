from pathlib import Path
config = Path('/etc/nginx/nginx.conf')
text = config.read_text()
anchor = '        server_name api.147-15-43-141.nip.io;'
if text.count(anchor) != 1:
    raise SystemExit('Expected exactly one API HTTPS server')
start = '# BEGIN GSA MANAGED ROUTES'
end = '# END GSA MANAGED ROUTES'
if start in text:
    before, rest = text.split(start, 1)
    _, after = rest.split(end, 1)
    text = before + after
blocks = []
for mount in ('client-supabase', 'marketplace'):
    blocks.append(f"""
        location = /{mount} {{ return 302 /{mount}/; }}
        location ^~ /{mount}/assets/ {{
            root /var/www/gsa-hub/dist;
            try_files $uri =404;
        }}
        location ^~ /{mount}/ {{
            root /var/www/gsa-hub/dist;
            try_files $uri $uri/ /{mount}/index.html;
            add_header Cache-Control "no-store" always;
        }}
""")
text = text.replace(anchor, anchor + '\n' + start + ''.join(blocks) + end, 1)
config.write_text(text)
