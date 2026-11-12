(() => {
  'use strict';
  window.runPortfolioLoader=async function(onReveal){
    const root=document.getElementById('intro');
    if(sessionStorage.getItem('portfolio-content-update')){sessionStorage.removeItem('portfolio-content-update');root.classList.add('done');onReveal(true);return;}
    if(matchMedia('(prefers-reduced-motion:reduce)').matches){root.classList.add('done');onReveal(true);return;}
    const title=root.querySelector('.intro-name'),shade=root.querySelector('.intro-shade');
    await document.fonts.ready;
    const mobile=innerWidth<=767,final=mobile?1.4:1.28;
    const stages=[{from:0,to:.3,duration:650+(mobile?300:0),hold:160},{from:.3,to:.6,duration:720,hold:200},{from:.6,to:final,duration:1460+(mobile?300:0),hold:500}];
    const duration=stages.reduce((sum,s)=>sum+s.duration+s.hold,0);
    const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    const started=performance.now();let revealed=false;
    return new Promise(resolve=>{
      function update(now){
        const elapsed=now-started;let rest=elapsed,progress=final;
        for(let i=0;i<stages.length;i++){const s=stages[i];if(rest<=s.duration+s.hold){const t=Math.max(0,Math.min(1,rest/s.duration));progress=s.from+(s.to-s.from)*(i===2?t*t*t*t:ease(t));break;}rest-=s.duration+s.hold;}
        shade.style.left=Math.min(mobile?1.4:1.12,progress)*100+'%';
        if(elapsed>=duration&&!revealed){revealed=true;onReveal(false);}
        if(elapsed>=duration+600){const exit=ease(Math.min(1,(elapsed-duration-600)/1330));root.style.transform=`translateY(${exit*innerHeight}px)`;title.style.transform=`translateY(${-exit*innerHeight}px)`;if(exit===1){root.classList.add('done');resolve();return;}}
        requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
    });
  };
})();
