/* Salt Harbor: browser 3D open world prototype. Original game, Three.js r128.
   Sections: 1 foundations, 2 assets, 3 world, 4 vehicles, 5 people, 6 input and audio,
   7 player and combat, 8 missions and wanted level, 9 HUD, 10 main loop. */
(function(){
'use strict';
var T=window.THREE;
function $(id){return document.getElementById(id)}
if(!T||!T.GLTFLoader||!T.SkeletonUtils){$('loadtxt').textContent='Could not load the 3D libraries. Check your connection and reload.';return}

/* =============================================================== 1. FOUNDATIONS */
var N=9,P=80,HALF=N*P/2,BOUND=388;
var DIRS=[[0,1],[1,0],[0,-1],[-1,0]];
var TAU=Math.PI*2;
var rnd=function(a,b){return a+Math.random()*(b-a)};
var rint=function(a,b){return Math.floor(rnd(a,b+1))};
var pick=function(a){return a[Math.floor(Math.random()*a.length)]};
var clamp=function(v,a,b){return v<a?a:v>b?b:v};
var angDiff=function(a,b){var d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d};
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
var rng=mulberry(20261017);
var nx=function(i){return (i-N/2)*P}, nz=function(j){return (j-N/2)*P};
var bc=function(i){return (i-(N-1)/2)*P};
var cellI=function(v){return clamp(Math.floor((v+HALF)/P),0,N-1)};
/* colours are authored as sRGB hex and converted so the lighting stays linear */
var col=function(h){return new T.Color(h).convertSRGBToLinear()};

/* settings and save (browser storage is a convenience only, always guarded) */
var CFG={vol:0.6,sens:1,q:'high',char:'Male_Casual'};
var SAVE={cash:500,best:{},jobs:0};
var STORE_KEY='saltharbor.v2';
(function(){
  try{var raw=window.localStorage.getItem(STORE_KEY);if(raw){var o=JSON.parse(raw);if(o.cfg)Object.assign(CFG,o.cfg);if(o.save)Object.assign(SAVE,o.save)}}catch(e){}
  if(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches&&!(function(){try{return window.localStorage.getItem(STORE_KEY)}catch(e){return 1}})())CFG.q='low';
})();
function persist(){try{window.localStorage.setItem(STORE_KEY,JSON.stringify({cfg:CFG,save:SAVE}))}catch(e){}}

/* renderer */
var canvas=$('view');
var renderer=new T.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
renderer.outputEncoding=T.sRGBEncoding;
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;
var scene=new T.Scene();
scene.fog=new T.Fog(col(0x8ec1e0),120,620);
var camera=new T.PerspectiveCamera(62,1,0.5,1600);
function resize(){var w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
window.addEventListener('resize',resize);
function applyQuality(){
  renderer.setPixelRatio(CFG.q==='high'?Math.min(window.devicePixelRatio||1,2):1);
  sun.castShadow=CFG.q==='high';
  resize();
}
var hemi=new T.HemisphereLight(col(0xbcd6ff),col(0x4a4338),0.9);scene.add(hemi);
var sun=new T.DirectionalLight(col(0xffe2b0),1.6);
sun.shadow.mapSize.set(2048,2048);
var sc=sun.shadow.camera;sc.left=-90;sc.right=90;sc.top=90;sc.bottom=-90;sc.near=10;sc.far=480;
sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.4;
scene.add(sun);scene.add(sun.target);
var headSpot=new T.SpotLight(col(0xfff2cc),0,90,0.5,0.55,1.1);

/* shared night factor (0 day, 1 night) used by building windows, lamps and cars */
var nightU={value:0};

/* sky dome: gradient, sun, moon and stars in one shader, same tone mapping as the scene */
var sky=(function(){
  var mat=new T.ShaderMaterial({
    uniforms:{uTop:{value:new T.Color()},uHor:{value:new T.Color()},uSun:{value:new T.Color()},uSunDir:{value:new T.Vector3(0,1,0)},uMoonDir:{value:new T.Vector3(0,-1,0)},uStars:{value:0}},
    vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_Position.z=gl_Position.w;}',
    fragmentShader:[
      'uniform vec3 uTop;uniform vec3 uHor;uniform vec3 uSun;uniform vec3 uSunDir;uniform vec3 uMoonDir;uniform float uStars;varying vec3 vDir;',
      'float h(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
      'void main(){vec3 d=normalize(vDir);float t=clamp(d.y,0.0,1.0);vec3 c=mix(uHor,uTop,pow(t,0.5));if(d.y<0.0)c=uHor;',
      'float sd=max(dot(d,uSunDir),0.0);c+=uSun*(pow(sd,900.0)*4.0+pow(sd,12.0)*0.3);',
      'float md=max(dot(d,uMoonDir),0.0);c+=vec3(0.75,0.82,1.0)*(smoothstep(0.9993,0.9996,md)*1.4+pow(md,60.0)*0.08)*uStars;',
      'vec3 sp=floor(d*190.0);float st=step(0.9972,h(sp));c+=vec3(st)*uStars*smoothstep(0.04,0.3,d.y)*(0.6+0.4*h(sp+3.1));',
      'gl_FragColor=vec4(c,1.0);',
      '#include <tonemapping_fragment>','#include <encodings_fragment>','}'].join('\n'),
    side:T.BackSide,depthWrite:false,fog:false});
  var m=new T.Mesh(new T.SphereGeometry(1000,32,16),mat);m.renderOrder=-10;m.frustumCulled=false;scene.add(m);
  return m;
})();

/* geometry merger for static flat pieces (slabs, road markings, containers) */
function Merger(){this.p=[];this.n=[];this.c=[];this.i=[]}
Merger.prototype.quad=function(v,n,cl){
  var b=this.p.length/3;
  for(var k=0;k<4;k++){this.p.push(v[k][0],v[k][1],v[k][2]);this.n.push(n[0],n[1],n[2]);this.c.push(cl.r,cl.g,cl.b)}
  this.i.push(b,b+1,b+2,b,b+2,b+3);
};
Merger.prototype.box=function(cx,y0,cz,w,h,d,cl){
  var hx=w/2,hz=d/2,y1=y0+h,x0=cx-hx,x1=cx+hx,z0=cz-hz,z1=cz+hz;
  this.quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],[1,0,0],cl);
  this.quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0],cl);
  this.quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],[0,1,0],cl);
  this.quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1],cl);
  this.quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],[0,0,-1],cl);
};
Merger.prototype.flat=function(cx,cz,w,d,y,cl){
  var x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2;
  this.quad([[x0,y,z1],[x1,y,z1],[x1,y,z0],[x0,y,z0]],[0,1,0],cl);
};
Merger.prototype.geo=function(){
  var g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(this.p,3));
  g.setAttribute('normal',new T.Float32BufferAttribute(this.n,3));
  g.setAttribute('color',new T.Float32BufferAttribute(this.c,3));
  g.setIndex(new T.BufferAttribute(new Uint32Array(this.i),1));
  g.computeBoundingSphere();return g;
};

/* =============================================================== 2. ASSETS */
var CAR_FILES=['NormalCar1','NormalCar2','SUV','Taxi','SportsCar','SportsCar2','Cop'];
var CHAR_FILES=['Male_Casual','Male_Shirt','Male_LongSleeve','Male_Suit','Female_Casual','Female_Dress','Female_TankTop','Female_Alternative'];
var BLD_LOW=['a','b','c','d','h'],BLD_MID=['f','g','i','l','m'],BLD_SKY=['a','b','c','d','e'];
var PROP_FILES=['light-square','construction-cone','construction-barrier','dumpster'];
var A={cars:{},chars:{},city:{}};
var loader=new T.GLTFLoader(),useText=false;
function loadAssets(onProgress){
  var jobs=[];
  CAR_FILES.forEach(function(n){jobs.push(['cars',n,'assets/cars/'+n+'.glb'])});
  CHAR_FILES.forEach(function(n){jobs.push(['chars',n,'assets/chars/'+n+'.glb'])});
  BLD_LOW.concat(BLD_MID).forEach(function(n){['','-b'].forEach(function(s){jobs.push(['city','building-'+n+s,'assets/city/building-'+n+s+'.glb'])})});
  BLD_SKY.forEach(function(n){['','-b'].forEach(function(s){jobs.push(['city','building-skyscraper-'+n+s,'assets/city/building-skyscraper-'+n+s+'.glb'])})});
  PROP_FILES.forEach(function(n){jobs.push(['city',n,'assets/city/'+n+'.glb'])});
  var done=0;
  return Promise.all(jobs.map(function(j){
    return new Promise(function(res){
      var ok=function(g){A[j[0]][j[1]]=g;done++;onProgress(done/jobs.length);res()},bad=function(){done++;onProgress(done/jobs.length);res()};
      /* some hosts do not serve .glb, so a base64 text copy (.b64.txt) is used as a fallback */
      var viaText=function(){
        fetch(j[2]+'.b64.txt').then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){
          var bin=atob(t.trim()),buf=new Uint8Array(bin.length);for(var q=0;q<bin.length;q++)buf[q]=bin.charCodeAt(q);
          loader.parse(buf.buffer,'',function(g){useText=true;ok(g)},bad);
        }).catch(bad);
      };
      if(useText)viaText();else loader.load(j[2],ok,undefined,viaText);
    });
  }));
}
/* bounding box of a loaded model, ignoring skinning */
function modelBox(obj){obj.updateMatrixWorld(true);return new T.Box3().setFromObject(obj)}
/* one InstancedMesh per mesh in a model, placed by an array of Matrix4 */
function instance(model,mats,material,shadows){
  model.updateMatrixWorld(true);
  var out=[],tmp=new T.Matrix4();
  model.traverse(function(n){
    if(!n.isMesh)return;
    var im=new T.InstancedMesh(n.geometry,material||n.material,mats.length);
    for(var i=0;i<mats.length;i++){tmp.multiplyMatrices(mats[i],n.matrixWorld);im.setMatrixAt(i,tmp)}
    im.castShadow=shadows!==false;im.receiveShadow=true;im.frustumCulled=false;scene.add(im);out.push(im);
  });
  return out;
}

/* =============================================================== 3. WORLD */
var cells=[];for(var q=0;q<N*N;q++)cells.push([]);
var blockInfo=[];
var parkBlocks=[[1,1],[7,2],[2,5],[6,6],[4,0],[0,6],[7,7]];
var rpick=function(a){return a[Math.floor(rng()*a.length)]};
var lampMat=new T.MeshBasicMaterial({color:0xffffff});
var lampGlow=null;

/* collision against building footprints (axis aligned boxes per block cell) */
function resolveCircle(c,r){
  var list=cells[cellI(c.z)*N+cellI(c.x)],hit=null;
  for(var k=0;k<list.length;k++){
    var b=list[k];
    var px=clamp(c.x,b.x0,b.x1),pz=clamp(c.z,b.z0,b.z1);
    var dx=c.x-px,dz=c.z-pz,d2=dx*dx+dz*dz;
    if(d2<r*r){
      var nxx,nzz,pen;
      if(d2<1e-6){
        var dl=c.x-b.x0,dr=b.x1-c.x,dt=c.z-b.z0,db=b.z1-c.z,m=Math.min(dl,dr,dt,db);
        if(m===dl){nxx=-1;nzz=0}else if(m===dr){nxx=1;nzz=0}else if(m===dt){nxx=0;nzz=-1}else{nxx=0;nzz=1}
        pen=m+r;
      }else{var d=Math.sqrt(d2);nxx=dx/d;nzz=dz/d;pen=r-d}
      c.x+=nxx*pen;c.z+=nzz*pen;hit={nx:nxx,nz:nzz};
    }
  }
  return hit;
}
function blocked(x,z){
  var list=cells[cellI(z)*N+cellI(x)];
  for(var k=0;k<list.length;k++){var b=list[k];if(x>b.x0&&x<b.x1&&z>b.z0&&z<b.z1)return true}
  return false;
}
function los(x1,z1,x2,z2){
  var d=Math.hypot(x2-x1,z2-z1),n=Math.ceil(d/3);
  for(var k=1;k<n;k++){var t=k/n;if(blocked(x1+(x2-x1)*t,z1+(z2-z1)*t))return false}
  return true;
}

/* traffic signals: a fixed 33 second cycle per intersection, staggered in a checkerboard */
function sigInfo(ni,nj,clock){
  var t=(clock+((ni+nj)%2)*16.5)%33,z,x;
  if(t<12){z='g';x='r'}else if(t<15){z='y';x='r'}else if(t<16.5){z='r';x='r'}
  else if(t<28.5){z='r';x='g'}else if(t<31.5){z='r';x='y'}else{z='r';x='r'}
  return {t:t,z:z,x:x};
}
var sigDyn=null;

