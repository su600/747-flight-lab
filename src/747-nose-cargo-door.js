import * as T from 'three';

// Approximate seam on the supplied 747-400 AC model, in native coordinates.
// Forward is -X; the upper end is below and ahead of the cockpit glazing.
export const NOSE_SEAM={slope:-.3,offset:26.4,top:2.9,hinge:new T.Vector3(-25.45,3,0),maxAngle:-Math.PI*.55};
export const noseSeamDistance=p=>p.x+NOSE_SEAM.slope*p.y+NOSE_SEAM.offset;

// Split triangles rather than hiding whole faces. Keep the original material
// groups and linearly interpolate UVs and authored (creased) normals at the cut.
export function splitNoseGeometry(source){
 const p=source.getAttribute('position'),n=source.getAttribute('normal'),uv=source.getAttribute('uv');
 if(!p||!n||!uv||source.index)throw Error('Unsupported 747 fuselage geometry');
 const vertex=i=>({p:new T.Vector3().fromBufferAttribute(p,i),n:new T.Vector3().fromBufferAttribute(n,i),uv:new T.Vector2().fromBufferAttribute(uv,i)});
 const mix=(a,b,t)=>({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t),uv:a.uv.clone().lerp(b.uv,t)});
 const half=(poly,plane,forward)=>{
  const out=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=plane(a.p),db=plane(b.p);
   const ia=forward?da<=0:da>=0,ib=forward?db<=0:db>=0;
   if(ia)out.push(a);
   if(ia!==ib)out.push(mix(a,b,da/(da-db)));
  }
  return out;
 };
 const empty=()=>({p:[],n:[],uv:[],groups:[]}),body=empty(),door=empty();
 const append=(out,poly)=>{for(let i=1;i+1<poly.length;i++)for(const v of [poly[0],poly[i],poly[i+1]]){out.p.push(...v.p);out.n.push(...v.n);out.uv.push(...v.uv);}};
 for(const group of source.groups.length?source.groups:[{start:0,count:p.count,materialIndex:0}]){
  const bs=body.p.length/3,ds=door.p.length/3;
  for(let i=group.start;i<group.start+group.count;i+=3){
   let remaining=[vertex(i),vertex(i+1),vertex(i+2)];
   for(const plane of [noseSeamDistance,p=>p.y-NOSE_SEAM.top]){if(!remaining.length)break;append(body,half(remaining,plane,false));remaining=half(remaining,plane,true);}
   append(door,remaining);
  }
  body.groups.push({start:bs,count:body.p.length/3-bs,materialIndex:group.materialIndex});
  door.groups.push({start:ds,count:door.p.length/3-ds,materialIndex:group.materialIndex});
 }
 const make=data=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(data.n,3));g.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));for(const q of data.groups)if(q.count)g.addGroup(q.start,q.count,q.materialIndex);g.computeBoundingBox();g.computeBoundingSphere();return g;};
 if(door.p.length<9||body.p.length<9)throw Error('747 nose seam misses fuselage');
 return {body:make(body),door:make(door)};
}

// A shallow lined hold, open at the seam (not a solid cap). The cross-section
// stays inside the measured fuselage; the aft wall is well behind the opening.
function cargoInterior(){
 const group=new T.Group();group.name='747-nose-cargo-interior';
 const lining=new T.MeshStandardMaterial({color:0x687579,roughness:.92,side:T.DoubleSide});
 const floor=new T.MeshStandardMaterial({color:0x505c5e,roughness:.86,side:T.DoubleSide});
 const back=new T.MeshStandardMaterial({color:0x293336,roughness:1,side:T.DoubleSide});
 const section=[[-.75,-1.4],[0,-1.72],[.85,-1.72],[1.6,-1.55],[2.25,-1.22],[2.25,1.22],[1.6,1.55],[.85,1.72],[0,1.72],[-.75,1.4]];
 const front=([y,z])=>new T.Vector3(-NOSE_SEAM.offset-NOSE_SEAM.slope*y+.07,y,z);
 const aft=([y,z])=>new T.Vector3(-14,y,z);
 const quad=(a,b,c,d,material,name)=>{const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));geo.computeVertexNormals();const mesh=new T.Mesh(geo,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);};
 for(let i=0;i<section.length;i++){const a=section[i],b=section[(i+1)%section.length];quad(front(a),front(b),aft(b),aft(a),i===section.length-1?floor:lining,i===section.length-1?'747-cargo-floor':'747-cargo-lining');}
 // A distant dark bulkhead gives depth without closing the doorway.
 const center=new T.Vector3(-14,.6,0),vertices=[];
 for(let i=0;i<section.length;i++)vertices.push(...center,...aft(section[i]),...aft(section[(i+1)%section.length]));
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const wall=new T.Mesh(geo,back);wall.name='747-cargo-aft-bulkhead';group.add(wall);
 // Longitudinal floor tracks and transverse ribs make the open hold legible.
 const lines=[];
 for(const z of [-1.1,-.55,0,.55,1.1])lines.push(-NOSE_SEAM.offset-NOSE_SEAM.slope*(-.75)+.10,-.735,z,-14,-.735,z);
 for(const x of [-21,-19,-17,-15])for(let i=0;i<section.length-1;i++){const a=section[i],b=section[i+1];lines.push(x,a[0],a[1],x,b[0],b[1]);}
 const lineGeo=new T.BufferGeometry();lineGeo.setAttribute('position',new T.Float32BufferAttribute(lines,3));const ribs=new T.LineSegments(lineGeo,new T.LineBasicMaterial({color:0xabb7b5}));ribs.name='747-cargo-tracks-and-ribs';group.add(ribs);
 group.visible=false;return group;
}

export function prepare747NoseCargoDoor(root){
 const hull=root.getObjectByName('fuselage#mesh'),cone=root.getObjectByName('nosecone'),cap=root.getObjectByName('fuselage.noseplane');
 if(!hull?.isMesh||!cone||!cap)throw Error('747 nose meshes missing');
 const original=hull.geometry,{body,door}=splitNoseGeometry(original);
 const hinge=new T.Group();hinge.name='747-nose-cargo-hinge';hinge.position.copy(NOSE_SEAM.hinge);hull.parent.add(hinge);
 const panel=hull.clone(false);panel.name='747-nose-cargo-skin';panel.geometry=door;panel.position.copy(NOSE_SEAM.hinge).negate();panel.visible=false;hinge.add(panel);
 // The separate radome belongs to the leaf. attach() preserves its closed pose.
 root.updateMatrixWorld(true);hinge.attach(cone);
 const interior=cargoInterior();hull.parent.add(interior);
 let enabled=false;
 return {hull,original,body,panel,hinge,cone,cap,interior,
  setEnabled(value){if(enabled===!!value)return;enabled=!!value;hull.geometry=enabled?body:original;panel.visible=enabled;cap.visible=!enabled;this.update(0);},
  update(value){const amount=enabled&&Number.isFinite(value)?T.MathUtils.clamp(value,0,1):0;hinge.rotation.z=NOSE_SEAM.maxAngle*amount;interior.visible=enabled&&amount>.001;}
 };
}
