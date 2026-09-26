(function(root){
const props=[
{id:'door',x:875,y:248,w:115,h:168,action:'visit'},
{id:'corkboard',x:490,y:68,w:126,h:110,action:'show'},
{id:'bookshelf',x:730,y:250,w:124,h:150,action:'read'},
{id:'plant',x:640,y:290,w:66,h:90,action:'inspect'},
{id:'bed',x:123,y:251,w:204,h:145,action:'sleep'},
{id:'chair',x:381,y:255,w:86,h:100,action:'sit'},
{id:'desk',x:445,y:291,w:174,h:109,action:'draw'},
{id:'music-player',x:493,y:249,w:76,h:66,action:'music'},
{id:'toy-box',x:796,y:395,w:118,h:92,action:'play'},
{id:'rug',x:477,y:432,w:246,h:126,action:'sit'},
{id:'cushion',x:212,y:468,w:109,h:66,action:'sit'},
{id:'ball',x:674,y:468,w:48,h:48,action:'play'},
{id:'dumbbell',x:820,y:514,w:72,h:44,action:'exercise'},
{id:'sketchbook',x:371,y:527,w:77,h:61,action:'carry'},
{id:'book',x:120,y:393,w:60,h:66,action:'read'},
{id:'watering-can',x:588,y:530,w:60,h:58,action:'inspect'}];
const anim={idle:{row:0,seq:[0,1,2,3],ms:600},walk:{row:1,seq:[0,1,2,3],ms:160},blink:{row:2,seq:[0,1,2,3],ms:140},happy:{row:3,seq:[0,1,2,3],ms:230},look:{row:4,seq:[0],ms:99999},'reach-right':{row:5,seq:[0,1,2,3],ms:200,hold:true},'reach-left':{row:6,seq:[0,1,2,3],ms:200,hold:true},tap:{row:7,seq:[0,1,2,3],ms:160},sit:{row:8,seq:[0,1,2,3],ms:700,loopFrom:2},sleep:{row:9,seq:[0,1,2,3],ms:1000,loopFrom:2},draw:{row:10,seq:[0,1,2,1,3],ms:500},read:{row:11,seq:[0,1,2,1,3],ms:700},held:{row:12,seq:[0,1,2,3],ms:260,loopFrom:1},land:{row:13,seq:[1,2,3],ms:130,hold:true},exercise:{row:14,seq:[0,1,2,3],ms:450},carry:{row:15,seq:[1,2],ms:230}};
class Room{
constructor(){this.x=470;this.y=380;this.state='idle';this.frame=0;this.clock=0;this.elapsed=0;this.index=0;this.dragging=false;this.falling=false;this.paused=false;this.auto=true;this.next=7000;this.target=null;this.pending=null;this.vy=0;this.selected=null;this.message='Drag him gently, or choose something in his room.';this.deadline=0;this.hops=0;this.doodles=0;this.lastDraw=0;this.facing=1;}
set(s){if(s===this.state)return;this.state=s;this.elapsed=0;this.index=0;this.frame=anim[s].seq[0];}
near(x,y){return props.filter(p=>Math.abs(x-p.x)<p.w/2+25&&Math.abs(y-p.y)<p.h/2+35).sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y))[0]||null}
anchor(p){if(p.action==='sleep')return {x:p.x,y:p.y+12};if(p.id==='desk')return {x:p.x,y:p.y+72};if(p.id==='chair')return{x:p.x,y:p.y+28};return{x:Math.max(65,Math.min(895,p.x)),y:Math.max(320,Math.min(560,p.y+60))}}
use(p){if(this.dragging||this.falling)return;this.selected=p;this.pending=p;this.target=this.anchor(p);this.deadline=0;this.set('walk');this.message='Going to the '+p.id.replaceAll('-',' ') +'.';}
act(p){this.target=null;this.pending=null;this.selected=p;let s={sleep:'sleep',sit:'sit',draw:'draw',read:'read',exercise:'exercise',carry:'carry',inspect:'reach-right',music:'sit',play:'tap',show:'carry',visit:'walk'}[p.action];this.set(s);this.deadline=this.clock+(p.action==='visit'?4500:p.action==='sleep'?22000:12000);this.lastDraw=this.clock;this.message={sleep:'A little nap.',sit:'Just hanging out.',draw:'Making a tiny sketch.',read:'One more page.',exercise:'Tiny reps.',carry:'Bringing his sketchbook along.',inspect:'A closer look.',music:'A quiet little sway. No audio plays.',play:'Play time.',show:'Showing you his sketchbook.',visit:'A quick wander outside. Back soon.'}[p.action];if(p.action==='visit')this.hidden=true;}
pick(x,y){if(this.paused)return false;this.dragging=true;this.falling=false;this.hidden=false;this.target=null;this.pending=null;this.selected=null;this.deadline=0;this.set('held');this.move(x,y);this.message='You have him. Drop him near something to use it.';return true}
move(x,y){if(!this.dragging)return;this.x=Math.max(58,Math.min(902,x));this.y=Math.max(95,Math.min(558,y+80));}
drop(x,y){if(!this.dragging)return;this.move(x,y);this.dragging=false;this.pending=this.near(x,y);this.floor=this.pending?this.anchor(this.pending).y:Math.max(330,Math.min(558,this.y+60));if(this.pending)this.x=this.anchor(this.pending).x;this.vy=0;this.falling=true;this.set('land');this.frame=0;this.message='Soft landing…';}
cancel(){this.dragging=false;this.falling=false;this.pending=null;this.target=null;this.hidden=false;this.set('idle');this.y=Math.max(330,Math.min(558,this.y));this.deadline=0;this.next=this.clock+6000;}
tick(dt){if(this.paused)return;dt=Math.min(dt,80);this.clock+=dt;let a=anim[this.state];this.elapsed+=dt;while(this.elapsed>=a.ms){this.elapsed-=a.ms;this.index++;if(this.index>=a.seq.length)this.index=a.hold?a.seq.length-1:(a.loopFrom||0);this.frame=a.seq[this.index]}
if(this.dragging)return;
if(this.falling){this.frame=0;this.vy+=dt*.0021;this.y+=this.vy*dt;if(this.y>=this.floor){this.y=this.floor;this.falling=false;this.index=0;this.frame=1;this.elapsed=0;this.deadline=this.clock+400;}return}
if(this.state==='land'&&this.deadline&&this.clock>=this.deadline){this.deadline=0;if(this.pending)this.act(this.pending);else{this.set('idle');this.next=this.clock+6000;}return}
if(this.target){let dx=this.target.x-this.x,dy=this.target.y-this.y,d=Math.hypot(dx,dy),step=dt*.10;this.facing=dx<0?-1:1;if(d<=step){this.x=this.target.x;this.y=this.target.y;this.act(this.pending)}else{this.x+=dx/d*step;this.y+=dy/d*step}return}
if(this.state==='draw'&&this.clock-this.lastDraw>5500){this.doodles++;this.lastDraw=this.clock;}
if(this.deadline&&this.clock>=this.deadline){this.deadline=0;this.hidden=false;this.selected=null;this.set('idle');this.next=this.clock+4000;}
if(this.auto&&!this.deadline&&this.clock>=this.next){const pool=props.filter(p=>['sleep','draw','read','sit','exercise','visit'].includes(p.action));this.use(pool[Math.floor(Math.random()*pool.length)]);this.next=this.clock+15000;}
}
}
root.TinyRoom={Room,props,anim};if(typeof module!=='undefined')module.exports=root.TinyRoom;
})(typeof window!=='undefined'?window:globalThis);