function buildWorld(){
  var slab=new Merger(),mark=new Merger(),cont=new Merger();
  var bmats={};   // model key -> matrices
  var treeSpots=[],propSpots={dumpster:[],cone:[],barrier:[]};
  var boxCols=[0xc0452f,0x2f6fa8,0xd8a62b,0x3a8a6a,0xe8e2d0,0x7b4aa0,0x4a4f57];
  var dm=new T.Matrix4(),pos=new T.Vector3(),qt=new T.Quaternion(),scl=new T.Vector3(),up=new T.Vector3(0,1,0);
  for(var j=0;j<N;j++)for(var i=0;i<N;i++){
    var cx=bc(i),cz=bc(j);
    var isPark=parkBlocks.some(function(p){return p[0]===i&&p[1]===j});
    var isDock=(j===N-1&&i>=1&&i<=N-2);
    var type=isPark?'park':isDock?'dock':'city';
    blockInfo.push({i:i,j:j,cx:cx,cz:cz,type:type});
    slab.box(cx,0,cz,60,0.14,60,col(type==='park'?0x56834c:type==='dock'?0x777a7c:0x9c9a92));
    var cell=cells[j*N+i];
    if(type==='park'){
      for(var t=0;t<22;t++)treeSpots.push([cx+rnd(-25,25),cz+rnd(-25,25),rnd(.8,1.3)]);
    }else if(type==='dock'){
      for(var sx=-1;sx<=1;sx+=2)for(var sz=-1;sz<=1;sz+=2){
        var px=cx+sx*14,pz=cz+sz*14;
        for(var r=0;r<4;r++){
          var zz=pz-8.25+r*5.5,L=Math.floor(rng()*3)+1;
          for(var e=-1;e<=1;e+=2)for(var l=0;l<L;l++)cont.box(px+e*5.5,0.14+l*2.6,zz,10.8,2.6,2.6,col(rpick(boxCols)));
        }
        cell.push({x0:px-11,x1:px+11,z0:pz-11,z1:pz+11,h:8});
      }
    }else{
      var dist=Math.hypot(i-4,j-4);
      for(var sx2=-1;sx2<=1;sx2+=2)for(var sz2=-1;sz2<=1;sz2+=2){
        var lx=cx+sx2*14,lz=cz+sz2*14,name;
        if(dist<1.6)name='building-skyscraper-'+rpick(BLD_SKY);
        else if(dist<3.2)name=rng()<0.45?'building-skyscraper-'+rpick(['a','c','e']):'building-'+rpick(BLD_MID);
        else if(dist<5)name='building-'+rpick(BLD_MID.concat(BLD_LOW));
        else name='building-'+rpick(BLD_LOW);
        if(rng()<0.5&&A.city[name+'-b'])name+='-b';
        var g=A.city[name];if(!g)continue;
        var bb=modelBox(g.scene),size=bb.getSize(new T.Vector3()),ctr=bb.getCenter(new T.Vector3());
        var lot=rng()<0.2?21:23.5;
        var s=Math.min(lot/Math.max(size.x,size.z),27);
        var hs=name.indexOf('skyscraper')>=0?0.9+rng()*0.3:0.85+rng()*0.45;
        var yaw=rng()<0.5?(sz2>0?0:Math.PI):(sx2>0?Math.PI/2:-Math.PI/2);
        qt.setFromAxisAngle(up,yaw);pos.set(lx,0.14,lz);scl.set(s,s*hs,s);
        dm.compose(pos,qt,scl);
        var off=new T.Matrix4().makeTranslation(-ctr.x,0,-ctr.z);
        dm.multiply(off);
        (bmats[name]=bmats[name]||[]).push(dm.clone());
        var swap=Math.abs(Math.sin(yaw))>0.5,hw=(swap?size.z:size.x)*s/2,hd=(swap?size.x:size.z)*s/2;
        cell.push({x0:lx-hw,x1:lx+hw,z0:lz-hd,z1:lz+hd,h:size.y*s*hs});
        if(rng()<0.3)propSpots.dumpster.push([lx+(sx2>0?-1:1)*(hw+1.8),lz+(sz2>0?-1:1)*(rng()*8-4),sx2>0?Math.PI/2:-Math.PI/2]);
      }
    }
  }
  /* buildings: one instanced mesh set per model, shared window glow material per colour variant */
  var bMat={};
  Object.keys(bmats).forEach(function(name){
    var variant=/-b$/.test(name)?'b':'a';
    if(!bMat[variant]){
      var src=null;A.city[name].scene.traverse(function(n){if(n.isMesh&&!src)src=n.material});
      var m=new T.MeshLambertMaterial({map:src.map});
      if(m.map){m.map.anisotropy=4}
      m.onBeforeCompile=function(sh){
        sh.uniforms.uNight=nightU;
        sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uNight;')
          .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat win=smoothstep(0.03,0.12,diffuseColor.b-diffuseColor.r);\ntotalEmissiveRadiance+=mix(diffuseColor.rgb,vec3(1.0,0.74,0.38),0.65)*win*uNight*1.5;');
      };
      bMat[variant]=m;
    }
    instance(A.city[name].scene,bmats[name],bMat[variant]);
  });
  /* ground, slabs, containers */
  var ground=new T.Mesh(new T.BoxGeometry(800,1.5,800),new T.MeshLambertMaterial({color:col(0x2f343a)}));
  ground.position.y=-0.75;ground.receiveShadow=true;scene.add(ground);
  var water=new T.Mesh(new T.PlaneGeometry(7000,7000),new T.MeshLambertMaterial({color:col(0x1f6c88)}));
  water.rotation.x=-Math.PI/2;water.position.y=-1.2;scene.add(water);
  var sm=new T.Mesh(slab.geo(),new T.MeshLambertMaterial({vertexColors:true}));sm.receiveShadow=true;scene.add(sm);
  var cm=new T.Mesh(cont.geo(),new T.MeshLambertMaterial({vertexColors:true}));cm.castShadow=cm.receiveShadow=true;scene.add(cm);
  /* road markings */
  (function(){
    var yel=col(0xe2bf55),wht=col(0xe9e9e4),Y=0.05;
    for(var k=0;k<=N;k++){
      var L=(k-N/2)*P;
      for(var seg=0;seg<N;seg++){
        var a=(seg-N/2)*P+14,b=(seg+1-N/2)*P-14,mid=(a+b)/2,len=b-a;
        mark.flat(mid,L-0.28,len,0.2,Y,yel);mark.flat(mid,L+0.28,len,0.2,Y,yel);
        mark.flat(mid,L-9.2,len,0.22,Y,wht);mark.flat(mid,L+9.2,len,0.22,Y,wht);
        mark.flat(L-0.28,mid,0.2,len,Y,yel);mark.flat(L+0.28,mid,0.2,len,Y,yel);
        mark.flat(L-9.2,mid,0.22,len,Y,wht);mark.flat(L+9.2,mid,0.22,len,Y,wht);
      }
    }
    for(var ii=0;ii<=N;ii++)for(var jj=0;jj<=N;jj++){
      var X=nx(ii),Z=nz(jj);
      for(var s=-4;s<=4;s++){
        var o=s*2;
        mark.flat(X+12.6,Z+o,3,0.9,Y,wht);mark.flat(X-12.6,Z+o,3,0.9,Y,wht);
        mark.flat(X+o,Z+12.6,0.9,3,Y,wht);mark.flat(X+o,Z-12.6,0.9,3,Y,wht);
      }
    }
    var mm=new T.Mesh(mark.geo(),new T.MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    mm.receiveShadow=true;scene.add(mm);
  })();
  /* trees */
  (function(){
    var trunk=new T.InstancedMesh(new T.CylinderGeometry(0.25,0.35,2.4,6),new T.MeshLambertMaterial({color:col(0x5b4636)}),treeSpots.length);
    var crown=new T.InstancedMesh(new T.IcosahedronGeometry(2.3,0),new T.MeshLambertMaterial({color:0xffffff}),treeSpots.length);
    var greens=[0x3f7a3a,0x4d8c42,0x356b3a,0x5a9447],d=new T.Object3D();
    treeSpots.forEach(function(s,idx){
      d.position.set(s[0],1.3,s[1]);d.scale.set(s[2],s[2],s[2]);d.rotation.set(0,0,0);d.updateMatrix();trunk.setMatrixAt(idx,d.matrix);
      d.position.set(s[0],4.2*s[2],s[1]);d.scale.set(s[2],s[2]*1.15,s[2]);d.updateMatrix();crown.setMatrixAt(idx,d.matrix);
      crown.setColorAt(idx,col(rpick(greens)));
    });
    trunk.castShadow=crown.castShadow=true;scene.add(trunk);scene.add(crown);
  })();
  /* street lamps (Kenney model) with a night glow lens at each arm tip */
  (function(){
    var lm=A.city['light-square'];if(!lm)return;
    var mats=[],glow=[],S=11,tip=new T.Vector3(0,0.585*S,-0.2*S);
    blockInfo.forEach(function(b){
      [[0,-29.2,0],[0,29.2,Math.PI],[-29.2,0,Math.PI/2],[29.2,0,-Math.PI/2]].forEach(function(e){
        var m=new T.Matrix4().compose(new T.Vector3(b.cx+e[0],0.14,b.cz+e[1]),new T.Quaternion().setFromAxisAngle(up,e[2]),new T.Vector3(S,S,S));
        mats.push(m);
        glow.push(new T.Matrix4().compose(tip.clone().applyMatrix4(m).add(new T.Vector3(0,-0.05,0)),new T.Quaternion(),new T.Vector3(1,1,1)));
      });
    });
    instance(lm.scene,mats,null,false);
    lampGlow=new T.InstancedMesh(new T.BoxGeometry(0.9,0.14,0.9),lampMat,glow.length);
    glow.forEach(function(m,k){lampGlow.setMatrixAt(k,m)});lampGlow.frustumCulled=false;scene.add(lampGlow);
  })();
  /* small props: dumpsters in the lanes between lots, a few work zones */
  (function(){
    var dm2=A.city['dumpster'],cone=A.city['construction-cone'],bar=A.city['construction-barrier'];
    if(dm2){
      var mats=propSpots.dumpster.map(function(p){return new T.Matrix4().compose(new T.Vector3(p[0],0.14,p[1]),new T.Quaternion().setFromAxisAngle(up,p[2]),new T.Vector3(8,8,8))});
      if(mats.length)instance(dm2.scene,mats,null,true);
    }
    var cm2=[],bm=[];
    for(var k=0;k<14;k++){
      var ni=rint(1,N-1),nj=rint(1,N-1),sx=rng()<0.5?-1:1,sz=rng()<0.5?-1:1,cx0=nx(ni)+sx*7.6,cz0=nz(nj)+sz*7.6;
      for(var c=0;c<5;c++)cm2.push(new T.Matrix4().compose(new T.Vector3(cx0+c*1.7*sx,0.14,cz0+(c%2)*0.6),new T.Quaternion(),new T.Vector3(10,10,10)));
      bm.push(new T.Matrix4().compose(new T.Vector3(cx0+3.4*sx,0.14,cz0+3.4*sz),new T.Quaternion().setFromAxisAngle(up,Math.PI/2),new T.Vector3(10,10,10)));
    }
    if(cone)instance(cone.scene,cm2,null,true);
    if(bar)instance(bar.scene,bm,null,true);
  })();
  /* traffic signal heads: pole, housing and three lenses per head, two heads per corner pole */
  (function(){
    var nodes=[],heads=[],poles=[],lensM=[];
    for(var ni=0;ni<=N;ni++)for(var nj=0;nj<=N;nj++){
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(c){
        var px=nx(ni)+c[0]*9.6,pz=nz(nj)+c[1]*9.6;
        poles.push([px,pz]);
        // z facing head (seen by traffic moving along z), then x facing head
        [[0,c[1],'z'],[c[0],0,'x']].forEach(function(f){
          var hx=px+f[0]*0.4,hz=pz+f[1]*0.4;
          heads.push([hx,hz]);
          for(var L=0;L<3;L++)lensM.push({x:hx+f[0]*0.32,y:5.55-L*0.5+0.5,z:hz+f[1]*0.32,ni:ni,nj:nj,axis:f[2],L:L});
        });
      });
    }
    var pm=new T.InstancedMesh(new T.CylinderGeometry(0.12,0.15,6,6),new T.MeshLambertMaterial({color:col(0x2c3136)}),poles.length);
    var hm=new T.InstancedMesh(new T.BoxGeometry(0.55,1.55,0.55),new T.MeshLambertMaterial({color:col(0x15181b)}),heads.length);
    var lm2=new T.InstancedMesh(new T.BoxGeometry(0.3,0.3,0.3),new T.MeshBasicMaterial({color:0xffffff}),lensM.length);
    var d=new T.Object3D();
    poles.forEach(function(p,k){d.position.set(p[0],3,p[1]);d.updateMatrix();pm.setMatrixAt(k,d.matrix)});
    heads.forEach(function(h,k){d.position.set(h[0],5.1,h[1]);d.updateMatrix();hm.setMatrixAt(k,d.matrix)});
    lensM.forEach(function(l,k){d.position.set(l.x,l.y-0.55+0.5,l.z);d.updateMatrix();lm2.setMatrixAt(k,d.matrix);lm2.setColorAt(k,new T.Color(0x201010))});
    [pm,hm,lm2].forEach(function(m){m.frustumCulled=false;m.castShadow=false;scene.add(m)});
    sigDyn={lens:lm2,items:lensM,last:-1,last2:-1};
  })();
}
var SIGCOL={r:[col(0xff2a1a),col(0x2a1210),col(0x1c0f0a)],y:[col(0x2a1c08),col(0xffc21a),col(0x1c0f0a)],g:[col(0x10200f),col(0x1c1c0a),col(0x2aff6a)]};
function signalVisual(clock){
  if(!sigDyn)return;
  var ph=function(off){var t=(clock+off)%33;return t<12?0:t<15?1:t<16.5?2:t<28.5?3:t<31.5?4:5};
  var p0=ph(0),p1=ph(16.5);
  if(p0===sigDyn.last&&p1===sigDyn.last2)return;
  sigDyn.last=p0;sigDyn.last2=p1;
  var im=sigDyn.lens,items=sigDyn.items;
  for(var k=0;k<items.length;k++){
    var it=items[k],st=sigInfo(it.ni,it.nj,clock)[it.axis];
    im.setColorAt(k,SIGCOL[st][it.L]);
  }
  im.instanceColor.needsUpdate=true;
}

