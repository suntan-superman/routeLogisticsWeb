// Asset packaging only: resize the generated artwork, encode store formats,
// and add Android overscan padding. No creative edits or background extraction.
const fs = require('node:fs');
const path = require('node:path');
const { generateImageAsync } = require('@expo/image-utils');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..'), folder = path.join(root, 'assets/brand');
const master = path.join(folder, 'app-icon-ios.png');
const foregroundPath = path.join(folder, 'android-adaptive-foreground.png');
const markSource = path.join(folder, 'route-mark-source.png');
const backgroundColor = '#046A36';
async function resized(src, size, opaque = false) {
  return (await generateImageAsync({ projectRoot: root, cacheType: 'rl-brand-icons' }, {
    src, width: size, height: size, resizeMode: 'contain', removeTransparency: opaque,
    backgroundColor: opaque ? backgroundColor : 'transparent',
  })).source;
}
function validate(buffer, size, opaque) {
  const png = PNG.sync.read(buffer);
  if (png.width !== size || png.height !== size) throw new Error('Incorrect icon dimensions.');
  if (opaque && buffer[25] !== 2) throw new Error('iOS master must be RGB PNG without an alpha channel.');
  return png;
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const source = process.argv[2] ? path.resolve(process.argv[2]) : master;
  const ios = await resized(source, 1024, true);
  validate(ios, 1024, true); fs.writeFileSync(master, ios);
  if (process.argv[3]) fs.copyFileSync(path.resolve(process.argv[3]), markSource);
  // Launcher viewport is ~72/108 of the foreground. Keep the generated mark
  // inside the 66dp safe circle while leaving transparent overscan around it.
  const artwork = PNG.sync.read(await resized(markSource, 760));
  const foreground = new PNG({ width: 1024, height: 1024 });
  PNG.bitblt(artwork, foreground, 0, 0, 760, 760, 132, 132);
  const adaptive = PNG.sync.write(foreground, { colorType: 6, inputColorType: 6, deflateLevel: 9 });
  validate(adaptive, 1024, false); fs.writeFileSync(foregroundPath, adaptive);
  // Android themed icons use the same alpha silhouette; RGB is a white mask.
  const monochrome = PNG.sync.read(adaptive);
  for (let i = 0; i < monochrome.data.length; i += 4) monochrome.data.fill(255, i, i + 3);
  fs.writeFileSync(path.join(folder, 'android-monochrome.png'), PNG.sync.write(monochrome, { colorType: 6, deflateLevel: 9 }));
  const playPixels = PNG.sync.read(await resized(master, 512));
  const play = PNG.sync.write(playPixels, { colorType: 6, inputColorType: 6, deflateLevel: 9 });
  if (play.length > 1024 * 1024) throw new Error('Google Play icon exceeds 1024 KB.');
  fs.writeFileSync(path.join(folder, 'google-play-icon.png'), play);
  // Validate the essential ivory mark against Android's circular safe zone.
  let maxMarkRadius = 0, markPixels = 0;
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4, [r,g,b,a] = foreground.data.subarray(i, i + 4);
    if (a > 200 && Math.min(r,g,b) > 150 && Math.max(r,g,b) - Math.min(r,g,b) < 65) {
      maxMarkRadius = Math.max(maxMarkRadius, Math.hypot(x - 511.5, y - 511.5)); markPixels++;
    }
  }
  const safeRadius = 1024 * 33 / 108;
  if (!markPixels || maxMarkRadius > safeRadius) throw new Error('Essential mark exceeds Android safe circle.');
  // Preview launcher clipping only; rounded corners are never baked into masters.
  const expanded = PNG.sync.read(await resized(foregroundPath, 768));
  for (const shape of ['circle', 'rounded-square']) {
    const preview = new PNG({ width: 512, height: 512 });
    PNG.bitblt(expanded, preview, 128, 128, 512, 512, 0, 0);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const distance = shape === 'circle' ? Math.hypot(x - 255.5, y - 255.5) - 256
        : Math.hypot(Math.max(128 - x, x - 383, 0), Math.max(128 - y, y - 383, 0)) - 128;
      const i = (y * 512 + x) * 4, alpha = preview.data[i + 3] / 255;
      const clip = Math.max(0, Math.min(1, 0.5 - distance));
      const background = [4, 106, 54], surround = [235, 237, 240];
      for (let channel = 0; channel < 3; channel++) {
        const color = preview.data[i + channel] * alpha + background[channel] * (1 - alpha);
        preview.data[i + channel] = Math.round(color * clip + surround[channel] * (1 - clip));
      }
      preview.data[i + 3] = 255;
    }
    fs.writeFileSync(path.join(folder, `preview-android-${shape}.png`), PNG.sync.write(preview, { colorType: 6 }));
  }
  console.log(JSON.stringify({ ios: { width: 1024, height: 1024, alphaChannel: false },
    android: { canvas: 1024, artworkInset: 132, maxMarkRadius: Number(maxMarkRadius.toFixed(2)), safeRadius: Number(safeRadius.toFixed(2)), safeZonePass: true },
    googlePlay: { width: 512, height: 512, bytes: play.length, rgba: true }, backgroundColor }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
