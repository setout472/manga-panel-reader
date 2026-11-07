import {build} from 'esbuild';
import {build as viteBuild} from 'vite';
await build({entryPoints:['src/main/main.ts'],outfile:'dist/main.cjs',bundle:true,platform:'node',format:'cjs',external:['electron','sharp'],sourcemap:true});
await build({entryPoints:['src/main/preload.ts'],outfile:'dist/preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron']});
await build({entryPoints:['src/main/panelWorker.ts'],outfile:'dist/panel-worker.cjs',bundle:true,platform:'node',format:'cjs'});
await viteBuild();
