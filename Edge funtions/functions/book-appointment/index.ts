// @deno-types="https://deno.land/std@0.168.0/http/server.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @deno-types="https://esm.sh/@supabase/supabase-js@2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOOK_APPOINTMENT_TOKEN = Deno.env.get("BOOK_APPOINTMENT_TOKEN") ?? "";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ──────────────────────────────────────────────────────────────
// Helper: respuesta JSON estándar
// ──────────────────────────────────────────────────────────────
function jsonResponse(body: object, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// ──────────────────────────────────────────────────────────────
// Helper: normalizar teléfono (solo dígitos)
// ──────────────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
    return (raw ?? "")
        .replace("@c.us", "")
        .replace("@s.whatsapp.net", "")
        .replace(/[\s\-\+\(\)]/g, "")
        .trim();
}

// ──────────────────────────────────────────────────────────────
// Helper: construir fecha/hora ISO a partir de date + time
// Acepta varios formatos:
//   date: "2026-02-25" | "25/02/2026" | ISO
//   time: "10:00" | "10:00 AM" | "14:30"
// ──────────────────────────────────────────────────────────────
function buildDateTime(date: string, time: string): Date | null {
    try {
        // Si ya viene como ISO completo, úsalo directo
        if (date.includes("T")) return new Date(date);

        // Normalizar date a YYYY-MM-DD
        let isoDate = date;
        if (date.includes("/")) {
            const parts = date.split("/");
            if (parts.length === 3) {
                // dd/mm/yyyy → yyyy-mm-dd
                isoDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
            }
        }

        // Normalizar time a HH:MM (24h)
        let isoTime = time.trim();
        const amPmMatch = isoTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (amPmMatch) {
            let hours = parseInt(amPmMatch[1]);
            const minutes = amPmMatch[2];
            const period = amPmMatch[3].toUpperCase();
            if (period === "PM" && hours < 12) hours += 12;
            if (period === "AM" && hours === 12) hours = 0;
            isoTime = `${String(hours).padStart(2, "0")}:${minutes}`;
        }

        const dt = new Date(`${isoDate}T${isoTime}:00`);
        return isNaN(dt.getTime()) ? null : dt;
    } catch {
        return null;
    }
}

