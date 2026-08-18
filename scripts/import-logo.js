const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function run(){
  const srcDir = path.join(__dirname,'..','assets','originals');
  const outDir = path.join(__dirname,'..','assets');
  const candidates = ['logo.png','logo.jpg','logo.jpeg','logo-source.png','logo-source.jpg','logo-source.jpeg'];
  const found = candidates.map(f=>path.join(srcDir,f)).find(p=>fs.existsSync(p));
  if(!found){
    console.error('No logo source found. Place your logo file as one of:', candidates.join(', '));
    process.exit(2);
  }
  console.log('Found source:', found);
  // generate 64x64 png and 128x128 png + webp
  await sharp(found).resize(64,64,{fit:'cover'}).png().toFile(path.join(outDir,'logo.png'));
  await sharp(found).resize(128,128,{fit:'cover'}).png().toFile(path.join(outDir,'logo@2x.png'));
  await sharp(found).resize(64,64,{fit:'cover'}).webp().toFile(path.join(outDir,'logo.webp'));
  console.log('Generated assets/logo.png, logo@2x.png, logo.webp');
}

run().catch(e=>{ console.error(e); process.exit(1); });
