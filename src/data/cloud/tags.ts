import * as service from '@/supabase/services/tags'
import type { TagsAdapter } from '../port'

export const cloudTagsAdapter: TagsAdapter = {
    getSavedTags: service.getSavedTags,
    createSavedTag: service.createSavedTag,
    saveTag: service.saveTag,
    deleteSavedTag: service.deleteSavedTag,
    updateSavedTag: service.updateSavedTag,
    getAllUniqueTags: service.getAllUniqueTags,
    bulkUpdateTag: service.bulkUpdateTag,
    bulkDeleteTag: service.bulkDeleteTag,
    addTagToLead: service.addTagToLead,
    removeTagFromLead: service.removeTagFromLead,
    syncLeadTagsToSavedTags: service.syncLeadTagsToSavedTags,
}