// ──────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────
serve(async (req) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    console.log("=".repeat(60));
    console.log("📅 [book-appointment] Nueva petición");
    console.log("=".repeat(60));

    try {
        // ── 1. Parsear body ──────────────────────────────────────
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            return jsonResponse({ error: "Body JSON inválido" }, 400);
        }

        // ── 2. Autenticación: token en body O en Authorization header ──
        const headerAuth = (req.headers.get("Authorization") ?? "")
            .replace("Bearer ", "")
            .trim();
        const bodyToken = (body.token ?? "").trim();
        const receivedToken = bodyToken || headerAuth;

        console.log(
            `🔑 [auth] Token recibido (primeros 8): ${receivedToken.substring(0, 8)}...`
        );

        if (!BOOK_APPOINTMENT_TOKEN) {
            console.error("❌ [auth] BOOK_APPOINTMENT_TOKEN no está configurado en secrets");
            return jsonResponse(
                { error: "Endpoint no configurado: falta BOOK_APPOINTMENT_TOKEN en secrets" },
                500
            );
        }

        if (!receivedToken || receivedToken !== BOOK_APPOINTMENT_TOKEN) {
            console.warn("❌ [auth] Token inválido");
            return jsonResponse({ error: "Unauthorized: token inválido" }, 401);
        }

        console.log("✅ [auth] Token válido");

        // ── 3. Extraer y validar campos ──────────────────────────
        const {
            phone,
            title,
            date,
            time,
            duration_minutes,
            notes,
            // campos alternativos que la Super API podría enviar
            telefono,
            titulo,
            fecha,
            hora,
            duracion,
            notas,
        } = body;

        // Soporte de nombres en español e inglés
        const rawPhone: string = phone ?? telefono ?? "";
        const rawTitle: string = title ?? titulo ?? "";
        const rawDate: string = date ?? fecha ?? "";
        const rawTime: string = time ?? hora ?? "09:00";
        const rawDuration: number =
            parseInt(duration_minutes ?? duracion ?? "30") || 30;
        const rawNotes: string = notes ?? notas ?? "";

        // Validaciones obligatorias
        if (!rawPhone) {
            return jsonResponse(
                { error: "Campo requerido: phone (número de teléfono del cliente)" },
                400
            );
        }
        if (!rawTitle) {
            return jsonResponse({ error: "Campo requerido: title (título de la cita)" }, 400);
        }
        if (!rawDate) {
            return jsonResponse(
                { error: "Campo requerido: date (fecha de la cita, ej: 2026-02-25)" },
                400
            );
        }

        const cleanPhone = normalizePhone(rawPhone);
        console.log(`📞 [phone] Normalizado: ${cleanPhone}`);

        // Construir DateTime
        const startTime = buildDateTime(rawDate, rawTime);
        if (!startTime) {
            return jsonResponse(
                {
                    error: `No se pudo interpretar la fecha/hora: date="${rawDate}" time="${rawTime}". Use formato YYYY-MM-DD y HH:MM`,
                },
                400
            );
        }
        const endTime = new Date(startTime.getTime() + rawDuration * 60000);

        console.log(`📅 [datetime] Inicio: ${startTime.toISOString()}`);
        console.log(`📅 [datetime] Fin: ${endTime.toISOString()}`);
        console.log(`📅 [datetime] Duración: ${rawDuration} min`);

        // ── 4. Inicializar Supabase ──────────────────────────────
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // ── 5. Buscar lead por teléfono ──────────────────────────
        console.log(`🔍 [lead] Buscando lead con teléfono: ${cleanPhone}`);

        const { data: leads, error: leadError } = await supabase
            .from("lead")
            .select("id, empresa_id, nombre_completo, telefono")
            .ilike("telefono", `%${cleanPhone}%`)
            .limit(5);

        if (leadError) {
            console.error("❌ [lead] Error en query:", leadError);
            return jsonResponse({ error: "Error buscando lead en la base de datos" }, 500);
        }

        if (!leads || leads.length === 0) {
            console.warn(`⚠️ [lead] No se encontró lead con teléfono: ${cleanPhone}`);
            return jsonResponse(
                {
                    error: `No se encontró ningún lead con el teléfono: ${cleanPhone}. Asegúrate de que el contacto existe en el CRM.`,
                    phone_searched: cleanPhone,
                },
                404
            );
        }

        // Usar el primer lead encontrado (el más relevante)
        const lead = leads[0];
        console.log(`✅ [lead] Encontrado: ${lead.nombre_completo} (ID: ${lead.id}, Empresa: ${lead.empresa_id})`);

        // ── 6. Insertar en lead_reuniones ────────────────────────
        console.log(`📝 [reunion] Creando cita en lead_reuniones...`);

        const { data: reunion, error: reunionError } = await supabase
            .from("lead_reuniones")
            .insert({
                lead_id: lead.id,
                empresa_id: lead.empresa_id,
                titulo: rawTitle,
                fecha: startTime.toISOString(),
                duracion_minutos: rawDuration,
                notas: rawNotes || null,
                created_by: null, // Sin usuario (creada por bot)
            })
            .select()
            .single();

        if (reunionError) {
            console.error("❌ [reunion] Error insertando:", reunionError);
            return jsonResponse(
                { error: `Error creando la cita: ${reunionError.message}` },
                500
            );
        }

        console.log(`✅ [reunion] Cita creada con ID: ${reunion.id}`);

        // ── 7. Notificación al owner de la empresa ───────────────
        try {
            const { data: empresa } = await supabase
                .from("empresa")
                .select("owner_id, nombre_empresa")
                .eq("id", lead.empresa_id)
                .maybeSingle();

            if (empresa?.owner_id) {
                await supabase.from("notificaciones").insert({
                    user_id: empresa.owner_id,
                    tipo: "nueva_cita_bot",
                    titulo: "Nueva cita agendada por IA",
                    mensaje: `${lead.nombre_completo} agendó: "${rawTitle}" para el ${startTime.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })} a las ${rawTime}`,
                    datos: {
                        lead_id: lead.id,
                        reunion_id: reunion.id,
                        empresa_id: lead.empresa_id,
                        start_time: startTime.toISOString(),
                    },
                    leido: false,
                });
                console.log(`🔔 [notif] Notificación enviada al owner: ${empresa.owner_id}`);
            }
        } catch (notifError) {
            // No fallar si la notificación falla
            console.warn("[notif] No se pudo crear notificación:", notifError);
        }

        // ── 8. Respuesta exitosa ─────────────────────────────────
        return jsonResponse({
            success: true,
            appointment_id: reunion.id,
            lead: {
                id: lead.id,
                name: lead.nombre_completo,
                phone: lead.telefono,
            },
            appointment: {
                title: rawTitle,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                duration_minutes: rawDuration,
                notes: rawNotes || null,
            },
            message: `Cita "${rawTitle}" agendada exitosamente para ${lead.nombre_completo}`,
        });
    } catch (err: any) {
        console.error("❌ [fatal] Error inesperado:", err);
        return jsonResponse({ error: err?.message ?? "Error interno del servidor" }, 500);
    }
});