/* sky, sun, moon and night factor from the clock */
var cNight=col(0x040a18),cDay=col(0x6fb0e0),cDusk=col(0xf08a4e),cHorDay=col(0xbfdcee),cHorDusk=col(0xf6a46a),cHorNight=col(0x0e1a30);
var tmpA=new T.Color(),tmpB=new T.Color(),sunDir=new T.Vector3(),moonDir=new T.Vector3();
var lampDay=col(0x6c7073),lampNight=col(0xffd9a0);
function updateSky(){
  var a=((S.hour-6)/12)*Math.PI,s=Math.sin(a);
  var day=clamp(s*3+0.35,0,1),dusk=Math.max(0,1-Math.abs(s)*3.2);
  tmpA.copy(cNight).lerp(cDay,day);tmpA.lerp(cDusk,dusk*0.55);        // zenith
  tmpB.copy(cHorNight).lerp(cHorDay,day);tmpB.lerp(cHorDusk,dusk*0.9); // horizon
  var u=sky.material.uniforms;
  u.uTop.value.copy(tmpA);u.uHor.value.copy(tmpB);
  sunDir.set(Math.cos(a)*0.9,s,0.45).normalize();
  moonDir.copy(sunDir).multiplyScalar(-1);
  u.uSunDir.value.copy(sunDir);u.uMoonDir.value.copy(moonDir);
  u.uSun.value.copy(col(0xffd090)).multiplyScalar(clamp(s*4+1,0,1));
  var night=clamp(0.45-s*4,0,1);
  u.uStars.value=clamp(night*1.4-0.2,0,1);
  scene.fog.color.copy(tmpB);
  var fogN=night>0.6?1:0;scene.fog.near=120;scene.fog.far=620-night*160;
  hemi.intensity=0.4+0.95*(1-night);
  hemi.color.copy(tmpA).lerp(col(0xffffff),0.4);hemi.groundColor.copy(col(0x4a4338)).multiplyScalar(0.4+0.6*(1-night));
  var warm=1-clamp(Math.abs(s)*2.6,0,1);
  sun.color.copy(col(0xfff1d8)).lerp(col(0xff9a55),warm);
  sun.color.lerp(col(0x8aa6ff),night);
  sun.intensity=night>0.5?0.28+0.2*night:clamp(s*3,0.15,1)*1.7;
  var fx=S.mode==='car'?S.car.x:player.x,fz=S.mode==='car'?S.car.z:player.z;
  var ld=night>0.5?moonDir:sunDir;
  sun.target.position.set(fx,0,fz);
  sun.position.set(fx+ld.x*170,Math.max(ld.y,0.22)*190,fz+ld.z*170);
  nightU.value=night;S.night=night;
  lampMat.color.copy(lampDay).lerp(lampNight,night);
  headSpot.intensity=(S.mode==='car'&&S.lights)?0.4+night*2.4:0;
  sky.position.copy(camera.position);
}

/* =============================================================== 4. VEHICLES */
var S={started:false,paused:false,hour:17.4,clockT:0,cash:SAVE.cash,hp:100,stars:0,coolT:0,searching:false,mode:'foot',car:null,
  dead:0,caught:false,caughtT:0,mission:null,pmT:0,hurtT:0,fireT:0,act:false,lights:true,night:0,radio:0,jobs:SAVE.jobs,horn:0};
var player={x:50.6,z:13,yaw:Math.PI,obj:null,inv:0,anim:'Idle'};
var cam={yaw:Math.PI,pitch:0.42,off:0,idle:9,shake:0};
var cars=[],peds=[];
var RESPAWN={x:-50.6,z:14};

