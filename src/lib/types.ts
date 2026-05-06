export type Priority = 'low' | 'medium' | 'high'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
export type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'phone'
export type PipelineType = 'sales' | 'support' | 'administrative' | string
export type AssignmentType = 'manual' | 'round_robin' | 'random'

export interface Tag {
  id: string
  name: string
  color: string
  short_id?: number | null
}

export interface Message {
  id: string
  leadId: string
  channel: Channel
  content: string
  timestamp: Date
  sender: 'team' | 'lead'
  read: boolean
  metadata?: any
}

export interface Task {
  id: string
  title: string
  description?: string
  assignedTo?: string // UUID del usuario
  assignedToName?: string // Helper para UI (join)
  leadId?: string
  leadName?: string // Helper para UI
  leadCompany?: string // Helper para UI
  empresaId: string
  type: 'call' | 'email' | 'meeting' | 'todo' | string
  status: 'pending' | 'completed' | 'cancelled'
  priority: Priority
  dueDate: Date
  completedAt?: Date
  createdAt: Date
  createdBy?: string
}

export type MeetingParticipantType = 'internal' | 'external'

export interface MeetingParticipant {
  id: string
  meetingId: string
  name: string
  type?: MeetingParticipantType | null
  createdAt: Date
  updatedAt?: Date
}

export interface Meeting {
  id: string
  leadId: string
  title: string
  date: Date
  duration: number
  participants: MeetingParticipant[]
  notes: string
  createdAt: Date
  updatedAt?: Date
  empresaId?: string
  createdBy?: string | null
}

export interface BudgetLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Budget {
  id: string
  leadId: string
  name: string
  items: BudgetLineItem[]
  subtotal: number
  tax: number
  total: number
  status: 'draft' | 'sent' | 'approved' | 'rejected'
  createdAt: Date
}

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  company: string
  avatar?: string
  pipeline: PipelineType
  stage: string
  tags: Tag[]
  priority: Priority
  budget: number
  assignedTo: string
  createdAt: Date
  lastContact: Date
  location?: string
  evento?: string
  membresia?: string
  lastMessageAt?: Date
  lastMessageSender?: 'lead' | 'team'
  lastMessage?: string
  archived?: boolean
  archivedAt?: Date
  customFields?: Record<string, any>
  stageEnteredAt?: Date | null
  slaCustomLimitMinutes?: number | null
}

export interface Stage {
  id: string
  name: string
  order: number
  color: string
  pipelineType: PipelineType
  short_id?: number | null
  is_sla_enabled?: boolean
  sla_limit_minutes?: number | null
}

export interface Pipeline {
  id: string
  name: string
  type: PipelineType
  stages: Stage[]
  short_id?: number | null
  assignment_type?: AssignmentType
  order?: number
}

export type RolePermission =
  | 'view_dashboard'
  | 'view_pipeline'
  | 'edit_leads'
  | 'delete_leads'
  | 'view_analytics'
  | 'view_calendar'
  | 'manage_team'
  | 'manage_settings'
  | 'view_budgets'
  | 'edit_budgets'
  | 'delete_messages'
  | 'manage_tags'

export interface Role {
  id: string
  name: string
  permissions: RolePermission[]
  color: string
  isSystem?: boolean
}

export interface TeamMember {
  id: string
  name: string
  email: string
  avatar: string
  role: string
  roleId?: string
  pipelines?: PipelineType[]
  teamId?: string
  permissionRole?: 'admin' | 'viewer' | 'owner'
  userId?: string
}

export interface Appointment {
  id: string
  leadId: string
  teamMemberId: string
  title: string
  description: string
  startTime: Date
  endTime: Date
  status: 'scheduled' | 'completed' | 'cancelled'
  attendees?: string[] // IDs of team members or external emails (deprecated, use participants)
  participants?: string[] // Array de nombres de participantes
  notes?: string // Notas adicionales de la reunión
}

