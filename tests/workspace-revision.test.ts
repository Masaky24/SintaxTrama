import { expect, it } from 'vitest';
import { Workspace } from '../src/domain/workspace';
import type { Document, Invoke } from '../src/domain/types';

const document: Document = { id: 'a', title: 'a.md', path: 'C:/a.md', text: 'A', baseText: 'A', diskHash: 'h', recovered: false, format: { encoding: 'UTF-8', eol: 'LF' } };
function setup() {
  const invoke: Invoke = async <T,>(command: string) => (command === 'bootstrap' ? { documents: [document], recents: [], warning: null } : command === 'check_external' ? false : undefined) as T;
  return new Workspace(invoke);
}
it('tracks every document revision including an A to B to A edit sequence', async () => {
  const store = setup(); await store.initialize();
  const first = store.snapshot().tabs[0].revision;
  store.edit('a', 'B'); store.edit('a', 'A');
  expect(store.snapshot().tabs[0].text).toBe('A');
  expect(store.snapshot().tabs[0].revision).toBe(first! + 2);
});
it('does not notify or checkpoint when activation, text and external status are unchanged', async () => {
  const store = setup(); await store.initialize();
  let notifications = 0; store.subscribe(() => notifications++);
  const before = store.snapshot(); store.activate('a'); store.edit('a', 'A'); await store.checkExternal();
  expect(notifications).toBe(0); expect(store.snapshot()).toBe(before);
  expect(store.snapshot().tabs[0].recovery).toBe('none');
});

it('accepts a renamed session without replacing unsent text, note or history identity', async () => {
  const renamed = { ...document, path: 'C:/renamed.md', title: 'renamed.md', text: 'A', note: 'Old note', noteRevision: 1 };
  const invoke: Invoke = async <T,>(command: string) => (command === 'bootstrap' ? { documents: [document], recents: [], warning: null }
    : command === 'open_pending' ? { documents: [renamed], warning: null } : undefined) as T;
  const store = new Workspace(invoke); await store.initialize();
  store.edit('a', 'Unsent body'); store.editNote('a', 'Unsent note');
  const revision = store.snapshot().tabs[0].revision;
  await store.openPending();
  expect(store.snapshot().tabs).toHaveLength(1);
  expect(store.snapshot().tabs[0]).toMatchObject({ id: 'a', path: 'C:/renamed.md', title: 'renamed.md', text: 'Unsent body', note: 'Unsent note', notePending: true, revision });
});
