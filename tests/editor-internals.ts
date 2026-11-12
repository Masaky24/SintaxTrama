// Browser integration helpers use Vite's normal dependency resolution so effects
// share the exact CodeMirror module instances used by the production adapter.
export { EditorView } from '@codemirror/view';
export { SearchQuery, setSearchQuery, getSearchQuery, searchPanelOpen } from '@codemirror/search';
export { foldEffect, foldedRanges } from '@codemirror/language';