var CARS={
  sedan:{f:'NormalCar1',paint:['Blue'],vmax:34,acc:15,turn:1.9,hp:100},
  hatch:{f:'NormalCar2',paint:['LightBlue'],vmax:32,acc:14,turn:2.0,hp:90},
  suv:{f:'SUV',paint:['White'],vmax:30,acc:12,turn:1.7,hp:130},
  taxi:{f:'Taxi',paint:null,vmax:33,acc:15,turn:1.9,hp:100},
  sport:{f:'SportsCar',paint:['Orange','DarkOrange'],vmax:46,acc:21,turn:2.1,hp:100},
  sport2:{f:'SportsCar2',paint:['White'],vmax:48,acc:22,turn:2.1,hp:100},
  cop:{f:'Cop',paint:null,vmax:42,acc:21,turn:2.2,hp:140}
};
var CIVILIAN=['sedan','sedan','hatch','hatch','suv','sport','sport2','taxi'];
var PAINTS=[0xc94c4c,0x3b6fb6,0xe3dccb,0x2d2f33,0x6f8f5a,0xd9a94a,0xf2f2f2,0x7a5b99,0xb5651d,0x2f8f8f,0x8d9aa5];
var carLightMats=[];
function collectCarLights(){
  CAR_FILES.forEach(function(n){var g=A.cars[n];if(!g)return;g.scene.traverse(function(o){if(o.isMesh&&o.material&&o.material.metalness!==undefined){o.material.metalness=Math.min(o.material.metalness,0.2);o.material.roughness=Math.max(o.material.roughness,0.5)}})});
  CAR_FILES.forEach(function(n){var g=A.cars[n];if(!g)return;g.scene.traverse(function(o){
    if(o.isMesh&&(o.material.name==='Headlights'||o.material.name==='TailLights')&&carLightMats.indexOf(o.material)<0)carLightMats.push(o.material);
  })});
}
var QY=new T.Quaternion(),QX=new T.Quaternion(),AXY=new T.Vector3(0,1,0),AXX=new T.Vector3(1,0,0);
function makeCar(typeKey,hex,mode){
  var spec=CARS[typeKey],gm=A.cars[spec.f];
  var model=gm.scene.clone(true),own={},wheels={fl:null,fr:null,rb:null},bar=null;
  model.traverse(function(n){
    if(n.name){
      if(/FrontLeftWheel$/.test(n.name))wheels.fl=n;else if(/FrontRightWheel$/.test(n.name))wheels.fr=n;else if(/BackWheels$/.test(n.name))wheels.rb=n;
    }
    if(!n.isMesh)return;
    n.castShadow=true;n.receiveShadow=false;
    var nm=n.material.name,isPaint=spec.paint&&spec.paint.indexOf(nm)>=0,isBar=typeKey==='cop'&&(nm==='BlueLights'||nm==='WhiteLights'||nm==='TailLights');
    if(isPaint||isBar){if(!own[nm])own[nm]=n.material.clone();n.material=own[nm]}
  });
  var paint=[];
  if(spec.paint){
    var base=col(hex||pick(PAINTS));
    spec.paint.forEach(function(nm,k){var m=own[nm];if(!m)return;m.color.copy(base).multiplyScalar(k?0.78:1);paint.push({m:m,c:m.color.clone()})});
  }
  var g=new T.Group(),body=new T.Group();body.add(model);g.add(body);scene.add(g);
  var c={g:g,body:body,type:typeKey,spec:spec,mode:mode,own:own,paint:paint,
    wheels:{fl:wheels.fl,fr:wheels.fr,rb:wheels.rb,flq:wheels.fl&&wheels.fl.quaternion.clone(),frq:wheels.fr&&wheels.fr.quaternion.clone(),rbq:wheels.rb&&wheels.rb.quaternion.clone()},
    x:0,z:0,h:0,vx:0,vz:0,hp:spec.hp,maxHp:spec.hp,vmax:spec.vmax,acc:spec.acc,brake:34,turn:spec.turn,cruise:rnd(10,15),
    cop:typeKey==='cop',ni:0,nj:0,dir:[0,1],ndir:[0,1],phase:0,wx:0,wz:0,road:false,pi:-1,pj:-1,stuck:0,rev:0,wreck:0,smoke:0,shot:0,
    wa:0,hPrev:0,fsPrev:0,roll:0,pitch:0,ax:0,skidT:0,slip:0};
  cars.push(c);return c;
}
function placeCar(c,dt){
  c.g.position.set(c.x,0.04,c.z);c.g.rotation.y=c.h;
  if(!dt||c.mode==='wreck')return;
  var fs=c.vx*Math.sin(c.h)+c.vz*Math.cos(c.h);
  var yr=angDiff(c.hPrev,c.h)/dt;c.hPrev=c.h;
  c.ax+=((fs-c.fsPrev)/dt-c.ax)*Math.min(1,dt*6);c.fsPrev=fs;
  var st=Math.atan(clamp(yr,-3,3)*2.7/Math.max(Math.abs(fs),2))*(fs<-0.5?-1:1);st=clamp(st,-0.55,0.55);
  c.wa+=fs*dt/0.3;
  var w=c.wheels;
  QX.setFromAxisAngle(AXX,c.wa);
  if(w.fl){QY.setFromAxisAngle(AXY,st);w.fl.quaternion.copy(QY).multiply(w.flq).multiply(QX)}
  if(w.fr){QY.setFromAxisAngle(AXY,st);w.fr.quaternion.copy(QY).multiply(w.frq).multiply(QX)}
  if(w.rb){w.rb.quaternion.copy(w.rbq).multiply(QX)}
  var tr=clamp(yr*fs*0.0035,-0.1,0.1),tp=clamp(-c.ax*0.0035,-0.05,0.05);
  c.roll+=(tr-c.roll)*Math.min(1,dt*8);c.pitch+=(tp-c.pitch)*Math.min(1,dt*8);
  c.body.rotation.z=c.roll;c.body.rotation.x=c.pitch;
}
var R=function(d){return [-d[1],d[0]]};
function laneE(ni,nj,d){var r=R(d);return [nx(ni)+r[0]*5-d[0]*12,nz(nj)+r[1]*5-d[1]*12]}
function laneX(ni,nj,d){var r=R(d);return [nx(ni)+r[0]*5+d[0]*12,nz(nj)+r[1]*5+d[1]*12]}
var nodeOK=function(i,j){return i>=0&&i<=N&&j>=0&&j<=N};
function nodeNear(x,z){return [clamp(Math.round(x/P+N/2),0,N),clamp(Math.round(z/P+N/2),0,N)]}
function trafficStart(c){
  for(var tries=0;tries<30;tries++){
    var d=pick(DIRS),ni=rint(0,N),nj=rint(0,N);
    if(!nodeOK(ni-d[0],nj-d[1]))continue;
    var e=laneE(ni,nj,d),back=rnd(0,50);
    c.x=e[0]-d[0]*back;c.z=e[1]-d[1]*back;c.h=Math.atan2(d[0],d[1]);
    c.ni=ni;c.nj=nj;c.dir=d;c.phase=0;c.wx=e[0];c.wz=e[1];
    var sp=c.cruise*0.8;c.vx=d[0]*sp;c.vz=d[1]*sp;c.hPrev=c.h;return;
  }
}
function curbSpot(){
  for(var tries=0;tries<40;tries++){
    var d=pick(DIRS),ni=rint(0,N),nj=rint(0,N);
    if(!nodeOK(ni+d[0],nj+d[1]))continue;
    var r=R(d),off=rnd(20,58);
    return {x:nx(ni)+d[0]*off+r[0]*8.6,z:nz(nj)+d[1]*off+r[1]*8.6,h:Math.atan2(d[0],d[1])};
  }
  return {x:48.6,z:-30,h:0};
}
function ringSpot(minR,maxR){
  var p=S.mode==='car'&&S.car?S.car:player;
  for(var tries=0;tries<60;tries++){
    var a=rnd(0,TAU),r=rnd(minR,maxR),x=p.x+Math.sin(a)*r,z=p.z+Math.cos(a)*r;
    if(Math.abs(x)<340&&Math.abs(z)<340)return [x,z];
  }
  return [0,0];
}
function recycleTo(c,s){
  var nn=nodeNear(s[0],s[1]),ni=nn[0],nj=nn[1],d=pick(DIRS);
  while(!nodeOK(ni-d[0],nj-d[1])||!nodeOK(ni+d[0],nj+d[1]))d=pick(DIRS);
  var e=laneE(ni,nj,d);c.x=e[0]-d[0]*rnd(0,30);c.z=e[1]-d[1]*rnd(0,30);c.h=Math.atan2(d[0],d[1]);c.hPrev=c.h;
  c.ni=ni;c.nj=nj;c.dir=d;c.phase=0;c.wx=e[0];c.wz=e[1];c.road=false;c.vx=d[0]*8;c.vz=d[1]*8;c.stuck=0;c.rev=0;
}
function recycle(c){recycleTo(c,ringSpot(150,230))}
function advanceTraffic(c){
  if(c.phase===0){
    var opts=[],w=[];
    for(var k=0;k<4;k++){
      var d=DIRS[k];
      if(d[0]===-c.dir[0]&&d[1]===-c.dir[1])continue;
      if(!nodeOK(c.ni+d[0],c.nj+d[1]))continue;
      opts.push(d);w.push(d[0]===c.dir[0]&&d[1]===c.dir[1]?3:1);
    }
    if(!opts.length){opts.push([-c.dir[0],-c.dir[1]]);w.push(1)}
    var tot=w.reduce(function(a,b){return a+b},0),r=Math.random()*tot,idx=0;
    while(r>w[idx]){r-=w[idx];idx++}
    c.ndir=opts[idx];var x=laneX(c.ni,c.nj,c.ndir);c.wx=x[0];c.wz=x[1];c.phase=1;
  }else{
    c.ni+=c.ndir[0];c.nj+=c.ndir[1];c.dir=c.ndir;
    var e=laneE(c.ni,c.nj,c.dir);c.wx=e[0];c.wz=e[1];c.phase=0;
  }
}
/* stop line behaviour: returns null when free to go, or a speed limit that brings the car to rest at the line */
function signalGate(c){
  if(c.phase!==0)return null;
  var ax=c.dir[0]!==0?'x':'z',st=sigInfo(c.ni,c.nj,S.clockT)[ax];
  if(st==='g')return null;
  var d=(c.wx-c.x)*c.dir[0]+(c.wz-c.z)*c.dir[1];
  if(d<-1)return null;
  var v=c.vx*c.dir[0]+c.vz*c.dir[1];
  if(st==='y'&&d<v*v/(2*9)+2)return null;
  return {limit:Math.sqrt(Math.max(0,2*6*(d-1.2)))};
}
function stepCar(c,dt,thr,steer,hb){
  var fx=Math.sin(c.h),fz=Math.cos(c.h);
  var fs=c.vx*fx+c.vz*fz,lx=c.vx-fx*fs,lz=c.vz-fz*fs;
  if(thr>0){fs+=(fs<0?c.brake:c.acc*(1-Math.max(0,fs)/c.vmax))*thr*dt}
  else if(thr<0){fs-=(fs>0?c.brake:c.acc*0.5*(1-(-fs)/(c.vmax*0.35)))*(-thr)*dt}
  fs-=fs*0.1*dt+Math.sign(fs)*Math.min(Math.abs(fs),1.4*dt);
  var rot=steer*clamp(Math.abs(fs)/6,0,1)*(fs>=0?1:-1)*c.turn*(hb?1.35:1);
  c.h+=rot*dt;
  var gf=Math.exp(-(hb?1.1:7)*dt);lx*=gf;lz*=gf;
  if(hb)fs*=Math.exp(-1.4*dt);
  var gx=Math.sin(c.h),gz=Math.cos(c.h);
  c.vx=gx*fs+lx;c.vz=gz*fs+lz;
  c.slip=Math.hypot(lx,lz);
  c.x+=c.vx*dt;c.z+=c.vz*dt;
}
function driveToward(c,tx,tz,vmax,dt){
  var diff=angDiff(c.h,Math.atan2(tx-c.x,tz-c.z));
  var fs=c.vx*Math.sin(c.h)+c.vz*Math.cos(c.h);
  var steer=clamp(diff*2.2,-1,1);
  var target=vmax*(1-Math.min(Math.abs(diff)/1.3,0.65));
  var thr=clamp((target-fs)*0.35,-1,1);
  if(c.rev>0){c.rev-=dt;thr=-1;steer=-steer}
  stepCar(c,dt,thr,steer,false);
  if(Math.hypot(c.vx,c.vz)<1.2&&vmax>3){c.stuck+=dt;if(c.stuck>1.6){c.stuck=0;c.rev=1.0}}else c.stuck=Math.max(0,c.stuck-dt);
}
function obstacleLimit(c){
  var fx=Math.sin(c.h),fz=Math.cos(c.h),sp=c.vx*fx+c.vz*fz,lim=99,look=11+Math.max(0,sp)*0.9,k,o,dx,dz,a,l;
  for(k=0;k<cars.length;k++){
    o=cars[k];if(o===c)continue;dx=o.x-c.x;dz=o.z-c.z;
    if(dx*dx+dz*dz>look*look*1.3)continue;a=dx*fx+dz*fz;if(a<=0||a>look)continue;
    l=Math.abs(-dx*fz+dz*fx);if(l<2.6)lim=Math.min(lim,Math.max(0,(a-4.8)*0.9));
  }
  for(k=0;k<peds.length;k++){
    o=peds[k];if(o.dead)continue;dx=o.x-c.x;dz=o.z-c.z;
    if(dx*dx+dz*dz>look*look)continue;a=dx*fx+dz*fz;if(a<=0||a>look)continue;
    l=Math.abs(-dx*fz+dz*fx);if(l<1.9)lim=Math.min(lim,Math.max(0,(a-3)*0.9));
  }
  if(S.mode==='foot'){dx=player.x-c.x;dz=player.z-c.z;a=dx*fx+dz*fz;
    if(a>0&&a<look&&Math.abs(-dx*fz+dz*fx)<1.9)lim=Math.min(lim,Math.max(0,(a-3)*0.9))}
  return lim;
}
function copAI(c,dt){
  var tgt=S.mode==='car'?S.car:player;
  var tx=tgt.x,tz=tgt.z,dist=Math.hypot(tx-c.x,tz-c.z);
  var vmax=22+S.stars*3.2,direct=dist<80&&los(c.x,c.z,tx,tz);
  if(direct){
    c.road=false;
    var lead=S.mode==='car'?0.45:0;
    driveToward(c,tx+(S.mode==='car'?S.car.vx:0)*lead,tz+(S.mode==='car'?S.car.vz:0)*lead,vmax,dt);
  }else{
    if(!c.road){c.road=true;var nn=nodeNear(c.x,c.z);c.ni=nn[0];c.nj=nn[1];c.pi=-1;c.pj=-1;c.wx=nx(c.ni);c.wz=nz(c.nj)}
    if(Math.hypot(c.wx-c.x,c.wz-c.z)<10){
      var best=null,bd=1e9;
      for(var k=0;k<4;k++){
        var ni=c.ni+DIRS[k][0],nj=c.nj+DIRS[k][1];
        if(!nodeOK(ni,nj)||(ni===c.pi&&nj===c.pj))continue;
        var dd=Math.hypot(nx(ni)-tx,nz(nj)-tz)+Math.random()*30;
        if(dd<bd){bd=dd;best=[ni,nj]}
      }
      if(!best)best=[c.pi<0?c.ni:c.pi,c.pj<0?c.nj:c.pj];
      c.pi=c.ni;c.pj=c.nj;c.ni=best[0];c.nj=best[1];c.wx=nx(c.ni);c.wz=nz(c.nj);
    }
    driveToward(c,c.wx,c.wz,vmax*0.8,dt);
  }
  if(S.stars>=2&&dist<30&&direct&&S.dead<=0){
    c.shot-=dt;
    if(S.mode==='foot')hurtPlayer(3.2*S.stars*dt,true);else hurtCar(S.car,2.2*S.stars*dt);
    if(c.shot<=0){c.shot=rnd(0.18,0.4);tracer(c.x+Math.sin(c.h)*1.5,1.1,c.z+Math.cos(c.h)*1.5,tx+rnd(-1,1),1.2,tz+rnd(-1,1),0xff8c6a);burst(0.07,1800,0.1)}
  }
}
function carBrain(c,dt){
  if(c.mode==='player'){
    var inp=getInput();stepCar(c,dt,inp.mz,-inp.mx,inp.hb);
  }else if(c.mode==='traffic'){
    var gate=signalGate(c);
    if(!gate&&Math.hypot(c.wx-c.x,c.wz-c.z)<5)advanceTraffic(c);
    driveToward(c,c.wx,c.wz,Math.min(c.cruise,obstacleLimit(c),gate?gate.limit:99),dt);
  }else if(c.mode==='police'){
    copAI(c,dt);
  }else if(c.mode==='parked'){
    stepCar(c,dt,0,0,true);
  }
}
var OFFS=[1.0,-1.0];
function carWorld(c){
  if(c.mode==='wreck')return;
  var worst=0,k;
  for(k=0;k<2;k++){
    var fx=Math.sin(c.h)*OFFS[k],fz=Math.cos(c.h)*OFFS[k],p={x:c.x+fx,z:c.z+fz},hit=resolveCircle(p,1.25);
    if(hit){
      c.x=p.x-fx;c.z=p.z-fz;
      var vn=-(c.vx*hit.nx+c.vz*hit.nz);
      if(vn>0){c.vx+=hit.nx*vn*1.3;c.vz+=hit.nz*vn*1.3;worst=Math.max(worst,vn)}
    }
  }
  if(Math.abs(c.x)>BOUND){var sx=Math.sign(c.x);c.x=sx*BOUND;if(c.vx*sx>0){worst=Math.max(worst,Math.abs(c.vx));c.vx*=-0.3}}
  if(Math.abs(c.z)>BOUND){var sz=Math.sign(c.z);c.z=sz*BOUND;if(c.vz*sz>0){worst=Math.max(worst,Math.abs(c.vz));c.vz*=-0.3}}
  if(worst>6)impact(c,worst);
}
function dist2player(c){var p=S.mode==='car'&&S.car?S.car:player;return (c.x-p.x)*(c.x-p.x)+(c.z-p.z)*(c.z-p.z)}
function impact(c,v){
  var dmg=(v-6)*1.25;if(dmg<=0)return;
  hurtCar(c,dmg);
  for(var k=0;k<6;k++)spawnP(c.x,1,c.z,rnd(-4,4),rnd(1,5),rnd(-4,4),0.5,0.25,0xd8d2c4,12);
  if(c.mode==='player'){cam.shake=Math.min(1,cam.shake+v*0.03);burst(0.25,900,0.35)}else if(dist2player(c)<2500)burst(0.1,900,0.25);
}
function carVsCar(a,b){
  var dx=a.x-b.x,dz=a.z-b.z;if(dx*dx+dz*dz>40)return;
  if(a.mode==='wreck'&&b.mode==='wreck')return;
  for(var i=0;i<2;i++)for(var j=0;j<2;j++){
    var ax=a.x+Math.sin(a.h)*OFFS[i],az=a.z+Math.cos(a.h)*OFFS[i],bx=b.x+Math.sin(b.h)*OFFS[j],bz=b.z+Math.cos(b.h)*OFFS[j];
    var ex=ax-bx,ez=az-bz,d=Math.hypot(ex,ez);
    if(d<2.5&&d>1e-4){
      var nxx=ex/d,nzz=ez/d,pen=2.5-d,wa=b.mode==='wreck'?1:0.5,wb=a.mode==='wreck'?1:0.5;
      a.x+=nxx*pen*wa;a.z+=nzz*pen*wa;b.x-=nxx*pen*wb;b.z-=nzz*pen*wb;
      var rel=(a.vx-b.vx)*nxx+(a.vz-b.vz)*nzz;
      if(rel<0){
        var imp=-1.3*rel*0.5;
        a.vx+=nxx*imp;a.vz+=nzz*imp;b.vx-=nxx*imp;b.vz-=nzz*imp;
        var v=-rel;
        if(v>5){
          var dm=(v-5)*1.1,pl=(a.mode==='player'||b.mode==='player');
          hurtCar(a,dm*(pl?1:0.5),b);hurtCar(b,dm*(pl?1:0.5),a);
          if(pl){
            var o=a.mode==='player'?b:a;
            if(o.cop)addHeat(2,3);else if(v>9)addHeat(1,1);
            cam.shake=Math.min(1,cam.shake+v*0.03);burst(0.25,800,0.35);
          }
          for(var q=0;q<5;q++)spawnP((ax+bx)/2,1,(az+bz)/2,rnd(-4,4),rnd(1,5),rnd(-4,4),0.5,0.25,0xe0d9c6,12);
        }
      }
    }
  }
}
function hurtCar(c,amt){
  if(c.mode==='wreck'||amt<=0)return;
  c.hp-=amt;
  var k=clamp(c.hp/c.maxHp,0,1),dark=0.4+0.6*k;
  for(var i=0;i<c.paint.length;i++)c.paint[i].m.color.copy(c.paint[i].c).multiplyScalar(dark);
  if(c.hp<=0)explode(c);
}
function explode(c){
  var wasPlayer=c.mode==='player';
  for(var k=0;k<34;k++)spawnP(c.x,1.2,c.z,rnd(-9,9),rnd(2,12),rnd(-9,9),rnd(0.5,1.1),rnd(0.4,1.1),pick([0xffb347,0xff7a2f,0xffd36b,0x333333]),10);
  burst(0.7,500,0.9);
  if(wasPlayer){
    S.mode='foot';S.car=null;player.x=c.x+2.5;player.z=c.z;player.obj.g.visible=true;
    resolveCircle(player,0.5);hurtPlayer(55);cam.shake=1;toast('Your car blew up');
  }
  if(c.cop&&c.mode==='police')addHeat(1,5);
  c.mode='wreck';c.wreck=25;c.vx=c.vz=0;
  for(var nm in c.own){c.own[nm].color.setHex(0x111111);c.own[nm].emissive.setHex(0x000000)}
  c.paint=[];
  c.body.traverse(function(n){if(n.isMesh&&n.material&&!c.own[n.material.name]){n.material=n.material.clone();n.material.color.multiplyScalar(0.18)}});
}
function removeCar(c){scene.remove(c.g);var i=cars.indexOf(c);if(i>=0)cars.splice(i,1)}
function spawnTraffic(){
  var c=makeCar(pick(CIVILIAN),null,'traffic');c.cruise=rnd(10,15);trafficStart(c);return c;
}
function spawnParked(type,hex){
  var s=curbSpot(),c=makeCar(type||pick(CIVILIAN),hex,'parked');
  c.x=s.x;c.z=s.z;c.h=s.h;c.hPrev=s.h;return c;
}
function spawnCop(mode,far){
  var c=makeCar('cop',null,mode||'traffic');c.cruise=12;
  if(far){var s=ringSpot(110,170);recycleTo(c,s)}else trafficStart(c);
  return c;
}
/* tyre marks and smoke while sliding */
var SKID_MAX=420,skidMesh,skidI=0,skidData=[];
(function(){
  var g=new T.PlaneGeometry(0.32,1.0);g.rotateX(-Math.PI/2);
  skidMesh=new T.InstancedMesh(g,new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.4,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),SKID_MAX);
  var m=new T.Matrix4().makeScale(0,0,0);
  for(var i=0;i<SKID_MAX;i++){skidMesh.setMatrixAt(i,m);skidData.push({x:0,z:0,h:0,age:99})}
  skidMesh.frustumCulled=false;scene.add(skidMesh);
})();
var skM=new T.Matrix4(),skQ=new T.Quaternion(),skP=new T.Vector3(),skS=new T.Vector3();
function updateSkids(dt){
  for(var i=0;i<SKID_MAX;i++){
    var s=skidData[i];if(s.age>=22)continue;
    s.age+=dt;
    var k=s.age<16?1:Math.max(0,1-(s.age-16)/6);
    skQ.setFromAxisAngle(AXY,s.h);skP.set(s.x,0.08,s.z);skS.set(k,1,1);
    skM.compose(skP,skQ,skS);skidMesh.setMatrixAt(i,skM);
  }
  skidMesh.instanceMatrix.needsUpdate=true;
}
function vehicleFx(c,dt){
  var sp=Math.hypot(c.vx,c.vz);
  var sliding=c.slip>2.6&&sp>5;
  if(c.mode==='player'&&getInput().hb&&sp>8)sliding=true;
  c.slipAmt=sliding?Math.min(1,c.slip/6+0.4):0;
  if(!sliding)return;
  c.skidT-=dt;
  if(c.skidT>0)return;
  c.skidT=0.05;
  var fx=Math.sin(c.h),fz=Math.cos(c.h),rx=-fz,rz=fx;
  for(var s=-1;s<=1;s+=2){
    var idx=skidI++%SKID_MAX,d=skidData[idx];
    d.x=c.x-fx*1.25+rx*s*0.8;d.z=c.z-fz*1.25+rz*s*0.8;d.h=Math.atan2(c.vx,c.vz);d.age=0;
  }
  if(Math.random()<0.6)spawnP(c.x-fx*1.3+rnd(-0.6,0.6),0.4,c.z-fz*1.3+rnd(-0.6,0.6),rnd(-0.4,0.4),rnd(0.6,1.6),rnd(-0.4,0.4),0.9,0.9,0xcfcfcf,-0.5);
}

