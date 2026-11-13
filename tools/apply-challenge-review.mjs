import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// Apply an editorial review without replacing accounts, submissions, or scoring settings.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reviewDir=process.argv[2];
if(!reviewDir)throw Error('Pass the folder containing challenge-review-source/first/second.json.');
const load=name=>JSON.parse(fs.readFileSync(path.join(reviewDir,name),'utf8'));
const baseline=load('challenge-review-source.json');
const review=[...load('challenge-review-first.json'),...load('challenge-review-second.json')];
const db=new DatabaseSync(path.join(root,'data/workshop.sqlite'));
const current=db.prepare('SELECT data FROM challenges').all().map(r=>JSON.parse(r.data));
const byId=new Map(current.map(c=>[c.id,c]));
const originalById=new Map(baseline.map(c=>[c.id,c]));
const images=c=>[c.objective,...(c.hints||[]).map(h=>h.content)].join('\n').match(/\/images\/[^)"\s<>]+/g)||[];
const updates=[];
if(review.length!==baseline.length||new Set(review.map(c=>c.id)).size!==review.length)throw Error('Review must cover each source challenge exactly once.');
for(const edit of review){
 const c=byId.get(edit.id),original=originalById.get(edit.id);
 if(!c||!original)throw Error('Unknown challenge: '+edit.id);
 if(JSON.stringify(c)!==JSON.stringify(original))throw Error('Content changed after review began: '+edit.id);
 if(!edit.question?.trim()||!edit.answerHelp?.trim())throw Error('Missing question/format: '+edit.id);
 const next={...c,question:edit.question.trim(),answerHelp:edit.answerHelp.trim()};
 if(edit.objective!==undefined)next.objective=edit.objective;
 if(edit.hints!==undefined)next.hints=edit.hints;
 if(next.hints.length!==c.hints.length||next.hints.some((h,i)=>h.cost!==c.hints[i].cost))throw Error('Hint costs changed: '+edit.id);
 for(const url of images(c))if(!images(next).includes(url))throw Error('Removed screenshot '+url+' from '+edit.id);
 if(c.id==='17.20-defender---fortipam-video-recording'){
  next.answers=[...new Set([...c.answers,'secret event & video'])];
  next.answerHelp='Enter the section name under Log & Report, including the & symbol. Both singular and plural menu wording are accepted.';
 }
 updates.push(next);
}
const idify=s=>s.toLowerCase().trim().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&e.name!=='backups'?walk(path.join(dir,e.name)):e.isFile()&&e.name.endsWith('.md')?[path.join(dir,e.name)]:[]);
const files=walk(path.join(root,'data'));
const parse=raw=>raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
const writes=new Map();
for(const c of updates){
 const file=files.find(f=>idify(path.basename(f,'.md'))===c.id&&!f.includes(path.sep+'hints'+path.sep));
 if(!file)throw Error('No source Markdown: '+c.id);
 const raw=fs.readFileSync(file,'utf8'),m=parse(raw);if(!m)throw Error('Missing front matter: '+file);
 let head=m[1].replace(/^(?:question|answer_help):.*\r?\n?/gm,'').trimEnd();
 head+='\nquestion: '+JSON.stringify(c.question)+'\nanswer_help: '+JSON.stringify(c.answerHelp);
 if(c.id==='17.20-defender---fortipam-video-recording')head+='\nanswer:\n'+c.answers.map(v=>'  - '+JSON.stringify(v)).join('\n');
 writes.set(file,'---\n'+head+'\n---\n\n'+c.objective+'\n');
 const refs=[...m[1].matchAll(/^\s*-\s*["']?([^\r\n|]+\.md)\s*\|/gm)].map(x=>x[1].trim());
 if(refs.length!==c.hints.length)throw Error('Source hint mapping differs: '+c.id);
 refs.forEach((ref,i)=>{
  const hintFile=path.resolve(path.dirname(file),ref),hintRaw=fs.readFileSync(hintFile,'utf8'),hm=parse(hintRaw);
  writes.set(hintFile,(hm?hm[0]+'\n':'')+c.hints[i].content+'\n');
 });
}
const backup=path.join(root,'data/backups','challenge-review-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.writeFileSync(path.join(backup,'challenges.json'),JSON.stringify(current,null,2));
for(const [file] of writes){const dest=path.join(backup,'markdown',path.relative(path.join(root,'data'),file));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);}
db.exec('BEGIN IMMEDIATE');
try{const update=db.prepare('UPDATE challenges SET data=? WHERE id=?');for(const c of updates)update.run(JSON.stringify(c),c.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
for(const [file,content] of writes)fs.writeFileSync(file,content);
db.close();
const report=['# Challenge content review','',`Reviewed ${updates.length} challenges, including the hidden rollback activity.`, '', 'Questions and format guidance now appear together above flag entry. Existing answers are preserved; the exact singular FortiPAM menu label is also accepted. Hint costs and screenshots are preserved.','',...review.flatMap(r=>['## '+byId.get(r.id).title,'','**Flag question:** '+r.question,'','**Review:** '+r.notes,'','**Evidence:** '+r.evidence,''])].join('\n');
fs.writeFileSync(path.join(root,'docs/CHALLENGE_CONTENT_REVIEW.md'),report);
console.log(JSON.stringify({reviewed:updates.length,markdownFiles:writes.size,backup},null,2));
