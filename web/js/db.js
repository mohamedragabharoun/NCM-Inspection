// IndexedDB wrapper: key/value store, outbound submission queue, photo blobs.
// Queue items are deleted only after the server confirms them (see sync.js, Step 2).

const DB_NAME = 'ncm-inspection';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const kvGet = (key) => run('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => run('kv', 'readwrite', (s) => s.put(value, key));
export const kvDelete = (key) => run('kv', 'readwrite', (s) => s.delete(key));

export const queueAdd = (item) => run('queue', 'readwrite', (s) => s.put(item));
export const queueAll = () => run('queue', 'readonly', (s) => s.getAll());
export const queueCount = () => run('queue', 'readonly', (s) => s.count());
export const queueDelete = (id) => run('queue', 'readwrite', (s) => s.delete(id));

export const photoPut = (photo) => run('photos', 'readwrite', (s) => s.put(photo));
export const photoGet = (id) => run('photos', 'readonly', (s) => s.get(id));
export const photoDelete = (id) => run('photos', 'readwrite', (s) => s.delete(id));
