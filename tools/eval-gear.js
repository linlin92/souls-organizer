const {matcher,G}=require("./refs-node.js"), {loadImage}=require("../tools/load.js");
const {ROWS,SHOTS,CLASS_OF}=require("../test/truth.js");
const m=matcher(); const F=["set","slot","cls","level","diamonds","refined","equipped"]; const ok={},n={}; F.forEach(f=>ok[f]=n[f]=0); const bad=[];
const an={};
for(const s of Object.keys(SHOTS)){ an[s]=G.analyze(m,loadImage(`${__dirname}/../test/fixtures/screens/${s}.jpg`)); const A=an[s];
  const exp=SHOTS[s]; if(A.rows.length!==exp.length) console.log(s,"ROWCOUNT",A.rows.length,exp.length);
  A.rows.forEach((r,ri)=>{const e=exp[ri]; if(!e)return; const kindOK=(e[0]==="f")===(r.kind==="full"); if(!kindOK) console.log(s,ri,"kind",r.kind,e[0]);
    r.cols.forEach((c,ci)=>{const t=c.tile; const tr=ROWS[e[1]][ci]; if(e[0]==="p"){ if(!t.ignored) console.log("READ PARTIAL!",s,ri,ci); return;}
      if(!tr){ if(!t.ignored) console.log("phantom",s,ri,ci); return;}
      if(t.ignored){console.log("ignored but present",s,ri,ci,t.notMythic?"notMythic":t.blurred?"blurred":"cut");return;}
      const got={set:t.set,slot:t.slot,cls:t.cls,level:t.level,diamonds:t.diamonds,refined:t.refined,equipped:t.equipped};
      const want={set:tr.set,slot:tr.slot,cls:CLASS_OF[tr.set],level:tr.level,diamonds:tr.diamonds,refined:tr.diamonds>0&&tr.platinum===tr.diamonds,equipped:tr.equipped};
      F.forEach(f=>{n[f]++; if(got[f]===want[f]) ok[f]++; else bad.push(`${s} r${ri}c${ci} ${f}: got ${got[f]} want ${want[f]}`)});
    });});}
console.log(F.map(f=>f+" "+ok[f]+"/"+n[f]).join("  ")); console.log(bad.join("\n"));
const mg=G.merge(Object.values(an)); const P=G.toPieces(mg.tiles);
console.log("merge: pieces",P.length,"partialOnly",mg.partialOnly,"dups",mg.duplicatesDropped, "expected", ROWS.flat().length);
console.log("flagged:",P.filter(p=>p.flags.length).map(p=>`${p.src.shot}/${p.src.row}/${p.src.col} ${p.cls} ${p.slot} L${p.level}: ${p.flags.join(";")}`));
const R=G.recap(P); console.log(JSON.stringify({total:R.total,byClass:Object.fromEntries(Object.entries(R.byClass).map(([k,v])=>[k,[v.total,v.refined,v.plain,v.equipped]])),refined:R.refined,plain:R.plain,transc:R.transc,eq:R.equipped,spare:R.spare,lv:R.levels.map(l=>l.n)}));
