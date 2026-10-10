SELECT pg_get_functiondef(
  'public.gsa_client_session_actor(uuid,text)'::regprocedure
) AS function_definition;
