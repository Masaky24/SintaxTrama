import { syntaxTree } from '@codemirror/language';
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

class Bullet extends WidgetType {
  toDOM() { const span = document.createElement('span'); span.className = 'novel-bullet'; span.textContent = '• '; return span; }
}
class Divider extends WidgetType {
  toDOM() { const span = document.createElement('span'); span.className = 'novel-divider'; return span; }
}
class Task extends WidgetType {
  constructor(private checked: boolean) { super(); }
  eq(other: Task) { return other.checked === this.checked; }
  toDOM() { const span = document.createElement('span'); span.className = 'novel-bullet'; span.textContent = this.checked ? '☑ ' : '☐ '; return span; }
}

function decorations(view: EditorView) {
  const ranges: ReturnType<ReturnType<typeof Decoration.mark>['range']>[] = [];
  const seen = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({ from, to, enter(node) {
      const name = node.name;
      if (/^(ATX|Setext)Heading\d$/.test(name)) {
        const line = view.state.doc.lineAt(node.from);
        if (!seen.has(line.from)) { ranges.push(Decoration.line({ class: `novel-heading novel-heading-${name.at(-1)}` }).range(line.from)); seen.add(line.from); }
      }
      if (name === 'StrongEmphasis' || name === 'Emphasis') ranges.push(Decoration.mark({ class: name === 'StrongEmphasis' ? 'novel-bold' : 'novel-italic' }).range(node.from, node.to));
      if (name === 'QuoteMark') ranges.push(Decoration.line({ class: 'novel-quote' }).range(view.state.doc.lineAt(node.from).from));
      if (name === 'HeaderMark' || name === 'EmphasisMark' || name === 'QuoteMark' || name === 'CodeMark' || name === 'LinkMark' || name === 'CodeInfo') {
        const hasSpace = ['HeaderMark', 'QuoteMark'].includes(name) && view.state.doc.sliceString(node.to, node.to + 1) === ' ';
        ranges.push(Decoration.replace({}).range(node.from, node.to + (hasSpace ? 1 : 0)));
      }
      if (name === 'ListMark') {
        const marker = view.state.doc.sliceString(node.from, node.to);
        if (/^[-+*]$/.test(marker)) {
          const tail = view.state.doc.sliceString(node.to, view.state.doc.lineAt(node.to).to);
          const task = tail.match(/^[ \t]+\[([ xX])\][ \t]?/);
          if (task) { ranges.push(Decoration.replace({ widget: new Task(task[1] !== ' ') }).range(node.from, node.to + task[0].length)); return; }
          const end = node.to + (view.state.doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0);
          ranges.push(Decoration.replace({ widget: new Bullet() }).range(node.from, end));
        }
      }
      if (name === 'HorizontalRule') ranges.push(Decoration.replace({ widget: new Divider() }).range(node.from, node.to));
      if (name === 'URL' && ['Link', 'Image'].includes(node.node.parent?.name ?? '')) ranges.push(Decoration.replace({}).range(node.from, node.to));
      if (name === 'InlineCode') ranges.push(Decoration.mark({ class: 'novel-code' }).range(node.from, node.to));
      if (name === 'Link') ranges.push(Decoration.mark({ class: 'novel-link' }).range(node.from, node.to));
    } });
    const text = view.state.doc.sliceString(from, to);
    for (const match of text.matchAll(/<u>([^\n]*?)<\/u>/g)) {
      const start = from + match.index!;
      if (match[1].length) ranges.push(Decoration.mark({ class: 'novel-underline' }).range(start + 3, start + match[0].length - 4));
      ranges.push(Decoration.replace({}).range(start, start + 3));
      ranges.push(Decoration.replace({}).range(start + match[0].length - 4, start + match[0].length));
    }
  }
  return Decoration.set(ranges, true);
}

export const novelPresentation = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = decorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = decorations(update.view);
  }
}, { decorations: plugin => plugin.decorations });
