// node render_overlay.js stills <tl.json> <out_dir> <base.mp4> t1,t2,...   -> composited stills (QA)
// node render_overlay.js video  <tl.json> <base.mp4> <audio.wav> <out.mp4> -> final short (overlay over footage + mix)
// Playwright comes from the skill folder's node_modules (setup installs it).
const path = require('path'), fs = require('fs'), { spawn, spawnSync } = require('child_process');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(__dirname, '..', '..', '.browsers');
const { chromium } = require('playwright');

(async () => {
  const [mode, tlPath, ...rest] = process.argv.slice(2);
  const TL = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.addInitScript(tl => { window.TL = tl; }, TL);
  page.on('pageerror', e => { console.error('PAGE ERROR', e.message); process.exitCode = 2; });
  await page.goto('file:///' + path.join(__dirname, 'overlay.html').replace(/\\/g, '/'));
  const fontsOk = await page.evaluate(() => window.READY);
  if (!fontsOk) { console.error('FONTS NOT LOADED (assets/fonts) - run setup again'); process.exit(3); }
  const shot = async t => { await page.evaluate(t => window.seek(t), t); return page.screenshot({ type: 'png', omitBackground: true }); };

  if (mode === 'stills') {
    const [outDir, base, times] = rest;
    fs.mkdirSync(outDir, { recursive: true });
    for (const t of times.split(',').map(Number)) {
      const ov = path.join(outDir, `ov_${t.toFixed(2)}.png`);
      fs.writeFileSync(ov, await shot(t));
      spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', base, '-i', ov, '-filter_complex',
        '[0:v][1:v]overlay=0:0', '-frames:v', '1', path.join(outDir, `t${t.toFixed(2)}.jpg`)]);
      fs.unlinkSync(ov);
    }
  } else {
    const [base, audio, out] = rest;
    const fps = TL.meta.fps, n = Math.round(TL.meta.dur * fps);
    const venc = TL.meta.venc || ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17'];
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-i', base, '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-i', audio, '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]', '-map', '[v]', '-map', '2:a',
      ...venc, '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', String(TL.meta.dur), out],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < n; i++) {
      const buf = await shot(i / fps);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 150 === 0) console.log(`frame ${i}/${n}`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
  }
  await browser.close();
})();
