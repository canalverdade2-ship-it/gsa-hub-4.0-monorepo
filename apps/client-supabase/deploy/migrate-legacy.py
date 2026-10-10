import json, sqlite3
c = sqlite3.connect('/var/lib/gsa-hub/data/gsa3.sqlite')
with open('/tmp/gsa-legacy-records.sql', 'w', encoding='utf-8') as f:
    for rid, kind, payload in c.execute('select id,kind,payload from records'):
        try:
            data = json.dumps(json.loads(payload), separators=(',', ':'), ensure_ascii=False)
        except Exception:
            data = json.dumps({'raw': payload}, ensure_ascii=False)
        def q(value):
            return "'" + str(value).replace("'", "''") + "'"
        f.write("insert into public.gsa_legacy_records(id,kind,payload) values (%s,%s,%s::jsonb) on conflict (kind,id) do update set payload=excluded.payload,updated_at=now();\n" % (q(rid), q(kind), q(data)))
