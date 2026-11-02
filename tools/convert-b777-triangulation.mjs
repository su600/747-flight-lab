// Deterministic repair for an audited self-intersecting AC polygon. Dynamic
// programming preserves all original boundary edges and minimizes projected
// overlapping area, but it does not establish a unique manufacturer surface.
export function boundaryPreservingTriangulation(refs,verts){
 if(refs.length<3)throw Error('Polygon requires at least three corners');
 let nx=0,ny=0,nz=0;
 for(let i=0;i<refs.length;i++){const a=verts[refs[i][0]],b=verts[refs[(i+1)%refs.length][0]];nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1]);}
 const axes=Math.abs(nx)>=Math.abs(ny)&&Math.abs(nx)>=Math.abs(nz)?[1,2]:Math.abs(ny)>=Math.abs(nz)?[0,2]:[0,1];
 const points=refs.map(r=>[verts[r[0]][axes[0]],verts[r[0]][axes[1]]]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 let signed=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];signed+=(a[0]*b[1]-b[0]*a[1])/2;}
 if(Math.abs(signed)<1e-14)throw Error('Cannot repair polygon with zero projected area');
 const n=refs.length,dp=Array.from({length:n},()=>Array(n));
 for(let i=0;i<n-1;i++)dp[i][i+1]={triangles:[],oppositeArea:0,absoluteArea:0,degenerate:0};
 for(let length=2;length<n;length++)for(let i=0;i+length<n;i++){
  const j=i+length;let best;
  for(let k=i+1;k<j;k++){
   const left=dp[i][k],right=dp[k][j],triangle=[i,k,j],area=cross(...triangle.map(t=>points[t]))/2;
   const candidate={triangles:[...left.triangles,...right.triangles,triangle],
    oppositeArea:left.oppositeArea+right.oppositeArea+(area*signed<0?Math.abs(area):0),
    absoluteArea:left.absoluteArea+right.absoluteArea+Math.abs(area),
    degenerate:left.degenerate+right.degenerate+(Math.abs(area)<1e-14?1:0)};
   if(!best||candidate.degenerate<best.degenerate||candidate.degenerate===best.degenerate&&candidate.oppositeArea<best.oppositeArea-1e-15)best=candidate;
  }
  dp[i][j]=best;
 }
 const best=dp[0][n-1];
 for(const tri of best.triangles){const area=cross(...tri.map(k=>points[k]))/2;if(area*signed<0)[tri[1],tri[2]]=[tri[2],tri[1]];}
 return {...best,axes,signedArea:signed,extraProjectedArea:Math.max(0,best.absoluteArea-Math.abs(signed))};
}
