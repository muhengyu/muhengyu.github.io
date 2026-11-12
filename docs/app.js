(() => {
  'use strict';
  const allProjects=window.PROJECTS;
  let projects=[...allProjects],activeCategory="全部",categoryBusy=false;
  const $=id=>document.getElementById(id);
  const mod=n=>(n%projects.length+projects.length)%projects.length;
  const scene=$('scene'), cards=$('cards'), list=$('project-list');
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let position=0,target=0,selected=-1,view='work',frame=0,snapTimer,drag=null,suppressClick=false;
  let magazine=null,pendingWheel=0,shaderSpeed=0,lastFrame=0,infoPosition=0,infoTween=null,initialized=false,introMotion=null;
  let currentInput='idle',lastInputTime=0,lastTick=-Infinity;
  let meshCount=projects.length*Math.max(1,Math.ceil(30/projects.length)),period=meshCount*1.01;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const wrap=(v,n)=>(v%n+n)%n;
  const logical=p=>{const cycle=Math.floor(p/period),local=p-cycle*period;return cycle*meshCount+(local<=meshCount-1?local:meshCount-1+(local-meshCount+1)/(period-meshCount+1));};
  const physical=p=>{const cycle=Math.floor(p/meshCount),local=p-cycle*meshCount;return cycle*period+(local<=meshCount-1?local:meshCount-1+(local-meshCount+1)*(period-meshCount+1));};
  const snapping=p=>physical(Math.round(logical(p)));
  let detailIndex=0,reelIndex=0,reelTimer=0;
  const projectDialog=$('project-dialog'),reelDialog=$('reel-dialog'),pageTransition=$('page-transition');
  let transitioning=false;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function transition(label,commit,wait=1000){
    if(transitioning)return;if(reduceMotion.matches){commit();return;}
    transitioning=true;magazine?.setHover(-1);
    const panel=pageTransition.querySelector('.transition-panel'),title=pageTransition.querySelector('.transition-label');
    title.textContent=label.toUpperCase();panel.getAnimations().forEach(a=>a.cancel());title.getAnimations().forEach(a=>a.cancel());
    panel.style.transform='translateY(100%)';title.style.opacity='0';title.style.clipPath='inset(0 0 0 0)';pageTransition.showModal();
    panel.animate([{transform:'translateY(100%)'},{transform:'translateY(0%)'}],{duration:1000,easing:'cubic-bezier(.42,0,.1,1)',fill:'forwards'});
    await delay(wait);commit();
    if(projectDialog.open){pageTransition.close();pageTransition.showModal();}
    title.animate([{opacity:0},{opacity:1}],{duration:800,fill:'forwards'});
    await delay(1300);
    const exit={duration:1100,easing:'cubic-bezier(.9,0,.58,1)',fill:'forwards'};
    panel.animate([{transform:'scaleY(1)'},{transform:'scaleY(0)'}],exit);
    await title.animate([{clipPath:'inset(0% 0 0 0)'},{clipPath:'inset(100% 0 0 0)'}],exit).finished;
    pageTransition.close();transitioning=false;if(projectDialog.open)projectDialog.querySelector('.dialog-close').focus();
  }
  pageTransition.addEventListener('cancel',e=>e.preventDefault());
  const cardNodes=[],summaryNodes=[];
  const text=(node,value)=>{node.textContent=value;};
  function useImageFallback(error){
    const broken=magazine;magazine=null;introMotion=null;
    scene.classList.remove('webgl-ready');scene.dataset.rendererState='fallback';scene.dataset.rendererError=error?.message||'Graphics unavailable';
    try{broken?.destroy();}catch{}
    scene.querySelectorAll('.magazine-canvas').forEach(canvas=>canvas.remove());
    document.body.classList.remove('motion-intro');initialized=true;render();schedule();
    console.warn('Using project image cards because the graphics layer is unavailable.',error?.message||error);
  }
  function populateProjects(){
    cardNodes.length=0;summaryNodes.length=0;cards.replaceChildren();list.replaceChildren();$("play-grid").replaceChildren();
  projects.forEach((p,i)=>{
    const card=document.createElement('button');card.className='project-card';card.dataset.index=i;
    if(p.coverAspect&&p.coverAspect!=='original'){card.style.aspectRatio=p.imageWidth+'/'+p.imageHeight;card.style.maxHeight='55svh';card.style.maxWidth='min(640px, '+(55*p.imageWidth/p.imageHeight)+'svh)';}
    card.setAttribute('aria-label','查看 '+p.title);card.tabIndex=-1;
    const img=document.createElement('img');img.src=p.image;img.alt=p.title+' — '+p.category;img.draggable=false;img.decoding='async';card.append(img);
    card.addEventListener('click',()=>{if(suppressClick)return;if(selected===i)openProject(i);else moveTo(i);});
    card.addEventListener('pointerenter',()=>{if(selected===i&&matchMedia('(pointer:fine)').matches)$('cursor').classList.add('visible');});
    card.addEventListener('pointerleave',()=>$('cursor').classList.remove('visible'));
    cards.append(card);cardNodes.push(card);
    const summary=document.createElement('button');summary.className='project-summary';summary.setAttribute('aria-label','选择 '+p.title);
    for(const [tag,cls,value]of [['span','category',p.category],['strong','title',p.title],['span','dash','—'],['span','description',p.description]]){const node=document.createElement(tag);node.className=cls;node.textContent=value;summary.append(node);}
    summary.addEventListener('click',()=>{if(!suppressClick)moveTo(i);});list.append(summary);summaryNodes.push(summary);
    const item=document.createElement('button');item.className='play-item';item.setAttribute('aria-label','查看 '+p.title);
    const thumb=img.cloneNode();if(p.coverAspect&&p.coverAspect!=='original')thumb.style.aspectRatio=p.imageWidth+'/'+p.imageHeight;thumb.loading='lazy';item.append(thumb);
    const label=document.createElement('span');label.className='small';const title=document.createElement('span');title.textContent=p.title;const nr=document.createElement('span');nr.textContent=String(i+1).padStart(2,'0');label.append(title,nr);item.append(label);
    item.addEventListener('click',()=>openProject(i));$('play-grid').append(item);
  });
  }
  populateProjects();
  function updateCategoryButtons(){document.querySelectorAll('[data-category]').forEach(b=>{b.disabled=b.dataset.category!=='全部'&&!allProjects.some(p=>p.category===b.dataset.category);});}
  updateCategoryButtons();
  async function setCategory(category){
    if(categoryBusy||category===activeCategory||(category!=='全部'&&!allProjects.some(p=>p.category===category)))return;
    categoryBusy=true;document.querySelectorAll('[data-category]').forEach(b=>b.disabled=true);
    clearTimeout(snapTimer);pendingWheel=0;shaderSpeed=0;introMotion=null;initialized=false;
    const old=magazine;magazine=null;try{old?.destroy();}catch{}scene.classList.remove('webgl-ready');
    projects=category==='全部'?[...allProjects]:allProjects.filter(p=>p.category===category);activeCategory=category;
    meshCount=projects.length*Math.max(1,Math.ceil(30/projects.length));period=meshCount*1.01;
    position=target=infoPosition=0;infoTween=null;selected=-1;populateProjects();refreshInfo(0);
    document.querySelector('.total').textContent='/'+String(projects.length).padStart(2,'0');
    document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('selected',b.dataset.category===category);b.setAttribute('aria-pressed',String(b.dataset.category===category));});
    try{const next=new window.MagazineRenderer(scene,projects);magazine=next;next.onFailure=useImageFallback;await next.ready;next.blend=1;next.onResize=()=>schedule();}
    catch(error){useImageFallback(error);}
    initialized=true;categoryBusy=false;updateCategoryButtons();render();schedule();
  }
  document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>setCategory(button.dataset.category)));
  function relative(i,p=infoPosition){let d=i-p;d-=Math.round(d/projects.length)*projects.length;return d;}
  function playTick(){}
  function refreshInfo(index){
    const previous=selected;selected=index;const p=projects[index];
    text($('project-role'),p.role);text($('project-date'),p.date);text($('project-recognition'),p.recognition);text($('current'),String(index+1).padStart(2,'0'));
    $('swatches').replaceChildren(...p.colors.map(c=>{const el=document.createElement('i');el.style.backgroundColor=c;return el;}));
    cardNodes.forEach((el,i)=>{el.classList.toggle('is-current',i===index);el.tabIndex=i===index?0:-1;el.setAttribute('aria-current',String(i===index));});
    summaryNodes.forEach((el,i)=>el.setAttribute('aria-current',String(i===index)));
    if(previous>=0&&previous!==index){
      const goal=infoPosition+relative(index);infoTween={from:infoPosition,to:goal,start:performance.now(),duration:clamp(220+Math.abs(goal-infoPosition)*60,260,460)};
      if(!reduceMotion.matches){for(const el of [$('project-role'),$('project-date'),$('project-recognition'),$('current'),$('swatches')])el.animate([{filter:'blur(0px)'},{filter:'blur(8px)',offset:.16},{filter:'blur(0px)'}],{duration:990,easing:'cubic-bezier(.22,1,.36,1)'});}
      if(initialized&&!introMotion)playTick();
    }
  }
  function render(now=performance.now(),delta=1){
    const mobile=innerWidth<768,w=innerWidth,h=scene.clientHeight;
    const current=mod(Math.round(logical(position)));if(!introMotion&&current!==selected)refreshInfo(current);
    if(infoTween){const t=clamp((now-infoTween.start)/infoTween.duration,0,1);infoPosition=infoTween.from+(infoTween.to-infoTween.from)*(1-Math.pow(1-t,3));if(t>=1)infoTween=null;}
    // Keep the real image cards up to date underneath the graphics layer.
    cardNodes.forEach((card,i)=>{
      const t=relative(i,logical(position)),a=Math.abs(t),visible=a<4.6;
      card.style.visibility=visible?'visible':'hidden';card.style.pointerEvents=a<.48?'auto':'none';
      if(!visible)return;
      const y=Math.sign(t)*(a<=1?a*h*(mobile?.77:.54):h*.54+(a-1)*h*.065);
      const x=-Math.sin(Math.min(a,3)*.85)*Math.sign(t)*w*(mobile?.27:.18);
      const scale=1-a*(mobile?.10:.045);
      card.style.transform=`translate(-50%,-50%) translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotateZ(${(-t*8+1).toFixed(2)}deg) rotateY(${(t*9).toFixed(2)}deg) rotateX(${(-t*3).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      card.style.zIndex=String(100-Math.round(a*15));card.style.opacity=mobile?String(Math.max(0,1-a*.55)):'1';
    });
    summaryNodes.forEach((node,i)=>{const t=relative(i),a=Math.abs(t);node.style.transform=`translateY(calc(-50% + ${t*(mobile?130:174)}px))`;node.style.opacity=String(mobile?(i===selected?1:0):i===selected?1:.24);node.style.visibility=a<(mobile?.75:5)?'visible':'hidden';node.tabIndex=a<3?0:-1;});
    if(magazine?.mesh){
      try{magazine.update(position,shaderSpeed,magazine.blend,delta,now);}catch(error){useImageFallback(error);return;}
      if(!introMotion&&!drag&&!modalOpen()&&now-magazine.pickTime>60&&magazine.pointer.x>=0){
        magazine.pickTime=now;let found;try{found=magazine.pick(magazine.pointer.x,magazine.pointer.y);}catch(error){useImageFallback(error);return;}
        if(found!==magazine.hover&&found>=0&&found%projects.length===selected)playTick(true);
        magazine.setHover(found);scene.style.cursor=found>=0?'pointer':'default';
      }
    }
  }
  function animate(now){
    frame=0;const dt=1;lastFrame=now;
    if(introMotion){
      const elapsed=now-introMotion.start,t=clamp(elapsed/2000,0,1),before=position;
      position=introMotion.from+(introMotion.to-introMotion.from)*(1-Math.pow(1-t,4));target=position;shaderSpeed-=position-before;
      magazine.blend=1-Math.pow(1-clamp((elapsed-1060)/1100,0,1),3);
      if(t>=1&&elapsed>=2160){position=target=introMotion.to;introMotion=null;magazine.blend=1;document.body.classList.remove('motion-intro');initialized=true;refreshInfo(mod(Math.round(logical(position))));}
    }else{
      if(Math.abs(pendingWheel)>.001){let amount=pendingWheel*(1-Math.pow(.925,dt));pendingWheel-=amount;if(Math.abs(pendingWheel)<.001){amount+=pendingWheel;pendingWheel=0;snap(150);}target+=amount;shaderSpeed-=amount;}
      position=reduceMotion.matches?target:position+(target-position)*(1-Math.pow(drag?.88:.953,dt));
      if(Math.abs(target-position)<.0005)position=target;
    }
    shaderSpeed*=Math.pow(drag?.72:.829,dt);
    if(view==='work'&&!document.hidden)render(now,dt);
    if(view==='work'||position!==target||introMotion)frame=requestAnimationFrame(animate);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(animate);}
  function moveTo(index){pendingWheel=0;clearTimeout(snapTimer);let nearest=target,distance=Infinity;for(let i=index;i<meshCount;i+=projects.length){const p=i+Math.round((target-i)/period)*period;if(Math.abs(p-target)<distance){nearest=p;distance=Math.abs(p-target);}}shaderSpeed-=(nearest-target)*.4;target=nearest;schedule();}
  function step(delta){if(introMotion)return;pendingWheel=0;target=physical(Math.round(logical(target))+delta);shaderSpeed-=delta*.4;schedule();}
  function snap(delay=240){clearTimeout(snapTimer);snapTimer=setTimeout(()=>{target=snapping(target);currentInput='idle';schedule();},delay);}
  const modalOpen=()=>projectDialog.open||reelDialog.open||transitioning;
  addEventListener('wheel',e=>{
    if(view!=='work'||modalOpen()||e.ctrlKey||introMotion||!initialized)return;
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    e.preventDefault();clearTimeout(snapTimer);
    const trackpad=e.deltaMode===0&&(Math.abs(e.deltaX)>0||Math.abs(e.deltaY)<24);
    const d=e.deltaY*(e.deltaMode===1?40:e.deltaMode===2?800:1);
    const viewport=Math.min(1,1512/Math.max(1,innerWidth),982/Math.max(1,innerHeight));
    const normalized=d*10.8/Math.max(1,innerHeight)*viewport;
    currentInput=trackpad?'trackpad':'mouse-wheel';lastInputTime=performance.now();
    if(trackpad){const amount=clamp(normalized*.21,-.14,.14);target+=amount;shaderSpeed-=amount;snap(240);}
    else pendingWheel+=Math.sign(normalized)*clamp(Math.round(Math.abs(normalized)*.7),1,4);
    schedule();
  },{passive:false});
  function bindDrag(surface,isList=false){
    surface.addEventListener('pointerdown',e=>{if(e.button!==0||modalOpen()||introMotion||(!isList&&e.pointerType==='mouse'))return;pendingWheel=0;clearTimeout(snapTimer);drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,start:target,moved:false,axis:null};});
    surface.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;const dy=drag.y-e.clientY,dx=drag.x-e.clientX;
      if(!drag.moved&&Math.max(Math.abs(dx),Math.abs(dy))>(isList?8:18)){drag.moved=true;drag.axis=Math.abs(dy)>Math.abs(dx)?'y':'x';surface.setPointerCapture(e.pointerId);magazine?.setHover(-1);}
      if(!drag.moved)return;
      if(isList){const d=dy*clamp(982/innerHeight,.62,1.55),a=Math.abs(d),steps=clamp(a<=34?a/34:1+(a-34)/150,0,3),next=drag.start+Math.sign(d)*steps;shaderSpeed-=(next-target)*.4;target=next;}
      else{const amount=(drag.axis==='y'?drag.lastY-e.clientY:drag.lastX-e.clientX)*10.8/innerHeight*1.15*Math.min(1,1512/innerWidth,982/innerHeight);const delta=clamp(amount,-.2,.2);target+=delta;shaderSpeed-=delta;drag.lastX=e.clientX;drag.lastY=e.clientY;}
      schedule();e.preventDefault();
    });
    const release=()=>{if(!drag)return;if(drag.moved){suppressClick=true;setTimeout(()=>{suppressClick=false;},180);target=snapping(target);schedule();}drag=null;};
    surface.addEventListener('pointerup',release);surface.addEventListener('pointercancel',release);surface.addEventListener('lostpointercapture',release);
  }
  bindDrag(scene);bindDrag(list,true);
  scene.addEventListener('click',e=>{if(suppressClick||introMotion||modalOpen()||!magazine?.mesh)return;const instance=magazine.pick(e.clientX,e.clientY);if(instance<0)return;const index=instance%projects.length;if(index===selected)openProject(index);else moveTo(index);});
  addEventListener('keydown',e=>{
    if(view!=='work'||modalOpen()||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
    const direction={ArrowDown:1,ArrowRight:1,PageDown:1,ArrowUp:-1,ArrowLeft:-1,PageUp:-1};
    if(direction[e.key]){e.preventDefault();step(direction[e.key]);}
    else if(e.key==='Home'){e.preventDefault();moveTo(0);}
    else if(e.key==='End'){e.preventDefault();moveTo(projects.length-1);}
    else if(e.key==='Escape'&&view!=='work')setView('work');
  });
  $('previous').addEventListener('click',()=>step(-1));$('next').addEventListener('click',()=>step(1));$('scroll-next').addEventListener('click',()=>step(1));
  function setView(next,updateHash=true){
    view=['work','about','playground','contact'].includes(next)?next:'work';
    for(const name of ['work','about','playground','contact'])$(name).hidden=name!==view;
    document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.closest('nav'))el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
    document.querySelector('.navigation nav').style.setProperty('--active-row',['work','about','playground','contact'].indexOf(view));
    document.body.style.overflow=view==='work'?'hidden':'auto';window.scrollTo(0,0);$('cursor').classList.remove('visible');
    if(updateHash&&location.hash!=='#'+view)history.pushState(null,'','#'+view);
    if(view==='work'){render();schedule();}
  }
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{
    const next=el.dataset.view;if(next===view||transitioning)return;
    document.querySelectorAll('nav [data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===next));
    document.querySelector('.navigation nav').style.setProperty('--active-row',['work','about','playground','contact'].indexOf(next));
    if(next==='contact'){setView(next);if(!reduceMotion.matches)$('contact').animate([{opacity:0,transform:'translateX(100px)'},{opacity:1,transform:'translateX(0)'}],{duration:800,easing:'cubic-bezier(.22,1,.36,1)'});}
    else transition(({work:'个人作品集',about:'关于我',playground:'作品索引',contact:'联系我'})[next],()=>setView(next));
  }));
  function renderDetail(){
    const p=projects[detailIndex];$('detail-image').src=p.image;$('detail-image').alt=p.title+' project preview';
    projectDialog.classList.toggle('has-extra',Boolean(p.gallery?.length||p.attachments?.length));
    projectDialog.querySelectorAll('.detail-gallery,.detail-attachments').forEach(el=>el.remove());
    if(p.gallery?.length){const gallery=document.createElement('div');gallery.className='detail-gallery';p.gallery.forEach(asset=>{const image=document.createElement('img');image.src=asset.path;image.alt=asset.name;image.loading='lazy';gallery.append(image);});projectDialog.append(gallery);}
    if(p.attachments?.length){const attachments=document.createElement('div');attachments.className='detail-attachments';const heading=document.createElement('h3');heading.textContent='项目附件';attachments.append(heading);p.attachments.forEach(asset=>{const link=document.createElement('a');link.href=asset.path;link.target='_blank';link.rel='noopener';link.textContent=asset.name+' ↗';attachments.append(link);});projectDialog.append(attachments);}
    for(const [id,value]of [['detail-category',p.category],['detail-title',p.title],['detail-description',p.description],['detail-role',p.role],['detail-date',p.date],['detail-awards',p.recognition]])text($(id),value);
    projectDialog.scrollTop=0;
  }
  function openProject(i,updateHash=true,animate=true){
    if(initialized&&animate){transition(projects[mod(i)].title,()=>openProject(i,updateHash,false),1700);return;}
    detailIndex=mod(i);renderDetail();if(!projectDialog.open)projectDialog.showModal();document.body.style.overflow='hidden';$('cursor').classList.remove('visible');if(updateHash)history.pushState(null,'','#project/'+projects[detailIndex].slug);
  }
  function closeProject(){projectDialog.close();}
  projectDialog.querySelector('.dialog-close').addEventListener('click',closeProject);
  projectDialog.addEventListener('close',()=>{document.body.style.overflow=view==='work'?'hidden':'auto';if(location.hash.startsWith('#project/'))history.replaceState(null,'','#'+view);});
  $('detail-next').addEventListener('click',()=>{const next=mod(detailIndex+1);transition(projects[next].title,()=>{detailIndex=next;renderDetail();history.replaceState(null,'','#project/'+projects[detailIndex].slug);},1700);});
  async function applyRoute(){const route=location.hash.slice(1);if(route.startsWith('project/')){const slug=route.slice(8),project=allProjects.find(p=>p.slug===slug);if(project){if(!projects.some(p=>p.slug===slug))await setCategory(project.category);openProject(projects.findIndex(p=>p.slug===slug),false,false);return;}}if(projectDialog.open)projectDialog.close();setView(route||'work',false);}
  addEventListener('hashchange',applyRoute);addEventListener('popstate',applyRoute);
  function reelSlide(){const p=projects[mod(reelIndex)];$('reel-image').src=p.image;$('reel-image').alt=p.title;text($('reel-title'),p.title);text($('reel-number'),String(mod(reelIndex)+1).padStart(2,'0')+' / '+projects.length);$('reel-image').style.animation='none';void $('reel-image').offsetWidth;$('reel-image').style.animation='';reelIndex++;}
  $('showreel').addEventListener('click',()=>{reelIndex=selected;reelSlide();reelDialog.showModal();document.body.style.overflow='hidden';reelTimer=setInterval(reelSlide,1800);});
  reelDialog.querySelector('.dialog-close').addEventListener('click',()=>reelDialog.close());
  reelDialog.addEventListener('close',()=>{clearInterval(reelTimer);document.body.style.overflow=view==='work'?'hidden':'auto';});
  addEventListener('pointermove',e=>{magazine?.setPointer(e.clientX,e.clientY);});
  document.addEventListener('pointerleave',()=>{magazine?.setHover(-1);if(magazine)magazine.pointer.x=-1000;});
  addEventListener('resize',()=>render());
  refreshInfo(0);setView('work',false);applyRoute();render();
  document.querySelector('.total').textContent='/'+String(projects.length).padStart(2,'0');
  document.body.classList.add('motion-intro');
  (async()=>{
    try{magazine=new window.MagazineRenderer(scene,projects);magazine.onFailure=useImageFallback;await magazine.ready;magazine.blend=reduceMotion.matches?1:0;magazine.onResize=()=>schedule();}
    catch(error){useImageFallback(error);}
    await window.runPortfolioLoader(skip=>{
      if(skip||!magazine){initialized=true;document.body.classList.remove('motion-intro');if(magazine)magazine.blend=1;schedule();return;}
      setTimeout(()=>{introMotion={start:performance.now(),from:projects.length,to:0};schedule();},240);
    });
  })();
  // Read-only diagnostics for repeatable motion verification.
  window.portfolioMotion={get state(){return{position,target,logical:logical(position),pendingWheel,shaderSpeed,selected,infoPosition,initialized,introPlaying:!!introMotion,input:currentInput,renderer:magazine?.mesh?'webgl':'fallback',meshCount,period,hover:magazine?.hover,hoverLift:magazine?.uniforms?.uHoverLift.value,sceneRotation:magazine?.group.rotation.y};}};
})();