export interface Notification {
  id: string
  type: 'task' | 'message' | 'appointment' | 'stage_change' | 'team_invitation'
  title: string
  message: string
  timestamp: Date
  read: boolean
  leadId?: string
  actionUrl?: string
}

// Trigger type defines what event activates the rule
export type AutomationTriggerType = 'message_received' | 'tag_added' | 'stage_change' | 'time_in_stage'

// Trigger config shapes (JSONB from DB)
export interface TriggerConfigMessageReceived {
  from_stage_id?: string | null // null = any stage
}
export interface TriggerConfigTagAdded {
  tag_name: string
  from_stage_id?: string | null
}
export interface TriggerConfigStageChange {
  from_stage_id: string // entering this stage triggers the rule
}
export interface TriggerConfigTimeInStage {
  stage_id: string
  days: number
}

// Action config (currently only move_stage)
export interface ActionConfigMoveStage {
  target_stage_id: string
  target_pipeline_id?: string | null
}

export interface AutomationRule {
  id: string
  empresa_id: string
  pipeline_id?: string | null
  nombre: string
  enabled: boolean
  trigger_type: AutomationTriggerType
  trigger_config: TriggerConfigMessageReceived | TriggerConfigTagAdded | TriggerConfigStageChange | TriggerConfigTimeInStage
  action_type: 'move_stage'
  action_config: ActionConfigMoveStage
  created_at: string
  updated_at: string
}

export interface CreateAutomationRuleDTO {
  empresa_id: string
  pipeline_id?: string | null
  nombre: string
  enabled?: boolean
  trigger_type: AutomationTriggerType
  trigger_config: Record<string, any>
  action_type?: 'move_stage'
  action_config: Record<string, any>
}

export interface AutomationLog {
  id: string
  rule_id: string
  lead_id: string
  empresa_id: string
  trigger_type: AutomationTriggerType
  action_taken: {
    from_stage_id?: string
    to_stage_id: string
    rule_name: string
  }
  created_at: string
}

export interface Note {
  id: string
  leadId: string
  content: string
  createdBy: string
  createdAt: Date
}

// ==========================================
// DTOs para operaciones CRUD (Fase 1 Refactorización)
// ==========================================

// ----- Lead DTOs -----
export interface CreateLeadDTO {
  nombre_completo: string
  telefono?: string
  correo_electronico?: string
  empresa_id: string
  pipeline_id?: string
  etapa_id?: string
  asignado_a?: string
  presupuesto?: number
  prioridad?: Priority
  ubicacion?: string
  evento?: string
  membresia?: string
  empresa?: string
  preferred_instance_id?: string | null
  custom_fields?: Record<string, any>
}

export interface UpdateLeadDTO {
  nombre_completo?: string
  telefono?: string
  correo_electronico?: string
  presupuesto?: number
  prioridad?: Priority
  asignado_a?: string
  etapa_id?: string
  pipeline_id?: string
  ubicacion?: string
  evento?: string
  membresia?: string
  empresa?: string
  archived?: boolean
  archived_at?: string | null
  stage_entered_at?: string | null
  sla_custom_limit_minutes?: number | null
  custom_fields?: Record<string, any>
}

// ============================================================
// CUSTOM FIELDS
// ============================================================

export interface CustomFieldDefinition {
  id: string
  empresa_id: string
  nombre: string
  clave: string
  tipo: 'text' | 'number' | 'select'
  opciones?: string[] | null
  requerido: boolean
  orden: number
  /** Descripción inyectada al prompt de la IA para guiar cuándo leer/escribir este campo. */
  descripcion?: string | null
  created_at: string
}

export interface PredefinedFieldDescriptionRow {
  empresa_id: string
  field_key: string
  descripcion: string
  updated_at: string
}

