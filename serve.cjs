const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  const file = path.resolve(root,'.'+(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root+path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file,(err,data)=>{ if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data); });
});
server.listen(4173,'127.0.0.1',()=>console.log('DIPScope: http://127.0.0.1:4173'));
