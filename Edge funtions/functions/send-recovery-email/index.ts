// @deno-types="https://deno.land/std@0.168.0/http/server.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @deno-types="https://esm.sh/@supabase/supabase-js@2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { recovery_email, redirect_to } = await req.json();
        console.log("[send-recovery-email] recovery_email recibido:", recovery_email);

        if (!recovery_email) {
            return new Response(
                JSON.stringify({ error: "Falta el correo alternativo." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Buscar el usuario que tiene ese correo alternativo
        const { data: usuario, error: lookupError } = await supabaseAdmin
            .from("usuarios")
            .select("id, email")
            .eq("recovery_email", recovery_email.toLowerCase().trim())
            .maybeSingle();

        if (lookupError) {
            console.error("[send-recovery-email] Error DB:", lookupError.message);
            throw new Error("Error de base de datos.");
        }

        // Respuesta genérica (nunca revelar si existe o no)
        if (!usuario) {
            console.log("[send-recovery-email] Usuario no encontrado.");
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Si el correo alternativo es válido, recibirás el enlace en tu correo principal."
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const primaryEmail = usuario.email;
        const redirectTo = redirect_to || `${SUPABASE_URL}/update-password`;

        // 2. Enviar el link de recuperación al correo PRINCIPAL del usuario
        //    (único método disponible en Supabase Auth sin SMTP externo)
        const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
            primaryEmail,
            { redirectTo }
        );

        if (resetError) {
            console.error("[send-recovery-email] Error enviando reset:", resetError.message);
            throw new Error("No se pudo enviar el correo de recuperación.");
        }

        // Enmascarar el email para la respuesta
        const maskedEmail = maskEmail(primaryEmail);
        console.log("[send-recovery-email] Reset enviado al email principal:", maskedEmail);

        return new Response(
            JSON.stringify({
                success: true,
                message: `Verificación exitosa. Enviamos el enlace de recuperación a ${maskedEmail}.`
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error("[send-recovery-email] Error:", error.message);
        return new Response(
            JSON.stringify({ error: error.message || "Error interno del servidor." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

function maskEmail(email: string): string {
    const [user, domain] = email.split("@");
    if (!user || !domain) return email;
    const visible = user.slice(0, 2);
    const hidden = "•".repeat(Math.max(2, user.length - 2));
    return `${visible}${hidden}@${domain}`;
}