// Lead como viene de la BD (snake_case)
export interface LeadDB {
  id: string
  nombre_completo: string
  telefono?: string
  correo_electronico?: string
  empresa_id: string
  pipeline_id?: string
  etapa_id?: string
  asignado_a?: string
  presupuesto?: number
  prioridad?: string
  ubicacion?: string
  evento?: string
  membresia?: string
  empresa?: string
  created_at: string
  updated_at?: string
  archived: boolean
  archived_at?: string | null
  last_message_at?: string
  last_message_sender?: string
  last_message_content?: string
  preferred_instance_id?: string | null
  stage_entered_at?: string | null
  sla_custom_limit_minutes?: number | null
  custom_fields?: Record<string, any>
}

// ============================================================
// CONTACTS
// ============================================================

export interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  avatar?: string
  location?: string
  position?: string
  birthday?: Date
  rating?: 1 | 2 | 3 | 4 | 5
  source?: string
  notes?: string
  socialNetworks?: {
    linkedin?: string
    instagram?: string
    twitter?: string
  }
  tags?: string[]
  assignedTo?: string
  archived?: boolean
  createdAt: Date
  updatedAt?: Date
  // Computed fields
  leadsCount?: number
  lastInteraction?: Date
  totalValue?: number
}

export interface ContactDB {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  empresa_nombre: string | null
  avatar: string | null
  ubicacion: string | null
  cargo: string | null
  cumpleanos: string | null
  rating: number | null
  fuente: string | null
  notas: string | null
  redes_sociales: any | null
  tags: string[] | null
  equipo_id?: string
  empresa_id: string
  origen_lead_id?: string
  asignado_a: string | null
  archivado: boolean
  created_at: string
  updated_at: string | null
}

// ----- Empresa Instancias -----
export interface EmpresaInstanciaDB {
  id: string
  empresa_id: string
  plataforma: 'whatsapp' | 'instagram' | 'facebook' | string
  client_id: string
  api_url?: string | null
  label?: string | null
  active: boolean
  auto_create_lead?: boolean
  default_pipeline_id?: string | null
  default_stage_id?: string | null
  default_lead_name?: string | null
  include_first_message?: boolean
  created_at?: string
  updated_at?: string
}

// ----- Empresa DTOs -----
export interface CreateEmpresaDTO {
  nombre_empresa: string
  usuario_id: string
  logo_url?: string
}

export interface UpdateEmpresaDTO {
  nombre_empresa?: string
  logo_url?: string
}

export interface EmpresaDB {
  id: string
  nombre_empresa: string
  usuario_id: string
  logo_url?: string
  codigo_empresa?: string
  created_at: string
  created_by?: string
}

// ----- Empresa Miembros -----
export type MemberRole = 'owner' | 'admin' | 'viewer'

export interface EmpresaMiembro {
  id: string
  empresa_id: string
  usuario_id: string | null
  email: string
  role: MemberRole
  role_id?: string | null
  created_at: string
  // Joined fields (from roles table)
  roles?: {
    id: string
    name: string
    permissions: RolePermission[]
    color: string
    is_system: boolean
  } | null
}

export interface UpdateMemberRoleDTO {
  usuario_id?: string
  email: string
  role: MemberRole
  role_id?: string | null
}

// ----- Pipeline DTOs -----
export interface CreatePipelineDTO {
  nombre: string
  empresa_id: string
  tipo?: string
}

export interface PipelineDB {
  id: string
  nombre: string
  empresa_id: string
  tipo?: string
  assignment_type?: AssignmentType
  last_assigned_persona_id?: string | null
  created_at: string
}

// ----- Etapa/Stage DTOs -----
export interface CreateEtapaDTO {
  nombre: string
  pipeline_id: string
  orden: number
  color?: string
  is_sla_enabled?: boolean
  sla_limit_minutes?: number | null
}

export interface EtapaDB {
  id: string
  nombre: string
  pipeline_id: string
  orden: number
  color?: string
  created_at: string
  is_sla_enabled?: boolean
  sla_limit_minutes?: number | null
}

// ----- Equipo DTOs -----
export interface EquipoDB {
  id: string
  nombre_equipo: string
  empresa_id: string
  created_at: string
}

export interface CreateEquipoDTO {
  nombre_equipo: string
  empresa_id: string
}

// ----- Usuario/Persona DTOs -----
export type AccountType = 'owner' | 'employee'

