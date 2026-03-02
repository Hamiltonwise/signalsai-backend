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
      badge.style.cssText='display:flex;align-items:center;justify-content:center;gap:4px;margin-top:8px;text-decoration:none;';
      var dColor='rgba(0,0,0,0.25)';var hColor='rgba(214,104,83,0.65)';
      badge.onmouseenter=function(){lbl.style.color=hColor;lbl.style.textShadow='0 1px 2px rgba(214,104,83,0.2)';path.style.fill=hColor;};
      badge.onmouseleave=function(){lbl.style.color=dColor;lbl.style.textShadow='0 1px 1px rgba(0,0,0,0.1)';path.style.fill=dColor;};
      var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('width','12');svg.setAttribute('height','12');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
      var path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M12 2l7 4v5c0 5.25-3.5 10-7 12-3.5-2-7-6.75-7-12V6l7-4z');path.style.fill=dColor;path.style.transition='fill 0.2s ease';
      svg.appendChild(path);
      var lbl=document.createElement('span');
      lbl.textContent='Powered by Alloro Protect\\u2122';
      lbl.style.cssText='font-size:11px;color:'+dColor+';font-family:system-ui,sans-serif;text-shadow:0 1px 1px rgba(0,0,0,0.1);transition:color 0.2s ease,text-shadow 0.2s ease;';
      badge.appendChild(svg);badge.appendChild(lbl);
      form.parentNode.insertBefore(badge,form.nextSibling);
      form.addEventListener('submit',function(e){
        e.preventDefault();
        var formName=form.getAttribute('data-form-name')||form.getAttribute('name')||'Contact Form';
        var formType=form.getAttribute('data-form-type')||'contact';
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
          body:JSON.stringify({projectId:PID,formName:formName,formType:formType,contents:contents,_hp:hp.value,_ts:_ts,_jsc:_jsc})
        })
        .then(function(r){if(!r.ok)throw new Error('fail');return r.json();})
        .then(function(){
          window.location.href=formType==='newsletter'?'/newsletter-success':'/success';
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
