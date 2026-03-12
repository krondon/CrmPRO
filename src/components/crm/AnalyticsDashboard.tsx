import { usePersistentState } from '@/hooks/usePersistentState'
import { Task } from '@/lib/types'
import { usePipelineData } from '@/hooks/usePipelineData'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useEffect, useState } from 'react'
import { getLeadsCount } from '@/supabase/services/leads'
import {
  CurrencyDollar,
  TrendUp,
  Users,
  CheckCircle,
  ChartBar,
  ChartPieSlice,
  CaretUp,
  CaretDown
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export function AnalyticsDashboard({ companyId }: { companyId?: string }) {
  const { user } = useAuth()
  const { leads, pipelines } = usePipelineData({
    companyId: companyId || '',
    userId: user?.id
  })
  const [tasks] = usePersistentState<Task[]>(`tasks-${companyId}`, [])

  const [dateRange, setDateRange] = useState<'30days' | 'quarter' | 'year'>('30days')
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    revenueTrend: 0,
    avgDealSize: 0,
    dealSizeTrend: 0,
    activeLeads: 0,
    leadsTrend: 0,
    completionRate: 0,
    tasksTrend: 0
  })

  useEffect(() => {
    if (!leads.length) return

    const now = new Date()
    let startDate = new Date()
    let prevStartDate = new Date()

    if (dateRange === '30days') {
      startDate.setDate(now.getDate() - 30)
      prevStartDate.setDate(now.getDate() - 60)
    } else if (dateRange === 'quarter') {
      startDate.setMonth(now.getMonth() - 3)
      prevStartDate.setMonth(now.getMonth() - 6)
    } else {
      startDate.setFullYear(now.getFullYear() - 1)
      prevStartDate.setFullYear(now.getFullYear() - 2)
    }

    // Filter current period
    const currentLeads = leads.filter(l => new Date(l.createdAt) >= startDate)
    const prevLeads = leads.filter(l => {
      const d = new Date(l.createdAt)
      return d >= prevStartDate && d < startDate
    })

    // Calculate Metrics
    const currentRevenue = currentLeads.reduce((acc, l) => acc + (l.budget || 0), 0)
    const prevRevenue = prevLeads.reduce((acc, l) => acc + (l.budget || 0), 0)

    const currentAvgDeal = currentLeads.length ? currentRevenue / currentLeads.length : 0
    const prevAvgDeal = prevLeads.length ? prevRevenue / prevLeads.length : 0

    const currentTasks = (tasks || []).filter(t => new Date(t.dueDate) >= startDate && t.completed).length
    const totalCurrentTasks = (tasks || []).filter(t => new Date(t.dueDate) >= startDate).length
    const taskRate = totalCurrentTasks ? Math.round((currentTasks / totalCurrentTasks) * 100) : 0

    const calcTrend = (curr: number, prev: number) => {
      if (!prev) return curr > 0 ? 100 : 0
      return Math.round(((curr - prev) / prev) * 100)
    }

    setMetrics({
      totalRevenue: currentRevenue,
      revenueTrend: calcTrend(currentRevenue, prevRevenue),
      avgDealSize: currentAvgDeal,
      dealSizeTrend: calcTrend(currentAvgDeal, prevAvgDeal),
      activeLeads: currentLeads.length,
      leadsTrend: calcTrend(currentLeads.length, prevLeads.length),
      completionRate: taskRate,
      tasksTrend: 0 // Mock for now as tasks don't have prev data easily accessible here
    })

    // Update charts data based on filtered leads...
  }, [leads, tasks, dateRange])

  const pipelineData = (pipelines || []).map(pipeline => ({
    name: pipeline.name,
    count: (leads || []).filter(l => l.pipeline === pipeline.id).length
  }))

  const pipelineChartWidth = Math.max(100 + (pipelineData.length * 120), 600)

  const priorityData = [
    { name: 'Alta', value: (leads || []).filter(l => l.priority === 'high').length, color: '#f43f5e' },
    { name: 'Media', value: (leads || []).filter(l => l.priority === 'medium').length, color: '#f59e0b' },
    { name: 'Baja', value: (leads || []).filter(l => l.priority === 'low').length, color: '#10b981' }
  ]

  const totalRevenue = (leads || []).reduce((sum, lead) => sum + (lead.budget || 0), 0)
  const avgDealSize = totalRevenue / ((leads || []).length || 1)
  const completedTasks = (tasks || []).filter(t => t.completed).length
  const totalTasks = (tasks || []).length
  const completionRate = Math.round((completedTasks / (totalTasks || 1)) * 100)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/95 backdrop-blur-md border border-border p-3 rounded-xl shadow-xl animate-in fade-in zoom-in duration-200">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
          <p className="text-sm font-bold text-primary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            {payload[0].value.toLocaleString()} {payload[0].name === 'count' ? 'Oportunidades' : ''}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-32 md:pb-8 space-y-8 bg-background/50">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            Analítica
          </h1>
          <p className="text-muted-foreground mt-2 font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Información y métricas de rendimiento en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-2 bg-background border border-border/50 p-1.5 rounded-2xl shadow-sm">
          <div className="px-4 py-1.5 bg-muted rounded-xl text-xs font-bold text-muted-foreground transition-all cursor-pointer hover:bg-muted/80" onClick={() => setDateRange('30days')} data-active={dateRange === '30days'} style={dateRange === '30days' ? { backgroundColor: 'var(--primary)', color: 'white' } : {}}>Últimos 30 días</div>
          <button className="px-4 py-1.5 hover:bg-muted rounded-xl text-xs font-bold text-muted-foreground transition-all" onClick={() => setDateRange('quarter')} style={dateRange === 'quarter' ? { backgroundColor: 'var(--primary)', color: 'white' } : {}}>Este trimestre</button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard
          title="Ingresos Totales"
          value={`$${metrics.totalRevenue.toLocaleString()}`}
          subtitle="En periodo seleccionado"
          icon={<CurrencyDollar size={20} weight="bold" className="text-blue-600" />}
          gradient="bg-gradient-to-br from-blue-500/20 to-transparent border-blue-100/50"
          themeColor="text-blue-600"
          bgIcon={CurrencyDollar}
          trend={`${metrics.revenueTrend > 0 ? '+' : ''}${metrics.revenueTrend}%`}
          trendUp={metrics.revenueTrend >= 0}
        />
        <KpiCard
          title="Promedio Oferta"
          value={`$${Math.round(metrics.avgDealSize).toLocaleString()}`}
          subtitle="Valor medio por oportunidad"
          icon={<TrendUp size={20} weight="bold" className="text-purple-600" />}
          gradient="bg-gradient-to-br from-purple-500/20 to-transparent border-purple-100/50"
          themeColor="text-purple-600"
          bgIcon={TrendUp}
          trend={`${metrics.dealSizeTrend > 0 ? '+' : ''}${metrics.dealSizeTrend}%`}
          trendUp={metrics.dealSizeTrend >= 0}
        />
        <KpiCard
          title="Oportunidades Nuevas"
          value={metrics.activeLeads.toString()}
          subtitle="En periodo seleccionado"
          icon={<Users size={20} weight="bold" className="text-emerald-600" />}
          gradient="bg-gradient-to-br from-emerald-500/20 to-transparent border-emerald-100/50"
          themeColor="text-emerald-600"
          bgIcon={Users}
          trend={`${metrics.leadsTrend > 0 ? '+' : ''}${metrics.leadsTrend}%`}
          trendUp={metrics.leadsTrend >= 0}
        />
        <KpiCard
          title="Tasa Completitud"
          value={`${metrics.completionRate}%`}
          subtitle="Tareas completadas"
          icon={<CheckCircle size={20} weight="bold" className="text-rose-600" />}
          gradient="bg-gradient-to-br from-rose-500/20 to-transparent border-rose-100/50"
          themeColor="text-rose-600"
          bgIcon={CheckCircle}
          trend="0%"
          trendUp={true}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pipeline Bar Chart */}
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
          <CardContent className="p-8 pt-6 overflow-x-auto">
            <div style={{ width: pipelineChartWidth, height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--muted-foreground)' }}
                    height={40}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="url(#barGradient)"
                    radius={[10, 10, 0, 0]}
                    barSize={40}
                    animationDuration={1500}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Priority Distribution Pie Chart */}
        <Card className="border-none shadow-2xl shadow-black/5 rounded-[2rem] overflow-hidden bg-background">
          <CardHeader className="p-8 pb-0">
            <div className="space-y-1">
              <CardTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                <ChartPieSlice size={24} weight="duotone" className="text-primary" />
                Distribución Prioritaria
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">Análisis de criticidad de oportunidades</p>
            </div>
          </CardHeader>
          <CardContent className="p-8 flex flex-col items-center">
            <div className="w-full h-[350px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={8}
                    dataKey="value"
                    animationDuration={1500}
                  >
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black">{(leads || []).length}</span>
                <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground">Total Oportunidades</span>
              </div>
            </div>

            <div className="flex gap-6 mt-4">
              {priorityData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
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

function KpiCard({ title, value, subtitle, icon, gradient, themeColor, trend, trendUp, bgIcon: BgIcon }: any) {
  return (
    <Card className={cn(
      "border-none shadow-sm hover:shadow-md transition-all duration-300 rounded-2xl overflow-hidden relative group bg-background",
      gradient
    )}>
      <div className={cn("absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform", themeColor)}>
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
          <div className={cn(
            "flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm",
            trendUp ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" : "bg-rose-500/10 text-rose-600 border-rose-200"
          )}>
            {trendUp ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}
            {trend}
          </div>
        </div>
        <p className="text-xs font-medium text-muted-foreground mt-1 opacity-70">{subtitle}</p>
      </CardContent>
    </Card>
  )
}
