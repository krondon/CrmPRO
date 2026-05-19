/**
 * Mockup estático de la bandeja de chats.
 * Se usa como "spoiler" detrás del GuestLock en modo invitado para que
 * el visitante vea cómo luce la funcionalidad real sin poder interactuar.
 */

import {
  MagnifyingGlass,
  WhatsappLogo,
  InstagramLogo,
  FacebookLogo,
  Check,
  Paperclip,
  Microphone,
  Smiley,
  PaperPlaneRight,
  DotsThree,
  Phone,
  VideoCamera,
  Info,
} from '@phosphor-icons/react'

const FAKE_LEADS = [
  {
    name: 'María González',
    phone: '+58 414 555 1234',
    initials: 'MG',
    lastMessage: 'Perfecto, espero la propuesta entonces 👍',
    time: '10:42',
    unread: 2,
    channel: 'whatsapp',
    color: 'bg-emerald-500',
    active: true,
  },
  {
    name: 'Carlos Mendoza',
    phone: '+58 412 887 4521',
    initials: 'CM',
    lastMessage: '¿Tienen disponibilidad para el viernes?',
    time: '09:18',
    unread: 1,
    channel: 'whatsapp',
    color: 'bg-blue-500',
  },
  {
    name: 'Ana Rodríguez',
    phone: 'ana_rodriguez',
    initials: 'AR',
    lastMessage: 'Me interesa el plan empresarial',
    time: 'Ayer',
    unread: 0,
    channel: 'instagram',
    color: 'bg-pink-500',
  },
  {
    name: 'Luis Pérez',
    phone: '+58 416 332 9981',
    initials: 'LP',
    lastMessage: 'Excelente atención, gracias!',
    time: 'Ayer',
    unread: 0,
    channel: 'whatsapp',
    color: 'bg-violet-500',
  },
  {
    name: 'Beatriz Salazar',
    phone: 'beatriz.s',
    initials: 'BS',
    lastMessage: '¿Podemos agendar una llamada?',
    time: 'Lun',
    unread: 0,
    channel: 'facebook',
    color: 'bg-orange-500',
  },
  {
    name: 'Roberto Silva',
    phone: '+58 424 118 7702',
    initials: 'RS',
    lastMessage: 'Voy a revisarlo con mi equipo',
    time: 'Lun',
    unread: 0,
    channel: 'whatsapp',
    color: 'bg-cyan-500',
  },
  {
    name: 'Patricia Núñez',
    phone: '+58 414 220 5588',
    initials: 'PN',
    lastMessage: 'Gracias por la información detallada',
    time: 'Dom',
    unread: 0,
    channel: 'whatsapp',
    color: 'bg-rose-500',
  },
]

const FAKE_MESSAGES = [
  { from: 'lead', text: 'Hola, buenos días! Vi su publicación en Instagram y me interesa conocer más sobre sus servicios.', time: '10:15' },
  { from: 'team', text: '¡Hola María! Gracias por contactarnos 😊 Con gusto te cuento. ¿En qué área específicamente estás interesada?', time: '10:18' },
  { from: 'lead', text: 'Principalmente automatización de WhatsApp y un CRM para mi equipo de ventas. Somos 5 vendedores.', time: '10:22' },
  { from: 'team', text: 'Perfecto, tenemos un plan ideal para equipos de tu tamaño. Te paso la propuesta con precios y características incluidas.', time: '10:25' },
  { from: 'lead', text: 'Genial, quedo atenta. También necesito saber si manejan integración con Instagram Direct.', time: '10:30' },
  { from: 'team', text: 'Sí, manejamos WhatsApp, Instagram y Facebook Messenger en una sola bandeja unificada. Te lo muestro en la demo 🚀', time: '10:33' },
  { from: 'lead', text: 'Perfecto, espero la propuesta entonces 👍', time: '10:42' },
]

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'instagram')
    return <InstagramLogo size={10} weight="fill" className="text-[#E1306C]" />
  if (channel === 'facebook')
    return <FacebookLogo size={10} weight="fill" className="text-[#1877F2]" />
  return <WhatsappLogo size={10} weight="fill" className="text-[#25D366]" />
}

