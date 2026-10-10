update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role','authenticated')
where email = 'qa-admin-1791570242@gsa.test';
