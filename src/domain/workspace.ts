import { dirty, type Document, type Tab, type Invoke, type Recent, type Folder, type SaveOutcome } from './types';

export interface Snapshot { tabs: Tab[]; activeId: string | null; recents: Recent[]; folder: Folder | null; folders: Folder[]; error: string | null; notice: string | null; ready: boolean; busy: boolean }

export class Workspace {
  private value: Snapshot = { tabs: [], activeId: null, recents: [], folder: null, folders: [], error: null, notice: null, ready: false, busy: false };
  private listeners = new Set<() => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private checkpointJob: Promise<unknown> | null = null;
  private autosaveJob: Promise<unknown> | null = null;
  private failedAutosaves = new Map<string, string>();
  constructor(private invoke: Invoke) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.value;
  private patch(patch: Partial<Snapshot>) {
    if (Object.entries(patch).every(([key, value]) => Object.is(this.value[key as keyof Snapshot], value))) return;
    this.value = { ...this.value, ...patch }; this.listeners.forEach(fn => fn());
  }
  private tab(id: string) { return this.value.tabs.find(t => t.id === id); }
  private update(id: string, patch: Partial<Tab>) {
    const tab = this.tab(id);
    if (!tab || Object.entries(patch).every(([key, value]) => Object.is(tab[key as keyof Tab], value))) return;
    this.patch({ tabs: this.value.tabs.map(t => t.id === id ? { ...t, ...patch } : t) });
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const job = this.tail.then(operation); this.tail = job.catch(() => undefined); return job;
  }
  private async report<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try { return await operation(); } catch (error) { this.patch({ error: String(error) }); return undefined; }
  }
  dismiss = () => this.patch({ error: null, notice: null });
  activate = (id: string) => this.patch({ activeId: id });
  edit = (id: string, text: string) => {
    const tab = this.tab(id); if (!tab || tab.text === text) return;
    this.failedAutosaves.delete(id);
    this.update(id, { text, revision: (tab.revision ?? 0) + 1, recovery: 'pending' });
  };
  editNote = (id: string, note: string) => { this.update(id, { note, notePending: true }); };
  private accept(doc: Document) {
    const exists = this.tab(doc.id);
    if (!exists) this.patch({ tabs: [...this.value.tabs, { ...doc, revision: 0, external: false, recovery: doc.recovered ? 'saved' : 'none' }], activeId: doc.id });
    else {
      // The native engine can recognize a renamed open file. Only refresh its
      // identity here; React may hold text/notes newer than the last checkpoint.
      this.update(doc.id, { path: doc.path, title: doc.title, noteId: doc.noteId,
        ...(exists.path !== doc.path && (dirty(exists) || exists.recovered) ? { recovery: 'pending' as const } : {}),
        ...(!exists.notePending && (doc.noteRevision ?? 0) >= (exists.noteRevision ?? 0)
          ? { note: doc.note, noteRevision: doc.noteRevision } : {}) });
      this.activate(doc.id);
    }
    if (doc.path) this.patch({ recents: [{ path: doc.path, title: doc.title }, ...this.value.recents.filter(r => r.path !== doc.path)].slice(0, 15) });
  }
  async initialize() {
    await this.report(() => this.serial(async () => {
      const result = await this.invoke<{ documents: Document[]; recents: Recent[]; folders?: Folder[]; warning: string | null }>('bootstrap');
      this.patch({ folders: result.folders ?? [] });
      this.patch({ recents: result.recents, error: result.warning }); result.documents.forEach(d => this.accept(d));
      if (result.documents.some(d => d.recovered)) this.patch({ notice: 'Se recuperaron documentos de la sesión anterior. Revísalos antes de guardar.' });
      this.patch({ ready: true });
    }));
  }
  openPending = () => this.report(() => this.serial(async () => {
    const result = await this.invoke<{ documents: Document[]; warning: string | null }>('open_pending');
    result.documents.forEach(doc => this.accept(doc));
    if (result.warning) this.patch({ error: result.warning });
  }));
  exportCopy = () => this.report(() => this.serial(async () => {
    const tab = this.value.activeId && this.tab(this.value.activeId); if (!tab) return;
    await this.persistAll();
    this.patch({ busy: true });
    try {
      const path = await this.invoke<string | null>('export_document', { id: tab.id, text: tab.text });
      if (path) {
        this.patch({ notice: `Copia exportada: ${path}` });
        if (this.tab(tab.id)?.text === tab.text) this.update(tab.id, { recovery: dirty(tab) || tab.recovered ? 'saved' : 'none' });
      }
    } finally { this.patch({ busy: false }); }
  }));
  create = () => this.report(() => this.serial(async () => this.accept(await this.invoke<Document>('new_document'))));
  open = (path?: string) => this.report(() => this.serial(async () => {
    if (!path) await this.persistAll();
    this.patch({ busy: true });
    try { const doc = await this.invoke<Document | null>(path ? 'open_path' : 'open_document', path ? { path } : {}); if (doc) this.accept(doc); }
    finally { this.patch({ busy: false }); }
  }));
  openFolder = () => this.report(() => this.serial(async () => {
    await this.persistAll();
    const folder = await this.invoke<Folder | null>('open_folder'); if (folder) this.setFolder(folder);
  }));
  setFolder = (folder: Folder) => this.patch({ folder, folders: [...this.value.folders.filter(f => f.path !== folder.path), folder] });
  removeFolder = (path: string) => this.report(() => this.serial(async () => {
    await this.invoke('remove_folder', { path });
    this.patch({ folders: this.value.folders.filter(f => f.path !== path), folder: this.value.folder?.path === path ? null : this.value.folder });
  }));
  private async persist(id: string) {
    let tab = this.tab(id); if (!tab) return;
    if (tab.notePending) {
      const note = tab.note ?? '';
      await this.invoke('save_note', { id, note });
      if (this.tab(id)?.note === note) this.update(id, { notePending: false });
      tab = this.tab(id)!;
    }
    if (!['pending', 'error'].includes(tab.recovery)) return;
    const text = tab.text;
    try {
      await this.invoke('checkpoint', { id, text });
      if (this.tab(id)?.text === text) this.update(id, { recovery: dirty(tab) || tab.recovered ? 'saved' : 'none' });
    } catch (error) { this.update(id, { recovery: 'error' }); throw error; }
  }
  private async persistAll() {
    for (const tab of this.value.tabs) await this.persist(tab.id);
  }
  checkpoint = () => {
    if (!this.checkpointJob) this.checkpointJob = this.report(() => this.serial(async () => {
      for (const tab of this.value.tabs) await this.persist(tab.id);
    })).finally(() => { this.checkpointJob = null; });
    return this.checkpointJob;
  };
  private async saveNow(id: string, saveAs: boolean): Promise<boolean> {
    const tab = this.tab(id); if (!tab) return false;
    if (saveAs || !tab.path) await this.persistAll();
    else if (tab.notePending) await this.persist(id);
    this.patch({ busy: true });
    try {
      const outcome = await this.invoke<SaveOutcome | null>('save_document', { id, text: tab.text, saveAs });
      if (!outcome) return false;
      const doc = outcome.document;
      const current = this.tab(id); if (!current) return false;
      this.update(id, { ...doc, note: current.notePending ? current.note : doc.note, text: current.text, external: false, recovery: current.text !== doc.text ? 'pending' : doc.metadataPending ? 'saved' : 'none' });
      this.patch({ error: outcome.warnings.length ? outcome.warnings.join('\n') : null });
      this.failedAutosaves.delete(id);
      if (doc.path) this.patch({ recents: [{ path: doc.path, title: doc.title }, ...this.value.recents.filter(r => r.path !== doc.path)].slice(0, 15) });
      if (current.text !== doc.text) await this.persist(id);
      return !dirty(this.tab(id)!) && !this.tab(id)!.metadataPending;
    } finally { this.patch({ busy: false }); }
  }
  save = (saveAs = false, id = this.value.activeId) => this.report(() => this.serial(async () => id ? this.saveNow(id, saveAs) : false));
  autoSave = () => {
    if (this.value.busy) return Promise.resolve();
    if (!this.autosaveJob) this.autosaveJob = this.report(() => this.serial(async () => {
      for (const candidate of this.value.tabs) {
        const tab = this.tab(candidate.id);
        if (!tab?.path || tab.external || tab.recovered || tab.metadataPending || tab.format.eol === 'Mixto' || !dirty(tab) || this.failedAutosaves.get(tab.id) === tab.text) continue;
        try { await this.saveNow(tab.id, false); }
        catch (error) {
          this.failedAutosaves.set(tab.id, tab.text);
          if (String(error).includes('CONFLICTO')) this.update(tab.id, { external: true });
          this.patch({ error: `Guardado automático: ${String(error)}` });
        }
      }
    })).finally(() => { this.autosaveJob = null; });
    return this.autosaveJob;
  };
  checkExternal = () => this.report(() => this.serial(async () => {
    for (const tab of this.value.tabs.filter(t => t.path)) this.update(tab.id, { external: await this.invoke<boolean>('check_external', { id: tab.id }) });
  }));
  reload = () => this.report(() => this.serial(async () => {
    const id = this.value.activeId; const tab = id && this.tab(id); if (!tab || !id) return;
    if (dirty(tab) || tab.recovered) {
      await this.persistAll();
      const answer = await this.invoke<string>('confirm_discard', { title: tab.title, reload: true }); if (answer !== 'save') return;
    }
    const beforeRead = this.tab(id)?.text;
    const doc = await this.invoke<Document>('reload_document', { id });
    const current = this.tab(id); if (!current) return;
    const newerInput = current.text !== beforeRead;
    this.update(id, { ...doc, text: newerInput ? current.text : doc.text, revision: newerInput || current.text === doc.text ? current.revision : (current.revision ?? 0) + 1, note: current.note ?? doc.note, external: false, recovery: newerInput ? 'pending' : 'none' });
    if (newerInput) await this.persist(id);
  }));
  private async closeNow(id: string) {
    await this.persist(id);
    const tab = this.tab(id); if (!tab) return true;
    if (dirty(tab) || tab.recovered || tab.metadataPending || (!tab.path && !!tab.note)) {
      await this.persistAll();
      const answer = await this.invoke<string>('confirm_discard', { title: tab.title, reload: false });
      if (answer === 'cancel') return false;
      if (answer === 'save' && !await this.saveNow(id, false)) return false;
      if (answer === 'discard' && this.tab(id)?.text !== tab.text) { this.patch({ notice: 'El documento cambió durante el cierre. Revise el texto antes de cerrar otra vez.' }); return false; }
    }
    await this.persist(id);
    await this.invoke('close_document', { id });
    this.failedAutosaves.delete(id);
    const tabs = this.value.tabs.filter(t => t.id !== id);
    this.patch({ tabs, activeId: this.value.activeId === id ? tabs.at(-1)?.id ?? null : this.value.activeId }); return true;
  }
  close = (id: string) => this.report(() => this.serial(() => this.closeNow(id)));
  closeAll = () => this.report(() => this.serial(async () => {
    for (const tab of [...this.value.tabs]) if (!await this.closeNow(tab.id)) return false; return true;
  }));
}
