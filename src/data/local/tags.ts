import type { TagsAdapter } from '../port'

const reject = (method: string): Promise<never> =>
    Promise.reject(new Error(`[data-local] tags.${method} pendiente de implementación en Fase 4 (SQLite)`))

export const localTagsAdapter: TagsAdapter = {
    getSavedTags: () => reject('getSavedTags'),
    createSavedTag: () => reject('createSavedTag'),
    saveTag: () => reject('saveTag'),
    deleteSavedTag: () => reject('deleteSavedTag'),
    updateSavedTag: () => reject('updateSavedTag'),
    getAllUniqueTags: () => reject('getAllUniqueTags'),
    bulkUpdateTag: () => reject('bulkUpdateTag'),
    bulkDeleteTag: () => reject('bulkDeleteTag'),
    addTagToLead: () => reject('addTagToLead'),
    removeTagFromLead: () => reject('removeTagFromLead'),
    syncLeadTagsToSavedTags: () => reject('syncLeadTagsToSavedTags'),
}
