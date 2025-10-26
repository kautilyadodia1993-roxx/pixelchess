/* =========================================================
   Pixel Chess — Final (Graveyard restored, gameplay untouched)
   - Uses your Start Game button (startGameBtn or newGameBtn)
   - Keeps AI, move rules, timers, sounds, select SFX
   - Restores bubble graveyards exactly like initial
   ========================================================= */

"use strict";

/* ====== Canvas & constants ====== */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const TILE = 80;

/* ====== DOM ====== */
const modeSelect   = document.getElementById('modeSelect');
const aiSideSelect = document.getElementById('aiSideSelect');
const startGameBtn = document.getElementById('startGameBtn') || document.getElementById('newGameBtn');
const passBtn      = document.getElementById('passBtn');
const undoBtn      = document.getElementById('undoBtn');

const whiteClockEl = document.getElementById('whiteClock');
const blackClockEl = document.getElementById('blackClock');
const whiteTimeEl  = document.getElementById('whiteTime');
const blackTimeEl  = document.getElementById('blackTime');
const turnText     = document.getElementById('turnText');

const capturedWhiteEl = document.getElementById('capturedWhite'); // white pieces captured (shown on right/bottom)
const capturedBlackEl = document.getElementById('capturedBlack'); // black pieces captured (shown on left/top)

const promoModal   = document.getElementById('promoModal');
const promoChoices = document.getElementById('promoChoices');

const muteSwitch   = document.getElementById('muteSwitch');

/* ====== Audio ====== */
const A = {
  bgm:     document.getElementById('bgm'),
  move:    document.getElementById('sfx-move'),
  capture: document.getElementById('sfx-capture'),
  tick:    document.getElementById('sfx-tick'),
  error:   document.getElementById('sfx-error'),
  muted:   false,
  play(name){ if(!this.muted){ try{ this[name].currentTime=0; this[name].play(); }catch(e){} } },
  startBgm(){ if(!this.muted){ try{ this.bgm.volume=0.35; this.bgm.play().catch(()=>{});}catch(e){} } },
  stopBgm(){ try{ this.bgm.pause(); }catch(e){} }
};

// Per-piece select sounds (keep your files in assets/audio/select/*.mp3 or .wav)
const selectSounds = {
  king:   new Audio('assets/audio/select/select_king.mp3'),
  queen:  new Audio('assets/audio/select/select_queen.mp3'),
  rook:   new Audio('assets/audio/select/select_rook.mp3'),
  bishop: new Audio('assets/audio/select/select_bishop.mp3'),
  knight: new Audio('assets/audio/select/select_knight.mp3'),
  pawn:   new Audio('assets/audio/select/select_pawn.mp3')
};
Object.values(selectSounds).forEach(a=>{ try{ a.volume=0.8; }catch(e){} });

/* ====== Sound toggle visual (green/red) ====== */
muteSwitch.classList.add('on');
muteSwitch.addEventListener('click', ()=>{
  A.muted = !A.muted;
  muteSwitch.classList.toggle('on', !A.muted);
  muteSwitch.classList.toggle('off', A.muted);
  if(A.muted) A.stopBgm();
  else if(gameStarted) A.startBgm();
});

/* ====== Sprites (mapping you confirmed) ====== */
const pieceSprites = {};
const PIECES = ['king','queen','rook','bishop','knight','pawn'];
const COLORS = ['white','black'];

function loadSprites(){
  COLORS.forEach(color=>{
    PIECES.forEach(piece=>{
      const key = color[0].toUpperCase() + piece[0].toUpperCase()
        .replace('k','K').replace('q','Q').replace('r','R')
        .replace('b','B').replace('k','K').replace('p','P'); // defensive
      const fixedKey = (()=>{
        switch(piece){
          case 'king':   return color[0].toUpperCase()+'K';
          case 'queen':  return color[0].toUpperCase()+'Q';
          case 'rook':   return color[0].toUpperCase()+'R';
          case 'bishop': return color[0].toUpperCase()+'B';
          case 'knight': return color[0].toUpperCase()+'N';
          case 'pawn':   return color[0].toUpperCase()+'P';
        }
      })();
      const img = new Image();
      img.src = `assets/sprites/pieces/${color}_${piece}.png`;
      pieceSprites[fixedKey] = img;
    });
  });
}
loadSprites();

