import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

// Exercise real app workflows in a new database, never the active workshop.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
fs.mkdirSync(path.join(root,'.data'),{recursive:true});
const temp=fs.mkdtempSync(path.join(root,'.data','platform-check-'));
const keep=process.argv.includes('--keep-running');
fs.copyFileSync(path.join(root,'server.mjs'),path.join(temp,'server.mjs'));
fs.cpSync(path.join(root,'public'),path.join(temp,'public'),{recursive:true});
fs.mkdirSync(path.join(temp,'tools'));fs.copyFileSync(path.join(root,'tools/start-local.mjs'),path.join(temp,'tools/start-local.mjs'));
function copyContent(from,to){fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){if(e.isDirectory()&&e.name!=='backups'&&e.name!=='images')copyContent(path.join(from,e.name),path.join(to,e.name));else if(e.isFile()&&e.name.endsWith('.md'))fs.copyFileSync(path.join(from,e.name),path.join(to,e.name));}}
copyContent(path.join(root,'data'),path.join(temp,'data'));
async function availablePort(){const socket=http.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
const port=await availablePort(),url='http://127.0.0.1:'+port;
const log=fs.openSync(path.join(temp,'server.log'),'a');
const child=spawn(process.execPath,[path.join(temp,'server.mjs')],{cwd:temp,env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},windowsHide:true,detached:keep,stdio:['ignore',log,log]});
const outcomes=[];
const request=async(route,{method='GET',body,cookie}={})=>{const response=await fetch(url+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
const ok=async(...args)=>{const response=await request(...args);assert(response.status<300,JSON.stringify(response));return response;};
const runLauncher=async(targetPort)=>{const proc=spawn(process.execPath,[path.join(temp,'tools/start-local.mjs'),'--no-browser'],{cwd:temp,env:{...process.env,HOST:'127.0.0.1',PORT:String(targetPort)},windowsHide:true});let output='';proc.stdout.on('data',d=>output+=d);proc.stderr.on('data',d=>output+=d);const code=await new Promise(resolve=>proc.once('exit',resolve));return{code,output};};
try{
 let ready=false;for(let i=0;i<50;i++){try{const r=await request('/api/health');if(r.data.ready){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert(ready,'isolated preview did not start: '+fs.readFileSync(path.join(temp,'server.log'),'utf8'));
 const password=randomBytes(24).toString('hex');
 const setup=await Promise.all(['a','b'].map(suffix=>request('/api/setup',{method:'POST',body:{username:'audit-admin-'+suffix,password}})));
 assert.deepEqual(setup.map(r=>r.status).sort(),[201,409]);const admin=setup.find(r=>r.status===201).cookie;
 outcomes.push('Concurrent setup creates exactly one administrator');
 let pack=(await ok('/api/admin/export',{cookie:admin})).data;
 pack.settings.cooldownSeconds=0;pack.settings.showScoreboard=false;
 for(const c of pack.challenges){c.requires=[];c.cooldown=0;}
 const target=pack.challenges.find(c=>c.id==='01.03-attacker---gaining-access');
 const editedHints=pack.challenges.find(c=>c.id==='05.07-defender---defending-the-endpoint');
 pack.challenges.push({id:'audit-manual',title:'Review response',category:'Audit',order:99999,points:10,visible:true,objective:'Submit a short response.',question:'What did you observe?',answerHelp:'Write one sentence.',answerType:'manual',answers:[],hints:[],requires:[]});
 await ok('/api/admin/workshop',{method:'PUT',cookie:admin,body:pack});
 for(const username of ['audit-student','preview-student'])await ok('/api/admin/users',{method:'POST',cookie:admin,body:{username,password,role:'participant'}});
 const student=(await ok('/api/login',{method:'POST',body:{username:'audit-student',password}})).cookie;
 const solves=await Promise.all([0,1].map(()=>request('/api/challenges/'+target.id+'/solve',{method:'POST',cookie:student,body:{answer:target.answers[0]}})));
 assert.equal(solves.filter(r=>r.data.status==='solved').length,1);
 let publicData=(await ok('/api/public',{cookie:student})).data;assert.equal(publicData.progress.score,10);assert.equal(publicData.progress.solves,1);assert.deepEqual(publicData.scoreboard,[]);
 outcomes.push('Concurrent solves award once; personal score works with scoreboard disabled');
 const pending=await Promise.all([0,1].map(()=>request('/api/challenges/audit-manual/solve',{method:'POST',cookie:student,body:{answer:'Observed the exercise.'}})));
 const review=(await ok('/api/admin/workshop',{cookie:admin})).data.submissions.filter(s=>s.challengeId==='audit-manual'&&s.status==='pending');assert.equal(review.length,1);
 const database=new DatabaseSync(path.join(temp,'data/workshop.sqlite'));
 const legacy=database.prepare("INSERT INTO submissions(user_id,challenge_id,answer,status,correct,points_awarded,created_at) VALUES(?,?,?,'pending',0,0,?)").run(review[0].userId,'audit-manual','Older duplicate response',new Date().toISOString());database.close();
 await ok('/api/admin/review',{method:'POST',cookie:admin,body:{id:review[0].id,action:'approve'}});
 await ok('/api/admin/review',{method:'POST',cookie:admin,body:{id:review[0].id,action:'approve'}});
 assert.equal((await ok('/api/admin/review',{method:'POST',cookie:admin,body:{id:Number(legacy.lastInsertRowid),action:'approve'}})).data.alreadySolved,true);
 publicData=(await ok('/api/public',{cookie:student})).data;assert.equal(publicData.progress.score,20);
 outcomes.push('Manual responses stay single and repeated approval cannot award twice');
 await ok('/api/challenges/'+editedHints.id+'/unlock',{method:'POST',cookie:student,body:{index:0}});
 pack=(await ok('/api/admin/export',{cookie:admin})).data;pack.challenges.find(c=>c.id===editedHints.id).hints=[];
 await ok('/api/admin/workshop',{method:'PUT',cookie:admin,body:pack});
 const stale=(await ok('/api/challenges/'+editedHints.id,{cookie:student})).data;
 assert.equal(stale.availablePoints,7);assert.equal(stale.hintAccessChanged,true);assert.deepEqual(stale.unlockedHints,[]);
 assert.equal((await request('/api/challenges/'+editedHints.id+'/unlock',{method:'POST',cookie:student,body:{index:0}})).status,409);
 await ok('/api/challenges/'+editedHints.id+'/solve',{method:'POST',cookie:student,body:{answer:editedHints.answers[0]}});
 assert.equal((await ok('/api/public',{cookie:student})).data.progress.score,27);
 outcomes.push('Edited hint lists remain readable and preserve recorded point deductions');
 const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfWsAAAAASUVORK5CYII=';
 const media=(await ok('/api/admin/media',{method:'POST',cookie:admin,body:{name:'Hero (2).png',data:image}})).data.media;
 assert.equal(media.url,'/images/Hero%20%282%29.png');assert.equal((await fetch(url+media.url)).status,200);
 pack=(await ok('/api/admin/export',{cookie:admin})).data;pack.settings.overviewArtwork=media.url;
 await ok('/api/admin/workshop',{method:'PUT',cookie:admin,body:pack});
 assert.equal((await ok('/api/public')).data.settings.overviewArtwork,media.url);
 outcomes.push('Media names with spaces/parentheses survive upload, artwork save and export');
 for(const mode of ['missing','cycle']){const bad=structuredClone(pack);if(mode==='missing')bad.challenges[0].requires=['missing-id'];else{bad.challenges[0].requires=[bad.challenges[1].id];bad.challenges[1].requires=[bad.challenges[0].id];}assert.equal((await request('/api/admin/workshop',{method:'PUT',cookie:admin,body:bad})).status,400);}
 assert.deepEqual((await ok('/api/admin/export',{cookie:admin})).data.challenges[0].requires,[]);
 outcomes.push('Broken prerequisite imports are rejected without replacing valid content');
 assert.equal((await runLauncher(port)).code,0);
 const other=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"app":"another-service"}');});await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve));
 try{assert.equal((await runLauncher(other.address().port)).code,1);}finally{await new Promise(resolve=>other.close(resolve));}
 assert.equal((await runLauncher('invalid')).code,1);
 outcomes.push('Launcher reuses this workshop, rejects another service and validates PORT');
 const fixture={url,root:temp,processId:child.pid,username:'preview-student',password};
 fs.writeFileSync(path.join(root,'.data/platform-review-preview.json'),JSON.stringify(fixture,null,2));
 console.log(JSON.stringify({passed:outcomes,preview:keep?{url,root:temp,fixture:path.join(root,'.data/platform-review-preview.json')}:null},null,2));
}catch(error){child.kill();throw error;}finally{fs.closeSync(log);if(keep)child.unref();else child.kill();}
