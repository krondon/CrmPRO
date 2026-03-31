
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."buscar_empresa_por_codigo"("p_codigo" "text") RETURNS TABLE("id" "uuid", "nombre_empresa" "text", "logo_url" "text", "codigo_empresa" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.nombre_empresa, e.logo_url, e.codigo_empresa
  FROM empresa e
  WHERE e.codigo_empresa = UPPER(TRIM(p_codigo));
END;
$$;


ALTER FUNCTION "public"."buscar_empresa_por_codigo"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buscar_empresa_por_id"("p_id" "uuid") RETURNS TABLE("id" "uuid", "nombre_empresa" "text", "logo_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.nombre_empresa, e.logo_url
  FROM empresa e
  WHERE e.id = p_id;
END;
$$;


ALTER FUNCTION "public"."buscar_empresa_por_id"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_seed_roles_on_empresa_create"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    BEGIN
        INSERT INTO roles (empresa_id, name, permissions, color, is_system) VALUES
        (NEW.id, 'Admin', '["view_dashboard","view_pipeline","edit_leads","delete_leads","view_analytics","view_calendar","manage_team","manage_settings","view_budgets","edit_budgets"]'::jsonb, '#8b5cf6', true),
        (NEW.id, 'Viewer', '["view_dashboard","view_pipeline","view_analytics","view_calendar","view_budgets"]'::jsonb, '#6b7280', true);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'fn_seed_roles_on_empresa_create: no se pudieron crear roles para empresa %. Error: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_seed_roles_on_empresa_create"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generar_codigo_empresa"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.codigo_empresa IS NULL THEN
    NEW.codigo_empresa := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generar_codigo_empresa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_landing_token"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  new_token text;
  token_exists boolean;
BEGIN
  LOOP
    -- Generar token tipo: lt_xxxxxxxxxxxx (12 chars hex)
    new_token := 'lt_' || encode(gen_random_bytes(12), 'hex');
    SELECT EXISTS(SELECT 1 FROM landing_tokens WHERE token = new_token) INTO token_exists;
    EXIT WHEN NOT token_exists;
  END LOOP;
  RETURN new_token;
END;
$$;


ALTER FUNCTION "public"."generate_landing_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_empresa_role"("_empresa_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _role text;
BEGIN
  SELECT role INTO _role
  FROM empresa_miembros
  WHERE empresa_id = _empresa_id
  AND usuario_id = auth.uid();
  
  RETURN _role;
END;
$$;


ALTER FUNCTION "public"."get_empresa_role"("_empresa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_safe"("_empresa_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM empresa_miembros2
    WHERE empresa_id = _empresa_id
    AND usuario_id = auth.uid()
    AND lower(role) = 'admin'
  );
END;
$$;


ALTER FUNCTION "public"."is_admin_safe"("_empresa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_empresa_member"("target_empresa_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Verifica si el usuario autenticado es parte de los miembros de esa empresa
  RETURN EXISTS (
    SELECT 1 
    FROM public.empresa_miembros
    WHERE empresa_id = target_empresa_id 
    AND usuario_id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."is_empresa_member"("target_empresa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT NULLIF(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '')
$$;


ALTER FUNCTION "public"."normalize_phone"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_lead_stage_sla"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  nueva_etapa_sla_limit INTEGER;
BEGIN
  -- Si el lead cambia a una etapa diferente
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    
    NEW.stage_entered_at = now();
    
    SELECT sla_limit_minutes INTO nueva_etapa_sla_limit 
    FROM public.etapas 
    WHERE id = NEW.etapa_id;
    
    NEW.sla_custom_limit_minutes = nueva_etapa_sla_limit;
    
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."reset_lead_stage_sla"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sincronizar_lead_a_contacto_real"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Caso 1: Insertar nuevo contacto si no existe
    IF (TG_OP = 'INSERT') THEN
        IF NOT EXISTS (SELECT 1 FROM contactos WHERE origen_lead_id = NEW.id OR (email = NEW.correo_electronico AND empresa_id = NEW.empresa_id)) THEN
            INSERT INTO contactos (nombre, email, telefono, empresa_nombre, empresa_id, origen_lead_id, created_at)
            VALUES (NEW.nombre_completo, NEW.correo_electronico, NEW.telefono, NEW.empresa, NEW.empresa_id, NEW.id, COALESCE(NEW.created_at, now()));
        END IF;
    
    -- Caso 2: Actualizar contacto existente cuando cambia el lead
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE contactos
        SET 
            nombre = NEW.nombre_completo,
            email = NEW.correo_electronico,
            telefono = NEW.telefono,
            empresa_nombre = NEW.empresa,
            updated_at = now()
        WHERE 
            origen_lead_id = NEW.id 
            OR (email = OLD.correo_electronico AND empresa_id = NEW.empresa_id)
            OR (email = NEW.correo_electronico AND empresa_id = NEW.empresa_id);
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sincronizar_lead_a_contacto_real"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_automation_rules_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_automation_rules_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "nombre" "text",
    "avatar_url" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "action_taken" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."automation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "pipeline_id" "uuid",
    "nombre" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "trigger_type" "text" NOT NULL,
    "trigger_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "action_type" "text" DEFAULT 'move_stage'::"text" NOT NULL,
    "action_config" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "automation_rules_action_type_check" CHECK (("action_type" = 'move_stage'::"text")),
    CONSTRAINT "automation_rules_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['message_received'::"text", 'tag_added'::"text", 'stage_change'::"text", 'time_in_stage'::"text"])))
);


ALTER TABLE "public"."automation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "unit_price" numeric,
    "image_url" "text",
    "stock" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."catalog_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "keywords" "text"[] DEFAULT '{}'::"text"[],
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contactos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "email" "text",
    "telefono" "text",
    "empresa_nombre" "text",
    "cargo" "text",
    "notas" "text",
    "empresa_id" "uuid" NOT NULL,
    "origen_lead_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "archivado" boolean DEFAULT false,
    "rating" integer DEFAULT 0,
    "redes_sociales" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."contactos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."empresa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_empresa" "text" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "logo_url" "text",
    "codigo_empresa" "text"
);


ALTER TABLE "public"."empresa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."empresa_instancias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "plataforma" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "api_url" "text",
    "label" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "api_token" "text",
    "webhook_secret" "text",
    "verify_token" "text",
    "auto_create_lead" boolean DEFAULT true,
    "default_pipeline_id" "uuid",
    "default_stage_id" "uuid",
    "default_lead_name" "text" DEFAULT 'Nuevo lead'::"text",
    "include_first_message" boolean DEFAULT true
);


ALTER TABLE "public"."empresa_instancias" OWNER TO "postgres";


COMMENT ON COLUMN "public"."empresa_instancias"."api_token" IS 'Token de autenticación para Super API (Bearer token). Requerido para enviar mensajes.';



COMMENT ON COLUMN "public"."empresa_instancias"."webhook_secret" IS 'Secret para validar webhooks entrantes. Usado en la URL del webhook como parámetro ?secret=XXX';



COMMENT ON COLUMN "public"."empresa_instancias"."verify_token" IS 'Token de verificación para webhooks estilo Facebook/Meta (hub.verify_token)';



CREATE TABLE IF NOT EXISTS "public"."empresa_miembros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rol_id" "uuid",
    "role_id" "uuid"
);


ALTER TABLE "public"."empresa_miembros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipo_invitaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipo_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "invited_usuario_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    "invited_nombre" "text",
    "invited_titulo_trabajo" "text",
    "pipeline_ids" "uuid"[],
    "token" "text",
    "permisos" "text",
    "permission_role" "text" DEFAULT 'viewer'::"text",
    "role_id" "uuid"
);


ALTER TABLE "public"."equipo_invitaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_equipo" "text",
    "empresa_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."etapas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "miembros" "text",
    "pipeline_id" "uuid" NOT NULL,
    "lead" "text",
    "presupuesto" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "color" "text" DEFAULT '#3b82f6'::"text",
    "orden" integer DEFAULT 0,
    "nombre" "text",
    "is_sla_enabled" boolean DEFAULT false,
    "sla_limit_minutes" integer
);


ALTER TABLE "public"."etapas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "scope" "text" DEFAULT 'global'::"text" NOT NULL,
    "empresa_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."form_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "crm_response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_responses_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."form_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."form_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "empresa_id" "text",
    "pipeline_id" "text",
    "etapa_id" "text",
    "prioridad_default" "text" DEFAULT 'medium'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_tokens_prioridad_default_check" CHECK (("prioridad_default" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."form_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "token_id" "uuid",
    "crm_fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "custom_fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "customization" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "forms_tipo_check" CHECK (("tipo" = ANY (ARRAY['static'::"text", 'dynamic'::"text"])))
);


