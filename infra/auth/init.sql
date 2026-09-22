CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path TO auth, public;
-- Supabase migrations grant read access to this non-login maintenance role.
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres NOLOGIN;
    END IF;
END $$;