/* =============================================================== 5. PEOPLE */
var CH_YAW=0,CH_H=1.78,chCache={};
var CH_LABEL={Male_Casual:'Casual',Male_Shirt:'Shirt',Male_LongSleeve:'Long sleeve',Male_Suit:'Suit',Female_Casual:'Casual F',Female_Dress:'Dress',Female_TankTop:'Tank top',Female_Alternative:'Alt'};
function clipOf(g,re){for(var i=0;i<g.animations.length;i++)if(re.test(g.animations[i].name))return g.animations[i];return null}
function makeChar(name){
  var gl=A.chars[name]||A.chars[CHAR_FILES[0]];
  var root=T.SkeletonUtils.clone(gl.scene),g=new T.Group();
  if(!chCache[name]){var b=modelBox(root);chCache[name]={s:CH_H/Math.max(0.01,b.max.y-b.min.y),y:-b.min.y}}
  var cc=chCache[name];root.scale.multiplyScalar(cc.s);root.position.y=cc.y*cc.s;g.add(root);
  root.traverse(function(n){if(n.isMesh){n.castShadow=true;n.frustumCulled=false}});
  var mixer=new T.AnimationMixer(root),acts={};
  [['Idle',/Idle$/],['Walk',/Walk$/],['Run',/Run$/],['Death',/Death$/]].forEach(function(p){
    var cl=clipOf(gl,p[1]);if(!cl)return;var a=mixer.clipAction(cl);acts[p[0]]=a;
    if(p[0]==='Death'){a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true}
  });
  var o={g:g,root:root,mixer:mixer,acts:acts,cur:null,name:name,hand:null};
  root.traverse(function(n){if(n.name==='Palm.R'&&!o.hand)o.hand=n});
  scene.add(g);charPlay(o,'Idle',0);
  mixer.update(rnd(0,2));
  return o;
}
function charPlay(o,nm,fade,ts){
  var a=o.acts[nm];if(!a)return;
  if(o.cur!==nm){
    var prev=o.cur&&o.acts[o.cur];a.reset();a.enabled=true;a.setEffectiveWeight(1);a.play();
    if(prev){var f=fade==null?0.2:fade;if(f>0)a.crossFadeFrom(prev,f,false);else prev.stop()}
    o.cur=nm;
  }
  a.timeScale=ts||1;
}
var cornerSign=[[-1,-1],[1,-1],[1,1],[-1,1]],PDIR=[[1,0],[0,1],[-1,0],[0,-1]];
function cornerPos(bi,bj,k,ins){return [bc(bi)+cornerSign[k][0]*ins,bc(bj)+cornerSign[k][1]*ins]}
function initPed(p,anywhere){
  var bi,bj,tries=0;
  do{bi=rint(0,N-1);bj=rint(0,N-1);tries++}while(!anywhere&&tries<30&&Math.hypot(bc(bi)-player.x,bc(bj)-player.z)<90);
  p.bi=bi;p.bj=bj;p.k=rint(0,3);p.land=false;p.cross=null;p.ins=28+rnd(-0.8,0.8);p.sp=rnd(1.3,1.8);p.flee=0;
  var a=cornerPos(bi,bj,(p.k+3)%4,p.ins),b=cornerPos(bi,bj,p.k,p.ins),t=Math.random();
  p.x=a[0]+(b[0]-a[0])*t;p.z=a[1]+(b[1]-a[1])*t;p.dead=0;
  if(p.o){p.o.cur=null;charPlay(p.o,'Walk',0)}
}
function spawnPed(){
  var p={o:makeChar(pick(CHAR_FILES)),dead:0};initPed(p,true);peds.push(p);return p;
}
function pedStep(p,dt){
  var o=p.o,near=(p.x-camera.position.x)*(p.x-camera.position.x)+(p.z-camera.position.z)*(p.z-camera.position.z)<130*130;
  o.g.visible=near;
  if(p.dead){
    p.dead-=dt;if(p.dead<=0)initPed(p,false);
    if(near)o.mixer.update(dt);o.g.position.set(p.x,0.02,p.z);return;
  }
  var tgt=cornerPos(p.bi,p.bj,p.k,p.ins),dx=tgt[0]-p.x,dz=tgt[1]-p.z,d=Math.hypot(dx,dz),moving=true;
  var sp=p.sp*(p.flee>0?2.6:1)*(p.land?1.35:1);
  if(p.flee>0)p.flee-=dt;
  if(d<0.6){
    if(p.land){p.land=false;p.k=(p.k+1)%4}
    else{
      if(!p.cross&&Math.random()<0.35){
        var dv=PDIR[p.k],nbi=p.bi+dv[0],nbj=p.bj+dv[1];
        if(nbi>=0&&nbi<N&&nbj>=0&&nbj<N){
          var ni,nj;
          if(dv[0]!==0){ni=Math.max(p.bi,nbi);nj=cornerSign[p.k][1]<0?p.bj:p.bj+1}else{nj=Math.max(p.bj,nbj);ni=cornerSign[p.k][0]<0?p.bi:p.bi+1}
          p.cross={bi:nbi,bj:nbj,ni:ni,nj:nj,ax:dv[0]!==0?'z':'x'};
        }else p.k=(p.k+1)%4;
      }else if(!p.cross)p.k=(p.k+1)%4;
      if(p.cross){
        if(p.flee>0||sigInfo(p.cross.ni,p.cross.nj,S.clockT)[p.cross.ax]==='r'){
          p.bi=p.cross.bi;p.bj=p.cross.bj;p.k=(p.k+3)%4;p.land=true;p.cross=null;
        }else moving=false;
      }
    }
  }else{p.x+=dx/d*sp*dt;p.z+=dz/d*sp*dt;o.g.rotation.y=Math.atan2(dx,dz)+CH_YAW}
  if(near){
    if(!moving||d<0.6&&!p.land)charPlay(o,'Idle',0.25,1);
    else if(p.flee>0)charPlay(o,'Run',0.15,1);
    else charPlay(o,'Walk',0.2,sp/1.5);
    o.mixer.update(dt);
  }
  o.g.position.set(p.x,0.02,p.z);
}
function killPed(p,byPlayer){
  if(p.dead)return;p.dead=12;
  charPlay(p.o,'Death',0.05,1);
  for(var k=0;k<5;k++)spawnP(p.x,0.8,p.z,rnd(-2,2),rnd(1,4),rnd(-2,2),0.45,0.18,0xcfc9bd,10);
  if(byPlayer){addHeat(1,2);toast('Pedestrian down. Heat up')}
}
/* player model with a pistol in the right hand */
var gunMesh=null;
function setPlayerChar(name){
  if(player.obj){scene.remove(player.obj.g)}
  var o=makeChar(name);player.obj=o;CFG.char=name;
  if(o.hand){
    gunMesh=new T.Mesh(new T.BoxGeometry(0.03,0.05,0.2),new T.MeshStandardMaterial({color:0x1c1d20,roughness:0.5,metalness:0.6}));
    o.g.updateMatrixWorld(true);var ws=new T.Vector3();o.hand.getWorldScale(ws);gunMesh.scale.setScalar(1/Math.max(ws.x,1e-4)*1.6);gunMesh.position.set(0,0.05,0.09).multiplyScalar(1/Math.max(ws.x,1e-4));o.hand.add(gunMesh);
  }
  o.g.visible=S.mode==='foot';
}
function cc2(o){return chCache[o.name]?chCache[o.name].s:1}

/* =============================================================== particles, tracers */
var dummy=new T.Object3D();
var PMAX=220,pm=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:0xffffff}),PMAX),pa=[],pIdx=0,pcol=new T.Color();
pm.frustumCulled=false;
for(var q2=0;q2<PMAX;q2++){pa.push({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,s:1,g:9});pm.setColorAt(q2,pcol.setHex(0xffffff))}
scene.add(pm);
function spawnP(x,y,z,vx,vy,vz,life,s,hex,g){
  var idx=pIdx++%PMAX,p=pa[idx];p.life=p.max=life;p.x=x;p.y=y;p.z=z;p.vx=vx;p.vy=vy;p.vz=vz;p.s=s;p.g=g==null?9:g;
  pm.setColorAt(idx,pcol.setHex(hex));pm.instanceColor.needsUpdate=true;
}
function updateParticles(dt){
  for(var k=0;k<PMAX;k++){
    var p=pa[k];
    if(p.life>0){
      p.life-=dt;p.vy-=p.g*dt;p.x+=p.vx*dt;p.y=Math.max(0.1,p.y+p.vy*dt);p.z+=p.vz*dt;
      var s=p.s*Math.max(0,p.life/p.max);
      dummy.position.set(p.x,p.y,p.z);dummy.scale.set(s,s,s);
    }else{dummy.scale.set(0,0,0);dummy.position.set(0,-50,0)}
    dummy.updateMatrix();pm.setMatrixAt(k,dummy.matrix);
  }
  pm.instanceMatrix.needsUpdate=true;
}
var tracers=[];
for(var q3=0;q3<8;q3++){var tm=new T.Mesh(new T.BoxGeometry(0.06,0.06,1),new T.MeshBasicMaterial({color:0xffe2a0}));tm.visible=false;scene.add(tm);tracers.push({m:tm,t:0})}
function tracer(x1,y1,z1,x2,y2,z2,color){
  var tr=null;for(var k=0;k<tracers.length;k++)if(tracers[k].t<=0){tr=tracers[k];break}
  if(!tr)tr=tracers[0];
  tr.t=0.08;var m=tr.m;m.position.set((x1+x2)/2,(y1+y2)/2,(z1+z2)/2);
  m.scale.set(1,1,Math.max(0.1,Math.hypot(x2-x1,y2-y1,z2-z1)));m.lookAt(x2,y2,z2);m.material.color.setHex(color||0xffe2a0);m.visible=true;
}

