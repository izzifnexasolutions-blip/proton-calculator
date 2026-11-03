// This is a public anon/publishable key only. Never place a service_role key in browser code.
const SUPABASE_URL='https://qagsczjxzshjxmmxvkbq.supabase.co';
const SUPABASE_PUBLIC_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZ3Njemp4enNoanhtbXh2a2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDY2MjIsImV4cCI6MjA5NzI4MjYyMn0.Y2YJbzCuaUsoJ-HmW2e4MPk8rVILgZDf7_6ulCkL3DM';
const gate=document.getElementById('auth-gate'),studio=document.getElementById('studio');
const msg=document.getElementById('auth-message');
function report(text,error=false){msg.textContent=text;msg.classList.toggle('error',error);}
const client=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLIC_KEY,{auth:{autoRefreshToken:true,persistSession:true}});
window.DriveStudioAuth={client};
async function checkAdmin(){if(!client)throw Error('Sambungan Supabase tidak tersedia.');
 const {data:{user},error}=await client.auth.getUser();if(error||!user)throw Error('Sila log masuk menggunakan akaun pentadbir.');
 const r=await client.from('sales_staff_profiles').select('role,is_active').eq('user_id',user.id).eq('role','admin').eq('is_active',true).maybeSingle();
 if(r.error)throw Error('Semakan role Supabase gagal: '+r.error.message);
 if(!r.data)throw Error('Akaun tiada peranan admin aktif. Hubungi pemilik Supabase.');return user;}
let booted=false;
async function unlock(){try{report('Mengesahkan identiti admin…');const user=await checkAdmin();if(booted)return;booted=true;gate.hidden=true;studio.hidden=false;await import('/studio3d/studio.js');document.getElementById('cloud-state').textContent='Admin: '+(user.email||'disahkan');}
catch(err){studio.hidden=true;gate.hidden=false;booted=false;report(err.message,true);}}
document.getElementById('admin-login').addEventListener('submit',async e=>{e.preventDefault();try{report('Sedang log masuk…');const email=document.getElementById('admin-email').value.trim(),password=document.getElementById('admin-password').value;const r=await client.auth.signInWithPassword({email,password});if(r.error)throw r.error;document.getElementById('admin-password').value='';await unlock();}catch(err){report(err.message,true);}});
document.getElementById('logout').addEventListener('click',async()=>{await client?.auth.signOut();location.replace('/');});
await unlock();