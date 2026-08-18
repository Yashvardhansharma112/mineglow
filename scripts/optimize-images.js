// Optimize images using sharp
// Usage:
// 1. Put original images into `assets/originals/` (img1.jpg .. img5.jpg)
// 2. Run `npm install` then `npm run optimize-images`

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const inputDir = path.join(root, 'assets', 'originals');
const outputDir = path.join(root, 'assets');

if (!fs.existsSync(inputDir)) {
  console.error('Input folder not found:', inputDir);
  console.error('Create it and add your images (img1.jpg ... img5.jpg)');
  process.exit(1);
}

fs.readdir(inputDir, async (err, files) => {
  if (err) throw err;
  const images = files.filter(f => /\.(jpe?g|png)$/i.test(f));
  if (!images.length) { console.log('No images found in', inputDir); return; }
  for (const file of images) {
    const inPath = path.join(inputDir, file);
    const name = path.parse(file).name;
    try {
      // Resize to max 1600px and save as optimized jpg and webp
      const img = sharp(inPath).rotate();
      await img.resize({ width: 1600, height: 1600, fit: 'inside' }).jpeg({ quality: 88 }).toFile(path.join(outputDir, name + '.jpg'));
      await img.resize({ width: 1600, height: 1600, fit: 'inside' }).webp({ quality: 84 }).toFile(path.join(outputDir, name + '.webp'));
      console.log('Optimized', file);
    } catch (e) { console.error('Failed', file, e); }
  }
  console.log('Done. Optimized images saved to', outputDir);
});
