import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Incluir variantes en mayúsculas para mayor compatibilidad con navegadores/proxies
  "Access-Control-Allow-Headers": [
    "authorization",
    "Authorization",
    "x-supabase-authorization",
    "X-Supabase-Authorization",
    "x-client-info",
    "X-Client-Info",
    "apikey",
    "Apikey",
    "content-type",
    "Content-Type"
  ].join(", "),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("x-supabase-authorization") ?? req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader) {
      try {
        const headersObj = Object.fromEntries(Array.from(req.headers.entries()));
        console.warn('[invite-member][missing-auth-header] Headers received:', headersObj);
      } catch (_) {
        console.warn('[invite-member][missing-auth-header] Could not stringify headers');
      }
      return new Response(JSON.stringify({ error: 'Missing auth header (x-supabase-authorization or Authorization)' }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = await req.json();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid or missing JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, teamId, companyId, name, role, pipelineIds, permissionRole } = body || {};
    if (!email || !companyId) {
      return new Response(JSON.stringify({ error: 'Missing email or companyId' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();

    // Identify requester user from JWT (decode locally to avoid external dependency)
    const tokenJwt = authHeader.replace(/^Bearer\s+/i, '');
    let requester: { id: string; email?: string | null } | null = null;
    try {
      const parts = tokenJwt.split('.');
      if (parts.length !== 3) throw new Error('Malformed JWT');
      const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);
      requester = { id: payload.sub, email: payload.email };
      if (!requester.id) throw new Error('Missing sub in JWT');
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Obtener el id de la tabla interna "usuarios" para el mismo email del requester (diagnóstico)
    let requesterUsuariosId: string | null = null;
    if (requester.email) {
      const { data: requesterUsuariosRow, error: requesterUsuariosErr } = await supabaseAdmin
        .from('usuarios')
        .select('id')
        .eq('email', requester.email)
        .maybeSingle();
      if (!requesterUsuariosErr && requesterUsuariosRow?.id) {
        requesterUsuariosId = requesterUsuariosRow.id;
      }
      console.log('[invite-member][requester]', { requesterIdAuth: requester.id, requesterEmail: requester.email, requesterUsuariosId });
    }

    // Authorize: Owner of the company or Admin member can invite
    const { data: empresaRow, error: empresaError } = await supabaseAdmin
      .from('empresa')
      .select('usuario_id')
      .eq('id', companyId)
      .maybeSingle();

    if (empresaError || !empresaRow) {
      return new Response(JSON.stringify({ error: 'Invalid companyId or company not found' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOwner = empresaRow.usuario_id === requester.id;
    const matchesUsuariosId = requesterUsuariosId ? (empresaRow.usuario_id === requesterUsuariosId) : false;
    console.log('[invite-member][owner-check]', {
      companyId,
      ownerIdAuth: empresaRow.usuario_id,
      requesterIdAuth: requester.id,
      requesterEmail: requester.email,
      requesterUsuariosId,
      isOwner,
      ownerMatchesRequesterUsuarios: matchesUsuariosId
    });
    let isAdmin = false;

    if (!isOwner) {
      const { data: memberRow, error: memberCheckError } = await supabaseAdmin
        .from('empresa_miembros')
        .select('role')
        .eq('empresa_id', companyId)
        .eq('usuario_id', requester.id)
        .maybeSingle();

      console.log('[invite-member][auth-check]', {
        companyId,
        requesterId: requester.id,
        ownerId: empresaRow.usuario_id,
        memberRowRole: memberRow?.role,
        memberCheckError: memberCheckError?.message
      });

      if (!memberCheckError && memberRow) {
        isAdmin = memberRow.role === 'admin';
      }
    }

    console.log('[invite-member][auth-result]', { isOwner, isAdmin, companyId });

    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Only Admins or Owners can invite members' }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar si el usuario existe en la tabla usuarios (o auth.users)
    // Usamos maybeSingle para no lanzar error si no existe
    const { data: existingUser, error: userError } = await supabaseAdmin
      .from("usuarios")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (userError) {
      console.error("Error checking user:", userError);
      // No lanzamos error, simplemente asumimos que no existe
    }

    // Si el usuario existe, validamos que no sea ya miembro
    if (existingUser) {
      // 1.1.a Validar duplicados: ya miembro de la empresa
      const { data: existingMember, error: memberError } = await supabaseAdmin
        .from('empresa_miembros')
        .select('id')
        .eq('empresa_id', companyId)
        .eq('usuario_id', existingUser.id)
        .maybeSingle();

      if (memberError) {
        throw new Error(memberError.message || 'Error verificando miembros existentes');
      }
      if (existingMember) {
        throw new Error('Esa persona ya es miembro de la empresa');
      }

      // 1.1.b Validar si es el dueño (owner) de la empresa
      const { data: empresaOwner, error: ownerError } = await supabaseAdmin
        .from('empresa')
        .select('id')
        .eq('id', companyId)
        .eq('usuario_id', existingUser.id)
        .maybeSingle();

      if (ownerError) {
        throw new Error(ownerError.message || 'Error verificando dueño de la empresa');
      }
      if (empresaOwner) {
        throw new Error('Esa persona ya es miembro (owner) de la empresa');
      }
    }

    // 1.2 Validar duplicados: invitación pendiente existente
    const { data: existingInvite, error: inviteCheckError } = await supabaseAdmin
      .from('equipo_invitaciones')
      .select('id')
      .eq('empresa_id', companyId)
      .eq('invited_email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle();

    if (inviteCheckError) {
      throw new Error(inviteCheckError.message || 'Error verificando invitaciones existentes');
    }
    if (existingInvite) {
      throw new Error('Ya existe una invitación pendiente para este correo');
    }

    const token = crypto.randomUUID();

    // 2. Insertar en equipo_invitaciones
    const { error: dbError } = await supabaseAdmin
      .from("equipo_invitaciones")
      .insert({
        equipo_id: teamId,
        empresa_id: companyId,
        invited_email: normalizedEmail,
        invited_usuario_id: existingUser ? existingUser.id : null, // Vinculamos si existe, sino null
        token: token,
        invited_nombre: name,
        invited_titulo_trabajo: role,
        pipeline_ids: Array.isArray(pipelineIds) ? pipelineIds : [],
        permission_role: permissionRole || 'viewer'
      });

    if (dbError) throw dbError;

    // 3. Enviar correo vía proveedor (Resend) con soporte multicliente
    // Precedencia de configuración:
    //   a) Overrides de prueba vía headers (solo Owner/Admin)
    //   b) Integración guardada por empresa (tabla integraciones + integracion_credenciales)
    //   c) Variables de entorno globales
    const ENABLE_EMAILS = (Deno.env.get('ENABLE_EMAILS') || 'true').toLowerCase();

    // Intentar resolver configuración por empresa desde base de datos
    async function resolveEmailConfig() {
      try {
        const { data: integration } = await supabaseAdmin
          .from('integraciones')
          .select('*')
          .eq('empresa_id', companyId)
          .eq('provider', 'resend')
          .maybeSingle();

        let credsMap: Record<string, string> = {};
        if (integration?.id) {
          const { data: creds } = await supabaseAdmin
            .from('integracion_credenciales')
            .select('key, value')
            .eq('integracion_id', integration.id);
          for (const c of (creds || []) as Array<{ key: string; value: string }>) {
            credsMap[c.key] = c.value;
          }
        }

        const envDomain = Deno.env.get('RESEND_DOMAIN');
        const envFrom = Deno.env.get('RESEND_FROM') || (envDomain ? `no-reply@${envDomain}` : undefined);
        return {
          apiKey: credsMap['api_key'] || Deno.env.get('RESEND_API_KEY'),
          from: credsMap['from'] || envFrom,
          domain: credsMap['domain'] || envDomain,
        } as { apiKey?: string; from?: string; domain?: string };
      } catch (e) {
        console.warn('[invite-member] Error resolviendo integración de correo:', e);
        const envDomain = Deno.env.get('RESEND_DOMAIN');
        return {
          apiKey: Deno.env.get('RESEND_API_KEY'),
          from: Deno.env.get('RESEND_FROM') || (envDomain ? `no-reply@${envDomain}` : undefined),
          domain: envDomain
        };
      }
    }

    // Overrides de prueba desde headers (no persistentes). Solo se aplican si es Owner/Admin.
    const overrideProvider = req.headers.get('x-email-provider') || req.headers.get('X-Email-Provider');
    const overrideApiKey = req.headers.get('x-email-api-key') || req.headers.get('X-Email-Api-Key');
    const overrideFrom = req.headers.get('x-email-from') || req.headers.get('X-Email-From');
    const overrideDomain = req.headers.get('x-email-domain') || req.headers.get('X-Email-Domain');

    let emailCfg = await resolveEmailConfig();
    if ((isOwner || isAdmin) && (overrideProvider === 'resend')) {
      emailCfg = {
        apiKey: overrideApiKey || emailCfg.apiKey,
        from: overrideFrom || emailCfg.from,
        domain: overrideDomain || emailCfg.domain,
      };
      console.log('[invite-member] Aplicando overrides de correo via headers para pruebas');
    }

    // Usar el origen de la petición (navegador) para construir el link correcto, 
    // útil para desarrollo local en puertos dinámicos.
    const origin = req.headers.get("origin");
    const APP_URL = Deno.env.get('APP_URL');
    const baseUrl = origin || APP_URL || 'https://example.com';

    let emailResult: { sent: boolean; reason?: string } = { sent: false };

    if (ENABLE_EMAILS === 'false' || ENABLE_EMAILS === '0' || ENABLE_EMAILS === 'off') {
      console.warn('[invite-member] Emails deshabilitados por ENABLE_EMAILS');
      emailResult = { sent: false, reason: 'Emails disabled by ENABLE_EMAILS' };
    } else if (!emailCfg.apiKey) {
      console.warn('[invite-member] Falta RESEND_API_KEY, se omite envío de correo');
      emailResult = { sent: false, reason: 'Missing RESEND_API_KEY' };
    } else if (!emailCfg.from) {
      console.warn('[invite-member] Falta RESEND_FROM o RESEND_DOMAIN para construir el remitente verificado');
      emailResult = { sent: false, reason: 'Missing RESEND_FROM/RESEND_DOMAIN' };
    } else {
      const acceptUrl = `${baseUrl}/?token=${token}`;
      const html = `
        <!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación al equipo</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .logo {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo img {
      height: 40px;
      width: auto;
    }
    h1 {
      color: #1a1a1a;
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 20px;
      text-align: center;
    }
    p {
      margin-bottom: 16px;
      font-size: 16px;
    }
    .role-badge {
      background-color: #f3f4f6;
      padding: 12px;
      border-radius: 6px;
      text-align: center;
      margin: 24px 0;
      font-weight: 500;
    }
    .button-container {
      text-align: center;
      margin-top: 32px;
      margin-bottom: 32px;
    }
    .button {
      background-color: #000000;
      color: #ffffff;
      padding: 14px 28px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      display: inline-block;
      transition: background-color 0.2s;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 14px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">
        <!-- Puedes reemplazar esto con tu logo real -->
        <span style="font-size: 24px; font-weight: bold;">CRM Pro</span>
      </div>
      
      <h1>¡Hola ${name}!</h1>
      
      <p>Has sido invitado a formar parte del equipo en <strong>CRM Pro</strong>.</p>
      
      <div class="role-badge">
        Rol asignado: <strong>${role}</strong>
      </div>
      
      <p>Para comenzar a colaborar con tu equipo, por favor acepta la invitación haciendo clic en el botón de abajo:</p>
      
      <div class="button-container">
        <a href="${acceptUrl}" class="button">Aceptar Invitación</a>
      </div>
      
      <p style="font-size: 14px; color: #666;">
        Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:<br>
        <a href="${acceptUrl}" style="color: #000000;">${acceptUrl}</a>
      </p>
    </div>
    
    <div class="footer">
      <p>Si no esperabas esta invitación, puedes ignorar este correo.</p>
      <p>&copy; ${new Date().getFullYear()} CRM Pro. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
      `;

      // Log remitente y destinatario para diagnóstico
      console.log('[invite-member] Sending email via Resend', {
        from: `Invitaciones <${emailCfg.from}>`,
        to: normalizedEmail,
        tenantDomain: emailCfg.domain || null,
      });

      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${emailCfg.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `CRM Pro <${emailCfg.from}>`,
          to: normalizedEmail,
          subject: 'Invitación a un equipo',
          html
        })
      });

      if (!sendRes.ok) {
        let errText = await sendRes.text();
        // Intentar parsear JSON si es válido para obtener message y name
        let parsed: any = null;
        try { parsed = JSON.parse(errText); } catch (_) { }
        const statusCode = sendRes.status;
        const baseReason = parsed?.message || parsed?.error || errText || 'Unknown Resend error';
        const validationHint = (statusCode === 403 && /testing emails|verify a domain/i.test(baseReason))
          ? 'El dominio/remitente todavía no está verificado en Resend o estás usando un FROM distinto al dominio verificado.'
          : undefined;
        console.error('[invite-member] Error enviando correo Resend', { statusCode, baseReason, from: emailCfg.from, to: normalizedEmail });
        emailResult = { sent: false, reason: `Resend ${statusCode}: ${baseReason}${validationHint ? ' - ' + validationHint : ''}` };
      } else {
        emailResult = { sent: true };
      }
    }

    return new Response(JSON.stringify({ message: "Invitación enviada exitosamente", email: emailResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
