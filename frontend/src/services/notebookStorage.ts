/**
 * BrainDebugger — Local-First Durable Notebook Storage Service (V11)
 *
 * Uses IndexedDB as primary persistent storage for Research Projects, Hypotheses,
 * Evidence Ledgers, and Timelines across browser sessions and reloads.
 * Falls back gracefully to localStorage when IndexedDB is unavailable or mocked.
 */

import { HypothesisRecord, ResearchProject, ResearchNotebookExport } from '../types';

const DB_NAME = 'BrainDebuggerNotebookDB';
const DB_VERSION = 1;

const STORES = {
  PROJECTS: 'projects',
  HYPOTHESES: 'hypotheses',
  EXPORTS: 'exports',
};

class NotebookStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private isIndexedDBAvailable: boolean;

  constructor() {
    this.isIndexedDBAvailable =
      typeof window !== 'undefined' &&
      typeof window.indexedDB !== 'undefined' &&
      window.indexedDB !== null;
  }

  private async getDB(): Promise<IDBDatabase | null> {
    if (!this.isIndexedDBAvailable) return null;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
            db.createObjectStore(STORES.PROJECTS, { keyPath: 'project_id' });
          }
          if (!db.objectStoreNames.contains(STORES.HYPOTHESES)) {
            db.createObjectStore(STORES.HYPOTHESES, { keyPath: 'hypothesis_id' });
          }
          if (!db.objectStoreNames.contains(STORES.EXPORTS)) {
            db.createObjectStore(STORES.EXPORTS, { keyPath: 'exported_at' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('IndexedDB failed to open, falling back to localStorage');
          resolve(null);
        };
      } catch (e) {
        console.warn('IndexedDB error, falling back to localStorage', e);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  // ── Hypotheses ─────────────────────────────────────────────────────────────

  async saveHypothesis(hypothesis: HypothesisRecord): Promise<void> {
    const db = await this.getDB();
    if (db) {
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORES.HYPOTHESES, 'readwrite');
          tx.objectStore(STORES.HYPOTHESES).put(hypothesis);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        } catch (e) {
          this.fallbackSaveHypothesis(hypothesis);
          resolve();
        }
      });
    }
    this.fallbackSaveHypothesis(hypothesis);
  }

  async getHypotheses(): Promise<HypothesisRecord[]> {
    const db = await this.getDB();
    if (db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORES.HYPOTHESES, 'readonly');
          const req = tx.objectStore(STORES.HYPOTHESES).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve(this.fallbackGetHypotheses());
        } catch (e) {
          resolve(this.fallbackGetHypotheses());
        }
      });
    }
    return this.fallbackGetHypotheses();
  }

  async deleteHypothesis(hypothesisId: string): Promise<void> {
    const db = await this.getDB();
    if (db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORES.HYPOTHESES, 'readwrite');
          tx.objectStore(STORES.HYPOTHESES).delete(hypothesisId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    }
    this.fallbackDeleteHypothesis(hypothesisId);
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async saveProject(project: ResearchProject): Promise<void> {
    const db = await this.getDB();
    if (db) {
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORES.PROJECTS, 'readwrite');
          tx.objectStore(STORES.PROJECTS).put(project);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        } catch (e) {
          this.fallbackSaveProject(project);
          resolve();
        }
      });
    }
    this.fallbackSaveProject(project);
  }

  async getProjects(): Promise<ResearchProject[]> {
    const db = await this.getDB();
    if (db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORES.PROJECTS, 'readonly');
          const req = tx.objectStore(STORES.PROJECTS).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve(this.fallbackGetProjects());
        } catch (e) {
          resolve(this.fallbackGetProjects());
        }
      });
    }
    return this.fallbackGetProjects();
  }

  // ── LocalStorage Fallbacks ─────────────────────────────────────────────────

  private fallbackSaveHypothesis(hypothesis: HypothesisRecord): void {
    try {
      const list = this.fallbackGetHypotheses();
      const idx = list.findIndex((h) => h.hypothesis_id === hypothesis.hypothesis_id);
      if (idx >= 0) list[idx] = hypothesis;
      else list.push(hypothesis);
      localStorage.setItem('braindebugger_hypotheses', JSON.stringify(list));
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }

  private fallbackGetHypotheses(): HypothesisRecord[] {
    try {
      const data = localStorage.getItem('braindebugger_hypotheses');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private fallbackDeleteHypothesis(id: string): void {
    try {
      const list = this.fallbackGetHypotheses().filter((h) => h.hypothesis_id !== id);
      localStorage.setItem('braindebugger_hypotheses', JSON.stringify(list));
    } catch {}
  }

  private fallbackSaveProject(project: ResearchProject): void {
    try {
      const list = this.fallbackGetProjects();
      const idx = list.findIndex((p) => p.project_id === project.project_id);
      if (idx >= 0) list[idx] = project;
      else list.push(project);
      localStorage.setItem('braindebugger_projects', JSON.stringify(list));
    } catch {}
  }

  private fallbackGetProjects(): ResearchProject[] {
    try {
      const data = localStorage.getItem('braindebugger_projects');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }
}

export const notebookStorage = new NotebookStorage();

