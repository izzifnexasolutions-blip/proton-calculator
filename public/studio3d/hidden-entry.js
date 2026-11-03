/* Hidden entry: long-press the existing settings gear, no changes to calculator layout. */
(function(){'use strict';
 const gear=document.getElementById('settings-tab-btn');if(!gear)return;
 let timeout=null,completed=false;
 function unlock(){completed=true;location.assign('/studio3d/index.html');}
 function clear(){if(timeout!==null)clearTimeout(timeout);timeout=null;}
 gear.addEventListener('pointerdown',function(e){if(e.button!==0&&e.pointerType==='mouse')return;completed=false;clear();timeout=setTimeout(unlock,1800);},{passive:true});
 ['pointerup','pointerleave','pointercancel'].forEach(name=>gear.addEventListener(name,clear,{passive:true}));
 gear.addEventListener('click',function(e){if(completed){e.preventDefault();e.stopImmediatePropagation();}},true);
 window.addEventListener('blur',clear);
})();