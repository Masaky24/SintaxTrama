export type Action = 'bold' | 'italic' | 'underline' | 'heading' | 'quote' | 'list' | 'title' | 'subtitle' | 'section' | 'normal' | 'code' | 'codeblock' | 'link' | 'task' | 'table' | 'divider' | 'ordered' | 'indent' | 'outdent';
export function formatSelection(text: string, from: number, to: number, action: Action) {
  const inline = { bold: ['**', '**'], italic: ['*', '*'], underline: ['<u>', '</u>'], code: ['`', '`'], link: ['[', '](https://)'] } as const;
  if (action in inline) {
    const [left, right] = inline[action as keyof typeof inline];
    if (text.slice(from - left.length, from) === left && text.slice(to, to + right.length) === right) {
      return { from: from - left.length, to: to + right.length, insert: text.slice(from, to), anchor: from - left.length, head: to - left.length };
    }
    return { from, to, insert: left + text.slice(from, to) + right, anchor: from + left.length, head: to + left.length };
  }
  const start = from === 0 ? 0 : text.lastIndexOf('\n', from - 1) + 1;
  const boundary = to > from && text[to - 1] === '\n' ? to - 1 : to;
  const end = text.indexOf('\n', boundary); const stop = end < 0 ? text.length : end;
  if (action === 'codeblock' || action === 'table' || action === 'divider') {
    const selected = text.slice(from, to);
    const snippet = action === 'codeblock' ? `\`\`\`\n${selected}\n\`\`\`` : action === 'table' ? '| Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |' : '---';
    const insert = (from > 0 && text[from - 1] !== '\n' ? '\n' : '') + snippet + (to < text.length && text[to] !== '\n' ? '\n' : '');
    return { from, to, insert, anchor: from, head: from + insert.length };
  }
  if (action === 'indent' || action === 'outdent') {
    const insert = text.slice(start, stop).split('\n').map(line => action === 'indent' ? '    ' + line : line.replace(/^( {1,4}|\t)/, '')).join('\n');
    return { from: start, to: stop, insert, anchor: start, head: start + insert.length };
  }
  if (action === 'ordered' || action === 'task') {
    const insert = text.slice(start, stop).split('\n').map((line, index) => (action === 'ordered' ? `${index + 1}. ` : '- [ ] ') + line.replace(/^(?:\d+\. |[-*] (?:\[[ xX]\] )?)/, '')).join('\n');
    return { from: start, to: stop, insert, anchor: start, head: start + insert.length };
  }
  if (['title', 'subtitle', 'section', 'normal'].includes(action)) {
    const prefix = { title: '# ', subtitle: '## ', section: '### ', normal: '' }[action as 'title' | 'subtitle' | 'section' | 'normal'];
    const insert = text.slice(start, stop).split('\n').map(line => line.trim() ? prefix + line.replace(/^#{1,6}\s+/, '') : line).join('\n');
    return { from: start, to: stop, insert, anchor: start, head: start + insert.length };
  }
  const prefix = { heading: '## ', quote: '> ', list: '- ' }[action as 'heading' | 'quote' | 'list'];
  const lines = text.slice(start, stop).split('\n'); const remove = lines.every(l => l.startsWith(prefix));
  const insert = lines.map(l => remove ? l.slice(prefix.length) : prefix + l).join('\n');
  return { from: start, to: stop, insert, anchor: start, head: start + insert.length };
}
