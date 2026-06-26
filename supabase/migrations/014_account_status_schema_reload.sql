-- Ensure PostgREST picks up account status RPC and columns after migration 011

NOTIFY pgrst, 'reload schema';
