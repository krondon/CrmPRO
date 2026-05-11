import type { Tag } from '@/lib/types'

export type SyncTagsResult = {
    total: number
    saved: number
    skipped: number
    errors: number
}

export interface TagsAdapter {
    getSavedTags(empresaId: string): Promise<Tag[]>
    createSavedTag(empresaId: string, tag: Tag): Promise<Tag>
    saveTag(empresaId: string, tag: Tag): Promise<Tag>
    deleteSavedTag(tagId: string): Promise<void>
    updateSavedTag(tagId: string, updates: Partial<Omit<Tag, 'id'>>): Promise<void>
    getAllUniqueTags(empresaId: string): Promise<Tag[]>
    bulkUpdateTag(empresaId: string, tagId: string, updates: Partial<Omit<Tag, 'id'>>): Promise<void>
    bulkDeleteTag(empresaId: string, tagId: string): Promise<void>
    addTagToLead(leadId: string, currentTags: Tag[], newTag: Tag, empresaId: string, skipSave?: boolean): Promise<Tag[] | undefined>
    removeTagFromLead(leadId: string, currentTags: Tag[], tagId: string, empresaId?: string): Promise<Tag[]>
    syncLeadTagsToSavedTags(empresaId: string): Promise<SyncTagsResult>
}

export interface DataAdapter {
    tags: TagsAdapter
}
