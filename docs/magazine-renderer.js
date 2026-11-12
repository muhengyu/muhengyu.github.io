/* Three.js scene and shader parameters verified against huyml.co's shipped runtime.
   Third-party notices and exact source URLs are retained in reference/motion-source.json. */
(() => {
  'use strict';
  class MagazineRenderer {
    constructor(element,projects){
      const T=window.THREE;this.T=T;this.element=element;this.projects=projects;
      this.count=projects.length*Math.max(1,Math.ceil(30/projects.length));
      this.period=this.count*1.01;this.origin=(this.count-1)/2;
      this.scene=new T.Scene();this.group=new T.Group();this.scene.add(this.group);
      this.camera=new T.OrthographicCamera(-8,8,5.4,-5.4,.1,1000);
      this.camera.position.set(20,12.1,16.6);this.camera.lookAt(-7,-2.1,1.3);
      this.renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
      this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=T.SRGBColorSpace;
      this.shaderError=null;this.renderer.debug.onShaderError=()=>{this.shaderError=new Error('Project image shader could not compile');};
      this.canvas=this.renderer.domElement;this.canvas.className='magazine-canvas';this.canvas.setAttribute('aria-hidden','true');element.append(this.canvas);
      this.pickTarget=new T.WebGLRenderTarget(1,1);this.buffer=new Uint8Array(4);
      this.hover=-1;this.hoverOut=-1;this.lift=0;this.liftOut=0;this.parallax=0;this.pointerX=0;
      this.pointer={x:-1000,y:-1000};this.pickTime=0;this.lastPosition=0;this.blend=1;this.pickingDirty=true;
      this.onContextLost=e=>{e.preventDefault();this.onFailure?.(new Error('Graphics context was lost'));};
      this.canvas.addEventListener('webglcontextlost',this.onContextLost);
      this.ready=this.initialize();
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(element);
    }
    async initialize(){
      const T=this.T;
      const images=await Promise.all(this.projects.map(p=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Could not load '+p.image));image.src=location.protocol==='file:'?(window.PROJECT_IMAGE_DATA?.[p.image]||p.image):p.image;})));
      const total=images.reduce((sum,img)=>sum+img.naturalHeight,0),widest=Math.max(...images.map(img=>img.naturalWidth));
      const factor=Math.min(1,Math.min(8192,this.renderer.capabilities.maxTextureSize)/total);
      const sizes=images.map(img=>({width:Math.max(1,Math.floor(img.naturalWidth*factor)),height:Math.max(1,Math.floor(img.naturalHeight*factor))}));
      const atlas=document.createElement('canvas');atlas.width=Math.ceil(widest*factor);atlas.height=sizes.reduce((sum,s)=>sum+s.height,0);
      const ctx=atlas.getContext('2d');let offset=0;
      const regions=images.map((img,i)=>{const size=sizes[i];ctx.drawImage(img,0,offset,size.width,size.height);const uv={xStart:0,xEnd:size.width/atlas.width,yStart:1-offset/atlas.height,yEnd:1-(offset+size.height)/atlas.height,aspect:img.naturalWidth/img.naturalHeight};offset+=size.height;return uv;});
      this.texture=new T.CanvasTexture(atlas);this.texture.colorSpace=T.NoColorSpace;this.texture.minFilter=T.LinearFilter;this.texture.magFilter=T.LinearFilter;this.texture.generateMipmaps=false;
      this.uniforms={};
      const values={uProgress:1,uSplitProgress:1,uPageThickness:.01,uPageWidth:4.492,uPageHeight:3.658,uMeshCount:this.count,uTime:0,uAtlas:this.texture,uScrollY:this.origin,uSpeedY:0,uScrollCurve:2.25,uPageSpacing:1,uCenterSpacing:7,uFocusRotationX:.06681,uFocusRotationY:-.36331,uFocusRotationZ:-.51318,uPicking:0,uHoverIndex:-1,uHoverLift:0,uHoverIndexOut:-1,uHoverLiftOut:0,uCurrentPage:0,uMaxX:0};
      for(const [name,value]of Object.entries(values))this.uniforms[name]={value};
      this.material=new T.ShaderMaterial({vertexShader:window.MagazineShaders.vertex,fragmentShader:window.MagazineShaders.fragment,uniforms:this.uniforms,transparent:true});
      this.makeGeometry();const coords=new Float32Array(this.count*4),aspects=new Float32Array(this.count),indices=new Float32Array(this.count);
      for(let i=0;i<this.count;i++){const region=regions[i%regions.length];coords.set([region.xStart,region.xEnd,region.yStart,region.yEnd],i*4);aspects[i]=region.aspect;indices[i]=i;}
      this.coords=coords;this.aspects=aspects;this.indices=indices;this.applyAttributes();
      this.mesh=new T.InstancedMesh(this.geometry,this.material,this.count);this.mesh.frustumCulled=false;this.mesh.rotation.set(-.0215,2.2884,.2884);this.group.add(this.mesh);
      this.resize();this.validateFrame();
      this.element.dataset.rendererState='ready';this.element.classList.add('webgl-ready');return this;
    }
    validateFrame(){
      // Check actual colored pixels, not only the existence of a canvas or mesh.
      const T=this.T,target=new T.WebGLRenderTarget(128,128),pixels=new Uint8Array(128*128*4);
      try{
        this.renderer.setRenderTarget(target);this.renderer.clear();this.renderer.render(this.scene,this.camera);
        this.renderer.readRenderTargetPixels(target,0,0,128,128,pixels);
        let covered=0,min=255,max=0;
        for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<20)continue;covered++;for(let c=0;c<3;c++){min=Math.min(min,pixels[i+c]);max=Math.max(max,pixels[i+c]);}}
        if(this.shaderError)throw this.shaderError;
        const intentionalBlank=this.projects.every(project=>project.placeholder===true)&&min>=200;
        if(covered<16||(!intentionalBlank&&max-min<8))throw Error('Project images produced an empty graphics frame');
        this.element.dataset.imagePixels=String(covered);
      }finally{this.renderer.setRenderTarget(null);target.dispose();}
    }
    mobile(){return innerWidth<=767;}
    makeGeometry(){const T=this.T;const mobile=this.mobile();this.geometry?.dispose();this.geometry=new T.BoxGeometry(mobile?3:4.492,mobile?2:3.658,.01,50,50,1);}
    applyAttributes(){const T=this.T;const baseW=this.mobile()?3:4.492,baseH=this.mobile()?2:3.658,scales=new Float32Array(this.count*2);for(let i=0;i<this.count;i++){const p=this.projects[i%this.projects.length];let x=1,y=1;if(p.coverAspect&&p.coverAspect!=='original'){const ratio=p.imageWidth/p.imageHeight,w=Math.min(baseW,baseH*ratio);x=w/baseW;y=w/ratio/baseH;}scales.set([x,y],i*2);}this.geometry.setAttribute('aCardScale',new T.InstancedBufferAttribute(scales,2));this.geometry.setAttribute('aTextureCoords',new T.InstancedBufferAttribute(this.coords,4));this.geometry.setAttribute('aImageAspect',new T.InstancedBufferAttribute(this.aspects,1));this.geometry.setAttribute('aIndex',new T.InstancedBufferAttribute(this.indices,1));}
    resize(){
      const width=Math.max(1,this.element.clientWidth),height=Math.max(1,this.element.clientHeight),mobile=this.mobile();
      this.renderer.setSize(width,height);this.renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));
      this.camera.left=-5.4*width/height;this.camera.right=5.4*width/height;this.camera.top=5.4;this.camera.bottom=-5.4;this.camera.updateProjectionMatrix();
      if(this.mesh){if(this.wasMobile!==mobile){this.makeGeometry();this.applyAttributes();this.mesh.geometry=this.geometry;}this.mesh.position.set(mobile?3.8:4.3,2.1,5.1);this.uniforms.uPageWidth.value=mobile?3:4.492;this.uniforms.uPageHeight.value=mobile?2:3.658;this.uniforms.uScrollCurve.value=mobile?1.15:2.25;}
      this.wasMobile=mobile;this.pickingDirty=true;this.onResize?.();
    }
    update(position,speed,blend,delta,time){
      if(!this.mesh)return;const u=this.uniforms;
      u.uScrollY.value=this.origin-position;u.uSpeedY.value=speed;u.uTime.value=time/1000;u.uCenterSpacing.value=7*blend;
      u.uFocusRotationX.value=.06681*blend;u.uFocusRotationY.value=-.36331*blend;u.uFocusRotationZ.value=-.51318*blend;
      const damping=1-Math.pow(.95,delta);this.parallax+=(this.pointerX-this.parallax)*damping;
      this.group.rotation.y=this.mobile()?0:this.parallax*.05;
      this.lift=this.hover>=0?Math.min(1,this.lift+delta/60):Math.max(0,this.lift-delta/60);this.liftOut=Math.max(0,this.liftOut-delta/60);
      u.uHoverIndex.value=this.hover;u.uHoverIndexOut.value=this.hoverOut;
      u.uHoverLift.value=1-Math.pow(1-this.lift,4);u.uHoverLiftOut.value=1-Math.pow(1-this.liftOut,4);
      this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
      this.lastPosition=position;this.lastSpeed=speed;this.blend=blend;
    }
    setPointer(x,y){this.pointer={x,y};const r=this.canvas.getBoundingClientRect();this.pointerX=(x-r.left)/r.width*2-1;}
    setHover(index){if(index===this.hover)return;if(this.hover>=0){this.hoverOut=this.hover;this.liftOut=this.lift;}this.hover=index;this.lift=0;}
    pick(x,y){
      if(!this.mesh)return -1;const r=this.canvas.getBoundingClientRect();if(x<r.left||x>r.right||y<r.top||y>r.bottom)return -1;
      const T=this.T,size=this.renderer.getDrawingBufferSize(new T.Vector2());
      const px=Math.max(0,Math.min(size.x-1,Math.floor((x-r.left)/r.width*size.x))),py=Math.max(0,Math.min(size.y-1,Math.floor((y-r.top)/r.height*size.y)));
      this.uniforms.uPicking.value=1;this.material.side=T.DoubleSide;this.camera.setViewOffset(size.x,size.y,px,py,1,1);
      this.renderer.setRenderTarget(this.pickTarget);this.renderer.clear();this.renderer.render(this.scene,this.camera);this.renderer.readRenderTargetPixels(this.pickTarget,0,0,1,1,this.buffer);
      this.camera.clearViewOffset();this.uniforms.uPicking.value=0;this.material.side=T.FrontSide;this.renderer.setRenderTarget(null);
      return this.buffer[3]>0?this.buffer[0]-1:-1;
    }
    destroy(){this.resizeObserver?.disconnect();this.canvas.removeEventListener('webglcontextlost',this.onContextLost);this.geometry?.dispose();this.material?.dispose();this.texture?.dispose();this.pickTarget.dispose();this.renderer.dispose();this.canvas.remove();this.element.classList.remove('webgl-ready');}
  }
  window.MagazineRenderer=MagazineRenderer;
})();
