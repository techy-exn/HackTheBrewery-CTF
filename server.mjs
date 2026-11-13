import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const INSTANCE_ID = createHash("sha256").update(path.resolve(ROOT).toLowerCase()).digest("hex");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "workshop.sqlite");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
db.exec("CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,data TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS pages(id TEXT PRIMARY KEY,data TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'participant',team TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,challenge_id TEXT NOT NULL,answer TEXT NOT NULL,status TEXT NOT NULL,correct INTEGER NOT NULL DEFAULT 0,points_awarded INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,reviewed_at TEXT,reviewed_by INTEGER);\nCREATE TABLE IF NOT EXISTS hint_unlocks(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,challenge_id TEXT NOT NULL,hint_index INTEGER NOT NULL,cost INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,challenge_id,hint_index));\nCREATE TABLE IF NOT EXISTS lab_reports(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS global_challenge_skips(challenge_id TEXT PRIMARY KEY,created_at TEXT NOT NULL,created_by INTEGER REFERENCES users(id) ON DELETE SET NULL);\nCREATE TABLE IF NOT EXISTS participant_challenge_skips(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,challenge_id TEXT NOT NULL,created_at TEXT NOT NULL,created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,PRIMARY KEY(user_id,challenge_id));\nCREATE TABLE IF NOT EXISTS issue_notes(id INTEGER PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL DEFAULT '',symptoms TEXT NOT NULL DEFAULT '',resolution TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL);\nCREATE INDEX IF NOT EXISTS submissions_user_idx ON submissions(user_id,status);\nCREATE INDEX IF NOT EXISTS submissions_challenge_idx ON submissions(challenge_id,status);");

