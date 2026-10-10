update auth.users
set aud = 'authenticated',
    role = 'authenticated',
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role','authenticated')
where aud is null or aud = '' or role is null or role = '';