/* =============================================================== 6. INPUT AND AUDIO */
var AC=null,master,eng1,eng2,engG,sirenO,sirenG,noiseBuf,skidG,hornA,hornB,hornG,radioG,muted=false;
function initAudio(){
  if(AC)return;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    master=AC.createGain();master.gain.value=CFG.vol*0.8;master.connect(AC.destination);
    var f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=420;
    eng1=AC.createOscillator();eng1.type='sawtooth';eng2=AC.createOscillator();eng2.type='square';
    engG=AC.createGain();engG.gain.value=0;eng1.connect(f);eng2.connect(f);f.connect(engG);engG.connect(master);eng1.start();eng2.start();
    sirenO=AC.createOscillator();sirenO.type='square';var sf=AC.createBiquadFilter();sf.type='lowpass';sf.frequency.value=1500;
    sirenG=AC.createGain();sirenG.gain.value=0;sirenO.connect(sf);sf.connect(sirenG);sirenG.connect(master);sirenO.start();
    noiseBuf=AC.createBuffer(1,Math.floor(AC.sampleRate*1.2),AC.sampleRate);
    var d=noiseBuf.getChannelData(0);for(var k=0;k<d.length;k++)d[k]=Math.random()*2-1;
    var ns=AC.createBufferSource();ns.buffer=noiseBuf;ns.loop=true;var bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.value=1700;bp.Q.value=1.4;
    skidG=AC.createGain();skidG.gain.value=0;ns.connect(bp);bp.connect(skidG);skidG.connect(master);ns.start();
    hornA=AC.createOscillator();hornA.type='sawtooth';hornA.frequency.value=392;hornB=AC.createOscillator();hornB.type='sawtooth';hornB.frequency.value=494;
    hornG=AC.createGain();hornG.gain.value=0;var hf=AC.createBiquadFilter();hf.type='lowpass';hf.frequency.value=1800;
    hornA.connect(hf);hornB.connect(hf);hf.connect(hornG);hornG.connect(master);hornA.start();hornB.start();
    radioG=AC.createGain();radioG.gain.value=0.5;radioG.connect(master);
  }catch(e){AC=null}
}
function applyVolume(){if(master)master.gain.value=muted?0:CFG.vol*0.8}
function burst(vol,freq,dur){
  if(!AC||muted||!noiseBuf)return;
  var s=AC.createBufferSource();s.buffer=noiseBuf;var f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=freq;
  var g=AC.createGain();g.gain.setValueAtTime(vol,AC.currentTime);g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+dur);
  s.connect(f);f.connect(g);g.connect(master);s.start();s.stop(AC.currentTime+dur+0.05);
}
function nearestCop(){
  var p=S.mode==='car'&&S.car?S.car:player,best=1e9;
  for(var k=0;k<cars.length;k++){var c=cars[k];if(c.mode==='police'){var d=Math.hypot(c.x-p.x,c.z-p.z);if(d<best)best=d}}
  return best;
}
/* tiny generative radio: two stations */
var STATIONS=[null,{name:'Harbor FM',bpm:84,wave:'triangle',prog:[57,53,48,55],lead:[0,3,5,7,10,12],hat:false},{name:'Neon 88',bpm:116,wave:'square',prog:[50,46,53,48],lead:[0,2,4,7,9,12],hat:true}];
var radioNext=0,radioStep=0;
function mtof(m){return 440*Math.pow(2,(m-69)/12)}
function tone(t,f,dur,type,vol,dest){
  var o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.015);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g);g.connect(dest);o.start(t);o.stop(t+dur+0.05);
}
function radioTick(){
  var st=STATIONS[S.radio];if(!AC||!st||S.mode!=='car'||muted)return;
  var step=60/st.bpm/2;
  if(radioNext<AC.currentTime-0.5)radioNext=AC.currentTime+0.05;
  while(radioNext<AC.currentTime+0.25){
    var bar=Math.floor(radioStep/8)%4,root=st.prog[bar],i=radioStep%8;
    if(i%2===0)tone(radioNext,mtof(root-12),step*1.8,st.wave,0.16,radioG);
    if(i===0||i===3||i===5)[0,4,7].forEach(function(iv){tone(radioNext,mtof(root+iv),step*2.2,'sine',0.05,radioG)});
    if(Math.random()<0.6)tone(radioNext,mtof(root+12+pick(st.lead)),step*0.9,st.wave==='square'?'square':'sine',0.045,radioG);
    if(st.hat&&i%2===1){var s=AC.createBufferSource();s.buffer=noiseBuf;var hf=AC.createBiquadFilter();hf.type='highpass';hf.frequency.value=7000;var hg=AC.createGain();hg.gain.setValueAtTime(0.05,radioNext);hg.gain.exponentialRampToValueAtTime(0.001,radioNext+0.05);s.connect(hf);hf.connect(hg);hg.connect(radioG);s.start(radioNext);s.stop(radioNext+0.08)}
    radioNext+=step;radioStep++;
  }
}
function updateAudio(){
  if(!AC)return;var t=AC.currentTime,inCar=S.mode==='car'&&S.car;
  var sp=inCar?Math.hypot(S.car.vx,S.car.vz):0,thr=inCar?Math.abs(getInput().mz):0;
  eng1.frequency.setTargetAtTime(38+sp*3.4+thr*8,t,0.06);eng2.frequency.setTargetAtTime(19+sp*1.7+thr*4,t,0.06);
  engG.gain.setTargetAtTime(muted||!inCar?0:0.05+Math.min(sp/40,1)*0.06+thr*0.03,t,0.1);
  var cd=nearestCop();
  sirenG.gain.setTargetAtTime(muted||S.stars===0||cd>150?0:0.03*(1-cd/150),t,0.1);
  sirenO.frequency.setTargetAtTime(Math.floor(S.clockT*2.2)%2?720:960,t,0.03);
  skidG.gain.setTargetAtTime(muted||!inCar?0:(S.car.slipAmt||0)*0.14,t,0.05);
  hornG.gain.setTargetAtTime(muted||!inCar||!S.horn?0:0.07,t,0.02);
  radioG.gain.setTargetAtTime(S.radio&&inCar?0.55:0,t,0.15);
  radioTick();
}
var keys={},stick={x:0,y:0,id:null},touchFire=false,touchHB=false,mouseDown=false;
var isTouch=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
window.addEventListener('keydown',function(e){
  if(e.repeat&&e.code!=='KeyF')return;
  keys[e.code]=true;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)>=0)e.preventDefault();
  if(!S.started||S.paused&&e.code!=='KeyP')return;
  if(e.code==='KeyE')S.act=true;
  if(e.code==='KeyM'){muted=!muted;applyVolume();toast(muted?'Sound off':'Sound on')}
  if(e.code==='KeyP')togglePause();
  if(e.code==='KeyL'){S.lights=!S.lights;toast(S.lights?'Headlights on':'Headlights off')}
  if(e.code==='KeyR'){S.radio=(S.radio+1)%STATIONS.length;toast(S.radio?'Radio: '+STATIONS[S.radio].name:'Radio off')}
});
window.addEventListener('keyup',function(e){keys[e.code]=false});
window.addEventListener('blur',function(){keys={}});
function getInput(){
  var mx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+stick.x;
  var mz=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)+stick.y;
  var m=Math.hypot(mx,mz);if(m>1){mx/=m;mz/=m}
  S.horn=!!keys.KeyH;
  return {mx:mx,mz:mz,sprint:!!(keys.ShiftLeft||keys.ShiftRight)||Math.hypot(stick.x,stick.y)>0.92,fire:!!(keys.KeyF||mouseDown||touchFire),hb:!!(keys.Space||touchHB)};
}
function look(dx,dy){
  var k=CFG.sens;
  if(S.mode==='car'){cam.off-=dx*0.0026*k;cam.idle=0}else cam.yaw-=dx*0.0026*k;
  cam.pitch=clamp(cam.pitch+dy*0.0022*k,0.06,1.15);
}
canvas.addEventListener('mousemove',function(e){
  if(!S.started||S.paused)return;
  if(document.pointerLockElement===canvas||(e.buttons&1))look(e.movementX||0,e.movementY||0);
});
function lockPointer(){if(isTouch)return;try{var pr=canvas.requestPointerLock();if(pr&&pr.catch)pr.catch(function(){})}catch(er){}}
canvas.addEventListener('mousedown',function(e){
  if(e.button!==0)return;
  if(S.started&&!S.paused&&!document.pointerLockElement)lockPointer();
  mouseDown=true;
});
window.addEventListener('mouseup',function(){mouseDown=false});
canvas.addEventListener('contextmenu',function(e){e.preventDefault()});
var lookPtr=null,lastX=0,lastY=0;
canvas.addEventListener('pointerdown',function(e){if(e.pointerType==='touch'&&lookPtr===null){lookPtr=e.pointerId;lastX=e.clientX;lastY=e.clientY}});
canvas.addEventListener('pointermove',function(e){if(e.pointerType==='touch'&&e.pointerId===lookPtr&&S.started&&!S.paused){look((e.clientX-lastX)*1.4,(e.clientY-lastY)*1.1);lastX=e.clientX;lastY=e.clientY}});
function endLook(e){if(e.pointerId===lookPtr)lookPtr=null}
canvas.addEventListener('pointerup',endLook);canvas.addEventListener('pointercancel',endLook);
var stickEl=$('stick'),nub=$('nub');
function stickMove(e){
  var r=stickEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  var dx=(e.clientX-cx)/(r.width/2),dy=(e.clientY-cy)/(r.height/2),m=Math.hypot(dx,dy);
  if(m>1){dx/=m;dy/=m}
  stick.x=dx;stick.y=-dy;nub.style.transform='translate('+(dx*38)+'px,'+(dy*38)+'px)';
}
stickEl.addEventListener('pointerdown',function(e){stick.id=e.pointerId;try{stickEl.setPointerCapture(e.pointerId)}catch(er){}stickMove(e);e.preventDefault()});
stickEl.addEventListener('pointermove',function(e){if(e.pointerId===stick.id)stickMove(e)});
function stickEnd(e){if(e.pointerId===stick.id){stick.id=null;stick.x=stick.y=0;nub.style.transform=''}}
stickEl.addEventListener('pointerup',stickEnd);stickEl.addEventListener('pointercancel',stickEnd);
$('btnAct').addEventListener('pointerdown',function(e){S.act=true;e.preventDefault()});
$('btnFire').addEventListener('pointerdown',function(e){touchFire=S.mode==='foot';touchHB=S.mode==='car';e.preventDefault()});
['pointerup','pointercancel','pointerleave'].forEach(function(n){$('btnFire').addEventListener(n,function(){touchFire=false;touchHB=false})});

/* =============================================================== 7. PLAYER AND COMBAT */
var cache={},toastT=0,banT=0;
function setText(id,v){if(cache[id]!==v){cache[id]=v;$(id).textContent=v}}
function toast(msg){var t=$('toast');t.textContent=msg;t.classList.add('show');toastT=2.4}
function banner(title,sub,dur){$('banTitle').textContent=title;$('banSub').textContent=sub||'';$('banner').classList.add('show');banT=dur||2.5}
var starsEl=$('stars');for(var s0=0;s0<5;s0++){var sp0=document.createElement('span');sp0.textContent='★';starsEl.appendChild(sp0)}
function addHeat(n,cap){
  var old=S.stars;S.stars=Math.max(S.stars,Math.min(cap==null?5:cap,S.stars+n));S.coolT=0;
  if(S.stars>old)toast('Wanted level '+S.stars);
}
function hurtPlayer(a,quiet){
  if(S.dead>0)return;S.hp-=a;S.hurtT=0;
  if(!quiet&&a>3){cam.shake=Math.min(1,cam.shake+0.3);burst(0.2,700,0.25)}
  if(S.hp<=0){S.hp=0;goDown()}
}
function goDown(){
  S.dead=3.2;banner('DOWN','The clinic will patch you up',3);
  if(S.mission)failMission('You went down');
}
function respawn(cost){
  S.cash-=Math.min(S.cash,cost);S.hp=100;S.stars=0;S.coolT=0;S.dead=0;S.caughtT=0;
  if(S.mode==='car'&&S.car){S.car.mode='parked';S.car=null}
  S.mode='foot';player.x=RESPAWN.x;player.z=RESPAWN.z;player.obj.g.visible=true;
  cars.forEach(function(c){if(c.mode==='police')c.mode='traffic'});
  $('banner').classList.remove('show');SAVE.cash=S.cash;persist();
}
function nearestCar(){
  var best=null,bd=4.4;
  for(var k=0;k<cars.length;k++){
    var c=cars[k];if(c.mode!=='parked'&&c.mode!=='traffic')continue;
    var d=Math.hypot(c.x-player.x,c.z-player.z);if(d<bd){bd=d;best=c}
  }
  return best;
}
function enterCar(c){
  if(c.cop){toast('That is a patrol car');return}
  if(c.mode==='traffic'){
    var p=peds[0],lx=Math.cos(c.h),lz=-Math.sin(c.h);
    p.x=c.x+lx*2.6;p.z=c.z+lz*2.6;p.dead=0;p.flee=7;p.cross=null;p.o.cur=null;
    p.bi=cellI(p.x);p.bj=cellI(p.z);p.k=rint(0,3);p.land=false;
    addHeat(1,2);toast('Carjacked');
  }
  c.mode='player';S.mode='car';S.car=c;player.obj.g.visible=false;
  c.g.add(headSpot);headSpot.position.set(0,1.1,1.8);c.g.add(headSpot.target);headSpot.target.position.set(0,0.4,16);
  cam.off=0;
  if(S.mission&&S.mission.car===c&&S.mission.steps[S.mission.idx].type==='steal')advanceMission();
}
function exitCar(){
  var c=S.car,lx=Math.cos(c.h),lz=-Math.sin(c.h),sides=[2.4,-2.4],ok=false;
  for(var k=0;k<2;k++){var x=c.x+lx*sides[k],z=c.z+lz*sides[k];if(!blocked(x,z)){player.x=x;player.z=z;ok=true;break}}
  if(!ok){player.x=c.x+lx*2.4;player.z=c.z+lz*2.4}
  c.mode='parked';S.mode='foot';S.car=null;player.obj.g.visible=true;player.yaw=c.h;cam.yaw=c.h;
}
function doAct(){
  if(S.dead>0)return;
  if(S.mode==='car'){
    if(Math.hypot(S.car.vx,S.car.vz)>9){toast('Slow down first');return}
    exitCar();
  }else{var c=nearestCar();if(c)enterCar(c)}
}
function fire(){
  var ox=player.x,oz=player.z,dx=Math.sin(cam.yaw),dz=Math.cos(cam.yaw),range=70,k;
  player.yaw=cam.yaw;
  var tb=range;for(var t=1;t<range;t+=1){if(blocked(ox+dx*t,oz+dz*t)){tb=t;break}}
  var bestT=tb,hit=null,type=null;
  for(k=0;k<peds.length;k++){
    var p=peds[k];if(p.dead)continue;
    var ex=p.x-ox,ez=p.z-oz,t2=ex*dx+ez*dz;
    if(t2>0&&t2<bestT&&Math.abs(-ex*dz+ez*dx)<0.7){bestT=t2;hit=p;type='ped'}
  }
  for(k=0;k<cars.length;k++){
    var c=cars[k];if(c.mode==='player'||c.mode==='wreck')continue;
    var cx=c.x-ox,cz=c.z-oz,t3=cx*dx+cz*dz;
    if(t3>0&&t3<bestT&&Math.abs(-cx*dz+cz*dx)<1.6){bestT=t3;hit=c;type='car'}
  }
  tracer(ox+dx*0.9,1.3,oz+dz*0.9,ox+dx*bestT,1.2,oz+dz*bestT);
  spawnP(ox+dx*0.9,1.3,oz+dz*0.9,0,0.3,0,0.06,0.35,0xffe08a,0);
  burst(0.18,2200,0.12);
  if(type==='ped')killPed(hit,true);
  else if(type==='car'){
    hurtCar(hit,hit.cop?9:13);
    for(var q=0;q<4;q++)spawnP(ox+dx*bestT,1.1,oz+dz*bestT,rnd(-3,3),rnd(1,4),rnd(-3,3),0.3,0.15,0xffdc8a,10);
    if(hit.cop)addHeat(2,3);else addHeat(1,1);
  }else if(bestT<range){
    for(var q2=0;q2<3;q2++)spawnP(ox+dx*bestT,1.2,oz+dz*bestT,rnd(-2,2),rnd(1,3),rnd(-2,2),0.3,0.14,0xd8d0b8,10);
  }
}
function updateFoot(dt){
  var inp=getInput(),fx=Math.sin(cam.yaw),fz=Math.cos(cam.yaw),rx=-fz,rz=fx;
  var dx=fx*inp.mz+rx*inp.mx,dz=fz*inp.mz+rz*inp.mx,m=Math.hypot(dx,dz),spd=0;
  if(S.dead>0)m=0;
  var o=player.obj;
  if(m>0.05){
    dx/=m;dz/=m;spd=(inp.sprint?7.6:4.4)*Math.min(1,m);
    player.x+=dx*spd*dt;player.z+=dz*spd*dt;
    player.yaw+=angDiff(player.yaw,Math.atan2(dx,dz))*(1-Math.exp(-14*dt));
  }
  var aiming=inp.fire&&S.dead<=0;
  if(aiming){player.yaw+=angDiff(player.yaw,cam.yaw)*(1-Math.exp(-20*dt));S.fireT-=dt;if(S.fireT<=0){S.fireT=0.22;fire()}}else S.fireT=Math.max(0,S.fireT-dt);
  resolveCircle(player,0.5);
  player.x=clamp(player.x,-BOUND,BOUND);player.z=clamp(player.z,-BOUND,BOUND);
  player.inv-=dt;
  for(var k=0;k<cars.length;k++){
    var c=cars[k],ex=player.x-c.x,ez=player.z-c.z;
    if(ex*ex+ez*ez>16)continue;
    var cfx=Math.sin(c.h),cfz=Math.cos(c.h),a=ex*cfx+ez*cfz,l=-ex*cfz+ez*cfx;
    var sp=Math.hypot(c.vx,c.vz);
    if(Math.abs(a)<2.7&&Math.abs(l)<1.55){
      if(sp>4&&c.mode!=='wreck'){
        if(player.inv<=0){player.inv=0.8;hurtPlayer(sp*1.7);player.x+=c.vx*0.12;player.z+=c.vz*0.12}
      }else{
        var pa2=2.7-Math.abs(a),pl=1.55-Math.abs(l);
        if(pa2<pl){var s1=Math.sign(a)||1;player.x+=cfx*s1*pa2;player.z+=cfz*s1*pa2}
        else{var s2=Math.sign(l)||1;player.x+=-cfz*s2*pl;player.z+=cfx*s2*pl}
      }
    }
  }
  if(S.dead>0)charPlay(o,'Death',0.1,1);
  else if(spd>0.5)charPlay(o,spd>6?'Run':'Walk',0.15,spd>6?1:spd/3.2);
  else charPlay(o,'Idle',0.2,1);
  o.mixer.update(dt);
  o.g.position.set(player.x,0.02,player.z);o.g.rotation.y=player.yaw+CH_YAW;
}

