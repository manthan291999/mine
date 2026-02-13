import * as Y from "yjs";

type Entry = {
  doc: Y.Doc;
  updates: number;
  touchedAt: number;
  hydrated: boolean;
};

export class DocStore {
  private docs = new Map<string, Entry>();

  constructor(private maxDocs = 100) {}

  get(docId: string): Entry {
    const found = this.docs.get(docId);
    if (found) {
      found.touchedAt = Date.now();
      return found;
    }

    if (this.docs.size >= this.maxDocs) {
      const oldest = [...this.docs.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
      if (oldest) this.docs.delete(oldest[0]);
    }

    const next: Entry = { doc: new Y.Doc(), updates: 0, touchedAt: Date.now(), hydrated: false };
    this.docs.set(docId, next);
    return next;
  }

  markUpdate(docId: string): number {
    const entry = this.get(docId);
    entry.updates += 1;
    return entry.updates;
  }

  markHydrated(docId: string) {
    const entry = this.get(docId);
    entry.hydrated = true;
  }
}
