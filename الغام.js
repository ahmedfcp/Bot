// plugins/الغام.js
// 𝐁𝐋𝐔𝐄 𝐒𝐊𝐘 𝐒𝐘𝐒𝐓𝐄𝐌 ⚔️ - Minesweeper Interactive HTML Game

export const BlueSky = {
  command: "لغم",
  description: "لعبة كشف الألغام (Minesweeper)",
  elite: "off",
  lock: "off",
  group: false,
  prv: false,
  bluesky: "on"
};

export async function execute({ sock, msg, from }) {
  const target = from || msg.key.remoteJid;

  const html = `
<style>
*{
  box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;
  user-select:none;
}
html,body{
  margin:0;
  padding:0;
  width:100%;
  min-height:100%;
  background:#111827;
  color:#ffffff;
  font-family:Arial,sans-serif;
}
body{
  padding:15px;
}
.game{
  width:100%;
  max-width:480px;
  margin:auto;
  padding:14px;
  border-radius:24px;
  background:#1f2937;
  border:2px solid #374151;
  box-shadow:0 10px 30px rgba(0,0,0,.5);
}
.title{
  text-align:center;
  font-size:26px;
  font-weight:900;
  margin-bottom:4px;
}
.sub{
  text-align:center;
  color:#cbd5e1;
  font-size:13px;
  margin-bottom:14px;
}
.stats{
  display:flex;
  justify-content:space-between;
  margin-bottom:12px;
  padding:10px;
  border-radius:14px;
  background:#111827;
  border:1px solid #374151;
  font-size:13px;
  font-weight:bold;
}
.status{
  text-align:center;
  padding:11px;
  border-radius:14px;
  background:#111827;
  border:1px solid #374151;
  margin-bottom:12px;
  font-size:14px;
  font-weight:bold;
  min-height:20px;
}
.modeBar{
  display:flex;
  gap:8px;
  margin-bottom:12px;
}
.modeBtn{
  flex:1;
  padding:11px 0;
  border-radius:12px;
  border:2px solid #374151;
  background:#111827;
  color:#cbd5e1;
  font-size:13px;
  font-weight:900;
  cursor:pointer;
}
.modeBtn.active{
  background:#2563eb;
  border-color:#3b82f6;
  color:#fff;
}
.board{
  width:100%;
  aspect-ratio:1/1;
  display:grid;
  grid-template-columns:repeat(16,1fr);
  grid-template-rows:repeat(16,1fr);
  gap:2px;
  background:#0b1220;
  padding:5px;
  border-radius:10px;
  border:2px solid #374151;
}
.cell{
  display:flex;
  justify-content:center;
  align-items:center;
  border-radius:3px;
  background:#374151;
  font-size:2.6vw;
  font-weight:900;
  cursor:pointer;
}
@media(min-width:480px){
  .cell{ font-size:13px; }
}
.cell.open{
  background:#1f2937;
  cursor:default;
}
.cell.mine{
  background:#b91c1c;
}
.cell.flag{
  background:#374151;
}
.c1{ color:#60a5fa; }
.c2{ color:#4ade80; }
.c3{ color:#f87171; }
.c4{ color:#a78bfa; }
.c5{ color:#fb923c; }
.c6{ color:#22d3ee; }
.c7{ color:#f5f5f4; }
.c8{ color:#94a3b8; }
.controls{
  display:flex;
  gap:10px;
  margin-top:14px;
}
.restart{
  flex:1;
  padding:13px;
  border:0;
  border-radius:15px;
  background:#ec4899;
  color:#fff;
  font-size:14px;
  font-weight:900;
  cursor:pointer;
}
.restart:active{
  transform:scale(.96);
  background:#db2777;
}
.footer{
  text-align:center;
  margin-top:12px;
  color:#6b7280;
  font-size:10px;
}
</style>

<div class="game">

  <div class="title">💣 كشف الألغام</div>
  <div class="sub">اكشف كل المربعات الآمنة من غير ما تدوس على لغم</div>

  <div class="stats">
    <span>💣 ألغام: <b id="mineCount">40</b></span>
    <span>🚩 أعلام: <b id="flagCount">0</b></span>
    <span>⏱️ <b id="timer">0s</b></span>
  </div>

  <div class="status" id="status">✨ دوس أي مربع تبدأ</div>

  <div class="modeBar">
    <button class="modeBtn active" id="modeReveal" onclick="setMode('reveal')">👆 كشف</button>
    <button class="modeBtn" id="modeFlag" onclick="setMode('flag')">🚩 علّم</button>
  </div>

  <div class="board" id="board"></div>

  <div class="controls">
    <button class="restart" onclick="restart()">🔄 لعبة جديدة</button>
  </div>

  <div class="footer">*· 𝐁𝐋𝐔𝐄 𝐒𝐊𝐘*</div>

</div>

<script>

var SIZE = 16;
var MINES = 40;
var grid = [];
var revealed = [];
var flagged = [];
var mode = 'reveal';
var started = false;
var finished = false;
var flagCount = 0;
var startTime = null;
var timerInterval = null;

function idx(r,c){ return r*SIZE+c; }
function inb(r,c){ return r>=0 && r<SIZE && c>=0 && c<SIZE; }

function neighbors(r,c){
  var n = [];
  for(var dr=-1;dr<=1;dr++){
    for(var dc=-1;dc<=1;dc++){
      if(dr===0 && dc===0) continue;
      if(inb(r+dr,c+dc)) n.push(idx(r+dr,c+dc));
    }
  }
  return n;
}

function buildGrid(safeIndex){
  var g = new Array(SIZE*SIZE).fill(0);
  var placed = 0;
  while(placed < MINES){
    var pos = Math.floor(Math.random()*SIZE*SIZE);
    if(pos === safeIndex || g[pos] === -1) continue;
    g[pos] = -1;
    placed++;
  }
  for(var r=0;r<SIZE;r++){
    for(var c=0;c<SIZE;c++){
      var i = idx(r,c);
      if(g[i] === -1) continue;
      var count = 0;
      neighbors(r,c).forEach(function(n){ if(g[n] === -1) count++; });
      g[i] = count;
    }
  }
  return g;
}

function render(){
  var el = document.getElementById('board');
  el.innerHTML = '';

  for(var r=0;r<SIZE;r++){
    for(var c=0;c<SIZE;c++){
      var i = idx(r,c);
      var d = document.createElement('div');
      d.className = 'cell';

      if(revealed[i]){
        d.className += ' open';
        if(grid[i] === -1){
          d.className += ' mine';
          d.innerHTML = '💣';
        } else if(grid[i] > 0){
          d.className += ' c' + grid[i];
          d.innerHTML = grid[i];
        }
      } else if(flagged[i]){
        d.className += ' flag';
        d.innerHTML = '🚩';
      }

      d.onclick = (function(index){
        return function(){ onCellClick(index); };
      })(i);

      el.appendChild(d);
    }
  }

  document.getElementById('flagCount').innerHTML = flagCount;
}

function setStatus(text){
  document.getElementById('status').innerHTML = text;
}

function setMode(m){
  mode = m;
  document.getElementById('modeReveal').className = 'modeBtn' + (m==='reveal' ? ' active' : '');
  document.getElementById('modeFlag').className = 'modeBtn' + (m==='flag' ? ' active' : '');
}

function startTimer(){
  startTime = Date.now();
  timerInterval = setInterval(function(){
    var s = Math.floor((Date.now()-startTime)/1000);
    document.getElementById('timer').innerHTML = s + 's';
  }, 1000);
}

function stopTimer(){
  if(timerInterval){
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function floodReveal(start){
  var stack = [start];
  while(stack.length){
    var i = stack.pop();
    if(revealed[i] || flagged[i]) continue;
    revealed[i] = true;

    if(grid[i] === 0){
      var r = Math.floor(i/SIZE), c = i%SIZE;
      neighbors(r,c).forEach(function(n){
        if(!revealed[n] && !flagged[n]) stack.push(n);
      });
    }
  }
}

function checkWin(){
  for(var i=0;i<grid.length;i++){
    if(grid[i] !== -1 && !revealed[i]) return false;
  }
  return true;
}

function revealAllMines(){
  for(var i=0;i<grid.length;i++){
    if(grid[i] === -1) revealed[i] = true;
  }
}

function onCellClick(i){
  if(finished) return;

  if(mode === 'flag'){
    if(revealed[i]) return;
    flagged[i] = !flagged[i];
    flagCount += flagged[i] ? 1 : -1;
    render();
    return;
  }

  if(flagged[i] || revealed[i]) return;

  if(!started){
    started = true;
    grid = buildGrid(i);
    startTimer();
  }

  if(grid[i] === -1){
    finished = true;
    stopTimer();
    revealed[i] = true;
    revealAllMines();
    render();
    setStatus('💥 دوست على لغم! خسرت');
    return;
  }

  floodReveal(i);
  render();

  if(checkWin()){
    finished = true;
    stopTimer();
    var totalTime = Math.floor((Date.now()-startTime)/1000);
    setStatus('🏆 كسبت! كشفت كل المربعات في ' + totalTime + ' ثانية');
  } else {
    setStatus('✨ كمّل كشف...');
  }
}

function restart(){
  stopTimer();
  grid = new Array(SIZE*SIZE).fill(0);
  revealed = new Array(SIZE*SIZE).fill(false);
  flagged = new Array(SIZE*SIZE).fill(false);
  started = false;
  finished = false;
  flagCount = 0;
  startTime = null;
  mode = 'reveal';
  document.getElementById('timer').innerHTML = '0s';
  document.getElementById('mineCount').innerHTML = MINES;
  setMode('reveal');
  setStatus('✨ دوس أي مربع تبدأ');
  render();
}

restart();

</script>
`;

  const data = Buffer.from(
    JSON.stringify({
      response_id: "mines-bluesky-" + Date.now(),

      sections: [
        {
          view_model: {

            primitive: {
              __typename: "GenAIaeacdsnwHtmlPrimitive",

              payload: html,

              trusted_sources: [
                "nixel.dev"
              ]
            },

            __typename: "GenAISingleLayoutViewModel"
          }
        }
      ]
    })
  ).toString('base64');

  await sock.relayMessage(
    target,
    {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2
      },

      botForwardedMessage: {

        message: {

          richResponseMessage: {

            messageType: 1,

            submessages: [
              {
                messageType: 2,
                messageText: "💣 MINESWEEPER"
              }
            ],

            unifiedResponse: {
              data
            },

            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardOrigin: 4
            }

          }

        }

      }

    },
    {}
  );

}

export default { BlueSky, execute };
