import { useRef, useState } from 'react'
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
