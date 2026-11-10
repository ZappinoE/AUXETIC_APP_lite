/* ---------- algebra 3D ---------- */
function rodrigues(w){
  const th=Math.hypot(w[0],w[1],w[2]);
  if(th<1e-12) return [1,-w[2],w[1], w[2],1,-w[0], -w[1],w[0],1];
  const kx=w[0]/th,ky=w[1]/th,kz=w[2]/th,c=Math.cos(th),s=Math.sin(th),v=1-c;
  return [c+kx*kx*v, kx*ky*v-kz*s, kx*kz*v+ky*s,
          ky*kx*v+kz*s, c+ky*ky*v, ky*kz*v-kx*s,
          kz*kx*v-ky*s, kz*ky*v+kx*s, c+kz*kz*v];
}
const mv=(M,x)=>[M[0]*x[0]+M[1]*x[1]+M[2]*x[2], M[3]*x[0]+M[4]*x[1]+M[5]*x[2], M[6]*x[0]+M[7]*x[1]+M[8]*x[2]];
function mm(A,B){const C=new Array(9); for(let i=0;i<3;i++)for(let j=0;j<3;j++) C[3*i+j]=A[3*i]*B[j]+A[3*i+1]*B[3+j]+A[3*i+2]*B[6+j]; return C;}
const mT=A=>[A[0],A[3],A[6],A[1],A[4],A[7],A[2],A[5],A[8]];
function rz(b){const c=Math.cos(b),s=Math.sin(b); return [c,-s,0,s,c,0,0,0,1];}
function logmap(R){
  const tr=R[0]+R[4]+R[8], c=Math.max(-1,Math.min(1,(tr-1)/2)), th=Math.acos(c);
  const vx=R[7]-R[5], vy=R[2]-R[6], vz=R[3]-R[1];
  if(th<1e-6) return [vx/2,vy/2,vz/2];
  const f=th/(2*Math.sin(th)); return [vx*f,vy*f,vz*f];
}
