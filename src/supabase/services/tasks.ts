import { supabase } from '../client'
import { Task } from '@/lib/types'

export const getTasks = async (companyId: string): Promise<Task[]> => {
    const { data, error } = await supabase
        .from('tasks')
        .select(`
      *,
      lead:lead_id ( nombre_completo, empresa )
    `)
        .eq('empresa_id', companyId)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })

    if (error) throw error

    return data.map((task: any) => ({
        ...task,
        assignedTo: task.assigned_to,
        assignedToName: task.assigned_to_user?.email,
        leadId: task.lead_id,
        leadName: task.lead?.nombre_completo,
        leadCompany: task.lead?.empresa,
        empresaId: task.empresa_id,
        dueDate: new Date(task.due_date),
        createdAt: new Date(task.created_at),
        completedAt: task.completed_at ? new Date(task.completed_at) : undefined
    }))
}

export const getTaskHistory = async (companyId: string): Promise<Task[]> => {
    const { data, error } = await supabase
        //aqui cambiar a task si cambiamos de base de datos, por que choca con la vieja
        .from('tasks')
        .select(`
      *,
      lead:lead_id ( nombre_completo, empresa )
    `)
        .eq('empresa_id', companyId)
        .neq('status', 'pending') // Completed or cancelled
        .order('updated_at', { ascending: false })
        .limit(50)

    if (error) throw error

    return data.map((task: any) => ({
        ...task,
        assignedTo: task.assigned_to,
        assignedToName: task.assigned_to_user?.email,
        leadId: task.lead_id,
        leadName: task.lead?.nombre_completo,
        leadCompany: task.lead?.empresa,
        empresaId: task.empresa_id,
        dueDate: new Date(task.due_date),
        createdAt: new Date(task.created_at),
        completedAt: task.completed_at ? new Date(task.completed_at) : undefined
    }))
}

export const createTask = async (task: Partial<Task>) => {
    const { data, error } = await supabase
        //aqui cambiar a task si cambiamos de base de datos, por que choca con la vieja
        .from('tasks')
        .insert([
            {
                title: task.title,
                description: task.description,
                type: task.type,
                priority: task.priority,
                due_date: task.dueDate?.toISOString(),
                lead_id: task.leadId,
                assigned_to: task.assignedTo,
                empresa_id: task.empresaId,
                status: 'pending'
            }
        ])
        .select()
        .single()

    if (error) throw error
    return data
}

export const updateTask = async (id: string, updates: Partial<Task>) => {
    const dbUpdates: any = { ...updates }

    // Map camelCase to snake_case for specific fields if needed
    if (updates.dueDate) dbUpdates.due_date = updates.dueDate.toISOString()
    if (updates.leadId) dbUpdates.lead_id = updates.leadId
    if (updates.assignedTo) dbUpdates.assigned_to = updates.assignedTo

    // Handle completedAt
    if (updates.completedAt) {
        dbUpdates.completed_at = updates.completedAt.toISOString()
        delete dbUpdates.completedAt
    } else if (updates.status === 'completed') {
        dbUpdates.completed_at = new Date().toISOString()
    }

    // Remove UI helper fields
    delete dbUpdates.assignedToName
    delete dbUpdates.leadName
    delete dbUpdates.leadCompany
    delete dbUpdates.dueDate
    delete dbUpdates.leadId
    delete dbUpdates.assignedTo
    delete dbUpdates.createdAt
    delete dbUpdates.empresaId

    const { data, error } = await supabase
        //aqui cambiar a task si cambiamos de base de datos, por que choca con la vieja
        .from('tasks')
        .update(dbUpdates)
        .eq('id', id)
        .select()

    if (error) throw error
    return data
}

export const deleteTask = async (id: string) => {
    const { error } = await supabase
        //aqui cambiar a task si cambiamos de base de datos, por que choca con la vieja
        .from('tasks')
        .delete()
        .eq('id', id)

    if (error) throw error
}

export const deleteCompletedTasks = async (companyId: string) => {
    const { error } = await supabase
        //aqui cambiar a task si cambiamos de base de datos, por que choca con la vieja
        .from('tasks')
        .delete()
        .eq('empresa_id', companyId)
        .eq('status', 'completed')

    if (error) throw error
}
