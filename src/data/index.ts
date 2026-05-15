import { getEdition } from '@/lib/edition'
import { cloudTagsAdapter } from './cloud/tags'
import { localTagsAdapter } from './local/tags'
import type { DataAdapter } from './port'

const cloudData: DataAdapter = {
    tags: cloudTagsAdapter,
}

const localData: DataAdapter = {
    tags: localTagsAdapter,
}

export const data: DataAdapter = getEdition() === 'free' ? localData : cloudData

export type { DataAdapter, TagsAdapter, SyncTagsResult } from './port'
