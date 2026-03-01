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
          body:JSON.stringify({projectId:PID,formName:formName,contents:contents,_hp:hp.value,_ts:_ts})
        })
        .then(function(r){if(!r.ok)throw new Error('fail');return r.json();})
        .then(function(){
          if(btn){btn.textContent='Sent!';btn.style.backgroundColor='#16a34a';}
          form.reset();
          setTimeout(function(){if(btn){btn.disabled=false;btn.textContent=origText;btn.style.backgroundColor='';}},3000);
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
