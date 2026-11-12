import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const label = process.argv[2] ?? 'baseline';
const repetitions = Number(process.argv[3] ?? 3);
const browser = await chromium.launch({ channel:'msedge', headless:true, args:['--js-flags=--expose-gc'] });
const samples=[];
for(let repetition=0; repetition<repetitions; repetition++) {
  const page=await browser.newPage();
  await page.routeWebSocket(/.*/, socket=>socket.close());
  await page.goto((process.env.BENCHMARK_URL ?? 'http://127.0.0.1:1423') + '/tests/fixture.html');
  await page.getByRole('textbox',{name:'Texto del documento'}).waitFor();
  const client=await page.context().newCDPSession(page);
  const setup=await page.evaluate(async()=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {flushSync}=(await import('/node_modules/.vite/deps/react-dom.js')).default;
    const {Editor}=await import('/src/editor/Editor.tsx');
    document.getElementById('root').style.display='none';
    const host=document.createElement('div'); host.style.height='600px';document.body.appendChild(host);
    const root=createRoot(host),handle={current:null},docs=[];
    const text=('# Capitulo\n\nUn parrafo con **negrita**, *cursiva* y [enlace](https://example.com).\n\n').repeat(2048);
    for(let i=0;i<16;i++) docs.push({id:'benchmark-'+i,title:'Capitulo-'+i+'.md',path:null,text:text+i,baseText:text+i,format:{encoding:'UTF-8',eol:'LF'},recovered:false});
    let current=0;
    const onEdit=(id,value)=>{docs.find(d=>d.id===id).text=value;};
    const render=()=>flushSync(()=>root.render(React.createElement(Editor,{doc:docs[current],mode:'markdown',indent:false,wrap:true,showSpaces:false,handle,onEdit,onCursor:()=>{},onBlock:()=>{},onStats:()=>{}})));
    const activate=async i=>{current=i;render();await new Promise(requestAnimationFrame);};
    window.__benchmark={docs,handle,activate,root};
    return {documents:docs.length,charactersPerDocument:text.length};
  });
  await client.send('HeapProfiler.collectGarbage');
  const before=await client.send('Runtime.getHeapUsage');
  const elapsed=await page.evaluate(async()=>{
    const b=window.__benchmark,start=performance.now();
    for(let i=0;i<b.docs.length;i++) {
      await b.activate(i);
      for(let edit=0;edit<12;edit++) {const doc=b.docs[i];b.handle.current.replace(doc.text.length,doc.text.length,'','\nCambio '+i+'-'+edit+' de la escena.');}
    }
    await b.activate(0);
    return performance.now()-start;
  });
  await client.send('HeapProfiler.collectGarbage');
  const after=await client.send('Runtime.getHeapUsage');
  const cached=await page.evaluate(async()=>{const c=await import('/src/editor/cache.ts');return c.editorStates?.size??c.retainedEditorCount?.()??null;});
  samples.push({repetition,...setup,before,after,usedHeapDelta:after.usedSize-before.usedSize,elapsedMs:elapsed,cached});
  await page.close();
}
await browser.close();
const result={label,kind:'headless Edge renderer JS heap; isolated editor workload, not native total RAM',samples};
const destination = resolve(process.env.BENCHMARK_OUTPUT ?? 'test-results/editor-memory-'+label+'.json');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));



