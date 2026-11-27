// Calibration report over the demo photos (not a pass/fail test). Run: npx vitest run src/dev
import { describe, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { measureCentering } from '../domain/centering';
import { cornerWear, edgeWear, lineEvidence, nameBarSharpness } from '../domain/defects';

function decode(file: string) {
  // Use ImageMagick to get raw RGBA at the app's working size (max side 1024).
  const buf = execFileSync('magick', [file, '-resize', '1024x1024>', '-depth', '8', 'rgba:-'], { maxBuffer: 64e6 });
  const dims = execFileSync('magick', ['identify', '-format', '%w %h', `${file}[1024x1024>]`]).toString().trim().split(' ').map(Number);
  return { width: dims[0], height: dims[1], data: new Uint8Array(buf) };
}

describe('calibration', () => {
  it('prints measurements for every demo card', () => {
    const dir = join(__dirname, '../../public/demo');
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    for (const c of m.cards) {
      const img = decode(join(dir, c.file));
      const cen = measureCentering(img);
      const cw = cornerWear(img, cen.card);
      const ew = edgeWear(img, cen.card);
      const sh = nameBarSharpness(img, cen.card); const st = `${cw.topLeft[0]}${cw.topRight[0]}${cw.bottomLeft[0]}${cw.bottomRight[0]} m=${cw.measurable}`;
      console.log(`${c.name.padEnd(12)} truth=${c.truth.ceiling}${c.truth.counterfeit ? ' FAKE' : ''} defects=${c.defects.join(',') || '-'} | center ${cen.label} max=${cen.maxGrade} conf=${cen.confident} | corners ${cw.shares.map((v: number) => v.toFixed(3)).join(' ')} | edge ${ew.share.toFixed(4)} ${ew.state} | ${st} | lines ${JSON.stringify(lineEvidence(img, cen.card))} ${sh ? '' : ''}`);
    }
    void readdirSync;
  });
});