ALTER TABLE "public"."forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integracion_credenciales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "integracion_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."integracion_credenciales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integraciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."integraciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."landing_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "etapa_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "prioridad_default" "text" DEFAULT 'medium'::"text",
    "asignado_a" "uuid" DEFAULT '00000000-0000-0000-0000-000000000000'::"uuid",
    "empresa_label" "text" DEFAULT 'Landing'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."landing_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_completo" "text" NOT NULL,
    "correo_electronico" "text",
    "telefono" "text",
    "empresa" "text",
    "presupuesto" numeric,
    "etapa_id" "uuid",
    "pipeline_id" "uuid",
    "prioridad" "text",
    "asignado_a" "uuid",
    "empresa_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "instagram_id" "text",
    "facebook_id" "text",
    "whatsapp_id" "text",
    "ubicacion" "text",
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "last_message_sender" "text" DEFAULT 'team'::"text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "archived" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "channel" "text",
    "instance_id" "uuid",
    "external_handle" "text",
    "preferred_instance_id" "uuid",
    "evento" "text",
    "membresia" "text",
    "stage_entered_at" timestamp with time zone DEFAULT "now"(),
    "sla_custom_limit_minutes" integer
);


ALTER TABLE "public"."lead" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_dedupe_backup" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_completo" "text" NOT NULL,
    "correo_electronico" "text",
    "telefono" "text",
    "empresa" "text",
    "presupuesto" numeric,
    "etapa_id" "uuid",
    "pipeline_id" "uuid",
    "prioridad" "text",
    "asignado_a" "uuid",
    "empresa_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "instagram_id" "text",
    "facebook_id" "text",
    "whatsapp_id" "text",
    "ubicacion" "text",
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "last_message_sender" "text" DEFAULT 'team'::"text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "archived" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "channel" "text",
    "instance_id" "uuid",
    "external_handle" "text",
    "preferred_instance_id" "uuid",
    "evento" "text",
    "membresia" "text"
);


ALTER TABLE "public"."lead_dedupe_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_historial" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "usuario_id" "uuid",
    "accion" "text" NOT NULL,
    "detalle" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_historial" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_reunion_participantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reunion_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tipo" "text" DEFAULT 'external'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lead_reunion_participantes_tipo_check" CHECK (("tipo" = ANY (ARRAY['internal'::"text", 'external'::"text"])))
);


ALTER TABLE "public"."lead_reunion_participantes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_reuniones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "titulo" "text" NOT NULL,
    "fecha" timestamp with time zone NOT NULL,
    "duracion_minutos" integer DEFAULT 30 NOT NULL,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_reuniones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensajes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "sender" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "external_id" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."mensajes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nota_lead" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "contenido" "text" NOT NULL,
    "creado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "creador_nombre" "text"
);


ALTER TABLE "public"."nota_lead" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notificaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_email" "text" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "data" "jsonb",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notificaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."persona" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permisos" "text",
    "nombre" "text" NOT NULL,
    "email" "text" NOT NULL,
    "titulo_trabajo" "text",
    "equipo_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "usuario_id" "uuid"
);


ALTER TABLE "public"."persona" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."persona_pipeline" (
    "persona_id" "uuid" NOT NULL,
    "pipeline_id" "uuid" NOT NULL
);


ALTER TABLE "public"."persona_pipeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text",
    "empresa_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "assignment_type" "text" DEFAULT 'manual'::"text",
    "last_assigned_persona_id" "uuid"
);


ALTER TABLE "public"."pipeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presupuesto_pdf" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "creado_por" "uuid"
);


ALTER TABLE "public"."presupuesto_pdf" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#3b82f6'::"text",
    "permissions" "jsonb" DEFAULT '[]'::"jsonb",
    "is_system" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solicitudes_union" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "solicitante_id" "uuid" NOT NULL,
    "solicitante_email" "text" NOT NULL,
    "solicitante_nombre" "text",
    "mensaje" "text",
    "empresa_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "role_asignado" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    "responded_by" "uuid",
    CONSTRAINT "solicitudes_union_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."solicitudes_union" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "assigned_to" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "type" "text" DEFAULT 'todo'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "due_date" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "recovery_email" "text",
    "account_type" "text" DEFAULT 'owner'::"text",
    CONSTRAINT "usuarios_account_type_check" CHECK (("account_type" = ANY (ARRAY['owner'::"text", 'employee'::"text"])))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhooks_entrantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "integracion_id" "uuid",
    "empresa_id" "uuid" NOT NULL,
    "provider" "text",
    "event" "text",
    "payload" "jsonb",
    "signature_valid" boolean,
    "dedupe_key" "text",
    "received_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webhooks_entrantes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_settings"
    ADD CONSTRAINT "chat_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."empresa"
    ADD CONSTRAINT "empresa2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."empresa"
    ADD CONSTRAINT "empresa_codigo_empresa_key" UNIQUE ("codigo_empresa");



ALTER TABLE ONLY "public"."empresa_instancias"
    ADD CONSTRAINT "empresa_instancias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."empresa_miembros"
    ADD CONSTRAINT "empresa_miembros_empresa_user_unique" UNIQUE ("empresa_id", "usuario_id");



ALTER TABLE ONLY "public"."empresa_miembros"
    ADD CONSTRAINT "empresa_miembros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipo_invitaciones"
    ADD CONSTRAINT "equipo_invitaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipos"
    ADD CONSTRAINT "equipos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."etapas"
    ADD CONSTRAINT "etapas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."form_responses"
    ADD CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."form_tokens"
    ADD CONSTRAINT "form_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."form_tokens"
    ADD CONSTRAINT "form_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."forms"
    ADD CONSTRAINT "forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integracion_credenciales"
    ADD CONSTRAINT "integracion_credenciales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integraciones"
    ADD CONSTRAINT "integraciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landing_tokens"
    ADD CONSTRAINT "landing_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landing_tokens"
    ADD CONSTRAINT "landing_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."lead_dedupe_backup"
    ADD CONSTRAINT "lead_dedupe_backup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_historial"
    ADD CONSTRAINT "lead_historial_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead"
    ADD CONSTRAINT "lead_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_reunion_participantes"
    ADD CONSTRAINT "lead_reunion_participantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_reuniones"
    ADD CONSTRAINT "lead_reuniones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensajes"
    ADD CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nota_lead"
    ADD CONSTRAINT "nota_lead_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notificaciones"
    ADD CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."persona_pipeline"
    ADD CONSTRAINT "persona_pipeline_pkey" PRIMARY KEY ("persona_id", "pipeline_id");



