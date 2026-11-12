/* User-provided Excel audit, not charger availability or location verification.
 * Pure functions: deterministic and testable without browser/network.
 */
export const REVIEW_BUCKETS=Object.freeze({
 candidate:"Calon dengan koordinat · belum disahkan",
 duplicate:"Pendua daripada fail asal",
 placeholder:"Nama generik · bukti lokasi diperlukan",
 no_coordinates:"Tiada koordinat · perlu geokod"
});
export function reviewBucket(record){
 if(record?.reviewStatus==="needs_review_placeholder")return "placeholder";
 if(record?.reviewStatus==="needs_geocode"||!Number.isFinite(record?.lat)||!Number.isFinite(record?.lon))return "no_coordinates";
 if(record?.duplicateOf)return "duplicate";
 return "candidate";
}
export function auditSummary(records=[]){
 const bucketCounts=Object.fromEntries(Object.keys(REVIEW_BUCKETS).map(k=>[k,0]));
 const states=new Set();
 for(const r of records){
   bucketCounts[reviewBucket(r)]++;
   if(r.state)states.add(r.state);
 }
 return {...bucketCounts,total:records.length,states:[...states].sort((a,b)=>a.localeCompare(b,"ms"))};
}
export function auditFilter(records=[],{status="all",state="all",query=""}={}){
 const q=String(query||"").toLocaleLowerCase("ms-MY").trim();
 return records.filter(r=>(status==="all"||reviewBucket(r)===status)&&
    (state==="all"||r.state===state)&&
    (!q||[r.name,r.area,r.state,r.operator,r.connectorRaw,r.sourceFile].filter(Boolean)
      .join(" ").toLocaleLowerCase("ms-MY").includes(q)));
}
const columns=["name","area","state","operator","lat","lon","connectorRaw",
  "sourceFile","sourceRow","reviewStatus","duplicateOf","auditBucket"];
function csvCell(v){
 const s=String(v??"");
 // Spreadsheet formula injection protection for externally sourced free text.
 const safe=/^[\s]*[=+@\-]/.test(s)?"'"+s:s;
 return /[",\n\r]/.test(safe)?'"'+safe.replace(/"/g,'""')+'"':safe;
}
export function exportAuditCsv(records=[]){
 return [columns.join(","),...records.map(r=>columns.map(k=>csvCell(
   k==="auditBucket"?reviewBucket(r):r[k])).join(","))].join("\r\n")+"\r\n";
}
