import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const noBrowser=process.argv.includes('--no-browser');
if(Number(process.versions.node.split('.')[0])<24){console.error('This workshop needs Node.js 24 or later. Install Node.js LTS, then open start.bat again.');process.exit(1);}
try{await import('node:sqlite');}catch{console.error('This Node.js installation does not include SQLite. Install Node.js 24 LTS or later.');process.exit(1);}
if(!Number.isInteger(port)||port<1||port>65535){console.error('PORT must be a whole number between 1 and 65535.');process.exit(1);}
const browserHost=host==='0.0.0.0'?'127.0.0.1':host==='::'?'[::1]':host.includes(':')&&!host.startsWith('[')?'['+host+']':host;
const url='http://'+browserHost+':'+port;
const instanceId=createHash('sha256').update(root.toLowerCase()).digest('hex');
async function probe(){
 try{const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1200)});const data=await response.json().catch(()=>null);return data?.app==='workshop-ctf'&&data?.instanceId===instanceId&&data.ready?'ready':'occupied';}
 catch{return 'unavailable';}
}
function openBrowser(){
 if(noBrowser)return;
 const command=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';
 const browser=spawn(command,[url],{stdio:'ignore',detached:true,windowsHide:true});
 browser.once('error',()=>console.log('Open '+url+' in your browser.'));browser.unref();
}
const existing=await probe();
if(existing==='ready'){console.log('This workshop is already running at '+url);openBrowser();process.exit(0);}
if(existing==='occupied'){console.error('Port '+port+' is being used by another service or workshop. Set a different PORT before starting this copy.');process.exit(1);}
console.log('Starting the workshop…');
const server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),HOST:host},stdio:'inherit',windowsHide:true});
let exitCode=null;
server.once('error',error=>{console.error('Could not start the workshop: '+error.message);exitCode=1;});
const finished=new Promise(resolve=>server.once('exit',code=>{exitCode=code??1;resolve(exitCode);}));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(exitCode===null)server.kill(signal);});
const deadline=Date.now()+10000;let ready=false;
while(exitCode===null&&Date.now()<deadline){if(await probe()==='ready'){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,150));}
if(!ready){console.error('The workshop did not become ready. Review the message above; the browser has not been opened.');if(exitCode===null)server.kill();process.exitCode=1;}
else{console.log('Open '+url);openBrowser();process.exitCode=await finished;}