function keyFromCode(code){
  const color = code[0]; // w/b
  const t = code[1];     // k,q,r,b,n,p
  const map = { k:'K', q:'Q', r:'R', b:'B', n:'N', p:'P' };
  return color.toUpperCase() + map[t];
}

/* ====== Game State ====== */
const STATE = {
  board: [],
  turn: 'w',
  selected: null,
  legalMoves: [],
  capturedWhite: [],
  capturedBlack: [],
  castling: { wk:true, wq:true, bk:true, bq:true },
  enPassant: null,
  halfmove: 0,
  history: [],
  timer: { w:45, b:45, id:null },
  gameOver: false,
  mode: 'pvai',
  aiSide: 'b'
};

let gameStarted = false;     // start only after button

// “Pass Turn only after a move” tracking
const PASS = {
  usedThisTurn:false,
  haveMoved:{ w:false, b:false }
};

/* ====== Helpers ====== */
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function inside(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function at(board,r,c){ return inside(r,c) ? board[r][c] : null; }
function colorOf(code){ return code ? (code[0]==='w'?'w':'b') : null; }
function typeOf(code){ return code ? code[1] : null; }
function pieceName(t){ return ({k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'})[t]; }

/* ====== Reset / Init ====== */
function resetBoard(){
  STATE.board = [
    ['br','bn','bb','bq','bk','bb','bn','br'],
    ['bp','bp','bp','bp','bp','bp','bp','bp'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['wp','wp','wp','wp','wp','wp','wp','wp'],
    ['wr','wn','wb','wq','wk','wb','wn','wr']
  ];
  STATE.turn='w';
  STATE.selected=null; STATE.legalMoves=[];
  STATE.capturedWhite=[]; STATE.capturedBlack=[];
  STATE.castling={wk:true,wq:true,bk:true,bq:true};
  STATE.enPassant=null; STATE.halfmove=0; STATE.history=[];
  STATE.timer.w=45; STATE.timer.b=45; updateClocks();
  STATE.gameOver=false;

  PASS.usedThisTurn=false;
  PASS.haveMoved.w=false;
  PASS.haveMoved.b=false;

  renderGraveyards();      // important: show empty slots at start
}

/* ====== Move generation (legal) ====== */
const DIRS = {
  n:[[ -2,-1],[ -2,1],[ -1,-2],[ -1,2],[ 1,-2],[ 1,2],[ 2,-1],[ 2,1]],
  B:[[ -1,-1],[ -1,1],[ 1,-1],[ 1,1]],
  R:[[ -1,0],[ 1,0],[ 0,-1],[ 0,1]],
  K:[[ -1,-1],[ -1,0],[ -1,1],[ 0,-1],[ 0,1],[ 1,-1],[ 1,0],[ 1,1]]
};

function inCheck(board, side){
  let kr=-1,kc=-1; for(let r=0;r<8;r++) for(let c=0;c<8;c++){ if(board[r][c]===(side+'k')){ kr=r; kc=c; } }
  const opp = side==='w'?'b':'w';
  for(const [dr,dc] of DIRS.n){ const rr=kr+dr,cc=kc+dc; if(inside(rr,cc)&&board[rr][cc]===(opp+'n')) return true; }
  for(const [dr,dc] of DIRS.B){ let rr=kr+dr,cc=kc+dc; while(inside(rr,cc)){ const p=board[rr][cc]; if(p){ if(colorOf(p)===opp&&(typeOf(p)==='b'||typeOf(p)==='q')) return true; break;} rr+=dr;cc+=dc; } }
  for(const [dr,dc] of DIRS.R){ let rr=kr+dr,cc=kc+dc; while(inside(rr,cc)){ const p=board[rr][cc]; if(p){ if(colorOf(p)===opp&&(typeOf(p)==='r'||typeOf(p)==='q')) return true; break;} rr+=dr;cc+=dc; } }
  for(const [dr,dc] of DIRS.K){ const rr=kr+dr,cc=kc+dc; if(inside(rr,cc)&&board[rr][cc]===(opp+'k')) return true; }
  const dir=(side==='w')?-1:1;
  if(inside(kr+dir,kc-1)&&board[kr+dir][kc-1]===(opp+'p')) return true;
  if(inside(kr+dir,kc+1)&&board[kr+dir][kc+1]===(opp+'p')) return true;
  return false;
}

function squareAttacked(board,r,c,bySide){
  const fake = board.map(row=>row.slice());
  fake[r][c] = bySide==='w' ? 'bk' : 'wk';
  return inCheck(fake, bySide==='w'?'b':'w');
}

function generateMoves(board, side, castling, enPassant){
  const moves=[];
  const add=(r,c,r2,c2, flags={})=>{ moves.push({r,c,r2,c2, ...flags}); };
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c]; if(!p || colorOf(p)!==side) continue; const t=typeOf(p);
    if(t==='p'){
      const dir = side==='w'? -1 : 1; const start = side==='w'?6:1; const promRow = side==='w'?0:7;
      if(inside(r+dir,c) && !board[r+dir][c]){
        if(r+dir===promRow){ ['q','r','b','n'].forEach(pt=> add(r,c,r+dir,c,{promo:pt})); }
        else add(r,c,r+dir,c);
        if(r===start && !board[r+2*dir][c]) add(r,c,r+2*dir,c,{double:true});
      }
      for(const dc of [-1,1]){
        const rr=r+dir, cc=c+dc; if(!inside(rr,cc)) continue;
        const q=board[rr][cc];
        if(q && colorOf(q)!==side){ if(rr===promRow){ ['q','r','b','n'].forEach(pt=> add(r,c,rr,cc,{promo:pt,capture:true})); } else add(r,c,rr,cc,{capture:true}); }
      }
      if(enPassant){ if(Math.abs(enPassant.c-c)===1 && enPassant.r===r+dir){ add(r,c,enPassant.r,enPassant.c,{enPassant:true}); } }
    } else if(t==='n'){
      for(const [dr,dc] of DIRS.n){ const rr=r+dr,cc=c+dc; if(!inside(rr,cc)) continue; const q=board[rr][cc]; if(!q || colorOf(q)!==side) add(r,c,rr,cc,{capture:!!q}); }
    } else if(t==='b' || t==='r' || t==='q'){
      const dirs = (t==='b')?DIRS.B:(t==='r')?DIRS.R:[...DIRS.B,...DIRS.R];
      for(const [dr,dc] of dirs){ let rr=r+dr,cc=c+dc; while(inside(rr,cc)){ const q=board[rr][cc]; if(!q){ add(r,c,rr,cc); } else { if(colorOf(q)!==side) add(r,c,rr,cc,{capture:true}); break; } rr+=dr; cc+=dc; } }
    } else if(t==='k'){
      for(const [dr,dc] of DIRS.K){ const rr=r+dr,cc=c+dc; if(!inside(rr,cc)) continue; const q=board[rr][cc]; if(!q || colorOf(q)!==side) add(r,c,rr,cc,{capture:!!q}); }
      if(side==='w' && r===7 && c===4){
        if(castling.wk && !board[7][5] && !board[7][6] && !inCheck(board,'w') && !squareAttacked(board,7,5,'b') && !squareAttacked(board,7,6,'b')) add(7,4,7,6,{castle:'K'});
        if(castling.wq && !board[7][1] && !board[7][2] && !board[7][3] && !inCheck(board,'w') && !squareAttacked(board,7,3,'b') && !squareAttacked(board,7,2,'b')) add(7,4,7,2,{castle:'Q'});
      }
      if(side==='b' && r===0 && c===4){
        if(castling.bk && !board[0][5] && !board[0][6] && !inCheck(board,'b') && !squareAttacked(board,0,5,'w') && !squareAttacked(board,0,6,'w')) add(0,4,0,6,{castle:'K'});
        if(castling.bq && !board[0][1] && !board[0][2] && !board[0][3] && !inCheck(board,'b') && !squareAttacked(board,0,3,'w') && !squareAttacked(board,0,2,'w')) add(0,4,0,2,{castle:'Q'});
      }
    }
  }
  const legal=[];
  for(const m of moves){
    const saved = snapshot();
    doMove(STATE, m, { simulate:true });
    if(!inCheck(STATE.board, side)) legal.push(m);
    restore(saved);
  }
  return legal;
}

function snapshot(){
  return {
    board: STATE.board.map(row=>row.slice()),
    castling: clone(STATE.castling),
    enPassant: STATE.enPassant?{...STATE.enPassant}:null,
    turn: STATE.turn,
    halfmove: STATE.halfmove,
    capturedWhite: STATE.capturedWhite.slice(),
    capturedBlack: STATE.capturedBlack.slice()
  };
}
function restore(s){
  STATE.board = s.board.map(row=>row.slice());
  STATE.castling = clone(s.castling);
  STATE.enPassant = s.enPassant?{...s.enPassant}:null;
  STATE.turn = s.turn;
  STATE.halfmove = s.halfmove;
  STATE.capturedWhite = s.capturedWhite.slice();
  STATE.capturedBlack = s.capturedBlack.slice();
}

function doMove(state, m, opts={}){
  const b = state.board; const side = state.turn; const opp = side==='w'?'b':'w';
  const piece = b[m.r][m.c];
  const target= b[m.r2][m.c2];

  if(target){ if(colorOf(target)==='w') state.capturedWhite.push(target); else state.capturedBlack.push(target); }
  if(m.enPassant){
    const dir=(side==='w')?-1:1; const rr=m.r2 - dir; const cap=b[rr][m.c2];
    if(cap){ b[rr][m.c2]=null; if(colorOf(cap)==='w') state.capturedWhite.push(cap); else state.capturedBlack.push(cap); }
  }

  b[m.r2][m.c2] = m.promo ? (side + m.promo) : piece;
  b[m.r][m.c] = null;

  if(m.castle==='K'){ if(side==='w'){ b[7][5]=b[7][7]; b[7][7]=null; } else { b[0][5]=b[0][7]; b[0][7]=null; } }
  if(m.castle==='Q'){ if(side==='w'){ b[7][3]=b[7][0]; b[7][0]=null; } else { b[0][3]=b[0][0]; b[0][0]=null; } }

  if(piece==='wk'){ state.castling.wk=false; state.castling.wq=false; }
  if(piece==='bk'){ state.castling.bk=false; state.castling.bq=false; }
  if(piece==='wr' && m.r===7 && m.c===0) state.castling.wq=false;
  if(piece==='wr' && m.r===7 && m.c===7) state.castling.wk=false;
  if(piece==='br' && m.r===0 && m.c===0) state.castling.bq=false;
  if(piece==='br' && m.r===0 && m.c===7) state.castling.bk=false;
  if(target==='wr' && m.r2===7 && m.c2===0) state.castling.wq=false;
  if(target==='wr' && m.r2===7 && m.c2===7) state.castling.wk=false;
  if(target==='br' && m.r2===0 && m.c2===0) state.castling.bq=false;
  if(target==='br' && m.r2===0 && m.c2===7) state.castling.bk=false;

  state.enPassant = (m.double)? { r:(m.r+m.r2)/2, c:m.c } : null;
  state.halfmove = (typeOf(piece)==='p' || target || m.enPassant) ? 0 : (state.halfmove+1);

  if(!opts.simulate){ state.history.push(m); }
  state.turn = opp;
}

/* ====== Rendering ====== */
function drawBoard(){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    ctx.fillStyle = ((r+c)%2===0)?'#233041':'#1a2533';
    ctx.fillRect(c*TILE,r*TILE,TILE,TILE);
  }

  if(STATE.selected){
    const {r,c}=STATE.selected;
    ctx.fillStyle = 'rgba(98,240,217,0.18)';
    ctx.fillRect(c*TILE, r*TILE, TILE, TILE);
    ctx.fillStyle = 'rgba(98,240,217,0.28)';
    for(const m of STATE.legalMoves){
      ctx.beginPath();
      ctx.arc(m.c2*TILE+TILE/2, m.r2*TILE+TILE/2, 10, 0, Math.PI*2);
      ctx.fill();
    }
  }

  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=STATE.board[r][c]; if(!p) continue;
    const key = keyFromCode(p);
    const img = pieceSprites[key];
    if(img && img.complete && img.naturalWidth>0){
      ctx.drawImage(img, c*TILE+8, r*TILE+8, TILE-16, TILE-16);
    } else {
      ctx.fillStyle = p[0]==='w' ? '#e6eef8' : '#0d1117';
      ctx.strokeStyle= '#9fb1c7'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(c*TILE+TILE/2, r*TILE+TILE/2, 26, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }
}

function render(){
  drawBoard();
  renderGraveyards();   // ← restore graveyard refresh on every render (from initial)
  updateTurnBadge();
}

/* ====== Graveyard (restored from initial — 16 slots) ====== */
function renderGraveyards(){
  const maxSlots = window.innerWidth < 980 ? 3 : 16;

  // --- Black pieces captured (by White) ---
  capturedBlackEl.innerHTML = '';
  STATE.capturedBlack.slice(-maxSlots).forEach(pc => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const img = document.createElement('img');
    const piece = pieceName(typeOf(pc));
    const color = colorOf(pc) === 'w' ? 'white' : 'black';
    img.src = `assets/sprites/pieces/${color}_${piece}.png`;
    img.width = 38;
    img.height = 38;
    img.style.imageRendering = 'pixelated';
    img.style.objectFit = 'contain';
    slot.appendChild(img);
    capturedBlackEl.appendChild(slot);
  });
  while (capturedBlackEl.children.length < maxSlots) {
    const filler = document.createElement('div');
    filler.className = 'slot';
    capturedBlackEl.appendChild(filler);
  }

  // --- White pieces captured (by Black) ---
  capturedWhiteEl.innerHTML = '';
  STATE.capturedWhite.slice(-maxSlots).forEach(pc => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const img = document.createElement('img');
    const piece = pieceName(typeOf(pc));
    const color = colorOf(pc) === 'w' ? 'white' : 'black';
    img.src = `assets/sprites/pieces/${color}_${piece}.png`;
    img.width = 38;
    img.height = 38;
    img.style.imageRendering = 'pixelated';
    img.style.objectFit = 'contain';
    slot.appendChild(img);
    capturedWhiteEl.appendChild(slot);
  });
  while (capturedWhiteEl.children.length < maxSlots) {
    const filler = document.createElement('div');
    filler.className = 'slot';
    capturedWhiteEl.appendChild(filler);
  }
}


function updateTurnBadge(){ turnText.textContent = STATE.turn==='w' ? 'White' : 'Black'; }

/* ====== Input ====== */
canvas.addEventListener('click', onBoardClick);
function toSquare(x,y){ return { c:Math.floor(x/TILE), r:Math.floor(y/TILE) }; }

function onBoardClick(ev){
  if(STATE.gameOver || !gameStarted) return;
  if(STATE.mode==='pvai' && STATE.aiSide===STATE.turn) return;

  const rect=canvas.getBoundingClientRect();
  const x=(ev.clientX-rect.left) * (canvas.width/rect.width);
  const y=(ev.clientY-rect.top)  * (canvas.height/rect.height);
  const {r,c}=toSquare(x,y);

  const sel = STATE.selected;
  const p = at(STATE.board,r,c);
  const side = STATE.turn;

  if(sel){
    const found = STATE.legalMoves.find(m=> m.r2===r && m.c2===c);
    if(found){
      if(found.promo && !found.promoChosen){
        openPromotion(side,(promoType)=>{ found.promo=promoType; found.promoChosen=true; makeMove(found); });
      } else {
        makeMove(found);
      }
      return;
    }
  }

  if(p && colorOf(p)===side){
    STATE.selected={r,c};
    STATE.legalMoves = generateMoves(STATE.board, side, STATE.castling, STATE.enPassant).filter(m=> m.r===r && m.c===c);

    const pieceType = pieceName(typeOf(p));
    const sfx = selectSounds[pieceType];
    if(!A.muted && sfx){ try{ sfx.currentTime=0; sfx.play(); }catch(e){} }

    render();
  } else {
    STATE.selected=null; STATE.legalMoves=[];
    render();
  }
}

/* ====== Promotion ====== */
function openPromotion(side, cb){
  promoChoices.innerHTML='';
  ['q','r','b','n'].forEach(pt=>{
    const div=document.createElement('div'); div.className='choice';
    const img=document.createElement('img'); img.width=64; img.height=64; img.style.imageRendering='pixelated';
    img.src=`assets/sprites/pieces/${side==='w'?'white':'black'}_${pieceName(pt)}.png`;
    const lbl=document.createElement('div'); lbl.textContent=pieceName(pt).toUpperCase(); lbl.style.fontSize='12px'; lbl.style.color='#9fb1c7';
    div.appendChild(img); div.appendChild(lbl);
    div.addEventListener('click',()=>{ closePromotion(); cb(pt); });
    promoChoices.appendChild(div);
  });
  promoModal.classList.add('show');
}
function closePromotion(){ promoModal.classList.remove('show'); }

/* ====== Move + Turn + Clock ====== */
function makeMove(m){
  A.play('move');
  doMove(STATE,m);
  STATE.selected=null; STATE.legalMoves=[];
  render();

  if(m.capture || m.enPassant){ A.play('capture'); }
  setTimeout(()=>A.play('move'), 80);

  const movedSide = (STATE.turn==='w' ? 'b' : 'w');
  PASS.haveMoved[movedSide] = true;
  PASS.usedThisTurn = false;
  updatePassButtonEnabled();

  switchClock();
  STATE.timer[STATE.turn] = 45;  // per-move cap
  updateClocks();

  checkEnd();
  if(STATE.mode==='pvai' && STATE.aiSide===STATE.turn && !STATE.gameOver){
    setTimeout(aiMove,120);
  }
}

function updateClocks(){
  whiteTimeEl.textContent = Math.max(0, Math.floor(STATE.timer.w));
  blackTimeEl.textContent = Math.max(0, Math.floor(STATE.timer.b));
}

function startClock(){
  clearInterval(STATE.timer.id);
  STATE.timer.id = setInterval(()=>{
    const s = STATE.turn;
    STATE.timer[s] -= 1;
    if([10,9,8,7,6,5,4,3,2,1].includes(Math.floor(STATE.timer[s]))){ A.play('tick'); }
    updateClocks();
    if(STATE.timer[s] <= 0){
      STATE.timer[s] = 0; updateClocks();
      STATE.gameOver = true; clearInterval(STATE.timer.id);
      A.stopBgm();
      alert((s==='w'?'White':'Black') + " ran out of time! Game Over.");
    }
  }, 1000);
}

function switchClock(){ updateClocks(); startClock(); updatePassButtonEnabled(); }

function updatePassButtonEnabled(){
  const side = STATE.turn;
  const humanTurn = (STATE.mode==='pvp') || (STATE.mode==='pvai' && STATE.aiSide!==side);
  passBtn.disabled = !(humanTurn && PASS.haveMoved[side] && !PASS.usedThisTurn && !STATE.gameOver && gameStarted);
}

/* ====== Pass ====== */
passBtn.addEventListener('click', ()=>{
  if(!gameStarted || STATE.gameOver) return;
  if(passBtn.disabled){ A.play('error'); return; }
  PASS.usedThisTurn = true;
  STATE.turn = (STATE.turn==='w' ? 'b' : 'w');
  STATE.timer[STATE.turn] = 45;
  updateTurnBadge(); updateClocks(); startClock(); updatePassButtonEnabled();
  if(STATE.mode==='pvai' && STATE.aiSide===STATE.turn && !STATE.gameOver){ setTimeout(aiMove,120); }
});

/* ====== Undo ====== */
undoBtn.addEventListener('click', ()=>{
  if(!STATE.history.length){ A.play('error'); return; }
  const hist = STATE.history.slice(0,-1);
  resetBoard();
  hist.forEach(m=> doMove(STATE,m));
  STATE.history = hist;
  render(); updateClocks(); updatePassButtonEnabled();
});

/* ====== End conditions ====== */
function checkEnd(){
  const side = STATE.turn;
  const legal = generateMoves(STATE.board, side, STATE.castling, STATE.enPassant);
  const isCheck = inCheck(STATE.board, side);
  if(legal.length===0){
    STATE.gameOver = true; clearInterval(STATE.timer.id);
    setTimeout(()=>{
      alert(isCheck ? (side==='w'?'Checkmate! Black wins.':'Checkmate! White wins.') : 'Stalemate!');
    },50);
  }
}

/* ====== AI ====== */
const PIECE_VALUE = { k:20000, q:900, r:500, b:330, n:320, p:100 };

function evaluate(board){
  let score=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=board[r][c]; if(!p) continue;
    const s = (p[0]==='w') ? 1 : -1;
    score += s * PIECE_VALUE[p[1]];
  }
  return score;
}

