(function(){
  'use strict';
  // 优先本地部署（实验机常处于受限网络），仅当本地文件缺失时才回退到 CDN。
  const SRC='./vendor/three/three.min.js';
  const SRC_FALLBACK='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  let renderer=null,scene=null,camera=null,loading=null,mounted=false;
  function loadThree(){
    if(window.THREE)return Promise.resolve(window.THREE);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      const tryLoad=(urls,i)=>{
        if(i>=urls.length){reject(new Error('Three.js 未能加载（本地与 CDN 均不可用）'));return;}
        const s=document.createElement('script');s.src=urls[i];s.async=true;
        s.onload=()=>window.THREE?resolve(window.THREE):tryLoad(urls,i+1);
        s.onerror=()=>tryLoad(urls,i+1);
        document.head.appendChild(s);
      };
      tryLoad([SRC,SRC_FALLBACK],0);
    });
    return loading;
  }
  function mat(THREE,color,roughness=.65,metalness=.12){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
  function addBox(THREE,parent,pos,size,material,rotation){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),material);
    mesh.position.set(pos[0],pos[1],pos[2]);if(rotation)mesh.rotation.set(rotation[0],rotation[1],rotation[2]);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function build(THREE,host){
    const w=host.clientWidth,h=host.clientHeight;
    scene=new THREE.Scene();
    camera=new THREE.PerspectiveCamera(54,w/h,.1,180);
    camera.position.set(0,2.05,8.5);camera.lookAt(0,1.0,-3.2);
    renderer=new THREE.WebGLRenderer({canvas:document.getElementById('cockpit3d'),alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setSize(w,h,false);
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;

    scene.add(new THREE.HemisphereLight(0xf7fbf5,0x95b7af,1.85));
    const key=new THREE.DirectionalLight(0xfff3d8,1.45);key.position.set(-5,9,7);scene.add(key);
    const fill=new THREE.DirectionalLight(0xffb9a5,.45);fill.position.set(7,4,-5);scene.add(fill);

    // Exterior sky and muted landscape. All 3D elements remain fixed; only the overlay instruments move.
    const sky=new THREE.Mesh(new THREE.SphereGeometry(85,32,20),new THREE.MeshBasicMaterial({color:0x7897aa,side:THREE.BackSide}));
    sky.position.set(0,0,-20);scene.add(sky);
    const horizon=new THREE.Mesh(new THREE.PlaneGeometry(170,30),new THREE.MeshBasicMaterial({color:0x596f68,side:THREE.DoubleSide}));
    horizon.position.set(0,-8,-28);scene.add(horizon);
    const sun=new THREE.Mesh(new THREE.SphereGeometry(2.4,24,16),new THREE.MeshBasicMaterial({color:0xffd78a}));sun.position.set(12,12,-40);scene.add(sun);
    const cloudMat=new THREE.MeshBasicMaterial({color:0xffffff});
    [[-14,5,-29],[10,7,-35],[-2,3,-38]].forEach(([x,y,z],index)=>{
      const cloud=new THREE.Group();
      [[0,0,0,2.1,0.7,0.55],[1.5,.25,0,1.5,.85,.55],[-1.35,.12,0,1.4,.72,.5]].forEach(([cx,cy,cz,sx,sy,sz])=>{
        const puff=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),cloudMat);
        puff.scale.set(sx,sy,sz);puff.position.set(cx,cy,cz);cloud.add(puff);
      });
      cloud.position.set(x,y,z);scene.add(cloud);
    });

    const cabin=new THREE.Group();scene.add(cabin);
    // Dark graphite/steel materials replace the earlier pastel training cockpit.
    const shell=mat(THREE,0x202c35,.72,.38),edge=mat(THREE,0x101a22,.58,.52),trim=mat(THREE,0x667882,.48,.7),soft=mat(THREE,0x35434c,.7,.32);
    // Window surround and side pillars.
    addBox(THREE,cabin,[0,5.15,-7.1],[15,.34,.55],edge);
    addBox(THREE,cabin,[-7.1,2.4,-5.3],[.42,5.6,.56],edge,[0,0,-.11]);
    addBox(THREE,cabin,[7.1,2.4,-5.3],[.42,5.6,.56],edge,[0,0,.11]);
    addBox(THREE,cabin,[0,-.1,-5.2],[14,.38,.65],edge);
    // Side consoles and lower cockpit walls.
    addBox(THREE,cabin,[-6.3,-.2,.0],[2.1,2.9,5.4],shell,[0,0,.11]);
    addBox(THREE,cabin,[6.3,-.2,.0],[2.1,2.9,5.4],shell,[0,0,-.11]);
    addBox(THREE,cabin,[0,-1.45,1.2],[14,.48,6.2],edge);
    // Forward instrument shelf and raised outer bevel. The HTML instruments sit in front of this geometry.
    addBox(THREE,cabin,[0,.25,-1.65],[13.3,2.0,2.3],shell,[.08,0,0]);
    addBox(THREE,cabin,[0,1.22,-2.45],[13.45,.14,.18],trim);
    addBox(THREE,cabin,[0,-.82,-.62],[13.2,.18,2.25],soft);
    addBox(THREE,cabin,[-6.65,.18,-1.5],[.18,1.95,2.3],trim,[0,0,-.08]);
    addBox(THREE,cabin,[6.65,.18,-1.5],[.18,1.95,2.3],trim,[0,0,.08]);
    // Overhead panel.
    addBox(THREE,cabin,[0,4.6,-.15],[5.5,.52,2.4],edge,[.12,0,0]);
    addBox(THREE,cabin,[0,4.31,-.15],[5.2,.08,2.1],trim,[.12,0,0]);
    // Center pedestal and throttle housing.
    addBox(THREE,cabin,[0,-.7,2.55],[2.1,1.15,3.6],shell,[.12,0,0]);
    addBox(THREE,cabin,[0,-.08,2.55],[1.65,.08,2.6],trim,[.12,0,0]);
    // Seat backs on far edges create depth without obscuring the panel.
    addBox(THREE,cabin,[-5.0,-.3,4.1],[1.7,2.8,.5],soft,[0,.12,.03]);
    addBox(THREE,cabin,[5.0,-.3,4.1],[1.7,2.8,.5],soft,[0,-.12,-.03]);

    // Small screws / rivets along the visible dashboard rail.
    const rivetMat=mat(THREE,0xaeb9bf,.42,.78);
    for(let x=-6.1;x<=6.1;x+=1.2){const rivet=new THREE.Mesh(new THREE.SphereGeometry(.035,8,8),rivetMat);rivet.position.set(x,1.34,-2.54);cabin.add(rivet);}
    mounted=true;render();
  }
  function render(){if(renderer&&scene&&camera)renderer.render(scene,camera);}
  function resize(){
    if(!renderer||!camera)return;
    const host=document.getElementById('flightdeckScene');if(!host)return;
    const w=host.clientWidth,h=host.clientHeight;
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);render();
  }
  async function mount(){
    if(mounted){resize();return true;}
    const host=document.getElementById('flightdeckScene');if(!host)return false;
    try{const THREE=await loadThree();build(THREE,host);host.classList.add('three-ready');window.addEventListener('resize',resize);return true;}
    catch(_e){host.classList.add('three-fallback');return false;}
  }
  window.Cockpit3D={mount,resize};
})();
