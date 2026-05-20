import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Crown,
    Sparkle,
    WhatsappLogo,
    ChartBar,
    ChatCircleDots,
    Play,
    Pause,
    CheckCircle,
    Robot,
    Lightning,
    Brain,
    PlugsConnected,
    MagicWand,
    Stack,
    UserCircleGear,
    Flag,
    Archive,
    ChatCircleText,
    LightbulbFilament,
    ArrowRight,
    MagnifyingGlass,
    PaperPlaneTilt,
    ChartLineUp,
    Quotes,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { getWhatsAppUrl } from '@/lib/guestContact'

/**
 * Vista que solo se monta en `/guest/premium`. Sirve como "showroom" de las
 * funcionalidades que un invitado no puede usar todavía. Muestra video real
 * de cada funcionalidad + bullets de qué hace, para invitar a contratar.
 *
 * Los videos viven en /public y se referencian por URL absoluta. Los nombres
 * tienen espacios y por eso usamos los paths exactos (el navegador resuelve
 * el encoding solo).
 */

interface Feature {
    id: string
    title: string
    tagline: string
    description: string
    bullets: string[]
    videoSrc: string
    Icon: typeof Crown
    accent: string // tailwind text-* + bg-* color tokens
}

const FEATURES: Feature[] = [
    {
        id: 'analytics',
        title: 'Analíticas avanzadas',
        tagline: 'Visualiza el rendimiento real de tu negocio',
        description:
            'Dashboard con métricas en tiempo real de tu pipeline, tasas de conversión, rendimiento por asesor, ingresos proyectados y embudos de venta. Toma decisiones basadas en datos, no en intuición.',
        bullets: [
            'Conversión por etapa del pipeline',
            'Ranking de asesores y carga de trabajo',
            'Análisis de tiempos de respuesta',
            'Reportes exportables',
        ],
        videoSrc: '/Video de analiticas .mp4',
        Icon: ChartBar,
        accent: 'from-blue-500/20 to-blue-500/5 text-blue-600',
    },
    {
        id: 'superapi',
        title: 'Chat conectado a WhatsApp',
        tagline: 'Recibe y responde mensajes de WhatsApp dentro del CRM',
        description:
            'Integración directa con WhatsApp Business mediante SuperAPI. Tus clientes te escriben por WhatsApp y los mensajes entran al CRM en tiempo real, asociados a la oportunidad correcta.',
        bullets: [
            'Mensajes entrantes y salientes en vivo',
            'Asignación automática a leads existentes',
            'Multi-cuenta de WhatsApp por empresa',
            'Notificaciones en tiempo real',
        ],
        videoSrc: '/Chat con SuperAPI.mp4',
        Icon: WhatsappLogo,
        accent: 'from-emerald-500/20 to-emerald-500/5 text-emerald-600',
    },
    {
        id: 'chat-features',
        title: 'Funcionalidades del chat',
        tagline: 'Conversa con tus clientes como un equipo profesional',
        description:
            'Plantillas, mensajes predeterminados, notas de voz, archivos, imágenes, etiquetas, paste desde clipboard y mucho más. Todo lo que necesitas para una conversación profesional sin salir del CRM.',
        bullets: [
            'Mensajes predeterminados con variables',
            'Plantillas aprobadas por Meta',
            'Notas de voz directas',
            'Adjuntos multimedia (imágenes, PDF, audio)',
        ],
        videoSrc: '/Funcionalidades del chat.mp4',
        Icon: ChatCircleDots,
        accent: 'from-violet-500/20 to-violet-500/5 text-violet-600',
    },
]

export function PremiumView() {
    return (
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-background via-background to-amber-500/5">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
                <Header />

                <div className="space-y-12">
                    {FEATURES.map((feature, idx) => (
                        <FeatureBlock key={feature.id} feature={feature} index={idx} />
                    ))}
                </div>

                <UltraPremiumSection />

                <ClosingCta />
            </div>
        </div>
    )
}

