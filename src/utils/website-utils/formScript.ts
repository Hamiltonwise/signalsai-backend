/**
 * Form Script Builder
 *
 * Generates an inline <script> tag that auto-intercepts all forms on a
 * rendered site page and POSTs their contents to /api/websites/form-submission.
 *
 * Forms with the `data-alloro-ignore` attribute are skipped.
 *
 * Security layers injected:
 * - Honeypot hidden field (_hp) — bots fill it, humans don't
 * - Timestamp (_ts) — recorded at page load, validated server-side
 */

export function buildFormScript(projectId: string, apiBase: string): string {
  return `<script data-alloro-form-handler>
(function(){
  'use strict';
  var _ts=Date.now();
  var _jsc=_ts;for(var i=0;i<1000;i++){_jsc=((_jsc*1103515245+12345)&0x7fffffff);}
  document.addEventListener('DOMContentLoaded',function(){
    var API='${apiBase}';
    var PID='${projectId}';
    var forms=document.querySelectorAll('form:not([data-alloro-ignore])');
    forms.forEach(function(form){
      var hp=document.createElement('input');
      hp.type='text';hp.name='website_url';hp.tabIndex=-1;hp.autocomplete='off';
      hp.setAttribute('aria-hidden','true');
      hp.style.cssText='position:absolute;left:-9999px;opacity:0;height:0;width:0;overflow:hidden;';
      form.appendChild(hp);
      var badge=document.createElement('a');
      badge.href='https://getalloro.com/alloro-protect';
      badge.target='_blank';badge.rel='noopener noreferrer';
      badge.style.cssText='display:flex;align-items:center;justify-content:center;gap:4px;margin-top:8px;text-decoration:none;opacity:0.45;transition:opacity 0.2s;';
      badge.onmouseenter=function(){badge.style.opacity='0.7';};
      badge.onmouseleave=function(){badge.style.opacity='0.45';};
      var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('width','12');svg.setAttribute('height','12');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('fill','none');
      var circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx','16');circle.setAttribute('cy','16');circle.setAttribute('r','15');circle.setAttribute('stroke','#999');circle.setAttribute('stroke-width','2');
      var path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M16 7l7 4v6c0 5.25-3 10.5-7 12-4-1.5-7-6.75-7-12v-6l7-4z');path.setAttribute('fill','#999');
      svg.appendChild(circle);svg.appendChild(path);
      var label=document.createElement('span');
      label.textContent='Protected by Alloro';
      label.style.cssText='font-size:11px;color:#999;font-family:system-ui,sans-serif;';
      badge.appendChild(svg);badge.appendChild(label);
      form.parentNode.insertBefore(badge,form.nextSibling);
      form.addEventListener('submit',function(e){
        e.preventDefault();
        var formName=form.getAttribute('data-form-name')||form.getAttribute('name')||'Contact Form';
        var contents={};
        var inputs=form.querySelectorAll('input,select,textarea');
        inputs.forEach(function(el){
          if(el.tabIndex===-1||el.type==='submit'||el.type==='hidden'||el.type==='button')return;
          var label=el.getAttribute('data-label')||el.getAttribute('name')||el.getAttribute('placeholder')||'';
          if(!label)return;
          if(el.type==='checkbox'){
            if(el.checked){
              contents[label]=contents[label]?contents[label]+', '+el.value:el.value;
            }
          }else if(el.type==='radio'){
            if(el.checked){
              contents[label]=el.value;
            }
          }else if(el.tagName==='SELECT'){
            var opt=el.options[el.selectedIndex];
            if(opt&&opt.value){
              contents[label]=opt.textContent.trim();
            }
          }else{
            var v=el.value.trim();
            if(v)contents[label]=v;
          }
        });
        var btn=form.querySelector('button[type="submit"],input[type="submit"]');
        var origText=btn?btn.textContent:'';
        if(btn){btn.disabled=true;btn.textContent='Sending...';}
        fetch(API+'/api/websites/form-submission',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({projectId:PID,formName:formName,contents:contents,_hp:hp.value,_ts:_ts,_jsc:_jsc})
        })
        .then(function(r){if(!r.ok)throw new Error('fail');return r.json();})
        .then(function(){
          window.location.href='/success';
        })
        .catch(function(){
          if(btn){btn.textContent='Error \\u2014 Try Again';btn.style.backgroundColor='#dc2626';}
          setTimeout(function(){if(btn){btn.disabled=false;btn.textContent=origText;btn.style.backgroundColor='';}},3000);
        });
      });
    });
  });
})();
</script>`;
}