ALTER TABLE ONLY "public"."persona"
    ADD CONSTRAINT "persona_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline"
    ADD CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presupuesto_pdf"
    ADD CONSTRAINT "presupuesto_pdf_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_tags"
    ADD CONSTRAINT "saved_tags_empresa_id_name_key" UNIQUE ("empresa_id", "name");



ALTER TABLE ONLY "public"."saved_tags"
    ADD CONSTRAINT "saved_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solicitudes_union"
    ADD CONSTRAINT "solicitudes_union_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solicitudes_union"
    ADD CONSTRAINT "solicitudes_union_solicitante_id_empresa_id_key" UNIQUE ("solicitante_id", "empresa_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."empresa_instancias"
    ADD CONSTRAINT "uq_empresa_instancia" UNIQUE ("empresa_id", "plataforma", "client_id");



ALTER TABLE ONLY "public"."integracion_credenciales"
    ADD CONSTRAINT "uq_integracion_credencial" UNIQUE ("integracion_id", "key");



ALTER TABLE ONLY "public"."integraciones"
    ADD CONSTRAINT "uq_integraciones_empresa_provider" UNIQUE ("empresa_id", "provider");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhooks_entrantes"
    ADD CONSTRAINT "webhooks_entrantes_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "equipo_invitaciones_unique_pending_email" ON "public"."equipo_invitaciones" USING "btree" ("empresa_id", "lower"("invited_email")) WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_automation_logs_created" ON "public"."automation_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_automation_logs_empresa" ON "public"."automation_logs" USING "btree" ("empresa_id");



CREATE INDEX "idx_automation_logs_lead" ON "public"."automation_logs" USING "btree" ("lead_id");



CREATE INDEX "idx_automation_logs_rule" ON "public"."automation_logs" USING "btree" ("rule_id");



CREATE INDEX "idx_automation_rules_empresa" ON "public"."automation_rules" USING "btree" ("empresa_id");



CREATE INDEX "idx_automation_rules_pipeline" ON "public"."automation_rules" USING "btree" ("pipeline_id");



CREATE INDEX "idx_automation_rules_trigger" ON "public"."automation_rules" USING "btree" ("trigger_type", "enabled");



CREATE INDEX "idx_chat_settings_empresa" ON "public"."chat_settings" USING "btree" ("empresa_id");



CREATE INDEX "idx_empresa_codigo" ON "public"."empresa" USING "btree" ("codigo_empresa");



CREATE INDEX "idx_empresa_instancias_client_id" ON "public"."empresa_instancias" USING "btree" ("client_id");



CREATE INDEX "idx_empresa_instancias_empresa_plataforma" ON "public"."empresa_instancias" USING "btree" ("empresa_id", "plataforma");



CREATE INDEX "idx_empresa_instancias_empresa_plataforma_active" ON "public"."empresa_instancias" USING "btree" ("empresa_id", "plataforma", "active") WHERE ("active" = true);



CREATE INDEX "idx_empresa_instancias_verify_token" ON "public"."empresa_instancias" USING "btree" ("verify_token") WHERE (("verify_token" IS NOT NULL) AND ("active" = true));



CREATE INDEX "idx_empresa_instancias_webhook_secret" ON "public"."empresa_instancias" USING "btree" ("webhook_secret") WHERE (("webhook_secret" IS NOT NULL) AND ("active" = true));



CREATE INDEX "idx_equipo_invitaciones_invited_email" ON "public"."equipo_invitaciones" USING "btree" ("invited_email");



CREATE INDEX "idx_equipo_invitaciones_token" ON "public"."equipo_invitaciones" USING "btree" ("token");



CREATE INDEX "idx_form_responses_created" ON "public"."form_responses" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_form_responses_form_id" ON "public"."form_responses" USING "btree" ("form_id");



CREATE INDEX "idx_form_tokens_active" ON "public"."form_tokens" USING "btree" ("active");



CREATE INDEX "idx_forms_active" ON "public"."forms" USING "btree" ("active");



CREATE INDEX "idx_landing_tokens_empresa" ON "public"."landing_tokens" USING "btree" ("empresa_id");



CREATE INDEX "idx_landing_tokens_token" ON "public"."landing_tokens" USING "btree" ("token");



CREATE INDEX "idx_lead_chat_sort" ON "public"."lead" USING "btree" ("last_message_sender" DESC, "last_message_at" DESC);



CREATE INDEX "idx_lead_empresa_channel" ON "public"."lead" USING "btree" ("empresa_id", "channel");



CREATE INDEX "idx_lead_facebook_id" ON "public"."lead" USING "btree" ("facebook_id");



CREATE INDEX "idx_lead_historial_created_at" ON "public"."lead_historial" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_lead_historial_lead_id" ON "public"."lead_historial" USING "btree" ("lead_id");



CREATE INDEX "idx_lead_instagram_id" ON "public"."lead" USING "btree" ("instagram_id");



CREATE INDEX "idx_lead_instance_id" ON "public"."lead" USING "btree" ("instance_id");



CREATE INDEX "idx_lead_preferred_instance_id" ON "public"."lead" USING "btree" ("preferred_instance_id");



CREATE INDEX "idx_lead_reunion_participantes_reunion_id" ON "public"."lead_reunion_participantes" USING "btree" ("reunion_id");



CREATE INDEX "idx_lead_reuniones_empresa_id" ON "public"."lead_reuniones" USING "btree" ("empresa_id");



CREATE INDEX "idx_lead_reuniones_lead_id" ON "public"."lead_reuniones" USING "btree" ("lead_id");



CREATE INDEX "idx_lead_whatsapp_id" ON "public"."lead" USING "btree" ("whatsapp_id");



CREATE INDEX "idx_mensajes_created_at" ON "public"."mensajes" USING "btree" ("created_at");



CREATE INDEX "idx_mensajes_lead_id" ON "public"."mensajes" USING "btree" ("lead_id");



CREATE INDEX "idx_nota_lead_lead_id" ON "public"."nota_lead" USING "btree" ("lead_id");



CREATE INDEX "idx_notificaciones_email_created" ON "public"."notificaciones" USING "btree" ("usuario_email", "created_at" DESC);



CREATE INDEX "idx_notificaciones_read" ON "public"."notificaciones" USING "btree" ("read");



CREATE INDEX "idx_notificaciones_type" ON "public"."notificaciones" USING "btree" ("type");



CREATE INDEX "idx_notificaciones_usuario_email" ON "public"."notificaciones" USING "btree" ("usuario_email");



CREATE INDEX "idx_presupuesto_pdf_lead_id" ON "public"."presupuesto_pdf" USING "btree" ("lead_id");



CREATE INDEX "idx_saved_tags_empresa" ON "public"."saved_tags" USING "btree" ("empresa_id");



CREATE INDEX "idx_solicitudes_empresa_status" ON "public"."solicitudes_union" USING "btree" ("empresa_id", "status");



CREATE INDEX "idx_solicitudes_solicitante" ON "public"."solicitudes_union" USING "btree" ("solicitante_id");



CREATE INDEX "idx_tasks_assigned_to" ON "public"."tasks" USING "btree" ("assigned_to");



CREATE INDEX "idx_tasks_due_date" ON "public"."tasks" USING "btree" ("due_date");



CREATE INDEX "idx_tasks_empresa_id" ON "public"."tasks" USING "btree" ("empresa_id");



CREATE INDEX "idx_tasks_lead_id" ON "public"."tasks" USING "btree" ("lead_id");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");



CREATE INDEX "idx_webhooks_entrantes_dedupe" ON "public"."webhooks_entrantes" USING "btree" ("dedupe_key");



CREATE INDEX "idx_webhooks_entrantes_empresa_created" ON "public"."webhooks_entrantes" USING "btree" ("empresa_id", "received_at" DESC);



CREATE INDEX "lead_archived_idx" ON "public"."lead" USING "btree" ("empresa_id", "archived");



CREATE INDEX "lead_dedupe_backup_empresa_id_archived_idx" ON "public"."lead_dedupe_backup" USING "btree" ("empresa_id", "archived");



CREATE INDEX "lead_dedupe_backup_empresa_id_channel_idx" ON "public"."lead_dedupe_backup" USING "btree" ("empresa_id", "channel");



CREATE INDEX "lead_dedupe_backup_facebook_id_idx" ON "public"."lead_dedupe_backup" USING "btree" ("facebook_id");



CREATE INDEX "lead_dedupe_backup_instagram_id_idx" ON "public"."lead_dedupe_backup" USING "btree" ("instagram_id");



CREATE INDEX "lead_dedupe_backup_instance_id_idx" ON "public"."lead_dedupe_backup" USING "btree" ("instance_id");



CREATE INDEX "lead_dedupe_backup_last_message_sender_last_message_at_idx" ON "public"."lead_dedupe_backup" USING "btree" ("last_message_sender" DESC, "last_message_at" DESC);



CREATE INDEX "lead_dedupe_backup_preferred_instance_id_idx" ON "public"."lead_dedupe_backup" USING "btree" ("preferred_instance_id");



CREATE INDEX "lead_dedupe_backup_whatsapp_id_idx" ON "public"."lead_dedupe_backup" USING "btree" ("whatsapp_id");



CREATE UNIQUE INDEX "uq_feature_flags_empresa" ON "public"."feature_flags" USING "btree" ("empresa_id", "key") WHERE (("scope" = 'empresa'::"text") AND ("empresa_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_feature_flags_global" ON "public"."feature_flags" USING "btree" ("key") WHERE (("scope" = 'global'::"text") AND ("empresa_id" IS NULL));



CREATE UNIQUE INDEX "uq_lead_empresa_phone_norm" ON "public"."lead" USING "btree" ("empresa_id", "public"."normalize_phone"("telefono")) WHERE ("public"."normalize_phone"("telefono") IS NOT NULL);



CREATE UNIQUE INDEX "uq_lead_empresa_telefono_not_null" ON "public"."lead" USING "btree" ("empresa_id", "telefono") WHERE (("telefono" IS NOT NULL) AND ("btrim"("telefono") <> ''::"text"));



CREATE UNIQUE INDEX "uq_mensajes_external_id_not_null" ON "public"."mensajes" USING "btree" ("external_id") WHERE ("external_id" IS NOT NULL);



CREATE UNIQUE INDEX "ux_chat_settings_empresa" ON "public"."chat_settings" USING "btree" ("empresa_id");



CREATE OR REPLACE TRIGGER "tr_seed_roles_on_empresa_create" AFTER INSERT ON "public"."empresa" FOR EACH ROW EXECUTE FUNCTION "public"."fn_seed_roles_on_empresa_create"();



CREATE OR REPLACE TRIGGER "tr_sincronizar_lead_contacto_real" AFTER INSERT OR UPDATE ON "public"."lead" FOR EACH ROW EXECUTE FUNCTION "public"."sincronizar_lead_a_contacto_real"();



CREATE OR REPLACE TRIGGER "trg_automation_rules_updated_at" BEFORE UPDATE ON "public"."automation_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_automation_rules_updated_at"();



CREATE OR REPLACE TRIGGER "trg_forms_updated_at" BEFORE UPDATE ON "public"."forms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_generar_codigo_empresa" BEFORE INSERT ON "public"."empresa" FOR EACH ROW EXECUTE FUNCTION "public"."generar_codigo_empresa"();



CREATE OR REPLACE TRIGGER "trg_lead_reunion_participantes_updated_at" BEFORE UPDATE ON "public"."lead_reunion_participantes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_lead_reuniones_updated_at" BEFORE UPDATE ON "public"."lead_reuniones" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_reset_lead_stage_sla" BEFORE UPDATE ON "public"."lead" FOR EACH ROW EXECUTE FUNCTION "public"."reset_lead_stage_sla"();



ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_settings"
    ADD CONSTRAINT "chat_settings_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_origen_lead_id_fkey" FOREIGN KEY ("origen_lead_id") REFERENCES "public"."lead"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."empresa_instancias"
    ADD CONSTRAINT "empresa_instancias_default_pipeline_id_fkey" FOREIGN KEY ("default_pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."empresa_instancias"
    ADD CONSTRAINT "empresa_instancias_default_stage_id_fkey" FOREIGN KEY ("default_stage_id") REFERENCES "public"."etapas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."empresa_instancias"
    ADD CONSTRAINT "empresa_instancias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."empresa_miembros"
    ADD CONSTRAINT "empresa_miembros_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."empresa_miembros"
    ADD CONSTRAINT "empresa_miembros_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."empresa_miembros"
    ADD CONSTRAINT "empresa_miembros_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."empresa_miembros"
    ADD CONSTRAINT "empresa_miembros_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipo_invitaciones"
    ADD CONSTRAINT "equipo_invitaciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipo_invitaciones"
    ADD CONSTRAINT "equipo_invitaciones_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipo_invitaciones"
    ADD CONSTRAINT "equipo_invitaciones_invited_usuario_id_fkey" FOREIGN KEY ("invited_usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."equipo_invitaciones"
    ADD CONSTRAINT "equipo_invitaciones_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."equipos"
    ADD CONSTRAINT "equipos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."etapas"
    ADD CONSTRAINT "etapas_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."form_responses"
    ADD CONSTRAINT "form_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forms"
    ADD CONSTRAINT "forms_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."landing_tokens"("id");



ALTER TABLE ONLY "public"."integracion_credenciales"
    ADD CONSTRAINT "integracion_credenciales_integracion_id_fkey" FOREIGN KEY ("integracion_id") REFERENCES "public"."integraciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integraciones"
    ADD CONSTRAINT "integraciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."landing_tokens"
    ADD CONSTRAINT "landing_tokens_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."landing_tokens"
    ADD CONSTRAINT "landing_tokens_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."landing_tokens"
    ADD CONSTRAINT "landing_tokens_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead"
    ADD CONSTRAINT "lead_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead"
    ADD CONSTRAINT "lead_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_historial"
    ADD CONSTRAINT "lead_historial_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_historial"
    ADD CONSTRAINT "lead_historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead"
    ADD CONSTRAINT "lead_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."empresa_instancias"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead"
    ADD CONSTRAINT "lead_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id");



ALTER TABLE ONLY "public"."lead"
    ADD CONSTRAINT "lead_preferred_instance_id_fkey" FOREIGN KEY ("preferred_instance_id") REFERENCES "public"."empresa_instancias"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_reunion_participantes"
    ADD CONSTRAINT "lead_reunion_participantes_reunion_id_fkey" FOREIGN KEY ("reunion_id") REFERENCES "public"."lead_reuniones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_reuniones"
    ADD CONSTRAINT "lead_reuniones_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."lead_reuniones"
    ADD CONSTRAINT "lead_reuniones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_reuniones"
    ADD CONSTRAINT "lead_reuniones_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensajes"
    ADD CONSTRAINT "mensajes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nota_lead"
    ADD CONSTRAINT "nota_lead_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."nota_lead"
    ADD CONSTRAINT "nota_lead_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."persona"
    ADD CONSTRAINT "persona_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."persona_pipeline"
    ADD CONSTRAINT "persona_pipeline_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."persona_pipeline"
    ADD CONSTRAINT "persona_pipeline_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."persona"
    ADD CONSTRAINT "persona_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pipeline"
    ADD CONSTRAINT "pipeline_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline"
    ADD CONSTRAINT "pipeline_last_assigned_persona_id_fkey" FOREIGN KEY ("last_assigned_persona_id") REFERENCES "public"."persona"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."presupuesto_pdf"
    ADD CONSTRAINT "presupuesto_pdf_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."presupuesto_pdf"
    ADD CONSTRAINT "presupuesto_pdf_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_tags"
    ADD CONSTRAINT "saved_tags_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitudes_union"
    ADD CONSTRAINT "solicitudes_union_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitudes_union"
    ADD CONSTRAINT "solicitudes_union_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."solicitudes_union"
    ADD CONSTRAINT "solicitudes_union_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."webhooks_entrantes"
    ADD CONSTRAINT "webhooks_entrantes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhooks_entrantes"
    ADD CONSTRAINT "webhooks_entrantes_integracion_id_fkey" FOREIGN KEY ("integracion_id") REFERENCES "public"."integraciones"("id") ON DELETE SET NULL;



CREATE POLICY "Admins y owners pueden actualizar roles" ON "public"."roles" FOR UPDATE USING ((((EXISTS ( SELECT 1
   FROM "public"."empresa"
  WHERE (("empresa"."id" = "roles"."empresa_id") AND ("empresa"."usuario_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."empresa_miembros" "em"
  WHERE (("em"."empresa_id" = "roles"."empresa_id") AND (("em"."usuario_id" = "auth"."uid"()) OR ("em"."email" = ("auth"."jwt"() ->> 'email'::"text"))) AND ("em"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) AND (NOT "is_system")));



CREATE POLICY "Admins y owners pueden agregar roles" ON "public"."roles" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."empresa"
  WHERE (("empresa"."id" = "roles"."empresa_id") AND ("empresa"."usuario_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."empresa_miembros" "em"
  WHERE (("em"."empresa_id" = "roles"."empresa_id") AND (("em"."usuario_id" = "auth"."uid"()) OR ("em"."email" = ("auth"."jwt"() ->> 'email'::"text"))) AND ("em"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))));



CREATE POLICY "Admins y owners pueden eliminar roles" ON "public"."roles" FOR DELETE USING ((((EXISTS ( SELECT 1
   FROM "public"."empresa"
  WHERE (("empresa"."id" = "roles"."empresa_id") AND ("empresa"."usuario_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."empresa_miembros" "em"
  WHERE (("em"."empresa_id" = "roles"."empresa_id") AND (("em"."usuario_id" = "auth"."uid"()) OR ("em"."email" = ("auth"."jwt"() ->> 'email'::"text"))) AND ("em"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) AND (NOT "is_system")));



CREATE POLICY "Enable delete for users of the same company" ON "public"."catalog_items" FOR DELETE USING (("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())
UNION
 SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "Enable insert for users of the same company" ON "public"."catalog_items" FOR INSERT WITH CHECK (("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())
UNION
 SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "Enable read for users of the same company" ON "public"."catalog_items" FOR SELECT USING (("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())
UNION
 SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "Enable update for users of the same company" ON "public"."catalog_items" FOR UPDATE USING (("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())
UNION
 SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "Miembros pueden ver roles de su empresa" ON "public"."roles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_miembros" "em"
  WHERE (("em"."empresa_id" = "roles"."empresa_id") AND (("em"."usuario_id" = "auth"."uid"()) OR ("em"."email" = ("auth"."jwt"() ->> 'email'::"text")))))));



CREATE POLICY "Users can insert history for accessible leads" ON "public"."lead_historial" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."lead"
  WHERE ("lead"."id" = "lead_historial"."lead_id"))));



CREATE POLICY "Users can view history of accessible leads" ON "public"."lead_historial" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."lead"
  WHERE ("lead"."id" = "lead_historial"."lead_id"))));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon insert responses" ON "public"."form_responses" FOR INSERT WITH CHECK (true);



CREATE POLICY "authenticated read tokens" ON "public"."form_tokens" FOR SELECT USING (true);



CREATE POLICY "authenticated write tokens" ON "public"."form_tokens" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."automation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalog_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_settings_insert_owner" ON "public"."chat_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa" "e"
  WHERE (("e"."id" = "chat_settings"."empresa_id") AND ("e"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "chat_settings_select_owner" ON "public"."chat_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa" "e"
  WHERE (("e"."id" = "chat_settings"."empresa_id") AND ("e"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "chat_settings_update_owner" ON "public"."chat_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa" "e"
  WHERE (("e"."id" = "chat_settings"."empresa_id") AND ("e"."usuario_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa" "e"
  WHERE (("e"."id" = "chat_settings"."empresa_id") AND ("e"."usuario_id" = "auth"."uid"())))));



ALTER TABLE "public"."contactos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contactos_delete_owner_or_member" ON "public"."contactos" FOR DELETE TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "contactos_insert_owner_or_member" ON "public"."contactos" FOR INSERT TO "authenticated" WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "contactos_select_owner_or_member" ON "public"."contactos" FOR SELECT TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "contactos_update_owner_or_member" ON "public"."contactos" FOR UPDATE TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))) WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "delete_automation_rules" ON "public"."automation_rules" FOR DELETE USING ((("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE (("empresa_miembros"."usuario_id" = "auth"."uid"()) AND ("empresa_miembros"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR ("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "delete_persona_pipeline" ON "public"."persona_pipeline" FOR DELETE TO "authenticated" USING (("persona_id" IN ( SELECT "p"."id"
   FROM (("public"."persona" "p"
     JOIN "public"."equipos" "eq" ON (("p"."equipo_id" = "eq"."id")))
     JOIN "public"."empresa" "e" ON (("eq"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("e"."id" IN ( SELECT "em"."empresa_id"
           FROM "public"."empresa_miembros" "em"
          WHERE ("em"."usuario_id" = "auth"."uid"())))))));



ALTER TABLE "public"."empresa" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "empresa_delete" ON "public"."empresa" FOR DELETE USING (("usuario_id" = "auth"."uid"()));



CREATE POLICY "empresa_insert" ON "public"."empresa" FOR INSERT WITH CHECK (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."empresa_instancias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "empresa_instancias_rw" ON "public"."empresa_instancias" TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))) WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "empresa_members_read_logs" ON "public"."automation_logs" FOR SELECT USING (("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))));



ALTER TABLE "public"."empresa_miembros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "empresa_miembros_admin_delete" ON "public"."empresa_miembros" FOR DELETE TO "authenticated" USING ((("public"."is_admin_safe"("empresa_id") IS TRUE) AND (("role" IS NULL) OR ("lower"("role") <> 'owner'::"text"))));



CREATE POLICY "empresa_miembros_delete_self" ON "public"."empresa_miembros" FOR DELETE TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



CREATE POLICY "empresa_miembros_owner" ON "public"."empresa_miembros" TO "authenticated" USING (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "empresa_miembros_owner_insert" ON "public"."empresa_miembros" FOR INSERT TO "authenticated" WITH CHECK (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "empresa_miembros_self" ON "public"."empresa_miembros" FOR SELECT TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



CREATE POLICY "empresa_select" ON "public"."empresa" FOR SELECT TO "authenticated" USING ((("usuario_id" = "auth"."uid"()) OR "public"."is_empresa_member"("id")));



CREATE POLICY "empresa_update" ON "public"."empresa" FOR UPDATE USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."equipo_invitaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipo_invitaciones_insert" ON "public"."equipo_invitaciones" FOR INSERT TO "authenticated" WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE (("empresa_miembros"."usuario_id" = "auth"."uid"()) AND ("empresa_miembros"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))));



CREATE POLICY "equipo_invitaciones_select" ON "public"."equipo_invitaciones" FOR SELECT TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE (("empresa_miembros"."usuario_id" = "auth"."uid"()) AND ("empresa_miembros"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))) OR ("invited_email" = ("auth"."jwt"() ->> 'email'::"text"))));



CREATE POLICY "equipo_invitaciones_update_invited" ON "public"."equipo_invitaciones" FOR UPDATE TO "authenticated" USING (("invited_email" = ("auth"."jwt"() ->> 'email'::"text"))) WITH CHECK (("invited_email" = ("auth"."jwt"() ->> 'email'::"text")));



CREATE POLICY "equipo_invitaciones_update_owner" ON "public"."equipo_invitaciones" FOR UPDATE TO "authenticated" USING (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



ALTER TABLE "public"."equipos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipos_rw" ON "public"."equipos" TO "authenticated" USING ((("empresa_id" IN ( SELECT "e"."id"
   FROM "public"."empresa" "e"
  WHERE ("e"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("empresa_id"))) WITH CHECK ((("empresa_id" IN ( SELECT "e"."id"
   FROM "public"."empresa" "e"
  WHERE ("e"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("empresa_id")));



ALTER TABLE "public"."etapas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "etapas_delete" ON "public"."etapas" FOR DELETE TO "authenticated" USING (("pipeline_id" IN ( SELECT "p"."id"
   FROM ("public"."pipeline" "p"
     LEFT JOIN "public"."empresa" "e" ON (("p"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("public"."get_empresa_role"("e"."id") = 'admin'::"text")))));



CREATE POLICY "etapas_insert" ON "public"."etapas" FOR INSERT TO "authenticated" WITH CHECK (("pipeline_id" IN ( SELECT "p"."id"
   FROM ("public"."pipeline" "p"
     LEFT JOIN "public"."empresa" "e" ON (("p"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("public"."get_empresa_role"("e"."id") = ANY (ARRAY['admin'::"text", 'viewer'::"text"]))))));



CREATE POLICY "etapas_select" ON "public"."etapas" FOR SELECT TO "authenticated" USING (("pipeline_id" IN ( SELECT "p"."id"
   FROM ("public"."pipeline" "p"
     LEFT JOIN "public"."empresa" "e" ON (("p"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("public"."get_empresa_role"("e"."id") IS NOT NULL)))));



CREATE POLICY "etapas_update" ON "public"."etapas" FOR UPDATE TO "authenticated" USING (("pipeline_id" IN ( SELECT "p"."id"
   FROM ("public"."pipeline" "p"
     LEFT JOIN "public"."empresa" "e" ON (("p"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("public"."get_empresa_role"("e"."id") = ANY (ARRAY['admin'::"text", 'viewer'::"text"])))))) WITH CHECK (("pipeline_id" IN ( SELECT "p"."id"
   FROM ("public"."pipeline" "p"
     LEFT JOIN "public"."empresa" "e" ON (("p"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("public"."get_empresa_role"("e"."id") = ANY (ARRAY['admin'::"text", 'viewer'::"text"]))))));



ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feature_flags_empresa_mutation" ON "public"."feature_flags" TO "authenticated" USING ((("scope" = 'empresa'::"text") AND (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))))) WITH CHECK ((("scope" = 'empresa'::"text") AND (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))));



CREATE POLICY "feature_flags_select" ON "public"."feature_flags" FOR SELECT TO "authenticated" USING (((("scope" = 'global'::"text") AND ("empresa_id" IS NULL)) OR (("scope" = 'empresa'::"text") AND (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))))));



ALTER TABLE "public"."form_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."form_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_automation_rules" ON "public"."automation_rules" FOR INSERT WITH CHECK ((("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE (("empresa_miembros"."usuario_id" = "auth"."uid"()) AND ("empresa_miembros"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR ("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "insert_persona_pipeline" ON "public"."persona_pipeline" FOR INSERT TO "authenticated" WITH CHECK (("persona_id" IN ( SELECT "p"."id"
   FROM (("public"."persona" "p"
     JOIN "public"."equipos" "eq" ON (("p"."equipo_id" = "eq"."id")))
     JOIN "public"."empresa" "e" ON (("eq"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("e"."id" IN ( SELECT "em"."empresa_id"
           FROM "public"."empresa_miembros" "em"
          WHERE ("em"."usuario_id" = "auth"."uid"())))))));



ALTER TABLE "public"."integracion_credenciales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integracion_credenciales_rw" ON "public"."integracion_credenciales" TO "authenticated" USING (("integracion_id" IN ( SELECT "i"."id"
   FROM "public"."integraciones" "i"
  WHERE (("i"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("i"."empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
           FROM "public"."empresa_miembros"
          WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))))) WITH CHECK (("integracion_id" IN ( SELECT "i"."id"
   FROM "public"."integraciones" "i"
  WHERE (("i"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("i"."empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
           FROM "public"."empresa_miembros"
          WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))))));



ALTER TABLE "public"."integraciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integraciones_mutation" ON "public"."integraciones" TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))) WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "integraciones_select" ON "public"."integraciones" FOR SELECT TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



ALTER TABLE "public"."landing_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "landing_tokens_mutation" ON "public"."landing_tokens" TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))) WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "landing_tokens_select" ON "public"."landing_tokens" FOR SELECT TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



ALTER TABLE "public"."lead" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_delete" ON "public"."lead" FOR DELETE TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("empresa_id")));



ALTER TABLE "public"."lead_historial" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_insert" ON "public"."lead" FOR INSERT TO "authenticated" WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("empresa_id")));



ALTER TABLE "public"."lead_reunion_participantes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_reunion_participantes_delete" ON "public"."lead_reunion_participantes" FOR DELETE TO "authenticated" USING (("reunion_id" IN ( SELECT "lr"."id"
   FROM "public"."lead_reuniones" "lr"
  WHERE ("lr"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"())
        UNION
         SELECT "empresa_miembros"."empresa_id"
           FROM "public"."empresa_miembros"
          WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))));



CREATE POLICY "lead_reunion_participantes_insert" ON "public"."lead_reunion_participantes" FOR INSERT TO "authenticated" WITH CHECK (("reunion_id" IN ( SELECT "lr"."id"
   FROM "public"."lead_reuniones" "lr"
  WHERE ("lr"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"())
        UNION
         SELECT "empresa_miembros"."empresa_id"
           FROM "public"."empresa_miembros"
          WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))));



CREATE POLICY "lead_reunion_participantes_select" ON "public"."lead_reunion_participantes" FOR SELECT TO "authenticated" USING (("reunion_id" IN ( SELECT "lr"."id"
   FROM "public"."lead_reuniones" "lr"
  WHERE ("lr"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"())
        UNION
         SELECT "empresa_miembros"."empresa_id"
           FROM "public"."empresa_miembros"
          WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))));



CREATE POLICY "lead_reunion_participantes_update" ON "public"."lead_reunion_participantes" FOR UPDATE TO "authenticated" USING (("reunion_id" IN ( SELECT "lr"."id"
   FROM "public"."lead_reuniones" "lr"
  WHERE ("lr"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"())
        UNION
         SELECT "empresa_miembros"."empresa_id"
           FROM "public"."empresa_miembros"
          WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))));



ALTER TABLE "public"."lead_reuniones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_reuniones_delete" ON "public"."lead_reuniones" FOR DELETE TO "authenticated" USING (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())
UNION
 SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "lead_reuniones_insert" ON "public"."lead_reuniones" FOR INSERT TO "authenticated" WITH CHECK (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())
UNION
 SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "lead_reuniones_select" ON "public"."lead_reuniones" FOR SELECT TO "authenticated" USING (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())
UNION
 SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "lead_reuniones_update" ON "public"."lead_reuniones" FOR UPDATE TO "authenticated" USING (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())
UNION
 SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "lead_select" ON "public"."lead" FOR SELECT TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("empresa_id")));



CREATE POLICY "lead_update" ON "public"."lead" FOR UPDATE TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("empresa_id"))) WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("empresa_id")));



ALTER TABLE "public"."mensajes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mensajes_delete" ON "public"."mensajes" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."lead" "l"
  WHERE (("l"."id" = "mensajes"."lead_id") AND (("l"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("l"."empresa_id"))))));



CREATE POLICY "mensajes_insert" ON "public"."mensajes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."lead" "l"
  WHERE (("l"."id" = "mensajes"."lead_id") AND (("l"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("l"."empresa_id"))))));



CREATE POLICY "mensajes_select" ON "public"."mensajes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."lead" "l"
  WHERE (("l"."id" = "mensajes"."lead_id") AND (("l"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("l"."empresa_id"))))));



CREATE POLICY "mensajes_update" ON "public"."mensajes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."lead" "l"
  WHERE (("l"."id" = "mensajes"."lead_id") AND (("l"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("l"."empresa_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."lead" "l"
  WHERE (("l"."id" = "mensajes"."lead_id") AND (("l"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("l"."empresa_id"))))));



ALTER TABLE "public"."nota_lead" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nota_lead_rw" ON "public"."nota_lead" TO "authenticated" USING (("lead_id" IN ( SELECT "l"."id"
   FROM "public"."lead" "l"
  WHERE (("l"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("l"."empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
           FROM "public"."empresa_miembros"
          WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))))) WITH CHECK (("lead_id" IN ( SELECT "l"."id"
   FROM "public"."lead" "l"
  WHERE (("l"."empresa_id" IN ( SELECT "empresa"."id"
           FROM "public"."empresa"
          WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("l"."empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
           FROM "public"."empresa_miembros"
          WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))))));



ALTER TABLE "public"."notificaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notificaciones_select_self" ON "public"."notificaciones" FOR SELECT TO "authenticated" USING (("usuario_email" = ("auth"."jwt"() ->> 'email'::"text")));



CREATE POLICY "notificaciones_update_self" ON "public"."notificaciones" FOR UPDATE TO "authenticated" USING (("usuario_email" = ("auth"."jwt"() ->> 'email'::"text"))) WITH CHECK (("usuario_email" = ("auth"."jwt"() ->> 'email'::"text")));



ALTER TABLE "public"."persona" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "persona_insert_invited" ON "public"."persona" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."equipo_invitaciones" "ei"
  WHERE (("ei"."equipo_id" = "persona"."equipo_id") AND ("ei"."invited_email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("ei"."status" = 'accepted'::"text")))));



ALTER TABLE "public"."persona_pipeline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "persona_rw" ON "public"."persona" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."equipos" "eq"
     JOIN "public"."empresa" "e" ON (("eq"."empresa_id" = "e"."id")))
  WHERE (("eq"."id" = "persona"."equipo_id") AND (("e"."usuario_id" = "auth"."uid"()) OR "public"."is_empresa_member"("e"."id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."equipos" "eq"
     JOIN "public"."empresa" "e" ON (("eq"."empresa_id" = "e"."id")))
  WHERE (("eq"."id" = "persona"."equipo_id") AND (("e"."usuario_id" = "auth"."uid"()) OR "public"."is_empresa_member"("e"."id"))))));



ALTER TABLE "public"."pipeline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pipeline_rw" ON "public"."pipeline" TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR "public"."is_empresa_member"("empresa_id")));



CREATE POLICY "public read forms" ON "public"."forms" FOR SELECT USING (true);



CREATE POLICY "read_automation_rules" ON "public"."automation_rules" FOR SELECT USING ((("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())))));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_tags_delete" ON "public"."saved_tags" FOR DELETE USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "saved_tags_insert" ON "public"."saved_tags" FOR INSERT WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "saved_tags_select" ON "public"."saved_tags" FOR SELECT USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "saved_tags_update" ON "public"."saved_tags" FOR UPDATE USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "select_persona_pipeline" ON "public"."persona_pipeline" FOR SELECT TO "authenticated" USING (("persona_id" IN ( SELECT "p"."id"
   FROM (("public"."persona" "p"
     JOIN "public"."equipos" "eq" ON (("p"."equipo_id" = "eq"."id")))
     JOIN "public"."empresa" "e" ON (("eq"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("e"."id" IN ( SELECT "em"."empresa_id"
           FROM "public"."empresa_miembros" "em"
          WHERE ("em"."usuario_id" = "auth"."uid"())))))));



CREATE POLICY "service_role admin_users" ON "public"."admin_users" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role read responses" ON "public"."form_responses" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role update responses" ON "public"."form_responses" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role write forms" ON "public"."forms" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_insert_logs" ON "public"."automation_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "solicitudes_insert" ON "public"."solicitudes_union" FOR INSERT WITH CHECK (("solicitante_id" = "auth"."uid"()));



CREATE POLICY "solicitudes_select_owner" ON "public"."solicitudes_union" FOR SELECT USING (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "solicitudes_select_solicitante" ON "public"."solicitudes_union" FOR SELECT USING (("solicitante_id" = "auth"."uid"()));



ALTER TABLE "public"."solicitudes_union" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "solicitudes_update_owner" ON "public"."solicitudes_union" FOR UPDATE TO "authenticated" USING (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete" ON "public"."tasks" FOR DELETE TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "tasks_insert" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "tasks_select" ON "public"."tasks" FOR SELECT TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "tasks_update" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"()))))) WITH CHECK ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "update_automation_rules" ON "public"."automation_rules" FOR UPDATE USING ((("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE (("empresa_miembros"."usuario_id" = "auth"."uid"()) AND ("empresa_miembros"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR ("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))))) WITH CHECK ((("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE (("empresa_miembros"."usuario_id" = "auth"."uid"()) AND ("empresa_miembros"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR ("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "update_persona_pipeline" ON "public"."persona_pipeline" FOR UPDATE TO "authenticated" USING (("persona_id" IN ( SELECT "p"."id"
   FROM (("public"."persona" "p"
     JOIN "public"."equipos" "eq" ON (("p"."equipo_id" = "eq"."id")))
     JOIN "public"."empresa" "e" ON (("eq"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("e"."id" IN ( SELECT "em"."empresa_id"
           FROM "public"."empresa_miembros" "em"
          WHERE ("em"."usuario_id" = "auth"."uid"()))))))) WITH CHECK (("persona_id" IN ( SELECT "p"."id"
   FROM (("public"."persona" "p"
     JOIN "public"."equipos" "eq" ON (("p"."equipo_id" = "eq"."id")))
     JOIN "public"."empresa" "e" ON (("eq"."empresa_id" = "e"."id")))
  WHERE (("e"."usuario_id" = "auth"."uid"()) OR ("e"."id" IN ( SELECT "em"."empresa_id"
           FROM "public"."empresa_miembros" "em"
          WHERE ("em"."usuario_id" = "auth"."uid"())))))));



ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuarios_insert" ON "public"."usuarios" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "usuarios_select_self" ON "public"."usuarios" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "usuarios_update_self" ON "public"."usuarios" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."webhooks_entrantes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhooks_entrantes_select" ON "public"."webhooks_entrantes" FOR SELECT TO "authenticated" USING ((("empresa_id" IN ( SELECT "empresa"."id"
   FROM "public"."empresa"
  WHERE ("empresa"."usuario_id" = "auth"."uid"()))) OR ("empresa_id" IN ( SELECT "empresa_miembros"."empresa_id"
   FROM "public"."empresa_miembros"
  WHERE ("empresa_miembros"."usuario_id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."mensajes";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."buscar_empresa_por_codigo"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."buscar_empresa_por_codigo"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_empresa_por_codigo"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_empresa_por_codigo"("p_codigo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."buscar_empresa_por_id"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."buscar_empresa_por_id"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_empresa_por_id"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_empresa_por_id"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_seed_roles_on_empresa_create"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_seed_roles_on_empresa_create"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_seed_roles_on_empresa_create"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generar_codigo_empresa"() TO "anon";
GRANT ALL ON FUNCTION "public"."generar_codigo_empresa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generar_codigo_empresa"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_landing_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_landing_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_landing_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_empresa_role"("_empresa_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_empresa_role"("_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_empresa_role"("_empresa_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_safe"("_empresa_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_safe"("_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_safe"("_empresa_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_empresa_member"("target_empresa_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_empresa_member"("target_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_empresa_member"("target_empresa_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_lead_stage_sla"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_lead_stage_sla"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_lead_stage_sla"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sincronizar_lead_a_contacto_real"() TO "anon";
GRANT ALL ON FUNCTION "public"."sincronizar_lead_a_contacto_real"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sincronizar_lead_a_contacto_real"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_automation_rules_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_automation_rules_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_automation_rules_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."automation_logs" TO "anon";
GRANT ALL ON TABLE "public"."automation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_logs" TO "service_role";



GRANT ALL ON TABLE "public"."automation_rules" TO "anon";
GRANT ALL ON TABLE "public"."automation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_items" TO "anon";
GRANT ALL ON TABLE "public"."catalog_items" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_items" TO "service_role";



GRANT ALL ON TABLE "public"."chat_settings" TO "anon";
GRANT ALL ON TABLE "public"."chat_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_settings" TO "service_role";



GRANT ALL ON TABLE "public"."contactos" TO "anon";
GRANT ALL ON TABLE "public"."contactos" TO "authenticated";
GRANT ALL ON TABLE "public"."contactos" TO "service_role";



GRANT ALL ON TABLE "public"."empresa" TO "anon";
GRANT ALL ON TABLE "public"."empresa" TO "authenticated";
GRANT ALL ON TABLE "public"."empresa" TO "service_role";



GRANT ALL ON TABLE "public"."empresa_instancias" TO "anon";
GRANT ALL ON TABLE "public"."empresa_instancias" TO "authenticated";
GRANT ALL ON TABLE "public"."empresa_instancias" TO "service_role";



GRANT ALL ON TABLE "public"."empresa_miembros" TO "anon";
GRANT ALL ON TABLE "public"."empresa_miembros" TO "authenticated";
GRANT ALL ON TABLE "public"."empresa_miembros" TO "service_role";



GRANT ALL ON TABLE "public"."equipo_invitaciones" TO "anon";
GRANT ALL ON TABLE "public"."equipo_invitaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."equipo_invitaciones" TO "service_role";



GRANT ALL ON TABLE "public"."equipos" TO "anon";
GRANT ALL ON TABLE "public"."equipos" TO "authenticated";
GRANT ALL ON TABLE "public"."equipos" TO "service_role";



GRANT ALL ON TABLE "public"."etapas" TO "anon";
GRANT ALL ON TABLE "public"."etapas" TO "authenticated";
GRANT ALL ON TABLE "public"."etapas" TO "service_role";



GRANT ALL ON TABLE "public"."feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."form_responses" TO "anon";
GRANT ALL ON TABLE "public"."form_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."form_responses" TO "service_role";



GRANT ALL ON TABLE "public"."form_tokens" TO "anon";
GRANT ALL ON TABLE "public"."form_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."form_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."forms" TO "anon";
GRANT ALL ON TABLE "public"."forms" TO "authenticated";
GRANT ALL ON TABLE "public"."forms" TO "service_role";



GRANT ALL ON TABLE "public"."integracion_credenciales" TO "anon";
GRANT ALL ON TABLE "public"."integracion_credenciales" TO "authenticated";
GRANT ALL ON TABLE "public"."integracion_credenciales" TO "service_role";



GRANT ALL ON TABLE "public"."integraciones" TO "anon";
GRANT ALL ON TABLE "public"."integraciones" TO "authenticated";
GRANT ALL ON TABLE "public"."integraciones" TO "service_role";



GRANT ALL ON TABLE "public"."landing_tokens" TO "anon";
GRANT ALL ON TABLE "public"."landing_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."landing_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."lead" TO "anon";
GRANT ALL ON TABLE "public"."lead" TO "authenticated";
GRANT ALL ON TABLE "public"."lead" TO "service_role";



GRANT ALL ON TABLE "public"."lead_dedupe_backup" TO "anon";
GRANT ALL ON TABLE "public"."lead_dedupe_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_dedupe_backup" TO "service_role";



GRANT ALL ON TABLE "public"."lead_historial" TO "anon";
GRANT ALL ON TABLE "public"."lead_historial" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_historial" TO "service_role";



GRANT ALL ON TABLE "public"."lead_reunion_participantes" TO "anon";
GRANT ALL ON TABLE "public"."lead_reunion_participantes" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_reunion_participantes" TO "service_role";



GRANT ALL ON TABLE "public"."lead_reuniones" TO "anon";
GRANT ALL ON TABLE "public"."lead_reuniones" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_reuniones" TO "service_role";



GRANT ALL ON TABLE "public"."mensajes" TO "anon";
GRANT ALL ON TABLE "public"."mensajes" TO "authenticated";
GRANT ALL ON TABLE "public"."mensajes" TO "service_role";



GRANT ALL ON TABLE "public"."nota_lead" TO "anon";
GRANT ALL ON TABLE "public"."nota_lead" TO "authenticated";
GRANT ALL ON TABLE "public"."nota_lead" TO "service_role";



GRANT ALL ON TABLE "public"."notificaciones" TO "anon";
GRANT ALL ON TABLE "public"."notificaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."notificaciones" TO "service_role";



GRANT ALL ON TABLE "public"."persona" TO "anon";
GRANT ALL ON TABLE "public"."persona" TO "authenticated";
GRANT ALL ON TABLE "public"."persona" TO "service_role";



GRANT ALL ON TABLE "public"."persona_pipeline" TO "anon";
GRANT ALL ON TABLE "public"."persona_pipeline" TO "authenticated";
GRANT ALL ON TABLE "public"."persona_pipeline" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline" TO "anon";
GRANT ALL ON TABLE "public"."pipeline" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline" TO "service_role";



GRANT ALL ON TABLE "public"."presupuesto_pdf" TO "anon";
GRANT ALL ON TABLE "public"."presupuesto_pdf" TO "authenticated";
GRANT ALL ON TABLE "public"."presupuesto_pdf" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."saved_tags" TO "anon";
GRANT ALL ON TABLE "public"."saved_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_tags" TO "service_role";



GRANT ALL ON TABLE "public"."solicitudes_union" TO "anon";
GRANT ALL ON TABLE "public"."solicitudes_union" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitudes_union" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."webhooks_entrantes" TO "anon";
GRANT ALL ON TABLE "public"."webhooks_entrantes" TO "authenticated";
GRANT ALL ON TABLE "public"."webhooks_entrantes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