export interface UsuarioDB {
  id: string
  email: string
  nombre?: string
  avatar_url?: string
  recovery_email?: string | null
  account_type: AccountType
  created_at: string
}

export type SolicitudStatus = 'pending' | 'approved' | 'rejected'

export interface SolicitudUnionDB {
  id: string
  solicitante_id: string
  solicitante_email: string
  solicitante_nombre: string | null
  mensaje: string | null
  empresa_id: string
  status: SolicitudStatus
  role_asignado: string
  created_at: string
  responded_at: string | null
  responded_by: string | null
  empresa?: { nombre_empresa: string; logo_url?: string }
}

export interface PersonaDB {
  id: string
  usuario_id: string
  empresa_id: string
  nombre?: string
  email: string
  titulo_trabajo?: string
  equipo_id?: string
  permisos?: string[]
  created_at: string
}

// ----- Respuestas paginadas -----
export interface PaginatedResponse<T> {
  data: T[]
  count: number | null
}

// ----- Opciones comunes para queries -----
export interface GetLeadsPagedOptions {
  empresaId: string
  currentUserId?: string
  isAdminOrOwner?: boolean
  limit?: number
  offset?: number
  pipelineId?: string
  stageId?: string
  order?: 'asc' | 'desc'
  archived?: boolean
}

export interface SearchLeadsOptions {
  pipelineId?: string
  stageId?: string
  archived?: boolean
  limit?: number
  order?: 'asc' | 'desc'
}


// ----- Lead History -----
export interface LeadHistory {
  id: string
  lead_id: string
  usuario_id: string
  usuario_nombre?: string // Join helper
  accion: 'creacion' | 'asignacion' | 'reasignacion' | 'etapa_cambio' | 'prioridad_cambio' | 'automatizacion' | 'automatizacion_ia' | string
  detalle: string
  metadata?: any
  created_at: string
}

export interface CreateLeadHistoryDTO {
  lead_id: string
  usuario_id: string
  accion: string
  detalle: string
  metadata?: any
}

// ----- Actividad CRM (Audit Log) -----
export type ActividadCategoria = 'leads' | 'mensajes' | 'equipo' | 'pipeline' | 'etapas' | 'tags' | 'notas' | 'reuniones'

export interface ActividadCRM {
  id: string
  empresa_id: string
  usuario_id: string | null
  usuario_nombre: string | null
  categoria: ActividadCategoria
  accion: string
  detalle: string
  entidad_tipo: string | null
  entidad_id: string | null
  entidad_nombre: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ----- Landing Tokens -----
export interface LandingTokenDB {
  id: string
  empresa_id: string
  pipeline_id: string
  etapa_id: string
  token: string
  nombre: string
  active: boolean
  prioridad_default: string
  asignado_a: string
  empresa_label: string
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

// ============================================================
// AI AUTOMATION
// ============================================================

export type AiIntentActionType = 'move_stage' | 'add_tag' | 'notify_team'

export interface AiIntentMapping {
  id: string
  intent: string
  action_type: AiIntentActionType
  action_config: Record<string, any>
  enabled: boolean
}

export interface AiAutomationConfig {
  id: string
  empresa_id: string
  nombre: string
  is_active: boolean
  activation_time_start: string | null
  activation_time_end: string | null
  message_limit: number | null
  background_time_window: string | null
  background_message_limit: number | null
  execution_interval_hours: number | null
  last_execution_at: string | null
  sandbox_prompt: string | null
  ai_api_key: string | null
  ai_model: string | null
  created_at: string
  updated_at: string
}

export interface CreateAiAutomationConfigDTO {
  empresa_id: string
  nombre: string
  is_active: boolean
  activation_time_start?: string | null
  activation_time_end?: string | null
  message_limit?: number | null
  background_time_window?: string | null
  background_message_limit?: number | null
  execution_interval_hours?: number | null
  sandbox_prompt?: string | null
  ai_api_key?: string | null
  ai_model?: string | null
}