/* =============================================================== 8. MISSIONS AND WANTED LEVEL */
var givers=[
  {kind:'courier',name:'Dockside Courier',x:nx(6),z:nz(5),cool:0},
  {kind:'wheels',name:'Borrowed Wheels',x:nx(3),z:nz(3),cool:0},
  {kind:'loop',name:'Harbor Loop',x:nx(5),z:nz(2),cool:0},
  {kind:'taxi',name:'Night Fare',x:nx(2),z:nz(6),cool:0},
  {kind:'heat',name:'Heat Run',x:nx(7),z:nz(4),cool:0}
];
function markerMesh(hex,h,r){
  var g=new T.Group();
  var m=new T.MeshBasicMaterial({color:hex,transparent:true,opacity:0.32,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,fog:false});
  var cyl=new T.Mesh(new T.CylinderGeometry(r,r,h,20,1,true),m);cyl.position.y=h/2;g.add(cyl);
  var ring=new T.Mesh(new T.RingGeometry(r*0.8,r,28),new T.MeshBasicMaterial({color:hex,transparent:true,opacity:0.7,side:T.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=0.2;g.add(ring);
  scene.add(g);return g;
}
givers.forEach(function(g){g.mesh=markerMesh(0xf3a83b,16,3.2);g.mesh.position.set(g.x,0,g.z)});
var beacon=markerMesh(0x4fe0f0,140,3.2);beacon.visible=false;
function randNode(from,minD){
  for(var t=0;t<60;t++){
    var i=rint(1,N-1),j=rint(1,N-1),x=nx(i),z=nz(j);
    if(Math.hypot(x-from[0],z-from[1])>=minD)return [x,z];
  }
  return [nx(2),nz(2)];
}
function startMission(g){
  var from=[g.x,g.z],m=null,dd=function(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])};
  if(g.kind==='courier'){
    var a=randNode(from,140),b=randNode(a,170);
    m={title:'Dockside Courier',reward:380,steps:[{type:'goto',pos:a,text:'Collect the parcel at the warehouse'},{type:'goto',pos:b,text:'Hand it to the buyer'}]};
    m.t=(dd(a,from)+dd(b,a))/8+30;
  }else if(g.kind==='wheels'){
    var sp=curbSpot(),car=spawnParked('sport',0xd9a21b);car.x=sp.x;car.z=sp.z;car.h=sp.h;car.hPrev=sp.h;
    var G=randNode([sp.x,sp.z],200);
    m={title:'Borrowed Wheels',reward:780,car:car,steps:[{type:'steal',text:'Take the gold sports car'},{type:'cardeliver',pos:G,text:'Bring it to the garage'}]};
    m.t=(dd([sp.x,sp.z],from)+dd(G,[sp.x,sp.z]))/9+55;
  }else if(g.kind==='taxi'){
    var p1=randNode(from,120),p2=randNode(p1,200);
    m={title:'Night Fare',reward:460,steps:[{type:'goto',pos:p1,need:true,text:'Pick up the fare. Arrive in a car'},{type:'goto',pos:p2,need:true,text:'Drop them at the hotel, no rough driving'}]};
    m.t=(dd(p1,from)+dd(p2,p1))/10+35;
  }else if(g.kind==='heat'){
    var h1=randNode(from,200),h2=randNode(h1,200);
    m={title:'Heat Run',reward:1100,steps:[{type:'goto',pos:h1,need:true,text:'Grab the package. Patrols are alerted'},{type:'goto',pos:h2,need:true,text:'Deliver it before the clock runs out'}],heat:2};
    m.t=(dd(h1,from)+dd(h2,h1))/11+40;
  }else{
    var pts=[],cur=from,tot=0;
    for(var k=0;k<5;k++){var np=randNode(cur,110);pts.push({type:'goto',pos:np,text:'Checkpoint '+(k+1)+' of 5'});tot+=dd(np,cur);cur=np}
    m={title:'Harbor Loop',reward:520,steps:pts};m.t=tot/13+25;
  }
  m.idx=0;m.limit=m.t;m.kind=g.kind;m.hintT=0;S.mission=m;
  givers.forEach(function(q){q.mesh.visible=false});
  toast(m.title);
  if(m.heat)addHeat(m.heat,m.heat);
}
function missionTarget(){
  var m=S.mission;if(!m)return null;var s=m.steps[m.idx];
  if(s.type==='steal'&&m.car)return [m.car.x,m.car.z];
  return s.pos;
}
function advanceMission(){
  var m=S.mission;if(!m)return;
  var s=m.steps[m.idx];
  if(s.type==='steal'){addHeat(2,2);toast('Alarm. Patrols are on you')}
  m.idx++;
  if(m.idx>=m.steps.length){
    var bonus=Math.round(m.t*2);S.cash+=m.reward+bonus;SAVE.cash=S.cash;SAVE.jobs=(SAVE.jobs||0)+1;S.jobs=SAVE.jobs;
    var bt=SAVE.best[m.kind];if(!bt||m.limit-m.t<bt)SAVE.best[m.kind]=Math.round((m.limit-m.t)*10)/10;
    persist();
    banner('JOB DONE','+$'+(m.reward+bonus),2.4);
    givers.forEach(function(g){if(g.kind===m.kind)g.cool=20});
    S.mission=null;
  }else toast(m.steps[m.idx].text);
}
function failMission(why){
  if(!S.mission)return;
  var t=S.mission.title;S.mission=null;toast(t+' failed. '+why);
  givers.forEach(function(g){g.cool=Math.max(g.cool,8)});
}
function missionUpdate(dt){
  var m=S.mission,px=S.mode==='car'?S.car.x:player.x,pz=S.mode==='car'?S.car.z:player.z;
  if(!m){
    for(var k=0;k<givers.length;k++){
      var g=givers[k];
      if(g.cool>0){g.cool-=dt;g.mesh.visible=false;continue}
      g.mesh.visible=true;
      if(Math.hypot(px-g.x,pz-g.z)<5.5&&S.dead<=0){startMission(g);break}
    }
    beacon.visible=false;return;
  }
  m.t-=dt;
  if(m.t<=0){failMission('Time is up');beacon.visible=false;return}
  var s=m.steps[m.idx];
  if(m.car&&(cars.indexOf(m.car)<0||m.car.mode==='wreck')){failMission('The car is gone');beacon.visible=false;return}
  var tg=missionTarget();
  if(s.type==='goto'){
    if(Math.hypot(px-tg[0],pz-tg[1])<8){
      if(s.need&&S.mode!=='car'){m.hintT-=dt;if(m.hintT<=0){m.hintT=3;toast('Get a car first')}}
      else advanceMission();
    }
  }else if(s.type==='cardeliver'){if(S.car===m.car&&Math.hypot(px-tg[0],pz-tg[1])<9)advanceMission()}
  if(S.mission){var t2=missionTarget();beacon.visible=true;beacon.position.set(t2[0],0,t2[1])}else beacon.visible=false;
}
function policeManage(dt){
  S.pmT-=dt;if(S.pmT>0)return;S.pmT=1;
  var p=S.mode==='car'?S.car:player,k,c;
  if(S.stars===0){
    for(k=0;k<cars.length;k++){c=cars[k];if(c.mode==='police'){c.mode='traffic';c.road=false;var nn=nodeNear(c.x,c.z);c.ni=nn[0];c.nj=nn[1];c.dir=[0,1];c.phase=0;var e=laneE(c.ni,c.nj,c.dir);c.wx=e[0];c.wz=e[1]}}
    return;
  }
  var want=[0,1,2,3,5,6][S.stars],have=0;
  for(k=0;k<cars.length;k++){
    c=cars[k];if(!c.cop||c.mode==='wreck')continue;
    var d=Math.hypot(c.x-p.x,c.z-p.z);
    if(c.mode==='traffic'&&d<260){c.mode='police';c.road=false}
    if(c.mode==='police'){
      have++;
      if(d>330){var s=ringSpot(120,190);recycleTo(c,s);c.mode='police'}
    }
  }
  var spawned=0;
  while(have+spawned<want&&spawned<2){spawnCop('police',true);spawned++}
}
function wantedUpdate(dt){
  var p=S.mode==='car'?S.car:player;
  if(S.stars>0){
    var cd=nearestCop();
    if(cd<60)S.coolT=0;else S.coolT+=dt;
    S.searching=S.coolT>0.5;
    if(S.coolT>9){S.stars--;S.coolT=0;toast(S.stars?'Heat dropping':'You lost them')}
  }else S.searching=false;
  var slow=S.mode==='foot'||Math.hypot(S.car.vx,S.car.vz)<5,near=false;
  if(S.stars>0&&slow){
    for(var k=0;k<cars.length;k++){var c=cars[k];if(c.mode==='police'&&Math.hypot(c.x-p.x,c.z-p.z)<10){near=true;break}}
  }
  if(near)S.caughtT+=dt;else S.caughtT=Math.max(0,S.caughtT-dt*2);
  if(S.caughtT>2.6&&S.dead<=0){
    S.caughtT=0;banner('CAUGHT','Fine paid at the station',3);S.dead=3.2;S.caught=true;
    if(S.mission)failMission('You were caught');
  }
  S.hurtT+=dt;
  if(S.hurtT>6&&S.hp<100&&S.dead<=0)S.hp=Math.min(100,S.hp+4*dt);
}

/* =============================================================== camera, minimap, HUD */
function updateCamera(dt){
  var inCar=S.mode==='car',tgt=inCar?S.car:player,sp=0;
  if(inCar){
    var c=S.car;sp=Math.hypot(c.vx,c.vz);
    cam.idle+=dt;if(cam.idle>1.3)cam.off*=Math.exp(-2.5*dt);
    cam.yaw+=angDiff(cam.yaw,c.h+cam.off)*(1-Math.exp(-4.2*dt));
  }
  var dist=inCar?10.5:5.6,ty=inCar?1.7:1.55,tx=tgt.x,tz=tgt.z,fx=Math.sin(cam.yaw),fz=Math.cos(cam.yaw);
  var hd=dist*Math.cos(cam.pitch),vd=dist*Math.sin(cam.pitch);
  for(var s=1.5;s<hd;s+=1){if(blocked(tx-fx*s,tz-fz*s)){hd=Math.max(1.6,s-1.3);vd=Math.max(vd*hd/(dist*Math.cos(cam.pitch)),1.2);break}}
  cam.shake*=Math.exp(-4*dt);
  var sh=cam.shake*0.5;
  camera.position.set(tx-fx*hd+rnd(-sh,sh),ty+vd+rnd(-sh,sh),tz-fz*hd+rnd(-sh,sh));
  camera.lookAt(tx+fx*1.2,ty+0.2,tz+fz*1.2);
  var fov=62+clamp(sp,0,45)*0.35;
  if(Math.abs(camera.fov-fov)>0.05){camera.fov+=(fov-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix()}
}
var mapC=$('map'),mctx=mapC.getContext('2d'),MS=320,MAPR=150;
var typeCol={city:'#7b786f',park:'#3f6b3d',dock:'#5f6466'};
function drawMap(){
  var px=S.mode==='car'?S.car.x:player.x,pz=S.mode==='car'?S.car.z:player.z,fx=Math.sin(cam.yaw),fz=Math.cos(cam.yaw),cx=MS/2,k=MS/2/MAPR;
  var tm=function(x,z){var dx=x-px,dz=z-pz;return [cx+(-fz*dx+fx*dz)*k,cx-(fx*dx+fz*dz)*k]};
  var poly=function(pts,fill){mctx.beginPath();for(var i=0;i<pts.length;i++){var q=tm(pts[i][0],pts[i][1]);i?mctx.lineTo(q[0],q[1]):mctx.moveTo(q[0],q[1])}mctx.closePath();mctx.fillStyle=fill;mctx.fill()};
  var edge=function(x,z){var q=tm(x,z),dx=q[0]-cx,dy=q[1]-cx,d=Math.hypot(dx,dy),mx=cx-14;if(d>mx){q[0]=cx+dx/d*mx;q[1]=cx+dy/d*mx}return q};
  mctx.clearRect(0,0,MS,MS);
  mctx.fillStyle='#14394a';mctx.fillRect(0,0,MS,MS);
  poly([[-400,-400],[400,-400],[400,400],[-400,400]],'#3a3f46');
  for(var i=0;i<blockInfo.length;i++){
    var b=blockInfo[i];if(Math.hypot(b.cx-px,b.cz-pz)>MAPR+50)continue;
    poly([[b.cx-30,b.cz-30],[b.cx+30,b.cz-30],[b.cx+30,b.cz+30],[b.cx-30,b.cz+30]],typeCol[b.type]||'#7b786f');
  }
  var cl=edge(RESPAWN.x,RESPAWN.z);mctx.fillStyle='#e8efe9';mctx.fillRect(cl[0]-6,cl[1]-2,12,4);mctx.fillRect(cl[0]-2,cl[1]-6,4,12);
  if(!S.mission){givers.forEach(function(g){if(g.cool>0)return;var q=edge(g.x,g.z);mctx.beginPath();mctx.arc(q[0],q[1],7,0,TAU);mctx.fillStyle='#f3a83b';mctx.fill();mctx.strokeStyle='#1b1206';mctx.lineWidth=2;mctx.stroke()})}
  var tg=missionTarget();
  if(tg){var q=edge(tg[0],tg[1]);mctx.beginPath();mctx.arc(q[0],q[1],8,0,TAU);mctx.fillStyle='#4fe0f0';mctx.fill();mctx.strokeStyle='#06262b';mctx.lineWidth=2;mctx.stroke()}
  var flash=Math.floor(S.clockT*3)%2;
  for(var j=0;j<cars.length;j++){
    var c=cars[j];if(c.mode!=='police')continue;
    var q2=edge(c.x,c.z);mctx.beginPath();mctx.arc(q2[0],q2[1],5,0,TAU);mctx.fillStyle=flash?'#ff5a47':'#5aa0ff';mctx.fill();
  }
  var hd=S.mode==='car'?S.car.h:player.yaw;
  mctx.save();mctx.translate(cx,cx);mctx.rotate(cam.yaw-hd);
  mctx.beginPath();mctx.moveTo(0,-11);mctx.lineTo(8,9);mctx.lineTo(0,4);mctx.lineTo(-8,9);mctx.closePath();
  mctx.fillStyle='#eef2ec';mctx.fill();mctx.strokeStyle='#0a1318';mctx.lineWidth=2;mctx.stroke();mctx.restore();
}
function updateHud(dt){
  setText('cash','$'+Math.floor(S.cash).toLocaleString('en-US'));
  var hh=Math.floor(S.hour)%24,mm=Math.floor((S.hour%1)*60);
  setText('clock',(hh<10?'0':'')+hh+':'+(mm<10?'0':'')+mm);
  var kids=starsEl.children;for(var i=0;i<5;i++)kids[i].className=i<S.stars?'on':'';
  starsEl.className=S.searching?'search':'';
  setText('heatLabel',S.stars>0?(S.searching?'LOSING THEM':'WANTED'):'');
  $('hpBar').style.width=Math.max(0,S.hp)+'%';
  var inCar=S.mode==='car';
  $('speedo').hidden=!inCar;$('cross').hidden=inCar;
  if(inCar){setText('spd',String(Math.round(Math.hypot(S.car.vx,S.car.vz)*3.6)));$('carBar').style.width=Math.max(0,S.car.hp/S.car.maxHp*100)+'%'}
  var pr=$('prompt'),txt='';
  if(S.dead<=0){
    if(inCar){if(Math.hypot(S.car.vx,S.car.vz)<=9)txt='<kbd>E</kbd> Get out'}
    else{var nc=nearestCar();if(nc)txt='<kbd>E</kbd> '+(nc.mode==='traffic'?'Take the car (carjack)':'Get in')}
  }
  if(cache.prompt!==txt){cache.prompt=txt;pr.hidden=!txt;pr.innerHTML=txt}
  var jb=$('job'),m=S.mission;
  jb.hidden=!m;
  if(m){
    setText('jobTitle',m.title);setText('jobText',m.steps[m.idx].text);
    var tg=missionTarget(),p=inCar?S.car:player;
    setText('jobDist',Math.round(Math.hypot(tg[0]-p.x,tg[1]-p.z))+' m');
    var t=Math.max(0,Math.ceil(m.t));setText('jobTime',Math.floor(t/60)+':'+(t%60<10?'0':'')+(t%60));
  }
  if(toastT>0){toastT-=dt;if(toastT<=0)$('toast').classList.remove('show')}
  if(banT>0){banT-=dt;if(banT<=0&&S.dead<=0)$('banner').classList.remove('show')}
  var bf=$('btnFire');if(bf){var l=inCar?'BRAKE':'FIRE';if(cache.bf!==l){cache.bf=l;bf.textContent=l}var al=inCar?'GET OUT':'GET IN';if(cache.al!==al){cache.al=al;$('btnAct').textContent=al}}
}

/* =============================================================== 10. UPDATE, LOOP, BOOT */
var headLit=0,saveT=0;
function carLightsUpdate(){
  var k=0.08+S.night*1.7;
  carLightMats.forEach(function(m){if(m.emissive){m.emissive.copy(m.name==='Headlights'?new T.Color(1,0.95,0.8):new T.Color(1,0.05,0.03));m.emissiveIntensity=m.name==='Headlights'?k:k*0.7}});
}
var copCol=new T.Color();
function update(dt){
  S.clockT+=dt;S.hour=(S.hour+dt/60)%24;
  if(S.dead>0){
    S.dead-=dt;
    if(S.dead<=0){if(S.caught){S.caught=false;respawn(250)}else respawn(150)}
  }
  if(S.act){S.act=false;doAct()}
  if(S.mode==='foot')updateFoot(dt);
  if(S.mode==='car'&&S.dead>0)stepCar(S.car,dt,0,0,true);
  var k,c,j;
  for(k=0;k<cars.length;k++){
    c=cars[k];
    if(c.mode==='wreck'){c.wreck-=dt;if(c.wreck<=0){removeCar(c);k--;continue}continue}
    if(!(c===S.car&&S.dead>0))carBrain(c,dt);
    if(c.mode==='traffic'||(c.mode==='police'&&S.stars===0)){
      var dd=dist2player(c);
      if(dd>260*260||(c.stuck>5&&dd>60*60))recycle(c);
    }
    if(c.hp<35){c.smoke-=dt;if(c.smoke<=0){c.smoke=0.12;spawnP(c.x+Math.sin(c.h)*1.6,1.1,c.z+Math.cos(c.h)*1.6,rnd(-.4,.4),rnd(1.5,3),rnd(-.4,.4),0.9,0.7,0x3a3a3a,-1)}}
    vehicleFx(c,dt);
  }
  for(k=0;k<cars.length;k++)carWorld(cars[k]);
  for(k=0;k<cars.length;k++)for(j=k+1;j<cars.length;j++)carVsCar(cars[k],cars[j]);
  for(k=0;k<cars.length;k++){
    c=cars[k];var sp=Math.hypot(c.vx,c.vz);if(sp<3||c.mode==='wreck')continue;
    var cfx=Math.sin(c.h),cfz=Math.cos(c.h);
    for(j=0;j<peds.length;j++){
      var p=peds[j];if(p.dead)continue;
      var ex=p.x-c.x,ez=p.z-c.z;if(ex*ex+ez*ez>16)continue;
      var a=ex*cfx+ez*cfz,l=-ex*cfz+ez*cfx;
      if(Math.abs(a)<2.4&&Math.abs(l)<1.4){killPed(p,c.mode==='player');if(c.mode==='player'){cam.shake=Math.min(1,cam.shake+0.2);burst(0.18,700,0.2)}}
    }
  }
  var ph=Math.floor(S.clockT*5)%2;
  for(k=0;k<cars.length;k++){
    c=cars[k];placeCar(c,dt);
    if(c.cop&&c.own){
      var on=c.mode==='police'&&S.stars>0;
      if(c.own.BlueLights){c.own.BlueLights.emissive.setHex(on&&ph?0x2255ff:0x000000);c.own.BlueLights.emissiveIntensity=2}
      if(c.own.WhiteLights){c.own.WhiteLights.emissive.setHex(on&&!ph?0xff2a1a:0x000000);c.own.WhiteLights.emissiveIntensity=2}
    }
  }
  for(k=0;k<peds.length;k++)pedStep(peds[k],dt);
  policeManage(dt);wantedUpdate(dt);missionUpdate(dt);
  for(k=0;k<tracers.length;k++){var tr=tracers[k];if(tr.t>0){tr.t-=dt;if(tr.t<=0)tr.m.visible=false}}
  updateParticles(dt);updateSkids(dt);signalVisual(S.clockT);carLightsUpdate();
  updateSky();updateCamera(dt);updateAudio();
  saveT+=dt;if(saveT>15){saveT=0;SAVE.cash=S.cash;persist()}
}
function populate(){
  var nT=CFG.q==='high'?36:22,nP=CFG.q==='high'?40:22,i;
  for(i=0;i<nT;i++)spawnTraffic();
  for(i=0;i<16;i++)spawnParked();
  spawnCop('traffic');spawnCop('traffic');
  var st=makeCar('sedan',0x3b8fa3,'parked');st.x=48.6;st.z=8;st.h=Math.PI;st.hPrev=Math.PI;
  for(i=0;i<nP;i++)spawnPed();
  cars.forEach(function(c){placeCar(c,0)});
}
var last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  var dt=Math.min((now-last)/1000,0.05);last=now;
  if(S.started&&!S.paused){update(dt);updateHud(dt);drawMap()}
  else if(!S.started){
    S.hour=(S.hour+dt/60)%24;updateSky();signalVisual(S.clockT);S.clockT+=dt;carLightsUpdate();
    var a=now/9000;camera.position.set(Math.sin(a)*260,90,Math.cos(a)*260);camera.lookAt(0,10,0);
    sky.position.copy(camera.position);
  }
  renderer.render(scene,camera);
}
function togglePause(){
  if(!S.started)return;
  S.paused=!S.paused;
  $('menu').hidden=!S.paused;
  if(S.paused){$('go').textContent='Resume';if(document.exitPointerLock)document.exitPointerLock();persist()}
}
function startGame(){
  S.started=true;S.paused=false;$('menu').hidden=true;$('hud').hidden=false;
  if(isTouch)$('touch').hidden=false;
  initAudio();if(AC&&AC.resume)AC.resume();applyVolume();
  lockPointer();last=performance.now();
}
function setupMenu(){
  var cEl=$('optChar');
  CHAR_FILES.forEach(function(n){
    var b=document.createElement('button');b.type='button';b.className='chip';b.textContent=CH_LABEL[n]||n;b.setAttribute('aria-pressed',String(n===CFG.char));
    b.addEventListener('click',function(){
      [].forEach.call(cEl.children,function(x){x.setAttribute('aria-pressed','false')});b.setAttribute('aria-pressed','true');
      setPlayerChar(n);persist();
    });
    cEl.appendChild(b);
  });
  var v=$('optVol'),s=$('optSens');v.value=Math.round(CFG.vol*100);s.value=Math.round(CFG.sens*100);
  v.addEventListener('input',function(){CFG.vol=v.value/100;applyVolume();persist()});
  s.addEventListener('input',function(){CFG.sens=s.value/100;persist()});
  var qEl=$('optQ');
  [].forEach.call(qEl.children,function(b){
    b.setAttribute('aria-pressed',String(b.getAttribute('data-q')===CFG.q));
    b.addEventListener('click',function(){
      CFG.q=b.getAttribute('data-q');[].forEach.call(qEl.children,function(x){x.setAttribute('aria-pressed',String(x===b))});
      applyQuality();persist();
    });
  });
  $('go').addEventListener('click',function(){
    if(!S.started)startGame();
    else{S.paused=false;$('menu').hidden=true;lockPointer();last=performance.now()}
  });
  document.addEventListener('pointerlockchange',function(){
    if(!document.pointerLockElement&&S.started&&!S.paused&&!isTouch){S.paused=true;$('menu').hidden=false;$('go').textContent='Resume'}
  });
  if(SAVE.jobs>0)$('saveNote').textContent='Welcome back. Jobs done: '+SAVE.jobs+'. Progress saves in this browser.';
}
function boot(){
  try{
    collectCarLights();applyQuality();buildWorld();setPlayerChar(CFG.char);populate();setupMenu();
    updateSky();
    $('loading').hidden=true;$('menu').hidden=false;$('go').disabled=false;
  }catch(e){$('loadtxt').textContent='Something went wrong while building the city: '+e.message;if(window.console)console.error(e);return}
}
window.__salt={S:S,cars:cars,peds:peds,player:player,cam:cam,start:startGame,update:update,givers:givers,A:A,scene:scene,camera:camera,renderer:renderer,sigInfo:sigInfo,CFG:CFG,setPlayerChar:setPlayerChar,enterCar:enterCar,nearestCar:nearestCar};
loadAssets(function(p){$('loadfill').style.width=Math.round(p*100)+'%'}).then(boot);
requestAnimationFrame(frame);
})();