function Header() {
    return (
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 shadow-sm">
                <Crown size={14} weight="fill" className="text-amber-600" />
                <span className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                    Premium
                </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight">
                Funcionalidades que <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">multiplican tu equipo</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Estas son las funciones que están bloqueadas en tu versión actual. Mira cómo
                funcionan y, cuando estés listo, hablemos para activarlas en tu cuenta.
            </p>
            <div className="flex justify-center pt-2">
                <Button
                    asChild
                    size="lg"
                    className="h-12 bg-green-600 hover:bg-green-700 text-white gap-2 rounded-xl shadow-lg shadow-green-600/30 font-bold"
                >
                    <a
                        href={getWhatsAppUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <WhatsappLogo size={20} weight="fill" />
                        Hablar con Morna Tech
                    </a>
                </Button>
            </div>
        </div>
    )
}

function FeatureBlock({ feature, index }: { feature: Feature; index: number }) {
    const reverse = index % 2 === 1
    return (
        <div
            className={cn(
                'grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center animate-in fade-in duration-500',
                reverse && 'lg:[&>:first-child]:order-2'
            )}
        >
            {/* Video player */}
            <FeatureVideo src={feature.videoSrc} accent={feature.accent} />

            {/* Specs */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-sm',
                        feature.accent
                    )}>
                        <feature.Icon size={22} weight="duotone" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xl sm:text-2xl font-black leading-tight">{feature.title}</h2>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
                            {feature.tagline}
                        </p>
                    </div>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                </p>

                <ul className="space-y-2">
                    {feature.bullets.map(b => (
                        <li key={b} className="flex items-start gap-2 text-sm">
                            <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />
                            <span className="text-foreground/80">{b}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

function FeatureVideo({ src, accent }: { src: string; accent: string }) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [hasStarted, setHasStarted] = useState(false)

    // Pausa este video si otro <video> del documento empieza a reproducirse.
    // El evento 'play' no burbujea, por eso usamos capture: true.
    useEffect(() => {
        const handleOtherPlay = (e: Event) => {
            const target = e.target as HTMLVideoElement | null
            const self = videoRef.current
            if (!self || !target || target === self) return
            if (target.tagName === 'VIDEO' && !self.paused) {
                self.pause()
            }
        }
        document.addEventListener('play', handleOtherPlay, true)
        return () => document.removeEventListener('play', handleOtherPlay, true)
    }, [])

    const togglePlay = () => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) {
            v.play()
            setIsPlaying(true)
            setHasStarted(true)
        } else {
            v.pause()
            setIsPlaying(false)
        }
    }

    return (
        <div className={cn(
            'relative rounded-2xl overflow-hidden border border-border/40 shadow-xl bg-gradient-to-br',
            accent
        )}>
            <video
                ref={videoRef}
                src={src}
                className="w-full h-auto block bg-black"
                playsInline
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
            />
            {/* Overlay con botón play hasta que arranca */}
            {!hasStarted && (
                <button
                    type="button"
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group"
                    aria-label="Reproducir video"
                >
                    <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white/95 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                        <Play size={28} weight="fill" className="text-slate-900 ml-1" />
                    </div>
                </button>
            )}
            {/* Botón pequeño cuando ya empezó */}
            {hasStarted && (
                <button
                    type="button"
                    onClick={togglePlay}
                    className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur flex items-center justify-center transition-colors"
                    aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                >
                    {isPlaying ? (
                        <Pause size={14} weight="fill" className="text-white" />
                    ) : (
                        <Play size={14} weight="fill" className="text-white ml-0.5" />
                    )}
                </button>
            )}
        </div>
    )
}

// ============================================================
// Sección Ultra Premium: explica el MCP + IA conectados al CRM
// ============================================================

interface McpCapability {
    Icon: typeof Crown
    title: string
    description: string
    color: string // text color
    bg: string    // bg gradient
}

const MCP_CAPABILITIES: McpCapability[] = [
    {
        Icon: Stack,
        title: 'Mueve etapas del pipeline',
        description: 'La IA detecta el momento del lead y lo avanza de etapa automáticamente, sin que tu equipo lo mueva a mano.',
        color: 'text-violet-600',
        bg: 'from-violet-500/20 to-violet-500/5',
    },
    {
        Icon: UserCircleGear,
        title: 'Asigna oportunidades',
        description: 'Reparte leads al asesor correcto según carga de trabajo, especialidad o pipeline, con un solo comando.',
        color: 'text-fuchsia-600',
        bg: 'from-fuchsia-500/20 to-fuchsia-500/5',
    },
    {
        Icon: Flag,
        title: 'Cambia prioridades',
        description: 'Eleva o baja la prioridad de cada oportunidad analizando el contexto de la conversación.',
        color: 'text-rose-600',
        bg: 'from-rose-500/20 to-rose-500/5',
    },
    {
        Icon: ChatCircleText,
        title: 'Sugiere respuestas',
        description: 'Lee la conversación completa y propone el siguiente mensaje exacto a enviar, listo para revisar y aprobar.',
        color: 'text-indigo-600',
        bg: 'from-indigo-500/20 to-indigo-500/5',
    },
    {
        Icon: LightbulbFilament,
        title: 'Analítica conversacional',
        description: 'Pregúntale a tu CRM en lenguaje natural: "¿cuánto vendí este mes?", "¿quién es mi mejor asesor?" — y te responde.',
        color: 'text-amber-600',
        bg: 'from-amber-500/20 to-amber-500/5',
    },
    {
        Icon: Archive,
        title: 'Archiva y depura',
        description: 'Cierra leads fríos, archiva chats sin actividad y mantiene tu pipeline limpio mientras tú duermes.',
        color: 'text-emerald-600',
        bg: 'from-emerald-500/20 to-emerald-500/5',
    },
]

function UltraPremiumSection() {
    return (
        <section className="relative overflow-hidden rounded-[2rem] border border-violet-500/20 bg-gradient-to-br from-slate-950 via-violet-950/90 to-indigo-950 shadow-2xl shadow-violet-900/30">
            {/* Decoración de fondo */}
            <div aria-hidden className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl" />
            </div>

            <div className="relative px-6 sm:px-10 py-12 sm:py-16 space-y-12">
                {/* Header */}
                <div className="text-center space-y-5 max-w-3xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 border border-violet-400/40 backdrop-blur-sm shadow-lg shadow-violet-500/30">
                        <Crown size={14} weight="fill" className="text-amber-300" />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">
                            Ultra Premium · Solo para clientes Hubmy
                        </span>
                    </div>

                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
                        Funcionalidades{' '}
                        <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">
                            ULTRA PREMIUM
                        </span>
                        <br />
                        que potencian tu CRM
                    </h2>

                    <p className="text-sm sm:text-base text-violet-100/80 leading-relaxed max-w-2xl mx-auto">
                        Tu CRM deja de ser una hoja de cálculo bonita y se convierte en{' '}
                        <span className="text-white font-bold">un equipo virtual que trabaja contigo 24/7.</span>{' '}
                        Conectado a inteligencia artificial mediante <span className="text-fuchsia-300 font-bold">MCP</span>,
                        capaz de tomar acciones reales dentro de tu negocio.
                    </p>
                </div>

                {/* Diagrama de flujo IA ↔ MCP ↔ CRM */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 max-w-3xl mx-auto">
                    <FlowNode
                        Icon={Brain}
                        label="Inteligencia"
                        sub="La IA entiende tu negocio"
                        gradient="from-violet-500 to-indigo-600"
                    />
                    <FlowConnector />
                    <FlowNode
                        Icon={PlugsConnected}
                        label="MCP"
                        sub="El puente que conecta todo"
                        gradient="from-fuchsia-500 to-pink-600"
                        highlight
                    />
                    <FlowConnector />
                    <FlowNode
                        Icon={Robot}
                        label="Acción en tu CRM"
                        sub="Mueve, asigna, responde"
                        gradient="from-amber-500 to-orange-600"
                    />
                </div>

                {/* Explicación del MCP */}
                <div className="max-w-3xl mx-auto rounded-2xl border border-fuchsia-400/30 bg-white/5 backdrop-blur-sm p-6 sm:p-8 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/40">
                            <PlugsConnected size={20} weight="fill" className="text-white" />
                        </div>
                        <h3 className="text-lg sm:text-xl font-black text-white">
                            ¿Qué es el <span className="text-fuchsia-300">MCP</span> y por qué lo cambia todo?
                        </h3>
                    </div>
                    <p className="text-sm text-violet-100/85 leading-relaxed">
                        El <strong className="text-white">Model Context Protocol</strong> es la tecnología que le da{' '}
                        <strong className="text-white">manos</strong> a la inteligencia artificial dentro de tu CRM.
                        Mientras otros chatbots solo "hablan", el MCP permite que la IA{' '}
                        <strong className="text-white">tome decisiones, ejecute acciones y modifique tu pipeline</strong>{' '}
                        en tiempo real — exactamente como lo haría tu mejor asesor, pero sin pausas, sin descansos
                        y sin errores humanos.
                    </p>
                </div>

                {/* Grid de capabilities */}
                <div>
                    <div className="text-center mb-8 space-y-2">
                        <div className="inline-flex items-center gap-2 text-fuchsia-300 text-[11px] font-black uppercase tracking-[0.2em]">
                            <Lightning size={14} weight="fill" />
                            Lo que tu IA puede hacer por ti
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                            Una IA que <span className="text-amber-300">ejecuta</span>, no solo conversa
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {MCP_CAPABILITIES.map(cap => (
                            <McpCard key={cap.title} capability={cap} />
                        ))}
                    </div>
                </div>

                {/* Ejemplos de prompts reales */}
                <div className="space-y-6">
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center gap-2 text-amber-300 text-[11px] font-black uppercase tracking-[0.2em]">
                            <Quotes size={14} weight="fill" />
                            Habla con tu CRM como hablas con tu equipo
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                            Solo escribe lo que necesitas.{' '}
                            <span className="bg-gradient-to-r from-amber-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent">
                                La IA se encarga.
                            </span>
                        </h3>
                        <p className="text-sm text-violet-100/70 max-w-2xl mx-auto leading-relaxed">
                            Sin menús, sin filtros complicados, sin reportes que armar a mano. Estos son
                            ejemplos reales de lo que puedes pedirle a tu CRM:
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <PromptCard
                            Icon={MagnifyingGlass}
                            badge="Búsqueda inteligente"
                            badgeColor="from-violet-400 to-indigo-400"
                            prompt="Búscame todos los mejores posibles clientes de la semana pasada"
                            outcome="Lista filtrada por prioridad alta, presupuesto y actividad reciente — lista para llamar."
                        />
                        <PromptCard
                            Icon={PaperPlaneTilt}
                            badge="Campaña en segundos"
                            badgeColor="from-fuchsia-400 to-pink-400"
                            prompt="Escríbele a todos los leads que sean mujer un mensaje del Día de las Madres"
                            outcome="La IA filtra el segmento dentro del CRM y prepara el mensaje personalizado listo para que lo revises y envíes desde el chat."
                        />
                        <PromptCard
                            Icon={ChartLineUp}
                            badge="Reporte instantáneo"
                            badgeColor="from-amber-400 to-orange-400"
                            prompt="Dame un reporte de los vendedores: tiempos de respuesta y porcentaje de cierre"
                            outcome="El reporte aparece al instante dentro del CRM, en la vista de Analíticas, con gráficos comparativos y ranking del equipo."
                        />
                    </div>

                    <p className="text-center text-[12px] text-violet-200/60 max-w-2xl mx-auto italic">
                        Y muchísimo más. Si lo puedes decir en una frase, la IA lo puede ejecutar.
                    </p>
                </div>

                {/* Quote / Big idea */}
                <div className="relative max-w-3xl mx-auto text-center pt-4">
                    <MagicWand size={32} weight="fill" className="text-fuchsia-300 mx-auto mb-3" />
                    <p className="text-lg sm:text-2xl font-black text-white leading-snug tracking-tight">
                        "Es como contratar a un asesor senior que{' '}
                        <span className="bg-gradient-to-r from-amber-300 to-fuchsia-300 bg-clip-text text-transparent">
                            nunca duerme, nunca olvida y nunca falla
                        </span>
                        ."
                    </p>
                    <p className="text-xs sm:text-sm text-violet-200/70 mt-3 font-medium">
                        Disponible para clientes con suscripción activa de Hubmy.
                    </p>
                </div>

                {/* CTA */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <Button
                        asChild
                        size="lg"
                        className="h-12 px-8 bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-600 hover:to-violet-700 text-white gap-2 rounded-xl shadow-2xl shadow-fuchsia-500/40 font-black border border-white/20"
                    >
                        <a
                            href={getWhatsAppUrl('Hola Morna Tech, quiero activar las funcionalidades ULTRA PREMIUM con IA + MCP en mi CRM.')}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Sparkle size={18} weight="fill" />
                            Activar Ultra Premium
                            <ArrowRight size={16} weight="bold" />
                        </a>
                    </Button>
                </div>
            </div>
        </section>
    )
}

function FlowNode({
    Icon,
    label,
    sub,
    gradient,
    highlight,
}: {
    Icon: typeof Crown
    label: string
    sub: string
    gradient: string
    highlight?: boolean
}) {
    return (
        <div
            className={cn(
                'relative rounded-2xl border backdrop-blur-sm p-4 text-center transition-transform hover:scale-[1.02]',
                highlight
                    ? 'border-fuchsia-400/50 bg-white/10 shadow-2xl shadow-fuchsia-500/30'
                    : 'border-white/15 bg-white/5'
            )}
        >
            {highlight && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-400 text-[9px] font-black uppercase tracking-widest text-slate-900 shadow-md whitespace-nowrap">
                    Clave
                </div>
            )}
            <div
                className={cn(
                    'mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg mb-2',
                    gradient
                )}
            >
                <Icon size={22} weight="fill" className="text-white" />
            </div>
            <div className="text-sm font-black text-white">{label}</div>
            <div className="text-[11px] text-violet-100/70 mt-0.5 leading-tight">{sub}</div>
        </div>
    )
}

function FlowConnector() {
    return (
        <div className="hidden md:flex items-center justify-center" aria-hidden>
            <ArrowRight size={22} weight="bold" className="text-fuchsia-300/80" />
        </div>
    )
}

function McpCard({ capability: c }: { capability: McpCapability }) {
    return (
        <div className="group relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/0 backdrop-blur-sm p-5 hover:border-fuchsia-400/40 hover:bg-white/10 transition-all hover:-translate-y-0.5">
            <div
                className={cn(
                    'h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg mb-3',
                    c.bg
                )}
            >
                <c.Icon size={20} weight="duotone" className={c.color} />
            </div>
            <h4 className="text-sm font-black text-white mb-1.5 leading-tight">
                {c.title}
            </h4>
            <p className="text-[12px] leading-relaxed text-violet-100/75">
                {c.description}
            </p>
        </div>
    )
}

function PromptCard({
    Icon,
    badge,
    badgeColor,
    prompt,
    outcome,
}: {
    Icon: typeof Crown
    badge: string
    badgeColor: string
    prompt: string
    outcome: string
}) {
    return (
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/60 to-violet-900/30 backdrop-blur-sm p-5 hover:border-fuchsia-400/40 transition-all flex flex-col gap-4">
            {/* Badge superior */}
            <div className="flex items-center gap-2">
                <div
                    className={cn(
                        'h-8 w-8 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-md shrink-0',
                        badgeColor
                    )}
                >
                    <Icon size={16} weight="fill" className="text-slate-900" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/90">
                    {badge}
                </span>
            </div>

            {/* Burbuja del prompt (estilo chat del usuario) */}
            <div className="relative bg-gradient-to-br from-fuchsia-500/15 to-violet-500/10 border border-fuchsia-400/25 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-fuchsia-300/80 mb-1 flex items-center gap-1">
                    <ChatCircleText size={10} weight="fill" />
                    Tú le dices
                </div>
                <p className="text-sm text-white leading-snug font-medium italic">
                    "{prompt}"
                </p>
            </div>

            {/* Flecha conectora */}
            <div className="flex justify-center -my-2" aria-hidden>
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/40">
                    <Lightning size={14} weight="fill" className="text-white" />
                </div>
            </div>

            {/* Respuesta del CRM */}
            <div className="relative bg-white/8 border border-white/15 rounded-2xl rounded-tr-sm px-4 py-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-emerald-300 mb-1 flex items-center gap-1">
                    <Robot size={10} weight="fill" />
                    Tu CRM hace
                </div>
                <p className="text-[12px] leading-relaxed text-violet-100/90">
                    {outcome}
                </p>
            </div>
        </div>
    )
}

function ClosingCta() {
    return (
        <div className="text-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl p-8 sm:p-12 border border-primary/20 space-y-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-purple-600 shadow-lg shadow-primary/40">
                <Sparkle size={26} weight="fill" className="text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                ¿Listo para activarlas en tu CRM?
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Escríbenos por WhatsApp y te ayudamos a habilitar todas estas funcionalidades en
                menos de 24 horas. Sin compromiso, sin contratos largos.
            </p>
            <Button
                asChild
                size="lg"
                className="h-12 bg-green-600 hover:bg-green-700 text-white gap-2 rounded-xl shadow-lg shadow-green-600/30 font-bold"
            >
                <a
                    href={getWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <WhatsappLogo size={20} weight="fill" />
                    Contactar a Morna Tech
                </a>
            </Button>
        </div>
    )
}