function aiMove(){
  if(STATE.gameOver) return;
  const side = STATE.turn;
  const best = search(2, -1e9, 1e9, side);
  if(best && best.move){ makeMove(best.move); }
}

function search(depth, alpha, beta, side){
  if(depth===0){ return { score: quiescence(alpha,beta,side) }; }
  const moves = generateMoves(STATE.board, side, STATE.castling, STATE.enPassant);
  if(moves.length===0){ return { score: inCheck(STATE.board, side) ? (side==='w'?-1:1)*1e7 : 0 }; }
  moves.sort((a,b)=> (b.capture?1:0) - (a.capture?1:0));
  let best=null;
  for(const m of moves){
    const snap = snapshot(); doMove(STATE, m, {simulate:true});
    const res = search(depth-1, -beta, -alpha, side==='w'?'b':'w');
    const score = -res.score;
    restore(snap);
    if(score>alpha){ alpha=score; best={move:m,score}; }
    if(alpha>=beta) break;
  }
  return best || { score: alpha };
}

function quiescence(alpha, beta, side){
  let stand = (side==='w'?1:-1) * evaluate(STATE.board);
  if(stand >= beta) return beta;
  if(alpha < stand) alpha = stand;
  const moves = generateMoves(STATE.board, side, STATE.castling, STATE.enPassant).filter(m=>m.capture);
  for(const m of moves){
    const snap = snapshot(); doMove(STATE,m,{simulate:true});
    const score = -quiescence(-beta,-alpha, side==='w'?'b':'w');
    restore(snap);
    if(score>=beta) return beta;
    if(score>alpha) alpha = score;
  }
  return alpha;
}

/* ====== Controls ====== */
modeSelect.addEventListener('change', ()=>{ STATE.mode = modeSelect.value; updatePassButtonEnabled(); });
aiSideSelect.addEventListener('change', ()=>{ STATE.aiSide = (aiSideSelect.value==='white')?'w':'b'; updatePassButtonEnabled(); });

/* ====== Start Game ====== */
if(startGameBtn){
  startGameBtn.addEventListener('click', ()=>{
    if(gameStarted) return;
    resetBoard();
    render();
    startClock();
    gameStarted = true;
    A.startBgm();
    updatePassButtonEnabled();
    if(STATE.mode==='pvai' && STATE.aiSide==='w'){ setTimeout(aiMove, 200); }
    startGameBtn.disabled = true;
  });
}

/* ====== Boot (no auto-start) ====== */
resetBoard();
render();
updateClocks();
updatePassButtonEnabled();
console.log("Pixel Chess — final loaded");
