import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const data=path.join(root,"data");
const db=new DatabaseSync(path.join(data,"workshop.sqlite"));
db.exec("PRAGMA busy_timeout=5000");
const backupDir=path.join(data,"backups");
fs.mkdirSync(backupDir,{recursive:true});
const backup=path.join(backupDir,"reference-pages-"+new Date().toISOString().replace(/[:.]/g,"-")+".sqlite");
db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");

const logos={"adaptix-c2":"/logos/adaptix.png",fortinet:"/logos/fortinet.png","nozomi-networks":"/logos/nozomi.png",sentinelone:"/logos/sentinelone.png",siemens:"/logos/siemens.svg"};
const source={products:"Products.md",credentials:"Credentials.md","ip-addresses":"IP addresses.md",fortinet:"Fortinet.md","nozomi-networks":"Nozomi Networks.md"};
const get=db.prepare("SELECT data FROM pages WHERE id=?");
const put=db.prepare("UPDATE pages SET data=? WHERE id=?");
db.exec("BEGIN IMMEDIATE");
try {
  for(const [id,logo] of Object.entries(logos)){
    const row=get.get(id);
    if(!row)throw Error("Missing vendor page: "+id);
    const page=JSON.parse(row.data);
    page.logo=logo;
    put.run(JSON.stringify(page),id);
  }
  for(const [id,file] of Object.entries(source)){
    const row=get.get(id);
    if(!row)throw Error("Missing reference page: "+id);
    const page=JSON.parse(row.data);
    const raw=fs.readFileSync(path.join(data,file),"utf8");
    page.body=raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,"").trim();
    if(id==="products")Object.assign(page,{title:"Product index",kind:"catalog",order:-100});
    if(id==="credentials")page.authRequired=true;
    put.run(JSON.stringify(page),id);
  }
  db.exec("COMMIT");
  console.log("Updated product index, vendor notes, IP addresses, and signed-in credentials. Backup: "+backup);
} catch(error){db.exec("ROLLBACK");throw error}
finally{db.close()}
