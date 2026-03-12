export type Language = 'en' | 'es'

export const translations = {
  en: {
    app: {
      title: 'CRM Pro',
      subtitle: 'Business Management'
    },
    nav: {
      dashboard: 'Dashboard',
      pipeline: 'Pipeline',
      analytics: 'Analytics',
      calendar: 'Calendar',
      team: 'Team',
      settings: 'Settings',
      notifications: 'Notifications',
      voice: 'Voice'
    },
    pipeline: {
      title: 'Pipeline',
      addStage: 'Add Stage',
      addLead: 'New Opportunity',
      newPipeline: 'New Pipeline',
      noStages: 'No stages in this pipeline yet',
      addFirstStage: 'Add First Stage',
      noLeads: 'No opportunities in this stage',
      sales: 'Sales',
      support: 'Support',
      administrative: 'Administrative',
      dragToMove: 'Drag to move between stages'
    },
    lead: {
      name: 'Full Name',
      email: 'Email',
      phone: 'Phone',
      company: 'Company',
      budget: 'Budget',
      priority: 'Priority',
      assignTo: 'Assign To',
      tags: 'Tags',
      addTag: 'Add Tag',
      createdAt: 'Created',
      lastContact: 'Last Contact',
      assignedTo: 'Assigned To',
      lowPriority: 'Low',
      mediumPriority: 'Medium',
      highPriority: 'High'
    },
    stage: {
      name: 'Stage Name',
      color: 'Stage Color',
      addStage: 'Add Stage',
      stageName: 'Stage Name'
    },
    chat: {
      typeMessage: 'Type a message...',
      noMessages: 'No messages on this channel yet'
    },
    budget: {
      title: 'Budgets & Proposals',
      newBudget: 'New Budget',
      noBudgets: 'No budgets created yet',
      status: 'Status',
      total: 'Total',
      draft: 'Draft',
      sent: 'Sent',
      approved: 'Approved',
      rejected: 'Rejected',
      name: 'Budget Name',
      description: 'Description',
      quantity: 'Quantity',
      unitPrice: 'Unit Price',
      addItem: 'Add Item',
      subtotal: 'Subtotal',
      tax: 'Tax',
      save: 'Save Budget'
    },
    meeting: {
      title: 'Meeting Minutes',
      addMeeting: 'Add Meeting',
      noMeetings: 'No meetings recorded yet',
      meetingTitle: 'Meeting Title',
      date: 'Date',
      duration: 'Duration (minutes)',
      participants: 'Participants',
      notes: 'Notes',
      save: 'Save Meeting'
    },
    notes: {
      addNote: 'Add Note',
      placeholder: 'Add a note...',
      noNotes: 'No notes yet'
    },
    tabs: {
      overview: 'Overview',
      chat: 'Chat',
      budget: 'Budget',
      meetings: 'Meetings',
      notes: 'Notes'
    },
    buttons: {
      add: 'Add',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      submit: 'Submit'
    },
    messages: {
      leadAdded: 'Opportunity added!',
      stageAdded: 'Stage added!',
      tagAdded: 'Tag added!',
      noteAdded: 'Note added!',
      messageSent: 'Message sent!',
      priorityUpdated: 'Priority updated!',
      leadDeleted: 'Opportunity deleted!',
      fillRequired: 'Please fill in all required fields',
      enterStageName: 'Please enter a stage name',
      budgetCreated: 'Budget created!',
      meetingCreated: 'Meeting created!',
      taskCreated: 'Task created and assigned!'
    },
    auth: {
      login: 'Login',
      logout: 'Logout',
      register: 'Register',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      welcome: 'Welcome back',
      createAccount: 'Create Account',
      switchBusiness: 'Switch Business',
      currentBusiness: 'Current Business'
    },
    team: {
      title: 'Team',
      addMember: 'Add Member',
      role: 'Role',
      email: 'Email',
      name: 'Name',
      admin: 'Admin',
      agent: 'Agent',
      viewer: 'Viewer'
    }
  },
  es: {
    app: {
      title: 'CRM Pro',
      subtitle: 'Gestión Empresarial'
    },
    nav: {
      dashboard: 'Panel',
      pipeline: 'Pipeline',
      analytics: 'Analíticas',
      calendar: 'Calendario',
      team: 'Equipo',
      settings: 'Configuración',
      notifications: 'Notificaciones',
      voice: 'Voz'
    },
    pipeline: {
      title: 'Pipeline',
      addStage: 'Agregar Etapa',
      addLead: 'Nueva Oportunidad',
      newPipeline: 'Nuevo Pipeline',
      noStages: 'No hay etapas en este pipeline todavía',
      addFirstStage: 'Agregar Primera Etapa',
      noLeads: 'No hay oportunidades en esta etapa',
      sales: 'Ventas',
      support: 'Soporte',
      administrative: 'Administrativo',
      dragToMove: 'Arrastra para mover entre etapas'
    },
    lead: {
      name: 'Nombre Completo',
      email: 'Correo Electrónico',
      phone: 'Teléfono',
      company: 'Empresa',
      budget: 'Presupuesto',
      priority: 'Prioridad',
      assignTo: 'Asignar a',
      tags: 'Etiquetas',
      addTag: 'Agregar Etiqueta',
      createdAt: 'Creado',
      lastContact: 'Último Contacto',
      assignedTo: 'Asignado a',
      lowPriority: 'Baja',
      mediumPriority: 'Media',
      highPriority: 'Alta'
    },
    stage: {
      name: 'Nombre de Etapa',
      color: 'Color de Etapa',
      addStage: 'Agregar Etapa',
      stageName: 'Nombre de Etapa'
    },
    chat: {
      typeMessage: 'Escribe un mensaje...',
      noMessages: 'No hay mensajes en este canal todavía'
    },
    budget: {
      title: 'Presupuestos y Propuestas',
      newBudget: 'Nuevo Presupuesto',
      noBudgets: 'No hay presupuestos creados todavía',
      status: 'Estado',
      total: 'Total',
      draft: 'Borrador',
      sent: 'Enviado',
      approved: 'Aprobado',
      rejected: 'Rechazado',
      name: 'Nombre del Presupuesto',
      description: 'Descripción',
      quantity: 'Cantidad',
      unitPrice: 'Precio Unitario',
      addItem: 'Agregar Item',
      subtotal: 'Subtotal',
      tax: 'Impuesto',
      save: 'Guardar Presupuesto'
    },
    meeting: {
      title: 'Actas de Reunión',
      addMeeting: 'Agregar Reunión',
      noMeetings: 'No hay reuniones registradas todavía',
      meetingTitle: 'Título de Reunión',
      date: 'Fecha',
      duration: 'Duración (minutos)',
      participants: 'Participantes',
      notes: 'Notas',
      save: 'Guardar Reunión'
    },
    notes: {
      addNote: 'Agregar Nota',
      placeholder: 'Agregar una nota...',
      noNotes: 'No hay notas todavía'
    },
    tabs: {
      overview: 'Resumen',
      chat: 'Chat',
      budget: 'Presupuesto',
      meetings: 'Reuniones',
      notes: 'Notas'
    },
    buttons: {
      add: 'Agregar',
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      close: 'Cerrar',
      submit: 'Enviar'
    },
    messages: {
      leadAdded: '¡Oportunidad agregada!',
      stageAdded: '¡Etapa agregada!',
      tagAdded: '¡Etiqueta agregada!',
      noteAdded: '¡Nota agregada!',
      messageSent: '¡Mensaje enviado!',
      priorityUpdated: '¡Prioridad actualizada!',
      leadDeleted: '¡Oportunidad eliminada!',
      fillRequired: 'Por favor complete todos los campos requeridos',
      enterStageName: 'Por favor ingrese un nombre de etapa',
      budgetCreated: '¡Presupuesto creado!',
      meetingCreated: '¡Reunión creada!',
      taskCreated: '¡Tarea creada y asignada!'
    },
    auth: {
      login: 'Iniciar Sesión',
      logout: 'Cerrar Sesión',
      register: 'Registrarse',
      email: 'Correo Electrónico',
      password: 'Contraseña',
      confirmPassword: 'Confirmar Contraseña',
      welcome: 'Bienvenido de nuevo',
      createAccount: 'Crear Cuenta',
      switchBusiness: 'Cambiar Negocio',
      currentBusiness: 'Negocio Actual'
    },
    team: {
      title: 'Equipo',
      addMember: 'Agregar Miembro',
      role: 'Rol',
      email: 'Correo',
      name: 'Nombre',
      admin: 'Administrador',
      agent: 'Agente',
      viewer: 'Observador'
    }
  }
}

export function useTranslation(lang: Language = 'es') {
  return translations[lang]
}
