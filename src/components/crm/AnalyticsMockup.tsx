/**
 * Mockup estático del dashboard de analítica.
 * Se usa como "spoiler" detrás del GuestLock en modo invitado para que
 * el visitante vea cómo luce la funcionalidad real sin poder interactuar.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import {
  CurrencyDollar,
  TrendUp,
  Users,
  CheckCircle,
  ChartBar,
  ChartPieSlice,
  CaretUp,
  Sparkle,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const FAKE_PIPELINE_DATA = [
  { name: 'Nuevo', count: 24 },
  { name: 'Contactado', count: 18 },
  { name: 'Calificado', count: 12 },
  { name: 'Propuesta', count: 8 },
  { name: 'Negociación', count: 5 },
  { name: 'Ganado', count: 9 },
]

const FAKE_PRIORITY_DATA = [
  { name: 'Alta', value: 14, color: '#f43f5e' },
  { name: 'Media', value: 28, color: '#f59e0b' },
  { name: 'Baja', value: 34, color: '#10b981' },
]

function MockKpiCard({ title, value, subtitle, icon, gradient, themeColor, trend, bgIcon: BgIcon }: any) {
  return (
    <Card className={cn(
      "border-none shadow-sm rounded-2xl overflow-hidden relative bg-background",
      gradient
    )}>
      <div className={cn("absolute top-[-10px] right-[-10px] opacity-10", themeColor)}>
        {BgIcon && <BgIcon size={80} weight="fill" />}
      </div>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
        <CardTitle className={cn("text-xs font-bold uppercase tracking-widest opacity-80", themeColor)}>{title}</CardTitle>
        <div className="p-2 bg-background/50 rounded-lg backdrop-blur-sm border border-border/10 shadow-sm">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="flex items-baseline gap-2">
          <div className={cn("text-3xl font-black", themeColor)}>{value}</div>
          <div className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm bg-emerald-500/10 text-emerald-600 border-emerald-200">
            <CaretUp size={10} weight="bold" />
            {trend}
          </div>
        </div>
        <p className="text-xs font-medium text-muted-foreground mt-1 opacity-70">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

export function AnalyticsMockup() {
  return (
    <div className="flex-1 overflow-hidden p-4 sm:p-6 md:p-8 space-y-8 bg-background/50 pointer-events-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            Analítica
          </h1>
          <p className="text-muted-foreground mt-2 font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Información y métricas de rendimiento en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-2 bg-background border border-border/50 p-1.5 rounded-2xl shadow-sm">
          <div className="px-4 py-1.5 bg-primary text-white rounded-xl text-xs font-bold">Últimos 30 días</div>
          <div className="px-4 py-1.5 rounded-xl text-xs font-bold text-muted-foreground">Este trimestre</div>
        </div>
      </div>

      {/* AI Search Bar Mock */}
      <div className="relative">
        <div className="flex items-center gap-3 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-indigo-500/10 border border-violet-200/50 rounded-2xl px-5 py-4 shadow-sm">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/30">
            <Sparkle size={18} weight="fill" className="text-white" />
          </div>
          <div className="flex-1 text-sm font-medium text-muted-foreground">
            Pregunta lo que quieras sobre tus métricas…
          </div>
          <div className="px-4 py-1.5 bg-violet-600 text-white rounded-xl text-xs font-bold">Preguntar</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MockKpiCard
          title="Valor del Embudo"
          value="$184,500"
          subtitle="Presupuesto potencial filtrado"
          icon={<CurrencyDollar size={20} weight="bold" className="text-blue-600" />}
          gradient="bg-gradient-to-br from-blue-500/20 to-transparent border-blue-100/50"
          themeColor="text-blue-600"
          bgIcon={CurrencyDollar}
          trend="76 prospectos"
        />
        <MockKpiCard
          title="Ingresos Cerrados"
          value="$62,300"
          subtitle="Ventas ganadas confirmadas"
          icon={<TrendUp size={20} weight="bold" className="text-emerald-600" />}
          gradient="bg-gradient-to-br from-emerald-500/20 to-transparent border-emerald-100/50"
          themeColor="text-emerald-600"
          bgIcon={TrendUp}
          trend="9 clientes"
        />
        <MockKpiCard
          title="Tasa de Conversión"
          value="32%"
          subtitle="Promedio de cierre"
          icon={<Users size={20} weight="bold" className="text-purple-600" />}
          gradient="bg-gradient-to-br from-purple-500/20 to-transparent border-purple-100/50"
          themeColor="text-purple-600"
          bgIcon={Users}
          trend="Efectividad"
        />
        <MockKpiCard
          title="Histórico de Oportunidades"
          value="148"
          subtitle="Todas las oportunidades y chats"
          icon={<CheckCircle size={20} weight="bold" className="text-rose-600" />}
          gradient="bg-gradient-to-br from-rose-500/20 to-transparent border-rose-100/50"
          themeColor="text-rose-600"
          bgIcon={CheckCircle}
          trend="3 pipelines"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-none shadow-2xl shadow-black/5 rounded-[2rem] overflow-hidden bg-background">
          <CardHeader className="p-8 pb-0 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                <ChartBar size={24} weight="duotone" className="text-primary" />
                Oportunidades por Pipeline
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">Distribución volumétrica por etapa</p>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-6">
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={FAKE_PIPELINE_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="mockBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="url(#mockBarGradient)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-2xl shadow-black/5 rounded-[2rem] overflow-hidden bg-background">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-xl font-black tracking-tight flex items-center gap-2">
              <ChartPieSlice size={24} weight="duotone" className="text-primary" />
              Distribución por Prioridad
            </CardTitle>
            <p className="text-sm text-muted-foreground font-medium mt-1">Segmentación del embudo activo</p>
          </CardHeader>
          <CardContent className="p-8 pt-6">
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={FAKE_PRIORITY_DATA}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {FAKE_PRIORITY_DATA.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-4">
              {FAKE_PRIORITY_DATA.map(item => (
                <div key={item.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs font-bold text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
