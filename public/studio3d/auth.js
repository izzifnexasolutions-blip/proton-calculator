// Studio editor is public and uses only local IndexedDB for drafts.
// Supabase backend policies remain unchanged; no anonymous cloud writes.
const SUPABASE_URL='https://qagsczjxzshjxmmxvkbq.supabase.co';
const SUPABASE_PUBLIC_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZ3Njemp4enNoanhtbXh2a2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDY2MjIsImV4cCI6MjA5NzI4MjYyMn0.Y2YJbzCuaUsoJ-HmW2e4MPk8rVILgZDf7_6ulCkL3DM';
const client=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLIC_KEY,{auth:{autoRefreshToken:true,persistSession:true}})||null;
window.DriveStudioAuth={client,mode:'local-only'};
const studio=document.getElementById('studio');
if(studio)studio.hidden=false;
const state=document.getElementById('cloud-state');
if(state)state.textContent='Editor terbuka · simpan lokal';
try{
  await import('/studio3d/studio.js');
}catch(err){
  const note=document.getElementById('save-status');
  if(note){note.textContent='Editor gagal dimulakan: '+(err?.message||String(err));note.classList.add('error');}
  console.error('Studio init failed',err);
}
