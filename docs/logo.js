(() => {
  'use strict';
  const anchor=document.querySelector('.identity'),cube=document.createElement('span');cube.className='identity-cube';cube.setAttribute('aria-hidden','true');
  for(let i=0;i<4;i++){
    const face=document.createElement('span');face.className='identity-face';face.dataset.face=String(i);face.style.transform=`rotateY(${i*90}deg) translateZ(28px)`;
    if(i===0){const name=document.createElement('span');name.className='identity-english';name.textContent='MU HENGYU';face.append(name);}
    else if(i===1){face.classList.add('identity-photo');const photo=window.PORTFOLIO_IDENTITY;if(photo?.photo){const image=document.createElement('img');image.src=location.protocol==='file:'?(photo.photoData||photo.photo):photo.photo;image.alt='';image.draggable=false;face.append(image);}}
    else face.classList.add('identity-pending');
    cube.append(face);
  }
  anchor.append(cube);let current=0,target=0,frame=0,timer=0,tween=null;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  function update(now){frame=0;if(tween){const p=Math.min(1,(now-tween.start)/1000);target=tween.from+(tween.to-tween.from)*(1-Math.pow(1-p,4));if(p===1)tween=null;}
    current+=(target-current)*.12;if(Math.abs(target-current)<.001&&!tween)current=target;
    cube.style.transform=`rotateY(${current}deg)`;if(current!==target||tween)frame=requestAnimationFrame(update);
  }
  addEventListener('wheel',e=>{if(reduced.matches||document.getElementById('project-dialog').open)return;tween=null;target+=e.deltaY*.25;clearTimeout(timer);timer=setTimeout(()=>{tween={from:target,to:Math.round(target/90)*90,start:performance.now()};if(!frame)frame=requestAnimationFrame(update);},140);if(!frame)frame=requestAnimationFrame(update);},{capture:true,passive:true});
})();