const DEFAULT = {
  title: "Hack the Brewery", tagline: "An OT and IT capture the flag",
  description: "A foothold in OT becomes a threat to the whole brewery. Follow the intrusion, stop the ransomware, and protect production.",
  welcome: "The attackers are already inside. Every flag reveals what happened next—and what the defenders can still save.", accent: "#c02678",
  overview: `The engineering station is the way in. The attacker follows the OT path to the PLC, then crosses into IT. Ransomware threatens the systems the brewery needs to keep running. Each flag advances the incident and reveals the response.

### [Attacker] Establish access in OT
Use the supplied starting point to reach the engineering workstation, then follow the route toward the OT domain controller.

### [Defender] Investigate and contain
Use endpoint telemetry, a decoy, and firewall controls to understand the activity and respond to it.

### [Both] Test and observe the PLC scenario
Run the assigned virtual PLC exercise, then investigate what changed from the OT defender view.

### [Attacker] Follow the route into IT
Work through the cross-network scenario and trace the effects on the IT environment.

### [Defender] Recover and secure operations
Review recovery, controlled remote access, and the final OT visibility activities.`,
  overviewRoute: "Kali Linux\nWindows 7 Engineering Station\nOT Domain Controller\nSiemens PLC\nCompromised VPN configuration\nWindows 10 IT Workstation\nIT Domain Controller",
  overviewArtwork: "/images/hack-the-brewery-home.png",
  topologyAddresses: {decoy:"https://10.60.10.50",pam:"https://10.60.10.40",guardian:"https://10.60.10.210",fgot:"https://10.60.10.2",plcConfigured:"192.168.250.193"},
  registrationOpen: false, showScoreboard: true, cooldownSeconds: 5,
  footer: "Use the assigned CloudShare lab only. Follow your workshop rules of engagement."
};
const now = () => new Date().toISOString();
function transaction(action) {
  db.exec("BEGIN IMMEDIATE");
  try { const result=action();db.exec("COMMIT");return result; }
  catch(e) { db.exec("ROLLBACK");throw e; }
}
const j = JSON.stringify;
const p = JSON.parse;
const text = (v, n=100000) => String(v ?? "").slice(0,n);
const idify = v => text(v,100).toLowerCase().trim().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"") || randomUUID();
const imageUrl = name => "/images/"+encodeURIComponent(name).replace(/[!'()*]/g,ch=>"%"+ch.charCodeAt(0).toString(16).toUpperCase());
const defaultPageLogos={"adaptix-c2":"/logos/adaptix-official.png",fortinet:"/logos/fortinet-wordmark.svg","nozomi-networks":"/logos/nozomi-wordmark.png",sentinelone:"/logos/sentinelone.png",siemens:"/logos/siemens.svg"};
function artworkUrl(value) {
  const source=text(value,500).trim();if(!source.startsWith("/images/"))return "";
  try {
    const name=decodeURIComponent(source.slice(8));
    if(path.basename(name)!==name||!/^[A-Za-z0-9][A-Za-z0-9._ ()-]{0,159}$/.test(name)||!new Set([".png",".jpg",".jpeg",".webp",".gif"]).has(path.extname(name).toLowerCase()))return "";
    return imageUrl(name);
  } catch { return ""; }
}
function send(res, status, body, headers={}) {
  res.writeHead(status,{ "Content-Type":typeof body==="string"?"text/plain; charset=utf-8":"application/json; charset=utf-8","Cache-Control":"no-store",...headers });
  res.end(typeof body==="string"?body:JSON.stringify(body));
}
function getCookie(req) {
  const pair=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("htb_session="));
  return pair?decodeURIComponent(pair.slice(12)):"";
}
const digest = token => createHash("sha256").update(token).digest("hex");
function cookieHeader(token, age) { return "htb_session="+encodeURIComponent(token)+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+age; }
function hashPassword(password) {
  const salt=randomBytes(16), key=scryptSync(String(password),salt,64);
  return salt.toString("hex")+":"+key.toString("hex");
}
function matchesPassword(password, stored) {
  try {
    const [salt,key]=stored.split(":"); const expected=Buffer.from(key,"hex");
    const actual=scryptSync(String(password),Buffer.from(salt,"hex"),expected.length);
    return expected.length===actual.length&&timingSafeEqual(expected,actual);
  } catch { return false; }
}
function fm(source) {
  const m=String(source).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if(!m) return {meta:{},body:String(source)};
  const meta={}; let active="";
  for(const line of m[1].split(/\r?\n/)) {
    const item=line.match(/^\s*-\s*(.*)$/);
    if(item&&active){meta[active].push(scalar(item[1]));continue;}
    const field=line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if(!field) continue;
    const rest=(field[2]||"").replace(/\s+#.*$/,"").trim();
    if(!rest){meta[field[1]]=[];active=field[1];}
    else {meta[field[1]]=scalar(rest);active="";}
  }
  return {meta,body:String(source).slice(m[0].length).trim()};
}
function scalar(s) {
  s=String(s).trim();
  if(s.startsWith('"')&&s.endsWith('"')){try{return JSON.parse(s)}catch{return s.slice(1,-1)}}
  if(s.startsWith("'")&&s.endsWith("'"))return s.slice(1,-1).replace(/''/g,"'");
  if(/^(true|false)$/i.test(s))return s.toLowerCase()==="true";
  if(/^-?\d+(\.\d+)?$/.test(s))return Number(s);
  if(s==="null")return null;
  return s;
}
function mdFiles(dir) {
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const f=path.join(dir,e.name);
    return e.isDirectory()?(e.name==="backups"?[]:mdFiles(f)):e.isFile()&&e.name.toLowerCase().endsWith(".md")?[f]:[];
  });
}
function hintFrom(base,spec) {
  const parts=String(spec).split("|").map(x=>x.trim()), target=path.resolve(base,parts[0]);
  if(!target.startsWith(path.resolve(DATA_DIR)+path.sep)||!fs.existsSync(target))return null;
  const h=fm(fs.readFileSync(target,"utf8"));
  return {title:parts[2]||h.meta.title||"Hint",cost:Math.max(0,Number(parts[1])||0),content:h.body};
}
function seed() {
  const challenges=[],pages=[];
  for(const file of mdFiles(DATA_DIR)) {
    const raw=fs.readFileSync(file,"utf8"), doc=fm(raw), rel=path.relative(DATA_DIR,file);
    if(doc.meta.category&&!rel.split(path.sep).includes("hints")) {
      const name=path.basename(file,".md"), lead=name.match(/^(\d+)\.(\d+)/);
      let answer=doc.meta.answer??doc.meta.flag??"";
      const answerType=doc.meta.requires_approval?"manual":text(doc.meta.flag_type||(doc.meta.choices?"choice":"text"),30);
      if(answerType==="choice"&&typeof answer==="string")answer=answer.split("|").map(x=>x.trim()).filter(Boolean);
      if(!Array.isArray(answer))answer=[String(answer)];
      challenges.push({
        id:idify(name),title:text(doc.meta.title||name,180),category:text(doc.meta.category,100),
        order:lead?Number(lead[1])*1000+Number(lead[2]):Number(doc.meta.order)||99999,
        points:Math.max(0,Number(doc.meta.value)||0),visible:doc.meta.state!=="hidden",objective:doc.body,
        question:text(doc.meta.question,1000),answerHelp:text(doc.meta.answer_help,1000),
        answerType,answers:answer,regex:answerType==="regex"?String(doc.meta.flag||""):"",
        caseSensitive:false,choices:Array.isArray(doc.meta.choices)?doc.meta.choices:[],
        multiple:Boolean(doc.meta.multiple),requiresApproval:Boolean(doc.meta.requires_approval),
        requires:Array.isArray(doc.meta.requires)?doc.meta.requires.map(String):doc.meta.requires?[String(doc.meta.requires)]:[],
        cooldown:Math.max(0,Number(doc.meta.cooldown)||0),
        hints:Array.isArray(doc.meta.hints)?doc.meta.hints.map(h=>hintFrom(path.dirname(file),h)).filter(Boolean):[]
      });
    } else if(path.dirname(file)===DATA_DIR) {
      const name=path.basename(file,".md"), title=text(doc.meta.title||name,180);
      const home=/^home$/i.test(name), vendor=/fortinet|nozomi|sentinelone|palo alto|siemens|adaptix/i.test(name+" "+title);
      const slug=idify(name);
      pages.push({id:slug,slug,title,kind:home?"home":vendor?"vendor":"page",body:home?doc.body.replace(/<!--[\s\S]*?-->/g,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<script[\s\S]*?<\/script>/gi,"").trim():doc.body,visible:true,order:slug==="products"?-100:pages.length*10,logo:defaultPageLogos[slug]||"",authRequired:Boolean(doc.meta.auth_required)});
    }
  }
  const titleMap=new Map(challenges.map(c=>[c.title.toLowerCase(),c.id]));
  for(const c of challenges)c.requires=c.requires.map(x=>titleMap.get(x.toLowerCase())||idify(x));
  const cfg={...DEFAULT,welcome:"Explore the OT and IT workshop, complete the activities, and follow the challenge path at your own pace."};
  db.prepare("INSERT INTO settings(id,data) VALUES(1,?)").run(j(cfg));
  const ci=db.prepare("INSERT INTO challenges(id,data) VALUES(?,?)");
  for(const c of challenges)ci.run(c.id,j(c));
  const pi=db.prepare("INSERT INTO pages(id,data) VALUES(?,?)");
  for(const item of pages){if(item.slug==="products")item.kind="catalog";pi.run(item.id,j(item))}
}
if(!db.prepare("SELECT id FROM settings WHERE id=1").get()) {
  if(!db.prepare("SELECT id FROM challenges LIMIT 1").get())seed();
  else db.prepare("INSERT INTO settings(id,data) VALUES(1,?)").run(j(DEFAULT));
}
const config=()=>({...DEFAULT,...p(db.prepare("SELECT data FROM settings WHERE id=1").get().data)});
const challenges=()=>db.prepare("SELECT data FROM challenges").all().map(r=>p(r.data)).sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title));
const pages=()=>db.prepare("SELECT data FROM pages").all().map(r=>p(r.data)).sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title));
const challenge=id=>{const r=db.prepare("SELECT data FROM challenges WHERE id=?").get(id);return r?p(r.data):null};
const page=id=>{const r=db.prepare("SELECT data FROM pages WHERE id=? OR json_extract(data,'$.slug')=?").get(id,id);return r?p(r.data):null};
function userFor(req) {
  const token=getCookie(req); if(!token)return null;
  return db.prepare("SELECT u.id,u.username,u.display_name,u.role,u.team FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").get(digest(token),Date.now())||null;
}
function mustUser(req,res,role="") {
  const u=userFor(req);
  if(!u){send(res,401,{error:"Sign in to continue."});return null}
  if(role&&u.role!==role){send(res,403,{error:"Administrator access is required."});return null}
  return u;
}
async function body(req) {
  const chunks=[];let size=0;
  for await(const c of req){size+=c.length;if(size>8*1024*1024)throw Error("Request is too large.");chunks.push(c)}
  const s=Buffer.concat(chunks).toString("utf8");return s?JSON.parse(s):{};
}
const solvedFor=uid=>new Set(db.prepare("SELECT challenge_id FROM submissions WHERE user_id=? AND status='solved'").all(uid).map(r=>r.challenge_id));
const skippedFor=uid=>new Set([...db.prepare("SELECT challenge_id FROM global_challenge_skips").all().map(r=>r.challenge_id),...db.prepare("SELECT challenge_id FROM participant_challenge_skips WHERE user_id=?").all(uid).map(r=>r.challenge_id)]);
const completedFor=uid=>new Set([...solvedFor(uid),...skippedFor(uid)]);
const locked=(c,solved)=>!solved.has(c.id)&&(c.requires||[]).some(id=>!solved.has(id));
function publicChallenge(c) {
  return {id:c.id,title:c.title,category:c.category,order:c.order,points:c.points,visible:c.visible,requires:c.requires||[],objective:c.objective,question:c.question||"",answerHelp:c.answerHelp||"",answerType:c.answerType,choices:c.choices||[],multiple:Boolean(c.multiple),requiresApproval:Boolean(c.requiresApproval),cooldown:c.cooldown||0,hints:(c.hints||[]).map((h,index)=>({title:h.title,cost:Number(h.cost)||0,index}))};
}
function scoreboard(limit=50) {
  return db.prepare("SELECT u.id,u.display_name,u.team,COALESCE(SUM(s.points_awarded),0) score,COUNT(s.id) solves,MAX(s.created_at) last_solve FROM users u LEFT JOIN submissions s ON s.user_id=u.id AND s.status='solved' WHERE u.role='participant' GROUP BY u.id ORDER BY score DESC,solves DESC,last_solve ASC LIMIT ?").all(limit);
}
const userObj=u=>({id:u.id,username:u.username,displayName:u.display_name,role:u.role,team:u.team,createdAt:u.created_at});
function facilitatorProgress() {
  const all=challenges().filter(c=>c.visible).sort((a,b)=>a.order-b.order);
  return db.prepare("SELECT id,username,display_name,team FROM users WHERE role='participant' ORDER BY display_name").all().map(u=>{
    const solved=solvedFor(u.id),skipped=skippedFor(u.id),completed=new Set([...solved,...skipped]);
    const current=all.find(c=>!completed.has(c.id)&&!locked(c,completed));
    const activity=db.prepare("SELECT MAX(created_at) at FROM submissions WHERE user_id=?").get(u.id).at;
    const hints=db.prepare("SELECT COUNT(*) n FROM hint_unlocks WHERE user_id=?").get(u.id).n;
    const wrong=db.prepare("SELECT COUNT(*) n FROM submissions WHERE user_id=? AND status='incorrect'").get(u.id).n;
    const report=db.prepare("SELECT status,note,updated_at FROM lab_reports WHERE user_id=?").get(u.id);
    return {id:u.id,username:u.username,displayName:u.display_name,team:u.team,solves:solved.size,skips:[...skipped].filter(id=>!solved.has(id)).length,total:all.length,current:current?.title||'Complete',lastActivity:activity||'',hints,wrong,labStatus:report?.status||'not_checked',labNote:report?.note||'',labUpdatedAt:report?.updated_at||''};
  });
}
function adminData() {
  return {issueNotes:db.prepare("SELECT n.id,n.title,n.category,n.symptoms,n.resolution,n.updated_at,u.display_name updated_by FROM issue_notes n LEFT JOIN users u ON u.id=n.updated_by ORDER BY n.updated_at DESC,n.id DESC").all(),participantProgress:facilitatorProgress(),globalSkips:db.prepare("SELECT challenge_id,created_at FROM global_challenge_skips").all(),participantSkips:db.prepare("SELECT user_id,challenge_id,created_at FROM participant_challenge_skips").all(),settings:config(),challenges:challenges(),pages:pages(),media:mediaList(),
    users:db.prepare("SELECT id,username,display_name,role,team,created_at FROM users ORDER BY role,username").all().map(userObj),
    submissions:db.prepare("SELECT s.id,s.user_id,s.challenge_id,s.answer,s.status,s.correct,s.points_awarded,s.created_at,u.username,u.display_name,c.data challenge_json FROM submissions s JOIN users u ON u.id=s.user_id LEFT JOIN challenges c ON c.id=s.challenge_id ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,s.id DESC LIMIT 200").all().map(r=>({id:r.id,userId:r.user_id,username:r.username,displayName:r.display_name,challengeId:r.challenge_id,challengeTitle:r.challenge_json?p(r.challenge_json).title:"Deleted challenge",answer:r.answer,status:r.status,correct:Boolean(r.correct),pointsAwarded:r.points_awarded,createdAt:r.created_at}))};
}
function mediaList() {
  const dir=path.join(DATA_DIR,"images");fs.mkdirSync(dir,{recursive:true});
  const allowed=new Set([".png",".jpg",".jpeg",".webp",".gif"]);
  return fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isFile()&&allowed.has(path.extname(x.name).toLowerCase())).map(x=>({name:x.name,size:fs.statSync(path.join(dir,x.name)).size,url:imageUrl(x.name)})).sort((a,b)=>a.name.localeCompare(b.name));
}
function normChallenge(input,i) {
  const type=["text","regex","choice","manual"].includes(input.answerType)?input.answerType:"text";
  const answers=Array.isArray(input.answers)?input.answers.map(x=>text(x,2000)).filter(Boolean):String(input.answers||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return {id:idify(input.id||input.title||"challenge-"+i),title:text(input.title||"Untitled challenge",180),category:text(input.category||"General",100),order:Number.isFinite(Number(input.order))?Number(input.order):i*10,points:Math.max(0,Number(input.points)||0),visible:input.visible!==false,objective:text(input.objective),question:text(input.question,1000),answerHelp:text(input.answerHelp,1000),answerType:type,answers,regex:text(input.regex,2000),caseSensitive:false,choices:Array.isArray(input.choices)?input.choices.map(x=>text(x,500)).filter(Boolean):[],multiple:Boolean(input.multiple),requiresApproval:type==="manual"||Boolean(input.requiresApproval),requires:Array.isArray(input.requires)?input.requires.map(String).filter(Boolean):[],cooldown:Math.max(0,Number(input.cooldown)||0),hints:Array.isArray(input.hints)?input.hints.map((h,n)=>({title:text(h.title||"Hint "+(n+1),180),cost:Math.max(0,Number(h.cost)||0),content:text(h.content)})):[]};
}
function normPage(input,i) {
  const slug=idify(input.slug||input.id||input.title||"page-"+i);
  const rawLogo=text(input.logo,500).trim();
  const logo=artworkUrl(rawLogo)||(/^\/logos\/[A-Za-z0-9._-]+\.(?:png|svg)$/i.test(rawLogo)?rawLogo:"");
  return {id:slug,slug,title:text(input.title||"Untitled page",180),kind:["vendor","catalog","home","page"].includes(input.kind)?input.kind:"page",body:text(input.body,200000),visible:input.visible!==false,order:Number.isFinite(Number(input.order))?Number(input.order):i*10,logo,authRequired:Boolean(input.authRequired)};
}
function saveContent(input) {
  if(!input||!Array.isArray(input.challenges)||!Array.isArray(input.pages)||!input.settings)throw Error("Workshop file needs settings, challenges, and pages.");
  const cfg={...DEFAULT,...input.settings};
  cfg.title=text(cfg.title||DEFAULT.title,120);cfg.tagline=text(cfg.tagline,200);cfg.description=text(cfg.description,2000);cfg.welcome=text(cfg.welcome,2000);cfg.overview=text(cfg.overview,20000);cfg.overviewRoute=text(cfg.overviewRoute,1200);cfg.overviewArtwork=artworkUrl(cfg.overviewArtwork);cfg.footer=text(cfg.footer,2000);
  cfg.accent=/^#[0-9a-f]{6}$/i.test(cfg.accent)?cfg.accent:DEFAULT.accent;cfg.registrationOpen=Boolean(cfg.registrationOpen);cfg.showScoreboard=cfg.showScoreboard!==false;cfg.cooldownSeconds=Math.max(0,Number(cfg.cooldownSeconds)||0);
  cfg.topologyAddresses=Object.fromEntries(Object.keys(DEFAULT.topologyAddresses).map(key=>[key,text(cfg.topologyAddresses?.[key]??DEFAULT.topologyAddresses[key],200).trim()]));
  const cs=input.challenges.map(normChallenge),ps=input.pages.map(normPage),seen=new Set(),pagesSeen=new Set();
  const issueNotes=Array.isArray(input.issueNotes)?input.issueNotes.map(x=>({title:text(x.title,160).trim(),category:text(x.category,80).trim(),symptoms:text(x.symptoms,5000).trim(),resolution:text(x.resolution,10000).trim()})):null;
  if(issueNotes?.some(x=>!x.title||!x.resolution))throw Error("Each common issue needs a title and a fix.");
  for(const c of cs){if(seen.has(c.id))throw Error("Challenge IDs must be unique: "+c.id);seen.add(c.id);if(c.answerType==="regex"&&c.regex){try{new RegExp(c.regex,"i")}catch{throw Error("Invalid answer pattern in "+c.title)}}}
  for(const x of ps){if(pagesSeen.has(x.id))throw Error("Page slugs must be unique: "+x.slug);pagesSeen.add(x.id)}
  const byId=new Map(cs.map(c=>[c.id,c]));
  for(const c of cs)for(const required of c.requires){
    if(required===c.id)throw Error('"'+c.title+'" cannot require itself.');
    if(!byId.has(required))throw Error('"'+c.title+'" requires missing challenge "'+required+'". Remove that prerequisite or include the required challenge before saving.');
  }
  const visited=new Set(),visiting=new Set();
  function checkDependencies(id,trail=[]){
    if(visiting.has(id))throw Error("Challenge prerequisites form a cycle: "+[...trail,id].map(x=>byId.get(x).title).join(" → "));
    if(visited.has(id))return;visiting.add(id);
    for(const required of byId.get(id).requires)checkDependencies(required,[...trail,id]);
    visiting.delete(id);visited.add(id);
  }
  for(const c of cs)checkDependencies(c.id);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE settings SET data=? WHERE id=1").run(j(cfg));db.exec("DELETE FROM challenges;DELETE FROM pages;");
    const ci=db.prepare("INSERT INTO challenges(id,data) VALUES(?,?)");for(const c of cs)ci.run(c.id,j(c));
    const pi=db.prepare("INSERT INTO pages(id,data) VALUES(?,?)");for(const x of ps)pi.run(x.id,j(x));
    if(issueNotes){db.exec("DELETE FROM issue_notes");const ii=db.prepare("INSERT INTO issue_notes(title,category,symptoms,resolution,updated_at) VALUES(?,?,?,?,?)");for(const x of issueNotes)ii.run(x.title,x.category,x.symptoms,x.resolution,now())}
    db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e}
}
const scoreFor=(uid,c)=>Math.max(0,c.points-db.prepare("SELECT COALESCE(SUM(cost),0) cost FROM hint_unlocks WHERE user_id=? AND challenge_id=?").get(uid,c.id).cost);
function checkAnswer(c,answer) {
  if(c.answerType==="manual")return null;
  if(c.answerType==="regex"){try{return new RegExp(c.regex||"a^","i").test(String(answer).trim())}catch{return false}}
  const norm=x=>String(x).trim().toLocaleLowerCase();
  const expected=(c.answers||[]).map(String);
  if(c.answerType==="choice"&&c.multiple){const given=(Array.isArray(answer)?answer:String(answer).split("|")).map(norm).sort(),target=expected.map(norm).sort();return given.length===target.length&&given.every((x,i)=>x===target[i])}
  const given=Array.isArray(answer)?answer[0]:answer;return expected.some(x=>norm(x)===norm(given));
}
function cooldown(uid,c) {
  const seconds=Math.max(Number(config().cooldownSeconds)||0,Number(c.cooldown)||0);
  const row=seconds?db.prepare("SELECT created_at FROM submissions WHERE user_id=? AND challenge_id=? AND status='incorrect' ORDER BY id DESC LIMIT 1").get(uid,c.id):null;
  return row?Math.max(0,Math.ceil(seconds-(Date.now()-new Date(row.created_at).getTime())/1000)):0;
}
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon"};
function staticFile(pathname,res) {
  let pth;try{pth=decodeURIComponent(pathname)}catch{send(res,400,"Bad path");return}
  if(pth==="/")pth="/index.html";
  const imagePath=pth.startsWith("/images/");const root=imagePath?path.resolve(DATA_DIR,"images"):PUBLIC_DIR;const rel=imagePath?pth.slice(8):pth.slice(1);const full=path.resolve(root,rel);
  if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){send(res,404,"Not found");return}
  res.writeHead(200,{"Content-Type":mime[path.extname(full).toLowerCase()]||"application/octet-stream","Cache-Control":"no-cache"});fs.createReadStream(full).pipe(res);
}
async function route(req,res) {
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(!pathname.startsWith("/api/")){staticFile(pathname,res);return}
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method==="GET"&&pathname==="/api/health"){send(res,200,{app:"workshop-ctf",instanceId:INSTANCE_ID,ready:true});return}
  const count=db.prepare("SELECT COUNT(*) n FROM users").get().n;
  if(req.method==="GET"&&pathname==="/api/public") {
    const u=userFor(req), solved=u?solvedFor(u.id):new Set(), skipped=u?skippedFor(u.id):new Set(), completed=new Set([...solved,...skipped]),cfg=config();
    const list=challenges().filter(c=>c.visible||u?.role==="admin").map(c=>({...publicChallenge(c),locked:u?.role==="admin"?false:locked(c,completed),solved:u?solved.has(c.id):false,skipped:u?skipped.has(c.id)&&!solved.has(c.id):false}));
    const progress=u?db.prepare("SELECT COALESCE(SUM(points_awarded),0) score,COUNT(*) solves FROM submissions WHERE user_id=? AND status='solved'").get(u.id):{score:0,solves:0};
    const reveal=id=>u&&(u.role==="admin"||solved.has(id))?challenge(id)?.answers?.[0]||"":"";
    const revealedTopologyAddresses={plcChanged:reveal("09.11-attacker---hack-the-plc"),engineering:reveal("17.21-defender---fortipam-analysis")};
    send(res,200,{needsSetup:count===0,settings:cfg,user:u?{id:u.id,username:u.username,displayName:u.display_name,role:u.role,team:u.team}:null,progress,challenges:list,revealedTopologyAddresses,pages:pages().filter(x=>x.visible).map(({id,slug,title,kind,order,logo,authRequired})=>({id,slug,title,kind,order,visible:true,logo:logo||"",authRequired:Boolean(authRequired)})),scoreboard:cfg.showScoreboard?scoreboard(25):[]});return;
  }
  if(req.method==="POST"&&pathname==="/api/setup") {
    if(count){send(res,409,{error:"Setup has already been completed."});return}
    const b=await body(req),username=text(b.username,40).trim(),password=String(b.password||"");
    if(username.length<3||password.length<12){send(res,400,{error:"Use a username with at least 3 characters and a password with at least 12 characters."});return}
    const result=transaction(()=>{
      if(db.prepare("SELECT COUNT(*) n FROM users").get().n)return{status:409,data:{error:"Setup has already been completed."}};
      const r=db.prepare("INSERT INTO users(username,display_name,password_hash,role,team,created_at) VALUES(?,?,?,?,?,?)").run(username,text(b.displayName||username,80),hashPassword(password),"admin","",now());
      const token=randomBytes(32).toString("base64url");db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(digest(token),r.lastInsertRowid,Date.now()+30*86400000);
      return{status:201,data:{ok:true},headers:{"Set-Cookie":cookieHeader(token,2592000)}};
    });
    send(res,result.status,result.data,result.headers);return;
  }
  if(req.method==="POST"&&pathname==="/api/login") {
    const b=await body(req),u=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(text(b.username,80).trim());
    if(!u||!matchesPassword(b.password||"",u.password_hash)){send(res,401,{error:"Username or password is incorrect."});return}
    const token=randomBytes(32).toString("base64url");db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(digest(token),u.id,Date.now()+30*86400000);
    send(res,200,{ok:true},{"Set-Cookie":cookieHeader(token,2592000)});return;
  }
  if(req.method==="POST"&&pathname==="/api/logout") {
    const token=getCookie(req);if(token)db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
    send(res,200,{ok:true},{"Set-Cookie":cookieHeader("",0)});return;
  }
  if(req.method==="POST"&&pathname==="/api/register") {
    if(!config().registrationOpen){send(res,403,{error:"Registration is closed. Ask the workshop admin for an account."});return}
    const b=await body(req),username=text(b.username,40).trim(),password=String(b.password||"");
    if(username.length<3||password.length<12){send(res,400,{error:"Use a username with at least 3 characters and a password with at least 12 characters."});return}
    try{db.prepare("INSERT INTO users(username,display_name,password_hash,role,team,created_at) VALUES(?,?,?,?,?,?)").run(username,text(b.displayName||username,80),hashPassword(password),"participant",text(b.team,80),now())}catch{send(res,409,{error:"That username is already in use."});return}
    send(res,201,{ok:true});return;
  }
  if(req.method==="GET"&&pathname==="/api/scoreboard") {
    if(!config().showScoreboard){send(res,403,{error:"The scoreboard is disabled."});return}send(res,200,scoreboard(100));return;
  }
  if(pathname==="/api/lab"&&req.method==="GET") {
    const u=mustUser(req,res);if(!u)return;
    const report=db.prepare("SELECT status,note,updated_at FROM lab_reports WHERE user_id=?").get(u.id);
    send(res,200,{platformReady:true,report:report||null});return;
  }
  if(pathname==="/api/lab"&&req.method==="POST") {
    const u=mustUser(req,res);if(!u)return;
    const b=await body(req),status=b.status==='needs_help'?'needs_help':'ready',note=text(b.note,500).trim();
    db.prepare("INSERT INTO lab_reports(user_id,status,note,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at").run(u.id,status,note,now());
    send(res,200,{ok:true,status});return;
  }
  if(pathname.startsWith("/api/challenges/")) {
    const tail=pathname.slice(16),unlock=tail.endsWith("/unlock"),solve=tail.endsWith("/solve");
    const cid=decodeURIComponent(tail.replace(/\/(unlock|solve)$/,"")),c=challenge(cid);
    if(!c||(!c.visible&&userFor(req)?.role!=="admin")){send(res,404,{error:"Challenge not found."});return}
    if(req.method==="GET"&&!unlock&&!solve) {
      const u=userFor(req);
      if(!u){send(res,200,{...publicChallenge(c),locked:false,solved:false,unlockedHints:[],availablePoints:c.points,hintAccessChanged:false,hintNotice:""});return}
      const solved=solvedFor(u.id),skipped=skippedFor(u.id),completed=new Set([...solved,...skipped]),unlocks=db.prepare("SELECT hint_index,cost FROM hint_unlocks WHERE user_id=? AND challenge_id=? ORDER BY hint_index").all(u.id,cid),data=publicChallenge(c);
      data.locked=u.role!=="admin"&&locked(c,completed);data.solved=solved.has(cid);data.skipped=skipped.has(cid)&&!data.solved;data.pending=Boolean(db.prepare("SELECT 1 FROM submissions WHERE user_id=? AND challenge_id=? AND status=? LIMIT 1").get(u.id,cid,"pending"));
      data.unlockedHints=unlocks.filter(x=>c.hints?.[x.hint_index]).map(x=>({...c.hints[x.hint_index],cost:x.cost,index:x.hint_index}));
      data.availablePoints=scoreFor(u.id,c);data.hintAccessChanged=unlocks.some((x,i)=>x.hint_index!==i||!c.hints?.[x.hint_index]);
      data.hintNotice=data.hintAccessChanged?"The hints were edited after you unlocked them. Ask your instructor to check your hint access before unlocking more. Your recorded hint costs are preserved.":"";
      send(res,200,data);return;
    }
    const u=mustUser(req,res);if(!u)return;
    if(req.method==="POST"&&unlock) {
      if(u.role!=="participant"&&u.role!=="admin"){send(res,403,{error:"Sign in with a workshop account to unlock a hint."});return}
      const b=await body(req),index=Number(b.index),result=transaction(()=>{
        const current=challenge(cid),solved=completedFor(u.id);if(!current)return{status:404,data:{error:"Challenge not found."}};
        if(skippedFor(u.id).has(cid))return{status:409,data:{error:"This challenge was skipped by your facilitator."}};
        if(u.role!=="admin"&&locked(current,solved))return{status:403,data:{error:"Complete the required challenges first."}};
        if(solved.has(cid))return{status:409,data:{error:"This challenge is already solved."}};
        const unlocks=db.prepare("SELECT hint_index FROM hint_unlocks WHERE user_id=? AND challenge_id=? ORDER BY hint_index").all(u.id,cid);
        if(unlocks.some((x,i)=>x.hint_index!==i||!current.hints?.[x.hint_index]))return{status:409,data:{error:"The hints changed after you unlocked them. Ask your instructor to check your hint access."}};
        if(!Number.isInteger(index)||index!==unlocks.length||!current.hints?.[index])return{status:409,data:{error:"Unlock hints in order."}};
        const hint=current.hints[index];
        db.prepare("INSERT INTO hint_unlocks(user_id,challenge_id,hint_index,cost,created_at) VALUES(?,?,?,?,?)").run(u.id,cid,index,Number(hint.cost)||0,now());
        return{status:200,data:{hint:{...hint,index}}};
      });
      send(res,result.status,result.data);return;
    }
    if(u.role!=="participant"){send(res,403,{error:"Use a participant account to submit an answer."});return}
    if(req.method==="POST"&&solve) {
      const b=await body(req),result=transaction(()=>{
        const current=challenge(cid),solved=completedFor(u.id);
        if(!current)return{status:404,data:{error:"Challenge not found."}};
        if(skippedFor(u.id).has(cid))return{status:409,data:{error:"This challenge was skipped by your facilitator."}};
        if(locked(current,solved))return{status:403,data:{error:"Complete the required challenges first."}};
        if(solved.has(cid))return{status:409,data:{error:"This challenge is already solved."}};
        if(db.prepare("SELECT 1 FROM submissions WHERE user_id=? AND challenge_id=? AND status='pending' LIMIT 1").get(u.id,cid))return{status:202,data:{status:"pending",message:"Your answer is waiting for an instructor to review it."}};
        const wait=cooldown(u.id,current);if(wait)return{status:429,data:{error:"Please wait "+wait+" seconds before trying again.",cooldown:wait}};
        const answer=b.answer;if(Array.isArray(answer)?answer.length===0:!String(answer||"").trim())return{status:400,data:{error:"Enter an answer first."}};
        const answerText=Array.isArray(answer)?answer.join(" | "):String(answer),correct=checkAnswer(current,answer);
        if(correct===null||current.requiresApproval){db.prepare("INSERT INTO submissions(user_id,challenge_id,answer,status,correct,points_awarded,created_at) VALUES(?,?,?,?,?,?,?)").run(u.id,cid,answerText,"pending",0,0,now());return{status:202,data:{status:"pending",message:"Your answer is waiting for an instructor to review it."}};}
        if(!correct){db.prepare("INSERT INTO submissions(user_id,challenge_id,answer,status,correct,points_awarded,created_at) VALUES(?,?,?,?,?,?,?)").run(u.id,cid,answerText,"incorrect",0,0,now());return{status:200,data:{status:"incorrect",message:"Not quite. Review the objective and try again."}};}
        const points=scoreFor(u.id,current);db.prepare("INSERT INTO submissions(user_id,challenge_id,answer,status,correct,points_awarded,created_at) VALUES(?,?,?,?,?,?,?)").run(u.id,cid,answerText,"solved",1,points,now());return{status:200,data:{status:"solved",points,message:"Challenge complete. "+points+" points awarded."}};
      });
      send(res,result.status,result.data);return;
    }
    send(res,404,{error:"Challenge action not found."});return;
  }
  if(pathname.startsWith("/api/pages/")&&req.method==="GET") {
    const x=page(decodeURIComponent(pathname.slice(11)));if(!x||!x.visible){send(res,404,{error:"Page not found."});return}if(x.authRequired&&!userFor(req)){send(res,401,{error:"Sign in to view this workshop page."});return}send(res,200,x);return;
  }
  if(pathname.startsWith("/api/admin/")) {
    const admin=mustUser(req,res,"admin");if(!admin)return;
    if(req.method==="GET"&&pathname==="/api/admin/workshop"){send(res,200,adminData());return}
    if(req.method==="POST"&&pathname==="/api/admin/issues"){
      const b=await body(req),id=Number(b.id)||0,title=text(b.title,160).trim(),category=text(b.category,80).trim(),symptoms=text(b.symptoms,5000).trim(),resolution=text(b.resolution,10000).trim();
      if(!title||!resolution){send(res,400,{error:"Add a title and a fix."});return}
      if(id){const old=db.prepare("SELECT 1 FROM issue_notes WHERE id=?").get(id);if(!old){send(res,404,{error:"Issue not found."});return}
        db.prepare("UPDATE issue_notes SET title=?,category=?,symptoms=?,resolution=?,updated_at=?,updated_by=? WHERE id=?").run(title,category,symptoms,resolution,now(),admin.id,id);
      }else{const result=db.prepare("INSERT INTO issue_notes(title,category,symptoms,resolution,updated_at,updated_by) VALUES(?,?,?,?,?,?)").run(title,category,symptoms,resolution,now(),admin.id);send(res,201,{ok:true,id:Number(result.lastInsertRowid)});return}
      send(res,200,{ok:true,id});return;
    }
    const issueMatch=pathname.match(/^\/api\/admin\/issues\/(\d+)$/);
    if(issueMatch&&req.method==="DELETE"){
      const result=db.prepare("DELETE FROM issue_notes WHERE id=?").run(Number(issueMatch[1]));
      if(!result.changes){send(res,404,{error:"Issue not found."});return}
      send(res,200,{ok:true});return;
    }
    if(req.method==="POST"&&pathname==="/api/admin/skips"){
      const b=await body(req),cid=text(b.challengeId,100),scope=b.scope,skip=b.skip===true;
      if(!challenge(cid)){send(res,404,{error:"Challenge not found."});return}
      if(scope==='all'){
        if(skip)db.prepare("INSERT INTO global_challenge_skips(challenge_id,created_at,created_by) VALUES(?,?,?) ON CONFLICT(challenge_id) DO NOTHING").run(cid,now(),admin.id);
        else db.prepare("DELETE FROM global_challenge_skips WHERE challenge_id=?").run(cid);
      }else if(scope==='participant'){
        const uid=Number(b.userId);
        if(!Number.isInteger(uid)||!db.prepare("SELECT 1 FROM users WHERE id=? AND role='participant'").get(uid)){send(res,404,{error:"Participant not found."});return}
        if(skip)db.prepare("INSERT INTO participant_challenge_skips(user_id,challenge_id,created_at,created_by) VALUES(?,?,?,?) ON CONFLICT(user_id,challenge_id) DO NOTHING").run(uid,cid,now(),admin.id);
        else db.prepare("DELETE FROM participant_challenge_skips WHERE user_id=? AND challenge_id=?").run(uid,cid);
      }else{send(res,400,{error:"Choose everyone or one participant."});return}
      send(res,200,{ok:true,scope,challengeId:cid,skipped:skip});return;
    }
    if(req.method==="POST"&&pathname==="/api/admin/lab-reports"){
      const b=await body(req),uid=Number(b.userId);
      if(!Number.isInteger(uid)||!db.prepare("SELECT 1 FROM users WHERE id=? AND role='participant'").get(uid)){send(res,404,{error:"Participant not found."});return}
      db.prepare("UPDATE lab_reports SET status='resolved',updated_at=? WHERE user_id=?").run(now(),uid);
      send(res,200,{ok:true});return;
    }
    if(req.method==="PUT"&&pathname==="/api/admin/workshop"){try{saveContent(await body(req));send(res,200,{ok:true})}catch(e){send(res,400,{error:e.message||"Could not save workshop."})}return}
    if(req.method==="GET"&&pathname==="/api/admin/export"){send(res,200,{version:1,exportedAt:now(),settings:config(),challenges:challenges(),pages:pages(),issueNotes:db.prepare("SELECT title,category,symptoms,resolution FROM issue_notes ORDER BY id").all()},{"Content-Disposition":'attachment; filename="workshop-export.json"'});return}
    if(req.method==="POST"&&pathname==="/api/admin/users") {
      const b=await body(req),username=text(b.username,40).trim(),password=String(b.password||""),role=b.role==="admin"?"admin":"participant";
      if(username.length<3||password.length<12){send(res,400,{error:"Username must be 3+ characters and password 12+ characters."});return}
      try{const r=db.prepare("INSERT INTO users(username,display_name,password_hash,role,team,created_at) VALUES(?,?,?,?,?,?)").run(username,text(b.displayName||username,80),hashPassword(password),role,text(b.team,80),now());send(res,201,{user:userObj(db.prepare("SELECT id,username,display_name,role,team,created_at FROM users WHERE id=?").get(r.lastInsertRowid))})}catch{send(res,409,{error:"That username is already in use."})}return;
    }
    const um=pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if(um&&req.method==="PUT") {
      const uid=Number(um[1]),b=await body(req),old=db.prepare("SELECT * FROM users WHERE id=?").get(uid);
      if(!old){send(res,404,{error:"User not found."});return}
      const role=b.role==="admin"?"admin":"participant",pw=String(b.password||"");
      if(old.role==="admin"&&role!=="admin"&&db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n<=1){send(res,400,{error:"Keep at least one administrator account."});return}
      if(pw&&pw.length<12){send(res,400,{error:"Use at least 12 characters for a password."});return}
      db.prepare("UPDATE users SET display_name=?,role=?,team=? WHERE id=?").run(text(b.displayName||old.display_name,80),role,text(b.team||"",80),uid);
      if(pw)db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(pw),uid);send(res,200,{ok:true});return;
    }
    if(um&&req.method==="DELETE") {
      const uid=Number(um[1]),old=db.prepare("SELECT * FROM users WHERE id=?").get(uid);
      if(!old){send(res,404,{error:"User not found."});return}
      if(uid===admin.id){send(res,400,{error:"You cannot delete your own signed-in account."});return}
      if(old.role==="admin"&&db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n<=1){send(res,400,{error:"Keep at least one administrator account."});return}
      db.prepare("DELETE FROM users WHERE id=?").run(uid);send(res,200,{ok:true});return;
    }
    if(req.method==="POST"&&pathname==="/api/admin/review") {
      const b=await body(req);if(!["approve","reject"].includes(b.action)){send(res,400,{error:"Choose approve or reject."});return}
      const result=transaction(()=>{
        const s=db.prepare("SELECT * FROM submissions WHERE id=?").get(Number(b.id));
        if(!s)return{status:404,data:{error:"Submission not found."}};
        if((b.action==="approve"&&s.status==="solved")||(b.action==="reject"&&s.status==="rejected"))return{status:200,data:{ok:true}};
        if(s.status!=="pending")return{status:409,data:{error:"This submission has already been reviewed."}};
        if(b.action==="reject"){db.prepare("UPDATE submissions SET status='rejected',reviewed_at=?,reviewed_by=? WHERE id=?").run(now(),admin.id,s.id);return{status:200,data:{ok:true}};}
        if(db.prepare("SELECT 1 FROM submissions WHERE user_id=? AND challenge_id=? AND status='solved' LIMIT 1").get(s.user_id,s.challenge_id)){
          db.prepare("UPDATE submissions SET status='rejected',correct=0,points_awarded=0,reviewed_at=?,reviewed_by=? WHERE id=?").run(now(),admin.id,s.id);
          return{status:200,data:{ok:true,alreadySolved:true,message:"This challenge was already solved. The duplicate response was closed without awarding additional points."}};
        }
        const c=challenge(s.challenge_id);if(!c)return{status:409,data:{error:"This challenge was removed. Reject the response or restore its challenge before approving it."}};
        const points=scoreFor(s.user_id,c);db.prepare("UPDATE submissions SET status='solved',correct=1,points_awarded=?,reviewed_at=?,reviewed_by=? WHERE id=?").run(points,now(),admin.id,s.id);
        return{status:200,data:{ok:true}};
      });
      send(res,result.status,result.data);return;
    }
    if(req.method==="GET"&&pathname==="/api/admin/media"){send(res,200,mediaList());return}
    if(req.method==="POST"&&pathname==="/api/admin/media"){
      const b=await body(req),name=path.basename(text(b.name,180)),ext=path.extname(name).toLowerCase(),allowed=new Set([".png",".jpg",".jpeg",".webp",".gif"]);
      if(name!==String(b.name||"")||!/^[A-Za-z0-9][A-Za-z0-9._ ()-]{0,159}$/.test(name)||!allowed.has(ext)){send(res,400,{error:"Use a PNG, JPG, WEBP, or GIF image with a simple filename."});return}
      if(typeof b.data!=="string"||b.data.length>7*1024*1024){send(res,413,{error:"Images must be 5 MB or smaller."});return}
      const bytes=Buffer.from(b.data,"base64");if(bytes.length>5*1024*1024){send(res,413,{error:"Images must be 5 MB or smaller."});return}
      const dir=path.join(DATA_DIR,"images");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),bytes);
      send(res,201,{ok:true,media:mediaList().find(x=>x.name===name)});return;
    }
    const mediaMatch=pathname.match(/^\/api\/admin\/media\/([^/]+)$/);
    if(mediaMatch&&req.method==="DELETE"){
      const name=decodeURIComponent(mediaMatch[1]),file=path.resolve(DATA_DIR,"images",name),root=path.resolve(DATA_DIR,"images");
      if(path.basename(name)!==name||!file.startsWith(root+path.sep)){send(res,400,{error:"Invalid image name."});return}
      if(!fs.existsSync(file)){send(res,404,{error:"Image not found."});return}
      fs.unlinkSync(file);send(res,200,{ok:true});return;
    }
    if(req.method==="GET"&&pathname==="/api/admin/summary"){send(res,200,{users:db.prepare("SELECT COUNT(*) n FROM users WHERE role='participant'").get().n,challenges:db.prepare("SELECT COUNT(*) n FROM challenges").get().n,solves:db.prepare("SELECT COUNT(*) n FROM submissions WHERE status='solved'").get().n,pending:db.prepare("SELECT COUNT(*) n FROM submissions WHERE status='pending'").get().n});return}
    send(res,404,{error:"Admin endpoint not found."});return;
  }
  send(res,404,{error:"API endpoint not found."});
}
const server=http.createServer((req,res)=>{res.setHeader("X-Frame-Options","SAMEORIGIN");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");Promise.resolve(route(req,res)).catch(e=>{if(!res.headersSent)send(res,500,{error:e.message||"Unexpected server error."});else res.end();console.error(e)})});
server.listen(PORT,HOST,()=>{console.log("Hack the Brewery Node CTF is ready at http://"+HOST+":"+PORT);console.log("Workshop database: "+DB_PATH)});
process.on("SIGINT",()=>server.close(()=>{db.close();process.exit(0)}));
process.on("SIGTERM",()=>server.close(()=>{db.close();process.exit(0)}));

