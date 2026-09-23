'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
fs.mkdirSync(dist,{recursive:true});

for(const file of ['styles.css','app.js','auto-ui.js','favicon.svg','.nojekyll'])
  fs.copyFileSync(path.join(root,file),path.join(dist,file));

let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(!html.includes('auto-ui.js')){
  html=html.replace('</body>','<script src="auto-ui.js" defer></script>\n</body>');
}
fs.writeFileSync(path.join(dist,'index.html'),html);

fs.mkdirSync(path.join(dist,'data'),{recursive:true});
const json=JSON.parse(fs.readFileSync(path.join(root,'data','calendar.json'),'utf8'));
if(!json.days||typeof json.days!=='object'||json.version!==1)throw Error('Archivo de datos inválido');
fs.writeFileSync(path.join(dist,'data','calendar.json'),JSON.stringify(json,null,2)+'\n');
console.log('Sitio estático preparado en dist/ con análisis automático; ningún secreto se publica.');
