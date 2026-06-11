import { get, set, del } from 'idb-keyval';

const DB_KEY = 'docsy_current_doc';

export interface PersistedDoc {
  bytes: Uint8Array;
  state: {
    pages: any[];
    currentPageIndex: number;
    fileName: string;
  };
}

export const saveDocument = async (doc: PersistedDoc) => {
  try {
    await set(DB_KEY, doc);
  } catch (err) {
    console.error('Failed to save document to IndexedDB:', err);
  }
};

export const loadDocument = async (): Promise<PersistedDoc | null> => {
  try {
    const doc = await get(DB_KEY);
    return doc || null;
  } catch (err) {
    console.error('Failed to load document from IndexedDB:', err);
    return null;
  }
};

export const clearDocument = async () => {
  try {
    await del(DB_KEY);
  } catch (err) {
    console.error('Failed to clear IndexedDB:', err);
  }
};