export function ChatsMockup() {
  return (
    <div className="flex flex-1 min-h-0 bg-background w-full h-full">
      {/* Sidebar de chats */}
      <div className="hidden md:flex w-[340px] shrink-0 flex-col border-r border-border/50 bg-background">
        <div className="h-14 sm:h-16 px-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-base font-black tracking-tight">Chats</h2>
          <button className="p-2 rounded-full hover:bg-muted">
            <DotsThree size={20} weight="bold" />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border/40">
          <div className="flex items-center gap-2 bg-muted/50 border border-border/30 rounded-full px-3 py-1.5">
            <MagnifyingGlass size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground/60 font-medium">Buscar conversación</span>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {FAKE_LEADS.map((lead, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-3 border-b border-border/30 ${
                lead.active ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/30'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full ${lead.color} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}
              >
                {lead.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <ChannelIcon channel={lead.channel} />
                    <span className="font-bold text-[13px] truncate">{lead.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0">{lead.time}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground truncate">{lead.lastMessage}</p>
                  {lead.unread > 0 && (
                    <span className="h-5 min-w-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                      {lead.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ventana de chat abierta */}
      <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-background/95 min-w-0">
        {/* Header */}
        <div className="h-14 sm:h-16 px-4 border-b bg-background flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              MG
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm leading-tight">María González</h3>
              <p className="text-[11px] text-muted-foreground font-medium">+58 414 555 1234</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 mr-2 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold">
              <WhatsappLogo size={10} weight="fill" />
              WhatsApp
            </span>
            <button className="p-2 rounded-full hover:bg-muted">
              <Phone size={18} />
            </button>
            <button className="p-2 rounded-full hover:bg-muted">
              <VideoCamera size={18} />
            </button>
            <button className="p-2 rounded-full hover:bg-muted">
              <Info size={18} />
            </button>
          </div>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-hidden p-4 sm:p-6">
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="flex justify-center my-4">
              <span className="px-3 py-1 bg-background/80 border border-border/40 text-[10px] font-black text-muted-foreground rounded-full uppercase tracking-widest shadow-sm">
                Hoy
              </span>
            </div>

            {FAKE_MESSAGES.map((msg, i) => {
              const isTeam = msg.from === 'team'
              return (
                <div key={i} className={`flex ${isTeam ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] px-3.5 py-2 rounded-2xl shadow-sm text-[15px] ${
                      isTeam
                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                        : 'bg-white text-black rounded-tl-none border border-border/10'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed font-medium">
                      {msg.text}
                    </p>
                    <div
                      className={`text-[10px] mt-1 flex items-center gap-1.5 font-bold uppercase opacity-60 ${
                        isTeam ? 'justify-end text-white/90' : 'justify-start text-muted-foreground'
                      }`}
                    >
                      {msg.time}
                      {isTeam && (
                        <div className="flex items-center -space-x-1.5">
                          <Check className="w-3 h-3" weight="bold" />
                          <Check className="w-3 h-3" weight="bold" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t bg-background px-4 py-3">
          <div className="flex items-end gap-2">
            <button className="p-2 rounded-full text-muted-foreground">
              <Paperclip size={20} />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-muted/50 border border-border/50 rounded-3xl px-4 py-2.5">
              <span className="flex-1 text-sm text-muted-foreground/60 font-medium">
                Escribe un mensaje...
              </span>
              <button className="text-muted-foreground p-1">
                <Smiley size={20} />
              </button>
            </div>
            <button className="rounded-full h-11 w-11 bg-muted text-muted-foreground flex items-center justify-center">
              <Microphone size={20} />
            </button>
            <button className="rounded-full h-11 w-11 bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
              <PaperPlaneRight size={20} weight="fill" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
