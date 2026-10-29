import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach } from 'vitest';
import { closeDB } from '../src/db/index';

// Banco novo e limpo a cada teste.
afterEach(async () => {
  await closeDB();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});
