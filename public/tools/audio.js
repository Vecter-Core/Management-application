/* ============================================================
   xAudio — biên tập âm thanh THẬT bằng Web Audio API:
   waveform, cắt/dán/fade/đảo/normalize, EQ 5 dải, reverb/delay/
   distortion/compressor (nướng vào file), tạo sóng/nhịp trống,
   ghi âm micro, xuất WAV 16-bit, phân tích bằng AI
   ============================================================ */
(function () {
    'use strict';

    let actx = null;
    let buf = null;
    let fileName = 'audio';
    let srcNode = null;
    let playing = false, startCtxTime = 0, startOffset = 0;
    let loop = false;
    let sel = null;              // {a,b} giây
    let playhead = 0;
    let zoom = 0;                // 0 = vừa khung, ngược lại px/giây
    let clipboard = null;        // {ch:[Float32Array], sr}
    let recorder = null, recStream = null, recChunks = [], recStart = 0;
    let peakCache = { pps: -1, min: null, max: null };
    let liveMaster = null, livePanner = null;
    const fx = { reverb: false, delay: false, distort: false, compress: false };
    const eqGains = [0, 0, 0, 0, 0];
    const EQ_FREQ = [60, 250, 1000, 4000, 12000];
    const hist = TK.history(25);

    const cv = document.getElementById('wave');
    const ctx2 = cv.getContext('2d');
    const wrap = document.getElementById('waveWrap');
    const ruler = document.getElementById('ruler');

    function AC() {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        return actx;
    }
    const dur = () => (buf ? buf.duration : 0);
    const hasAudio = () => { if (!buf) { TK.toast('Chưa có âm thanh — mở file, ghi âm hoặc tạo sóng trước', 'error'); return false; } return true; };

    /* ================= HIỂN THỊ ================= */
    function layout() {
        document.getElementById('emptyBox').style.display = buf ? 'none' : 'flex';
        updateStats();
        draw();
    }
    function pps() {
        if (!buf) return 100;
        return zoom > 0 ? zoom : Math.max(20, (wrap.clientWidth - 4) / buf.duration);
    }
    function draw() {
        const h = Math.max(80, wrap.clientHeight);
        const w = buf ? Math.max(wrap.clientWidth, Math.round(buf.duration * pps())) : wrap.clientWidth;
        const dpr = window.devicePixelRatio || 1;
        cv.width = Math.min(20000, Math.round(w * dpr));
        cv.height = Math.round(h * dpr);
        cv.style.width = Math.min(20000, w) + 'px';
        cv.style.height = h + 'px';
        const g = ctx2;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const W = cv.width / dpr, H = cv.height / dpr;
        g.clearRect(0, 0, W, H);
        // nền lưới
        g.strokeStyle = 'rgba(0,229,184,.07)';
        g.lineWidth = 1;
        for (let y = 0; y < H; y += H / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
        if (!buf) { drawRuler(0); return; }

        const p = pps();
        // vùng chọn
        if (sel) {
            const x1 = sel.a * p, x2 = sel.b * p;
            g.fillStyle = 'rgba(0,229,184,.16)';
            g.fillRect(x1, 0, Math.max(1, x2 - x1), H);
            g.strokeStyle = 'rgba(0,229,184,.7)';
            g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, H); g.moveTo(x2, 0); g.lineTo(x2, H); g.stroke();
        }
        // peaks
        const ch = buf.getChannelData(0);
        const ch2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
        const sr = buf.sampleRate;
        const cols = Math.ceil(W);
        if (peakCache.pps !== p || peakCache.n !== ch.length) {
            peakCache = { pps: p, n: ch.length, min: new Float32Array(cols), max: new Float32Array(cols), min2: new Float32Array(cols), max2: new Float32Array(cols) };
            for (let i = 0; i < cols; i++) {
                const s0 = Math.floor(i / p * sr), s1 = Math.max(s0 + 1, Math.floor((i + 1) / p * sr));
                let mn = 1, mx = -1, mn2 = 1, mx2 = -1;
                const step = Math.max(1, Math.floor((s1 - s0) / 4000));
                for (let s = s0; s < s1 && s < ch.length; s += step) {
                    const v = ch[s]; if (v < mn) mn = v; if (v > mx) mx = v;
                    if (ch2) { const u = ch2[s]; if (u < mn2) mn2 = u; if (u > mx2) mx2 = u; }
                }
                peakCache.min[i] = mn; peakCache.max[i] = mx; peakCache.min2[i] = mn2; peakCache.max2[i] = mx2;
            }
        }
        const mid = H / 2, amp = H / 2 - 4;
        // kênh 2 (mờ)
        if (ch2) {
            g.fillStyle = 'rgba(0,163,163,.45)';
            for (let i = 0; i < cols; i++) {
                const y1 = mid - peakCache.max2[i] * amp * 0.92, y2 = mid - peakCache.min2[i] * amp * 0.92;
                g.fillRect(i, y1, 1, Math.max(1, y2 - y1));
            }
        }
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#7dffdd'); grad.addColorStop(.5, '#00e5b8'); grad.addColorStop(1, '#00a3a3');
        g.fillStyle = grad;
        for (let i = 0; i < cols; i++) {
            const y1 = mid - peakCache.max[i] * amp, y2 = mid - peakCache.min[i] * amp;
            g.fillRect(i, y1, 1, Math.max(1, y2 - y1));
        }
        // đường 0
        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
        // playhead
        const px = playhead * p;
        g.strokeStyle = '#ff5c7a'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke();
        g.fillStyle = '#ff5c7a';
        g.beginPath(); g.moveTo(px - 4, 0); g.lineTo(px + 4, 0); g.lineTo(px, 7); g.closePath(); g.fill();
        drawRuler(W);
        document.getElementById('stZoom').textContent = 'Zoom: ' + (zoom > 0 ? Math.round(p) + ' px/s' : 'vừa khung');
    }
    function drawRuler(W) {
        const p = pps();
        const total = buf ? buf.duration : 0;
        if (!ruler.firstElementChild) {
            const inner = document.createElement('div');
            inner.id = 'rulerInner';
            inner.style.cssText = 'position:absolute;top:0;left:0;height:100%;width:20000px;';
            ruler.appendChild(inner);
        }
        const host = ruler.firstElementChild;
        host.innerHTML = '';
        const target = Math.max(1, Math.ceil((W || wrap.clientWidth) / 90));
        let step = 0.05;
        const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
        for (const s of steps) { if (total / s <= target) { step = s; break; } step = s; }
        const count = Math.min(500, Math.ceil((total || 1) / step) + 1);
        let html = '';
        for (let i = 0; i < count; i++) {
            const t = i * step, x = t * p;
            html += `<div style="position:absolute;left:${x}px;top:0;bottom:0;border-left:1px solid rgba(0,229,184,.28);padding:2px 3px;font:9.5px monospace;color:#7fa8a1;white-space:nowrap;">${fmt(t)}</div>`;
        }
        host.innerHTML = html;
        host.style.transform = `translateX(${-wrap.scrollLeft}px)`;
    }
    function fmt(t) {
        t = Math.max(0, t || 0);
        const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t % 1) * 100);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
    }
    function updateStats() {
        const el = document.getElementById('stats');
        document.getElementById('timeDisp').textContent = fmt(playhead);
        if (!buf) { el.innerHTML = 'Chưa tải audio.'; document.getElementById('stFile').textContent = 'Chưa có file'; document.getElementById('stSel').textContent = 'Chưa chọn vùng'; return; }
        const ch = buf.getChannelData(0);
        let peak = 0, sum = 0, silent = 0;
        const step = Math.max(1, Math.floor(ch.length / 200000));
        let n = 0;
        for (let i = 0; i < ch.length; i += step) { const v = Math.abs(ch[i]); if (v > peak) peak = v; sum += v * v; if (v < 0.005) silent++; n++; }
        const rms = Math.sqrt(sum / (n || 1));
        const db = v => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-∞');
        el.innerHTML = `<b>File:</b> ${esc(fileName)}<br><b>Thời lượng:</b> ${fmt(buf.duration)} (${buf.duration.toFixed(3)} s)<br>
        <b>Sample rate:</b> ${buf.sampleRate} Hz · <b>Kênh:</b> ${buf.numberOfChannels}<br>
        <b>Samples:</b> ${buf.length.toLocaleString('vi-VN')}<br>
        <b>Peak:</b> ${db(peak)} dBFS · <b>RMS:</b> ${db(rms)} dBFS<br>
        <b>Im lặng:</b> ${(silent / (n || 1) * 100).toFixed(1)}%<br>
        <b>Playhead:</b> ${fmt(playhead)}${sel ? `<br><b>Chọn:</b> ${fmt(sel.a)} → ${fmt(sel.b)} (${(sel.b - sel.a).toFixed(2)} s)` : ''}`;
        document.getElementById('stFile').textContent = `${fileName} · ${buf.sampleRate / 1000}kHz · ${buf.numberOfChannels}ch`;
        document.getElementById('stSel').textContent = sel ? `Chọn ${fmt(sel.a)}→${fmt(sel.b)} (${(sel.b - sel.a).toFixed(2)}s)` : 'Chưa chọn vùng';
    }
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ================= BUFFER ================= */
    function makeBuffer(chArrays, sr) {
        const ac = AC();
        const len = chArrays[0].length;
        const b = ac.createBuffer(chArrays.length, Math.max(1, len), sr);
        chArrays.forEach((c, i) => b.copyToChannel(c, i));
        return b;
    }
    function channelsOf(b) {
        const out = [];
        for (let i = 0; i < b.numberOfChannels; i++) out.push(b.getChannelData(i).slice());
        return out;
    }
    function setBuffer(b, name, keepSel) {
        buf = b;
        if (name) fileName = name;
        if (!keepSel) sel = null;
        playhead = TK.clamp(playhead, 0, b.duration);
        peakCache.pps = -1;
        push();
        layout();
    }
    function rangeSamples() {
        if (!buf) return null;
        const sr = buf.sampleRate;
        const a = sel ? Math.floor(sel.a * sr) : 0;
        const b = sel ? Math.floor(sel.b * sr) : buf.length;
        return { a: TK.clamp(a, 0, buf.length), b: TK.clamp(Math.max(b, a + 1), 0, buf.length), sr };
    }
    function mapRange(fn, label) {
        if (!hasAudio()) return;
        const r = rangeSamples();
        const chs = channelsOf(buf);
        fn(chs, r);
        setBuffer(makeBuffer(chs, buf.sampleRate));
        TK.status(label);
    }

    /* ================= PHÁT ================= */
    function buildChain(ac, dest, opts) {
        const o = opts || {};
        const input = ac.createGain();
        let node = input;
        const eqs = EQ_FREQ.map((f, i) => {
            const b = ac.createBiquadFilter();
            b.type = i === 0 ? 'lowshelf' : i === 4 ? 'highshelf' : 'peaking';
            b.frequency.value = f; b.gain.value = eqGains[i]; b.Q.value = 1.1;
            node.connect(b); node = b; return b;
        });
        if (fx.distort) {
            const ws = ac.createWaveShaper();
            const k = parseFloat(document.getElementById('distAmt').value) * 4;
            const n = 1024, curve = new Float32Array(n);
            for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
            ws.curve = curve; ws.oversample = '4x';
            node.connect(ws); node = ws;
        }
        if (fx.compress) {
            const c = ac.createDynamicsCompressor();
            c.threshold.value = -22; c.knee.value = 22; c.ratio.value = 5; c.attack.value = 0.004; c.release.value = 0.2;
            node.connect(c); node = c;
        }
        const sum = ac.createGain();
        node.connect(sum);
        if (fx.reverb) {
            const amt = parseFloat(document.getElementById('revAmt').value) / 100;
            const conv = ac.createConvolver();
            conv.buffer = impulse(ac, 2.2, 2.6);
            const wet = ac.createGain(); wet.gain.value = amt;
            node.connect(conv); conv.connect(wet); wet.connect(sum);
            const dry = ac.createGain(); dry.gain.value = 1 - amt * 0.35;
            node.disconnect(); node.connect(dry); dry.connect(sum); node.connect(conv);
        }
        if (fx.delay) {
            const amt = parseFloat(document.getElementById('delAmt').value) / 100;
            const d = ac.createDelay(2); d.delayTime.value = 0.28;
            const fb = ac.createGain(); fb.gain.value = TK.clamp(amt * 0.7, 0, 0.85);
            const wet = ac.createGain(); wet.gain.value = amt;
            node.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(sum);
        }
        const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
        const master = ac.createGain();
        master.gain.value = o.master == null ? parseFloat(document.getElementById('vol').value) / 100 : o.master;
        if (panner) { panner.pan.value = parseFloat(document.getElementById('pan').value) / 100; sum.connect(panner); panner.connect(master); }
        else sum.connect(master);
        master.connect(dest);
        return { input, master, panner };
    }
    function impulse(ac, seconds, decay) {
        const sr = ac.sampleRate, len = Math.floor(sr * seconds);
        const b = ac.createBuffer(2, len, sr);
        for (let c = 0; c < 2; c++) {
            const d = b.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        return b;
    }
    function stop() {
        if (srcNode) { try { srcNode.onended = null; srcNode.stop(); } catch (e) {} srcNode.disconnect(); srcNode = null; }
        playing = false;
        document.getElementById('playBtn').textContent = '▶';
    }
    function play(from, to) {
        if (!hasAudio()) return;
        const ac = AC();
        stop();
        const s = ac.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = parseFloat(document.getElementById('rate').value) / 100;
        s.loop = loop && to == null;
        const chain = buildChain(ac, ac.destination);
        liveMaster = chain.master; livePanner = chain.panner || null;
        s.connect(chain.input);
        const off = from == null ? playhead : from;
        s.start(0, TK.clamp(off, 0, buf.duration), to == null ? undefined : Math.max(0.01, (to - off) / s.playbackRate.value));
        srcNode = s; playing = true;
        startCtxTime = ac.currentTime; startOffset = off;
        document.getElementById('playBtn').textContent = '⏸';
        s.onended = () => {
            if (!playing) return;
            playing = false; srcNode = null;
            document.getElementById('playBtn').textContent = '▶';
            playhead = to != null ? TK.clamp(to, 0, buf.duration) : (loop ? 0 : buf.duration);
            updateStats(); draw();
        };
        TK.status('▶ Đang phát từ ' + fmt(off) + (to != null ? ' đến ' + fmt(to) : loop ? ' (lặp)' : ''));
        tick();
    }
    let rafId = 0;
    function tick() {
        cancelAnimationFrame(rafId);
        const step = () => {
            if (!playing) return;
            const rate = parseFloat(document.getElementById('rate').value) / 100;
            playhead = startOffset + (AC().currentTime - startCtxTime) * rate;
            if (playhead > buf.duration) playhead = loop ? playhead % buf.duration : buf.duration;
            document.getElementById('timeDisp').textContent = fmt(playhead);
            const px = playhead * pps();
            if (px < wrap.scrollLeft || px > wrap.scrollLeft + wrap.clientWidth - 20) wrap.scrollLeft = Math.max(0, px - wrap.clientWidth / 2);
            draw();
            rafId = requestAnimationFrame(step);
        };
        rafId = requestAnimationFrame(step);
    }

    /* ================= NẠP FILE / GHI ÂM ================= */
    async function loadFile(file, append) {
        if (!file) return;
        try {
            if (/\.json$/i.test(file.name)) return loadProject(file);
            TK.status('Đang giải mã ' + file.name + '…');
            const ab = await TK.readAsArrayBuffer(file);
            const ac = AC();
            const b = await ac.decodeAudioData(ab.slice(0));
            if (append && buf) { setBuffer(concatBuffers(buf, b), file.name); TK.toast('Đã nối ' + file.name + ' vào cuối', 'ok'); }
            else { playhead = 0; setBuffer(b, file.name); TK.toast('Đã tải ' + file.name + ' — ' + fmt(b.duration) + ', ' + b.sampleRate + 'Hz', 'ok'); }
        } catch (e) {
            TK.toast('Không giải mã được file: ' + e.message, 'error');
        }
    }
    function concatBuffers(a, b) {
        const ac = AC();
        const sr = a.sampleRate;
        const n = a.numberOfChannels > 1 ? 2 : 1;
        const out = ac.createBuffer(n, a.length + Math.round(b.duration * sr), sr);
        for (let c = 0; c < n; c++) {
            const d = out.getChannelData(c);
            d.set(a.getChannelData(Math.min(c, a.numberOfChannels - 1)), 0);
            const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
            for (let i = 0; i < src.length; i++) {
                const t = i / src.length;
                d[a.length + i] = src[i] * (t < 0.02 ? t / 0.02 : 1);
            }
        }
        return out;
    }
    async function toggleRecord() {
        const btn = document.getElementById('recBtn');
        if (recorder && recorder.state === 'recording') {
            recorder.stop();
            btn.classList.remove('on'); btn.textContent = '● Ghi âm';
            return;
        }
        try {
            recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            recChunks = [];
            recorder = new MediaRecorder(recStream);
            recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
            recorder.onstop = async () => {
                recStream.getTracks().forEach(t => t.stop());
                const blob = new Blob(recChunks, { type: recorder.mimeType || 'audio/webm' });
                const secs = (Date.now() - recStart) / 1000;
                try {
                    const ab = await blob.arrayBuffer();
                    const b = await AC().decodeAudioData(ab);
                    const name = 'mic-' + new Date().toLocaleTimeString('vi-VN').replace(/:/g, '-') + '.webm';
                    if (buf && (await TK.confirm('Bản ghi ' + secs.toFixed(1) + 's', 'Nối vào cuối file hiện tại? (Hủy = thay thế toàn bộ)'))) setBuffer(concatBuffers(buf, b), name);
                    else { playhead = 0; setBuffer(b, name); }
                    TK.toast('● Đã ghi ' + secs.toFixed(1) + ' giây', 'ok');
                } catch (e) { TK.toast('Không giải mã được bản ghi: ' + e.message, 'error'); }
            };
            recStart = Date.now();
            recorder.start();
            btn.classList.add('on'); btn.textContent = '⏹ Dừng ghi';
            TK.status('● Đang ghi âm từ micro… bấm lần nữa để dừng');
        } catch (e) {
            TK.toast('Không truy cập được micro: ' + e.message + ' (cần quyền micro và HTTPS/localhost)', 'error');
        }
    }

    /* ================= DỰ LIỆU / CHỈNH SỬA ================= */
    function push() {
        if (!buf) return;
        hist.push({ b: buf, n: fileName, ph: playhead });
    }
    function restore(h) { buf = h.b; fileName = h.n; playhead = TK.clamp(h.ph, 0, buf.duration); peakCache.pps = -1; layout(); }

    function exportWav(onlySel) {
        if (!hasAudio()) return;
        const r = onlySel ? rangeSamples() : { a: 0, b: buf.length, sr: buf.sampleRate };
        const wav = encodeWav(channelsOf(buf).map(c => c.slice(r.a, r.b)), buf.sampleRate);
        TK.download(new Blob([wav], { type: 'audio/wav' }), `${fileName.replace(/\.[^.]+$/, '')}${onlySel ? '-doanchon' : ''}.wav`);
        TK.status('Đã xuất WAV ' + ((r.b - r.a) / buf.sampleRate).toFixed(2) + 's · ' + buf.sampleRate + 'Hz · 16-bit');
    }
    function encodeWav(chs, sr) {
        const n = chs[0].length, chN = chs.length;
        const bytes = 44 + n * chN * 2;
        const ab = new ArrayBuffer(bytes), v = new DataView(ab);
        const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        wstr(0, 'RIFF'); v.setUint32(4, bytes - 8, true); wstr(8, 'WAVE');
        wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, chN, true);
        v.setUint32(24, sr, true); v.setUint32(28, sr * chN * 2, true); v.setUint16(32, chN * 2, true); v.setUint16(34, 16, true);
        wstr(36, 'data'); v.setUint32(40, n * chN * 2, true);
        let o = 44;
        for (let i = 0; i < n; i++) for (let c = 0; c < chN; c++) {
            let s = TK.clamp(chs[c][i], -1, 1);
            v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
        }
        return ab;
    }
    async function saveProject() {
        if (!hasAudio()) return;
        const wav = encodeWav(channelsOf(buf), buf.sampleRate);
        const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(new Blob([wav], { type: 'audio/wav' })); });
        TK.download(new Blob([JSON.stringify({ app: 'xAudio', name: fileName, sr: buf.sampleRate, eq: eqGains, fx, wav: b64 })], { type: 'application/json' }), 'xaudio-project.json');
    }
    async function loadProject(file) {
        try {
            const j = JSON.parse(await TK.readAsText(file));
            if (!j.wav) throw new Error('không có dữ liệu audio');
            const res = await fetch(j.wav);
            const ab = await res.arrayBuffer();
            const b = await AC().decodeAudioData(ab);
            if (Array.isArray(j.eq)) j.eq.forEach((g, i) => { eqGains[i] = g; const s = document.getElementById('eq' + i); if (s) { s.value = g; document.getElementById('eq' + i + 'V').textContent = g; } });
            Object.keys(fx).forEach(k => { fx[k] = !!(j.fx && j.fx[k]); const b2 = document.getElementById('fx' + k[0].toUpperCase() + k.slice(1)); if (b2) b2.classList.toggle('on', fx[k]); });
            playhead = 0;
            setBuffer(b, j.name || file.name);
            TK.toast('Đã mở dự án xAudio', 'ok');
        } catch (e) { TK.toast('Dự án lỗi: ' + e.message, 'error'); }
    }

    /* ================= TẠO ÂM ================= */
    function generated(chFill, seconds, sr, name, channels) {
        sr = sr || 44100;
        const len = Math.max(1, Math.round(seconds * sr));
        const chs = [];
        for (let c = 0; c < (channels || 1); c++) {
            const d = new Float32Array(len);
            chFill(d, c, sr, len);
            chs.push(d);
        }
        return { b: makeBuffer(chs, sr), name };
    }
    function env(i, len, a, r) {
        const at = Math.min(len * 0.02, a * len), rt = r * len;
        if (i < at) return i / at;
        if (i > len - rt) return Math.max(0, (len - i) / rt);
        return 1;
    }

    /* ================= GRANULAR TIME-STRETCH ================= */
    function timeStretch(chs, sr, factor) {
        const grain = Math.round(sr * 0.05), hop = Math.round(grain / 2);
        return chs.map(ch => {
            const outLen = Math.round(ch.length * factor);
            const out = new Float32Array(outLen);
            const win = new Float32Array(grain);
            for (let i = 0; i < grain; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / grain);
            let oi = 0;
            for (let pos = 0; pos + grain <= ch.length && oi < outLen; pos += hop) {
                for (let i = 0; i < grain && oi + i < outLen; i++) out[oi + i] += ch[pos + i] * win[i];
                oi += Math.round(hop * factor);
            }
            let mx = 0; for (let i = 0; i < out.length; i++) mx = Math.max(mx, Math.abs(out[i]));
            if (mx > 1) for (let i = 0; i < out.length; i++) out[i] /= mx;
            return out;
        });
    }
    function varispeed(chs, sr, rate) {
        return chs.map(ch => {
            const outLen = Math.round(ch.length / rate);
            const out = new Float32Array(outLen);
            for (let i = 0; i < outLen; i++) {
                const p = i * rate, i0 = Math.floor(p), f = p - i0;
                out[i] = (ch[i0] || 0) * (1 - f) + (ch[i0 + 1] || 0) * f;
            }
            return out;
        });
    }

    /* ================= BAKE HIỆU ỨNG ================= */
    async function bake(which, label) {
        if (!hasAudio()) return;
        const prev = JSON.parse(JSON.stringify(fx));
        if (which) Object.keys(fx).forEach(k => fx[k] = (k === which));
        const ac = AC();
        const tail = (fx.reverb ? 2.4 : 0) + (fx.delay ? 1.2 : 0);
        const len = Math.round((buf.duration + tail) * buf.sampleRate);
        const off = new OfflineAudioContext(Math.min(2, Math.max(1, buf.numberOfChannels)), len, buf.sampleRate);
        const chain = buildChain(off, off.destination, { master: 1 });
        const s = off.createBufferSource();
        s.buffer = buf; s.connect(chain.input); s.start(0);
        TK.status('Đang xử lý ' + (label || 'hiệu ứng') + '…');
        try {
            const rendered = await off.startRendering();
            let chs = channelsOf(rendered);
            if (!tail) { const keep = Math.round(buf.duration * buf.sampleRate); chs = chs.map(c => c.slice(0, keep)); }
            else { // cắt phần đuôi im lặng thừa
                const keep = Math.round((buf.duration + tail * 0.6) * buf.sampleRate);
                chs = chs.map(c => c.slice(0, Math.min(c.length, keep)));
            }
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('🔥 Đã nướng ' + (label || 'hiệu ứng') + ' vào audio (' + fmt(buf.duration) + ')', 'ok');
        } catch (e) {
            TK.toast('Xử lý thất bại: ' + e.message, 'error');
        }
        if (which) { Object.assign(fx, prev); syncFxButtons(); }
    }
    function syncFxButtons() {
        Object.keys(fx).forEach(k => {
            const b = document.getElementById('fx' + k[0].toUpperCase() + k.slice(1));
            if (b) b.classList.toggle('on', fx[k]);
        });
    }

    /* ================= ACTIONS ================= */
    TK.init({ app: 'xaudio', status: '.statusbar [data-status-text]' });
    const A = {
        openFile() { TK.pickFile('audio/*,.mp3,.wav,.ogg,.m4a,.flac,.webm,.json').then(f => loadFile(f)); },
        record() { toggleRecord(); },
        play() { if (!hasAudio()) return; playing ? (stop(), TK.status('⏸ Tạm dừng tại ' + fmt(playhead))) : play(playhead); },
        playSel() { if (!hasAudio()) return; if (!sel) return TK.toast('Kéo chuột trên waveform để chọn vùng trước', 'error'); play(sel.a, sel.b); },
        stop() { stop(); playhead = 0; updateStats(); draw(); TK.status('⏹ Đã dừng, về đầu'); },
        loop() { loop = !loop; document.getElementById('loopBtn').classList.toggle('on', loop); TK.toast('Lặp: ' + (loop ? 'BẬT' : 'TẮT')); },
        undo() { if (hist.canUndo()) { restore(hist.undo()); TK.status('↶ Hoàn tác'); } else TK.toast('Không còn gì để hoàn tác'); },
        redo() { if (hist.canRedo()) { restore(hist.redo()); TK.status('↷ Làm lại'); } else TK.toast('Không còn gì để làm lại'); },
        cut() {
            if (!hasAudio() || !sel) return TK.toast('Chọn vùng trước (kéo trên waveform)', 'error');
            const r = rangeSamples();
            clipboard = { ch: channelsOf(buf).map(c => c.slice(r.a, r.b)), sr: buf.sampleRate };
            const chs = channelsOf(buf).map(c => { const n = new Float32Array(c.length - (r.b - r.a)); n.set(c.slice(0, r.a), 0); n.set(c.slice(r.b), r.a); return n; });
            playhead = sel.a; sel = null;
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('✂ Đã cắt ' + ((r.b - r.a) / buf.sampleRate).toFixed(2) + 's vào clipboard', 'ok');
        },
        copy() {
            if (!hasAudio() || !sel) return TK.toast('Chọn vùng trước', 'error');
            const r = rangeSamples();
            clipboard = { ch: channelsOf(buf).map(c => c.slice(r.a, r.b)), sr: buf.sampleRate };
            TK.toast('⧉ Đã sao chép ' + ((r.b - r.a) / buf.sampleRate).toFixed(2) + 's', 'ok');
        },
        paste() {
            if (!hasAudio()) return;
            if (!clipboard) return TK.toast('Clipboard trống — chọn vùng rồi bấm Sao chép/Cắt', 'error');
            const at = Math.round(playhead * buf.sampleRate);
            const chs = channelsOf(buf).map((c, i) => {
                const srcCh = clipboard.ch[Math.min(i, clipboard.ch.length - 1)];
                const n = new Float32Array(c.length + srcCh.length);
                n.set(c.slice(0, at), 0); n.set(srcCh, at); n.set(c.slice(at), at + srcCh.length);
                return n;
            });
            sel = { a: playhead, b: playhead + clipboard.ch[0].length / buf.sampleRate };
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('📋 Đã dán ' + (sel.b - sel.a).toFixed(2) + 's tại ' + fmt(playhead), 'ok');
        },
        del() {
            if (!hasAudio() || !sel) return TK.toast('Chọn vùng trước', 'error');
            const r = rangeSamples();
            const chs = channelsOf(buf).map(c => { const n = new Float32Array(c.length - (r.b - r.a)); n.set(c.slice(0, r.a), 0); n.set(c.slice(r.b), r.a); return n; });
            playhead = sel.a; sel = null;
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.status('Đã xóa ' + ((r.b - r.a) / buf.sampleRate).toFixed(2) + 's');
        },
        trim() {
            if (!hasAudio() || !sel) return TK.toast('Chọn vùng muốn giữ lại', 'error');
            const r = rangeSamples();
            const chs = channelsOf(buf).map(c => c.slice(r.a, r.b));
            playhead = 0; sel = null;
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('⤢ Đã cắt chỉ giữ ' + buf.duration.toFixed(2) + 's', 'ok');
        },
        selAll() { if (!hasAudio()) return; sel = { a: 0, b: buf.duration }; layout(); TK.status('Đã chọn toàn bộ'); },
        clearSel() { sel = null; layout(); },
        fadeIn() {
            if (!hasAudio()) return;
            const r0 = rangeSamples();
            mapRange((chs, r) => chs.forEach(c => { for (let i = r.a; i < r.b; i++) c[i] *= (i - r.a) / (r.b - r.a || 1); }),
                '↗ Fade in ' + ((r0.b - r0.a) / buf.sampleRate).toFixed(2) + 's');
        },
        fadeOut() {
            if (!hasAudio()) return;
            const r0 = rangeSamples();
            mapRange((chs, r) => chs.forEach(c => { for (let i = r.a; i < r.b; i++) c[i] *= (r.b - i) / (r.b - r.a || 1); }),
                '↘ Fade out ' + ((r0.b - r0.a) / buf.sampleRate).toFixed(2) + 's');
        },
        reverse() { mapRange((chs, r) => chs.forEach(c => { const seg = c.slice(r.a, r.b).reverse(); c.set(seg, r.a); }), '⇄ Đã đảo ngược vùng chọn'); },
        silence() { mapRange((chs, r) => chs.forEach(c => c.fill(0, r.a, r.b)), '🔇 Đã làm im lặng vùng chọn'); },
        normalize() {
            if (!hasAudio()) return;
            const chs = channelsOf(buf);
            let peak = 0;
            const r = rangeSamples();
            chs.forEach(c => { for (let i = r.a; i < r.b; i++) peak = Math.max(peak, Math.abs(c[i])); });
            if (peak < 1e-6) return TK.toast('Vùng này im lặng hoàn toàn', 'error');
            const k = 0.99 / peak;
            chs.forEach(c => { for (let i = r.a; i < r.b; i++) c[i] = TK.clamp(c[i] * k, -1, 1); });
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('≋ Normalize: +' + (20 * Math.log10(k)).toFixed(1) + ' dB → peak -0.1 dBFS', 'ok');
        },
        async gain() {
            if (!hasAudio()) return;
            const v = await TK.askNumber('Chỉnh gain', 'Nhập số dB (âm: -6, dương: +6). Áp cho vùng chọn hoặc toàn bộ nếu không chọn:', 3);
            if (v == null) return;
            const k = Math.pow(10, (parseFloat(v) || 0) / 20);
            mapRange((chs, r) => chs.forEach(c => { for (let i = r.a; i < r.b; i++) c[i] = TK.clamp(c[i] * k, -1, 1); }), 'Gain ' + v + ' dB (×' + k.toFixed(3) + ')');
        },
        removeDc() {
            if (!hasAudio()) return;
            const chs = channelsOf(buf);
            chs.forEach(c => { let m = 0; for (let i = 0; i < c.length; i++) m += c[i]; m /= c.length || 1; for (let i = 0; i < c.length; i++) c[i] -= m; });
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('Đã bỏ lệch DC', 'ok');
        },
        trimSilence() {
            if (!hasAudio()) return;
            const ch = buf.getChannelData(0), th = 0.006;
            let a = 0, b = ch.length - 1;
            while (a < ch.length && Math.abs(ch[a]) < th) a++;
            while (b > a && Math.abs(ch[b]) < th) b--;
            if (a >= b) return TK.toast('Cả file gần như im lặng', 'error');
            const pad = Math.round(buf.sampleRate * 0.02);
            a = Math.max(0, a - pad); b = Math.min(ch.length, b + pad);
            const chs = channelsOf(buf).map(c => c.slice(a, b));
            playhead = 0; sel = null;
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('Đã cắt ' + (a / buf.sampleRate).toFixed(2) + 's đầu và ' + ((ch.length - b) / buf.sampleRate).toFixed(2) + 's cuối', 'ok');
        },
        denoise() {
            if (!hasAudio()) return;
            const chs = channelsOf(buf);
            // ước lượng ngưỡng ồn từ 10% sample nhỏ nhất
            const sample = [];
            const ch0 = chs[0];
            for (let i = 0; i < ch0.length; i += Math.max(1, Math.floor(ch0.length / 50000))) sample.push(Math.abs(ch0[i]));
            sample.sort((x, y) => x - y);
            const floor = sample[Math.floor(sample.length * 0.1)] || 0.002;
            const th = Math.max(0.002, floor * 2.2);
            let n = 0;
            chs.forEach(c => { for (let i = 0; i < c.length; i++) { if (Math.abs(c[i]) < th) { c[i] *= 0.12; n++; } } });
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast(`🔇 Noise gate: ngưỡng ${th.toFixed(4)} — đã hạ ${Math.round(n / chs.length / (buf.sampleRate / 1000))}ms mẫu ồn`, 'ok');
        },
        pitchUp() {
            if (!hasAudio()) return;
            const rate = Math.pow(2, 2 / 12);
            const chs = varispeed(channelsOf(buf), buf.sampleRate, rate);
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('⬆ Pitch +2 bán cung (tempo ×' + rate.toFixed(3) + ')', 'ok');
        },
        pitchDown() {
            if (!hasAudio()) return;
            const rate = Math.pow(2, -2 / 12);
            const chs = varispeed(channelsOf(buf), buf.sampleRate, rate);
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('⬇ Pitch −2 bán cung (tempo ×' + rate.toFixed(3) + ')', 'ok');
        },
        speedUp() {
            if (!hasAudio()) return;
            const chs = timeStretch(channelsOf(buf), buf.sampleRate, 1 / 1.25);
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('⏩ Nhanh ×1.25 (granular stretch, giữ nguyên pitch)', 'ok');
        },
        slowDown() {
            if (!hasAudio()) return;
            const chs = timeStretch(channelsOf(buf), buf.sampleRate, 1 / 0.8);
            setBuffer(makeBuffer(chs, buf.sampleRate));
            TK.toast('⏪ Chậm ×0.8 (granular stretch, giữ nguyên pitch)', 'ok');
        },
        toMono() {
            if (!hasAudio()) return;
            if (buf.numberOfChannels === 1) return TK.toast('File đã là mono');
            const chs = channelsOf(buf);
            const m = new Float32Array(chs[0].length);
            for (let i = 0; i < m.length; i++) m[i] = (chs[0][i] + (chs[1] ? chs[1][i] : 0)) / chs.length;
            setBuffer(makeBuffer([m], buf.sampleRate));
            TK.toast('Đã chuyển sang mono', 'ok');
        },
        stereoWiden() {
            if (!hasAudio()) return;
            if (buf.numberOfChannels < 2) return TK.toast('File mono — không mở rộng stereo được', 'error');
            const chs = channelsOf(buf), k = 1.45;
            const L = new Float32Array(chs[0].length), R = new Float32Array(chs[0].length);
            for (let i = 0; i < chs[0].length; i++) {
                const mid = (chs[0][i] + chs[1][i]) / 2, side = (chs[0][i] - chs[1][i]) / 2;
                L[i] = TK.clamp(mid + side * k, -1, 1); R[i] = TK.clamp(mid - side * k, -1, 1);
            }
            setBuffer(makeBuffer([L, R], buf.sampleRate));
            TK.toast('Đã mở rộng stereo (side ×1.45)', 'ok');
        },
        fx(e, elm) {
            const k = elm.dataset.arg;
            fx[k] = !fx[k];
            syncFxButtons();
            TK.toast((fx[k] ? 'BẬT ' : 'TẮT ') + k + (playing ? ' (ngay lập tức khi đang phát)' : ' — bấm "Nướng" để ghi vào file'), fx[k] ? 'ok' : '');
        },
        resetFx() {
            Object.keys(fx).forEach(k => fx[k] = false);
            eqGains.fill(0);
            for (let i = 0; i < 5; i++) { document.getElementById('eq' + i).value = 0; document.getElementById('eq' + i + 'V').textContent = '0'; }
            ['revAmt', 'delAmt', 'distAmt'].forEach(id => { document.getElementById(id).value = id === 'revAmt' ? 35 : id === 'delAmt' ? 30 : 20; document.getElementById(id + 'V').textContent = document.getElementById(id).value; });
            syncFxButtons();
            TK.toast('↺ Đã bỏ toàn bộ hiệu ứng', 'ok');
        },
        eqFlat() { setEq([0, 0, 0, 0, 0], 'EQ phẳng'); },
        eqVoice() { setEq([-6, 2, 4, 3, -3], 'EQ giọng nói (rõ lời)'); },
        eqBass() { setEq([8, 4, -1, 0, 2], 'EQ bass mạnh'); },
        bakeEq() { bake(null, 'EQ'); },
        bakeReverb() { bake('reverb', 'Reverb'); },
        bakeDelay() { bake('delay', 'Delay'); },
        bakeDistort() { bake('distort', 'Distortion'); },
        bakeCompress() { bake('compress', 'Compressor'); },
        bakeAll() { bake(null, 'toàn bộ chuỗi hiệu ứng'); },
        zoomIn() { zoom = (zoom || pps()) * 1.5; peakCache.pps = -1; draw(); },
        zoomOut() { zoom = Math.max(5, (zoom || pps()) / 1.5); peakCache.pps = -1; draw(); },
        zoomFit() { zoom = 0; peakCache.pps = -1; wrap.scrollLeft = 0; draw(); },
        exportWav() { exportWav(false); },
        exportSel() { exportWav(true); },
        saveProject,
        async tone() {
            const f = parseFloat(document.getElementById('gFreq').value) || 440;
            const d = TK.clamp(parseFloat(document.getElementById('gDur').value) || 2, 0.05, 60);
            const t = document.getElementById('gType').value;
            const g = generated((arr, c, sr, len) => {
                for (let i = 0; i < len; i++) {
                    const ph = (i / sr) * f * Math.PI * 2;
                    let v = t === 'sine' ? Math.sin(ph) : t === 'square' ? Math.sign(Math.sin(ph)) : t === 'sawtooth' ? 2 * ((i / sr * f) % 1) - 1 : 2 / Math.PI * Math.asin(Math.sin(ph));
                    arr[i] = v * 0.5 * env(i, len, 0.01, 0.05) * (c ? 0.9 : 1);
                }
            }, d, 44100, `${t}-${f}Hz.wav`, 2);
            playhead = 0; setBuffer(g.b, g.name);
            TK.toast(`♪ Đã tạo sóng ${t} ${f}Hz · ${d}s`, 'ok');
        },
        async appendTone() {
            const f = parseFloat(document.getElementById('gFreq').value) || 440;
            const d = TK.clamp(parseFloat(document.getElementById('gDur').value) || 1, 0.05, 30);
            const t = document.getElementById('gType').value;
            const g = generated((arr, c, sr, len) => {
                for (let i = 0; i < len; i++) {
                    const ph = (i / sr) * f * Math.PI * 2;
                    arr[i] = (t === 'sine' ? Math.sin(ph) : t === 'square' ? Math.sign(Math.sin(ph)) : t === 'sawtooth' ? 2 * ((i / sr * f) % 1) - 1 : 2 / Math.PI * Math.asin(Math.sin(ph))) * 0.45 * env(i, len, 0.01, 0.05);
                }
            }, d, buf ? buf.sampleRate : 44100, 'tone.wav', 1);
            if (!buf) { playhead = 0; return setBuffer(g.b, g.name); }
            setBuffer(concatBuffers(buf, g.b), fileName);
            TK.toast('＋ Đã nối sóng ' + f + 'Hz vào cuối', 'ok');
        },
        async noise() {
            const d = TK.clamp(parseFloat(document.getElementById('gDur').value) || 1, 0.05, 30);
            const g = generated((arr, c, sr, len) => { for (let i = 0; i < len; i++) arr[i] = (Math.random() * 2 - 1) * 0.4 * env(i, len, 0.005, 0.02); }, d, 44100, 'noise.wav', 2);
            playhead = 0; setBuffer(g.b, g.name); TK.toast('Đã tạo nhiễu trắng ' + d + 's', 'ok');
        },
        async silenceGen() {
            const d = TK.clamp(parseFloat(document.getElementById('gDur').value) || 1, 0.05, 120);
            const g = generated(() => {}, d, 44100, 'silence.wav', 2);
            playhead = 0; setBuffer(g.b, g.name); TK.toast('Đã tạo ' + d + 's im lặng', 'ok');
        },
        async chord() {
            const base = parseFloat(document.getElementById('gFreq').value) || 261.63;
            const d = TK.clamp(parseFloat(document.getElementById('gDur').value) || 3, 0.2, 30);
            const ratios = [1, 1.25, 1.5]; // trưởng
            const g = generated((arr, c, sr, len) => {
                for (let i = 0; i < len; i++) {
                    let v = 0;
                    ratios.forEach((r, k) => { v += Math.sin(2 * Math.PI * base * r * (i / sr) + k * (c ? 0.4 : 0)) / 3; });
                    arr[i] = v * 0.55 * env(i, len, 0.02, 0.25);
                }
            }, d, 44100, 'chord.wav', 2);
            playhead = 0; setBuffer(g.b, g.name);
            TK.toast('🎹 Hợp âm trưởng từ ' + base.toFixed(1) + 'Hz (' + ratios.map(r => (base * r).toFixed(1) + 'Hz').join(' · ') + ')', 'ok');
        },
        async sweep() {
            const f0 = parseFloat(document.getElementById('gFreq').value) || 100;
            const d = TK.clamp(parseFloat(document.getElementById('gDur').value) || 3, 0.2, 30);
            const f1 = f0 * 40;
            const g = generated((arr, c, sr, len) => {
                let ph = 0;
                for (let i = 0; i < len; i++) {
                    const t = i / len;
                    const f = f0 * Math.pow(f1 / f0, t);
                    ph += 2 * Math.PI * f / sr;
                    arr[i] = Math.sin(ph) * 0.5 * env(i, len, 0.01, 0.05);
                }
            }, d, 44100, 'sweep.wav', 2);
            playhead = 0; setBuffer(g.b, g.name);
            TK.toast(`Sweep ${f0.toFixed(0)}Hz → ${f1.toFixed(0)}Hz trong ${d}s`, 'ok');
        },
        async beat() {
            const bpm = 100, bars = 2, sr = 44100;
            const beatLen = 60 / bpm, total = beatLen * 4 * bars;
            const g = generated((arr, c, s, len) => {
                const put = (t, fn, dur2, gain) => {
                    const st = Math.round(t * s), n = Math.round(dur2 * s);
                    for (let i = 0; i < n && st + i < len; i++) arr[st + i] += fn(i / s, i / n) * gain;
                };
                for (let b = 0; b < bars * 4; b++) {
                    const t = b * beatLen;
                    if (b % 2 === 0) put(t, (x, p) => Math.sin(2 * Math.PI * (60 + 60 * Math.exp(-x * 22)) * x) * Math.exp(-x * 7), 0.4, 0.85); // kick
                    if (b % 4 === 2) put(t, (x, p) => (Math.random() * 2 - 1) * Math.exp(-x * 24), 0.22, 0.45); // snare
                    for (let h = 0; h < 2; h++) put(t + h * beatLen / 2, (x) => (Math.random() * 2 - 1) * Math.exp(-x * 70), 0.06, 0.18); // hat
                    if (b % 8 === 7) put(t, (x) => Math.sin(2 * Math.PI * 180 * x) * Math.exp(-x * 12), 0.2, 0.25);
                }
                for (let i = 0; i < len; i++) arr[i] = TK.clamp(arr[i], -1, 1) * 0.92;
            }, total, sr, `beat-${bpm}bpm.wav`, 2);
            playhead = 0; setBuffer(g.b, g.name);
            TK.toast('🥁 Đã tạo nhịp ' + bpm + ' BPM · ' + bars + ' nhịp 4/4 (kick, snare, hat)', 'ok');
        },
        async aiAnalyze() {
            if (!hasAudio()) return;
            const ch = buf.getChannelData(0);
            let peak = 0, sum = 0, silent = 0, n = 0;
            const step = Math.max(1, Math.floor(ch.length / 300000));
            for (let i = 0; i < ch.length; i += step) { const v = Math.abs(ch[i]); peak = Math.max(peak, v); sum += v * v; if (v < 0.005) silent++; n++; }
            const rms = Math.sqrt(sum / (n || 1));
            // ước lượng tempo bằng khoảng cách các đỉnh năng lượng
            const win = Math.round(buf.sampleRate * 0.02);
            const energy = [];
            for (let i = 0; i + win < ch.length; i += win) {
                let e = 0; for (let j = 0; j < win; j += 4) e += ch[i + j] * ch[i + j];
                energy.push(e / (win / 4));
            }
            let onsets = 0;
            for (let i = 1; i < energy.length; i++) if (energy[i] > energy[i - 1] * 2.2 && energy[i] > 0.0008) onsets++;
            const bpm = Math.round(onsets / (buf.duration / 60)) || 0;
            const info = `Thời lượng ${buf.duration.toFixed(2)}s; sample rate ${buf.sampleRate}Hz; ${buf.numberOfChannels} kênh; peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS; RMS ${(20 * Math.log10(rms || 1e-9)).toFixed(1)} dBFS; tỉ lệ im lặng ${(silent / (n || 1) * 100).toFixed(1)}%; số onset ước lượng ${onsets}; tempo ước lượng ~${bpm} BPM; EQ hiện tại ${eqGains.join('/')} dB; hiệu ứng đang bật: ${Object.keys(fx).filter(k => fx[k]).join(', ') || 'không'}`;
            TK.status('✨ AI đang phân tích số liệu âm thanh…');
            try {
                const t = await TK.ai(`Bạn là kỹ sư âm thanh. Đây là số liệu đo được từ file audio trong trình duyệt (AI không nghe trực tiếp, chỉ phân tích số liệu):\n${info}\n\nHãy nhận xét ngắn gọn bằng tiếng Việt: chất lượng bản thu, vấn đề có thể có (ồn, méo, quá nhỏ/quá to, im lặng dài), và đề xuất cụ thể nên bấm nút nào trong xAudio (Normalize, Noise gate, EQ giọng nói, Compressor, Trim im lặng 2 đầu, Fade…). Tối đa 150 từ.`, { system: 'Bạn là kỹ sư master âm thanh, trả lời ngắn và thực tế.' });
                if (!t) return;
                TK.modal({ title: '✨ AI phân tích âm thanh', message: String(t), ok: 'Đóng', cancel: '' });
                TK.status('AI đã phân tích xong');
            } catch (e) {
                TK.toast('AI lỗi: ' + RuneAI.humanError(e.message) + ' — số liệu đo được vẫn hiển thị ở panel Thông tin', 'error');
            }
        }
    };
    function setEq(vals, label) {
        vals.forEach((v, i) => {
            eqGains[i] = v;
            document.getElementById('eq' + i).value = v;
            document.getElementById('eq' + i + 'V').textContent = v;
        });
        TK.toast('🎚 ' + label + ' — ' + vals.join(' / ') + ' dB', 'ok');
    }
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    /* ---------- điều khiển trượt ---------- */
    TK.slider('#vol', '#volV', v => { if (liveMaster) liveMaster.gain.value = v / 100; }, v => v + '%');
    TK.slider('#pan', '#panV', v => { if (livePanner) livePanner.pan.value = v / 100; }, v => (v === 0 ? 'C' : (v < 0 ? 'L' + Math.abs(v) : 'R' + v)));
    TK.slider('#rate', '#rateV', v => { if (srcNode) srcNode.playbackRate.value = v / 100; }, v => (v / 100).toFixed(2) + '×');
    for (let i = 0; i < 5; i++) TK.slider('#eq' + i, '#eq' + i + 'V', v => eqGains[i] = v);
    TK.slider('#revAmt', '#revAmtV');
    TK.slider('#delAmt', '#delAmtV');
    TK.slider('#distAmt', '#distAmtV');

    /* ---------- chọn vùng trên waveform ---------- */
    function timeAt(e) {
        const r = cv.getBoundingClientRect();
        return TK.clamp((e.clientX - r.left) * (cv.width / (window.devicePixelRatio || 1)) / r.width / pps(), 0, buf ? buf.duration : 0);
    }
    let dragSel = null;
    cv.addEventListener('pointerdown', e => {
        if (!buf) return;
        cv.setPointerCapture(e.pointerId);
        const p = timeAt(e);
        dragSel = { a: p, b: p, moved: false };
    });
    cv.addEventListener('pointermove', e => {
        if (!dragSel || !buf) return;
        const p = timeAt(e);
        if (Math.abs(p - dragSel.a) > 0.005) dragSel.moved = true;
        dragSel.b = p;
        sel = { a: Math.min(dragSel.a, dragSel.b), b: Math.max(dragSel.a, dragSel.b) };
        if (sel.b - sel.a < 0.005) sel = null;
        draw(); updateStats();
    });
    cv.addEventListener('pointerup', e => {
        if (!dragSel) return;
        if (!dragSel.moved) {
            sel = null;
            playhead = timeAt(e);
            TK.status('Playhead: ' + fmt(playhead));
        } else TK.status('Đã chọn ' + fmt(sel.a) + ' → ' + fmt(sel.b));
        dragSel = null; draw(); updateStats();
    });
    cv.addEventListener('wheel', e => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.deltaY < 0 ? A.zoomIn() : A.zoomOut();
    }, { passive: false });
    wrap.addEventListener('scroll', () => {
        const inner = ruler.firstElementChild;
        if (inner) inner.style.transform = `translateX(${-wrap.scrollLeft}px)`;
    });

    /* ---------- kéo thả file ---------- */
    ['dragenter', 'dragover'].forEach(t => wrap.addEventListener(t, e => { e.preventDefault(); wrap.style.outline = '2px dashed #00e5b8'; }));
    ['dragleave', 'drop'].forEach(t => wrap.addEventListener(t, e => { e.preventDefault(); wrap.style.outline = 'none'; }));
    wrap.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f, e.shiftKey); });

    /* ---------- phím tắt ---------- */
    document.addEventListener('keydown', e => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
        const k = e.key.toLowerCase();
        if (k === ' ') { e.preventDefault(); return A.play(); }
        if ((e.ctrlKey || e.metaKey) && k === ' ') { e.preventDefault(); return A.playSel(); }
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return e.shiftKey ? A.redo() : A.undo(); }
        if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); return A.redo(); }
        if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); return A.openFile(); }
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); return A.exportWav(); }
        if ((e.ctrlKey || e.metaKey) && k === 'r') { e.preventDefault(); return A.record(); }
        if ((e.ctrlKey || e.metaKey) && k === 'x') { e.preventDefault(); return A.cut(); }
        if ((e.ctrlKey || e.metaKey) && k === 'c') { e.preventDefault(); return A.copy(); }
        if ((e.ctrlKey || e.metaKey) && k === 'v') { e.preventDefault(); return A.paste(); }
        if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); return A.selAll(); }
        if ((e.ctrlKey || e.metaKey) && k === 't') { e.preventDefault(); return A.trim(); }
        if (k === 'delete' || k === 'backspace') { e.preventDefault(); return A.del(); }
        if (k === 'home') { playhead = 0; updateStats(); draw(); }
        if (k === 'end' && buf) { playhead = buf.duration; updateStats(); draw(); }
        if (k === 'arrowleft' && buf) { playhead = TK.clamp(playhead - (e.shiftKey ? 1 : 0.05), 0, buf.duration); updateStats(); draw(); }
        if (k === 'arrowright' && buf) { playhead = TK.clamp(playhead + (e.shiftKey ? 1 : 0.05), 0, buf.duration); updateStats(); draw(); }
        if (k === 'l') A.loop();
        if (k === 'f') A.fadeIn();
        if (k === 'g') A.fadeOut();
        if (k === 'n') A.normalize();
    });

    /* ---------- lệnh AI / trang cha ---------- */
    TK.cmd('get_info', () => buf ? ({
        app: 'xAudio', file: fileName, duration: +buf.duration.toFixed(3), sampleRate: buf.sampleRate, channels: buf.numberOfChannels,
        playhead: +playhead.toFixed(3), selection: sel ? { from: +sel.a.toFixed(3), to: +sel.b.toFixed(3) } : null,
        eq: eqGains.slice(), effects: Object.keys(fx).filter(k => fx[k])
    }) : { app: 'xAudio', file: null, message: 'chưa có audio' });
    TK.cmd('generate', a => {
        const kind = String(a.type || a.kind || 'tone');
        document.getElementById('gFreq').value = a.freq || a.frequency || 440;
        document.getElementById('gDur').value = a.duration || a.seconds || 2;
        if (a.wave) document.getElementById('gType').value = ['sine', 'square', 'sawtooth', 'triangle'].includes(a.wave) ? a.wave : 'sine';
        ({ tone: A.tone, noise: A.noise, chord: A.chord, sweep: A.sweep, beat: A.beat, silence: A.silenceGen }[kind] || A.tone)();
        return { generated: kind };
    });
    TK.cmd('edit', a => {
        const op = String(a.op || a.action || '').toLowerCase();
        const map = { cut: A.cut, copy: A.copy, paste: A.paste, delete: A.del, del: A.del, trim: A.trim, fadein: A.fadeIn, fadeout: A.fadeOut, reverse: A.reverse, normalize: A.normalize, silence: A.silence, denoise: A.denoise, mono: A.toMono, trimsilence: A.trimSilence, dc: A.removeDc };
        if (!map[op]) return { ok: false, error: 'Không có thao tác "' + op + '". Hỗ trợ: ' + Object.keys(map).join(', ') };
        map[op]();
        return { ok: true, op };
    });
    TK.cmd('set_selection', a => {
        if (!buf) return { ok: false, error: 'chưa có audio' };
        sel = { a: TK.clamp(+a.from || 0, 0, buf.duration), b: TK.clamp(+a.to || buf.duration, 0, buf.duration) };
        if (sel.b <= sel.a) sel = null;
        layout(); return sel;
    });
    TK.cmd('play', a => { if (a.stop) A.stop(); else if (a.selection) A.playSel(); else A.play(); return { playing }; });
    TK.cmd('set_eq', a => { const v = a.values || a.eq || [0, 0, 0, 0, 0]; setEq(v.map(Number), 'EQ từ lệnh AI'); return eqGains; });
    TK.cmd('apply_effect', a => {
        const k = String(a.effect || a.name || '').toLowerCase();
        const alias = { reverb: 'reverb', vang: 'reverb', delay: 'delay', echo: 'delay', distort: 'distort', distortion: 'distort', compress: 'compress', compressor: 'compress', nén: 'compress' }[k];
        if (!alias) return { ok: false, error: 'Hiệu ứng không rõ: ' + k };
        fx[alias] = true; syncFxButtons();
        if (a.bake !== false) bake(alias, alias);
        return { ok: true, effect: alias, baked: a.bake !== false };
    });
    TK.cmd('export', a => { (String(a.format || 'wav') === 'wav' && a.selection) ? exportWav(true) : exportWav(false); return { format: 'wav' }; });
    TK.cmd('record', () => { toggleRecord(); return { recording: !!(recorder && recorder.state === 'recording') }; });
    TK.cmd('get_stats', () => {
        if (!buf) return { ok: false };
        const ch = buf.getChannelData(0);
        let peak = 0, sum = 0, n = 0;
        const step = Math.max(1, Math.floor(ch.length / 200000));
        for (let i = 0; i < ch.length; i += step) { const v = Math.abs(ch[i]); peak = Math.max(peak, v); sum += v * v; n++; }
        return { duration: +buf.duration.toFixed(3), sampleRate: buf.sampleRate, channels: buf.numberOfChannels, peakDbfs: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rmsDbfs: +(20 * Math.log10(Math.sqrt(sum / (n || 1)) || 1e-9)).toFixed(1) };
    });

    layout();
    window.addEventListener('resize', () => { peakCache.pps = -1; draw(); });
    TK.status('Sẵn sàng — mở file, ghi âm, kéo-thả file vào waveform, hoặc tạo sóng/nhịp trống.');
})();
