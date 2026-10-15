/* ============================================================
   xLight — Develop engine thật: white balance, exposure, tone,
   HSL, clarity, sharpen, noise, vignette, mask cọ, crop, xoay,
   histogram thật, preset, 7 module (Library/Develop/Map/Book/
   Slideshow/Print/Web), AI chỉnh ảnh qua khóa AI của Rune
   ============================================================ */
(function () {
    'use strict';

    const view = document.getElementById('viewCanvas');
    const vctx = view.getContext('2d', { willReadFrequently: true });
    const histC = document.getElementById('histCanvas');
    const hctx = histC.getContext('2d');

    const PREVIEW_MAX = 1100;
    const photos = [];
    let cur = -1;
    let module = 'develop';
    let tool = null;
    let compareOn = false, compareX = 0.5;
    let zoomed = false;
    let slideTimer = null, slideIdx = 0;
    let dirty = false, rafId = null;

    /* ---------------- thông số ---------------- */
    const DEFAULTS = {
        exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
        texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
        temp: 5500, tint: 0, sharpen: 40, noise: 25, vignette: 0, grain: 0, rotate: 0
    };
    const HSL_CHANNELS = [
        { id: 'red', name: 'Red', c: 0, color: '#ef4444' }, { id: 'orange', name: 'Orange', c: 30, color: '#f97316' },
        { id: 'yellow', name: 'Yellow', c: 60, color: '#eab308' }, { id: 'green', name: 'Green', c: 120, color: '#22c55e' },
        { id: 'aqua', name: 'Aqua', c: 180, color: '#06b6d4' }, { id: 'blue', name: 'Blue', c: 240, color: '#3b82f6' },
        { id: 'purple', name: 'Purple', c: 280, color: '#8b5cf6' }, { id: 'magenta', name: 'Magenta', c: 320, color: '#ec4899' }
    ];
    const newHsl = () => HSL_CHANNELS.reduce((a, c) => (a[c.id] = { h: 0, s: 0, l: 0 }, a), {});

    const SLIDER_SPECS = {
        basicSliders: [
            ['exposure', 'Exposure', -100, 100, v => (v / 50).toFixed(2) + ' EV'],
            ['contrast', 'Contrast', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['highlights', 'Highlights', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['shadows', 'Shadows', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['whites', 'Whites', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['blacks', 'Blacks', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['texture', 'Texture', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['clarity', 'Clarity', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['dehaze', 'Dehaze', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['vibrance', 'Vibrance', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['saturation', 'Saturation', -100, 100, v => (v > 0 ? '+' : '') + v]
        ],
        wbSliders: [
            ['temp', 'Temp', 2000, 10000, v => v + 'K'],
            ['tint', 'Tint', -100, 100, v => (v > 0 ? '+' : '') + v]
        ],
        detailSliders: [
            ['sharpen', 'Sharpening', 0, 150, v => v],
            ['noise', 'Noise Reduction', 0, 100, v => v]
        ],
        effectSliders: [
            ['vignette', 'Vignette', -100, 100, v => (v > 0 ? '+' : '') + v],
            ['grain', 'Grain', 0, 100, v => v],
            ['rotate', 'Straighten', -45, 45, v => v + '°']
        ]
    };

    const PRESETS = {
        original: {},
        colorpop: { vibrance: 42, saturation: 12, contrast: 14, clarity: 12 },
        vintage: { temperature: 6200, contrast: -8, saturation: -22, vignette: 32, grain: 26, highlights: -14 },
        golden: { temp: 6800, tint: 8, exposure: 8, vibrance: 22, highlights: -18, shadows: 18 },
        coolblue: { temp: 4300, tint: -6, contrast: 12, saturation: -6, clarity: 14 },
        cinematic: { contrast: 24, highlights: -26, shadows: 16, saturation: -12, vibrance: 16, vignette: 24, temp: 5200 },
        bwcontrast: { saturation: -100, contrast: 42, clarity: 24, blacks: -18, whites: 12 },
        bwsoft: { saturation: -100, contrast: -8, highlights: 12, shadows: 18, grain: 14 },
        bwhighkey: { saturation: -100, exposure: 26, contrast: -12, blacks: 32, whites: 18 },
        mcontrast: { contrast: 18, blacks: -8, whites: 8 },
        scontrast: { contrast: 42, blacks: -24, whites: 20, clarity: 18 },
        flat: { contrast: -32, blacks: 22, whites: -14, saturation: -14 }
    };

    /* ---------------- dựng UI slider ---------------- */
    function buildSliders() {
        Object.keys(SLIDER_SPECS).forEach(boxId => {
            const box = document.getElementById(boxId);
            box.innerHTML = SLIDER_SPECS[boxId].map(([key, label, min, max, fmt]) => `
                <div class="slider-row">
                    <div class="slider-row-header"><span>${label}</span><span class="slider-value" data-val="${key}"></span></div>
                    <input type="range" min="${min}" max="${max}" step="1" data-param="${key}">
                </div>`).join('');
        });
        document.querySelectorAll('input[data-param]').forEach(inp => {
            inp.addEventListener('input', () => {
                if (cur < 0) return;
                P()[inp.dataset.param] = parseFloat(inp.value);
                syncSliderLabels(); scheduleRender();
            });
        });
        document.getElementById('wbPreset').addEventListener('change', e => {
            if (cur < 0) return;
            P().temp = parseInt(e.target.value, 10);
            syncSliderLabels(); scheduleRender();
        });

        // HSL
        const grid = document.getElementById('hslGrid');
        grid.innerHTML = HSL_CHANNELS.map(c => `<button class="hsl-btn" data-action="hsl" data-arg="${c.id}" style="background:${c.color}">${c.name}</button>`).join('');
        document.getElementById('hslPanel').innerHTML = ['h', 's', 'l'].map(k => `
            <div class="slider-row">
                <div class="slider-row-header"><span>${k === 'h' ? 'Hue' : k === 's' ? 'Saturation' : 'Luminance'}</span><span class="slider-value" data-hslval="${k}"></span></div>
                <input type="range" min="-100" max="100" step="1" data-hsl="${k}">
            </div>`).join('') + `<div class="btn-row"><button data-action="hslReset">Reset kênh này</button></div>`;
        document.querySelectorAll('input[data-hsl]').forEach(inp => {
            inp.addEventListener('input', () => {
                if (cur < 0 || !hslActive) return;
                P().hsl[hslActive][inp.dataset.hsl] = parseFloat(inp.value);
                syncHslLabels(); scheduleRender();
            });
        });

        document.getElementById('chkCA').addEventListener('change', () => { if (cur >= 0) { P().ca = document.getElementById('chkCA').checked; scheduleRender(); } });
        document.getElementById('chkProfile').addEventListener('change', () => { if (cur >= 0) { P().profile = document.getElementById('chkProfile').checked; scheduleRender(); } });
    }
    let hslActive = null;
    const P = () => photos[cur].params;

    function syncSliderLabels() {
        if (cur < 0) return;
        const p = P();
        document.querySelectorAll('input[data-param]').forEach(inp => {
            const k = inp.dataset.param;
            inp.value = p[k];
            const spec = Object.values(SLIDER_SPECS).flat().find(s => s[0] === k);
            const lab = document.querySelector(`[data-val="${k}"]`);
            if (lab && spec) lab.textContent = spec[4](p[k]);
        });
        document.getElementById('wbPreset').value = String(p.temp);
    }
    function syncHslLabels() {
        if (cur < 0 || !hslActive) return;
        const c = P().hsl[hslActive];
        ['h', 's', 'l'].forEach(k => {
            const inp = document.querySelector(`input[data-hsl="${k}"]`);
            inp.value = c[k];
            document.querySelector(`[data-hslval="${k}"]`).textContent = (c[k] > 0 ? '+' : '') + c[k];
        });
    }

    /* ---------------- ảnh ---------------- */
    function makePhoto(name, imgEl) {
        const scale = Math.min(1, PREVIEW_MAX / imgEl.naturalWidth);
        const prev = document.createElement('canvas');
        prev.width = Math.round(imgEl.naturalWidth * scale);
        prev.height = Math.round(imgEl.naturalHeight * scale);
        prev.getContext('2d').drawImage(imgEl, 0, 0, prev.width, prev.height);

        const full = document.createElement('canvas');
        full.width = imgEl.naturalWidth; full.height = imgEl.naturalHeight;
        full.getContext('2d').drawImage(imgEl, 0, 0);

        const mask = document.createElement('canvas');
        mask.width = prev.width; mask.height = prev.height;

        return {
            id: Date.now() + Math.random(), name, img: imgEl, full, prev, mask,
            params: Object.assign({ hsl: newHsl(), ca: false, profile: true, preset: 'original' }, DEFAULTS),
            rating: 0, lat: null, lon: null
        };
    }

    async function addFiles(files) {
        let added = 0;
        for (const f of files) {
            if (!f.type.startsWith('image/')) continue;
            try {
                const img = await TK.loadImage(await TK.readAsDataURL(f));
                photos.push(makePhoto(f.name, img));
                added++;
            } catch (e) { TK.toast('Không đọc được ' + f.name, 'error'); }
        }
        if (added) { select(photos.length - 1); TK.status(`Đã nhập ${added} ảnh — tổng ${photos.length}`); }
        renderFilmstrip(); renderLibrary();
        return added;
    }

    function select(i) {
        cur = TK.clamp(i, 0, photos.length - 1);
        const p = photos[cur];
        view.width = p.prev.width; view.height = p.prev.height;
        document.getElementById('stFile').textContent = p.name;
        document.getElementById('stMeta').textContent = `${p.full.width}×${p.full.height} px · ${'★'.repeat(p.rating) || 'chưa đánh giá'}`;
        syncSliderLabels(); syncHslLabels();
        document.getElementById('chkCA').checked = !!p.params.ca;
        document.getElementById('chkProfile').checked = p.params.profile !== false;
        renderFilmstrip(); renderLibrary();
        renderNow();
    }

    function renderFilmstrip() {
        const box = document.getElementById('filmstrip');
        box.innerHTML = '';
        if (!photos.length) { box.innerHTML = '<div class="thumb-empty">Chưa có ảnh — bấm 📥 Nhập ảnh (hoặc menu Preset → Ảnh mẫu ở Library)</div>'; return; }
        photos.forEach((p, i) => {
            const d = document.createElement('div');
            d.className = 'thumb' + (i === cur ? ' active' : '');
            d.style.backgroundImage = `url(${p.prev.toDataURL('image/jpeg', 0.5)})`;
            d.title = p.name;
            d.innerHTML = `<span class="rate">${'★'.repeat(p.rating)}</span><span class="del" title="Xóa ảnh">✕</span>`;
            d.addEventListener('click', e => {
                if (e.target.classList.contains('del')) {
                    photos.splice(i, 1);
                    if (!photos.length) { cur = -1; vctx.clearRect(0, 0, view.width, view.height); drawHistogram(null); document.getElementById('stFile').textContent = 'Chưa có ảnh'; }
                    else select(Math.min(i, photos.length - 1));
                    renderFilmstrip(); renderLibrary();
                    return;
                }
                select(i);
            });
            box.appendChild(d);
        });
    }

    function renderLibrary() {
        const g = document.getElementById('libGrid');
        g.innerHTML = '';
        if (!photos.length) {
            g.innerHTML = `<div class="drop-hint" style="grid-column:1/-1;">Kéo thả ảnh vào cửa sổ này, hoặc bấm <b>&nbsp;📥 Nhập ảnh&nbsp;</b> ở thanh trên.<br><br>
            <button class="tbtn" data-action="loadSamples" style="margin-top:8px;">🎞️ Nạp 3 ảnh mẫu để thử ngay</button></div>`;
            const b = g.querySelector('[data-action="loadSamples"]');
            if (b) b.addEventListener('click', loadSamples);
            return;
        }
        photos.forEach((p, i) => {
            const c = document.createElement('div');
            c.className = 'lib-card' + (i === cur ? ' active' : '');
            c.innerHTML = `<div class="img" style="background-image:url(${p.prev.toDataURL('image/jpeg', .6)})"></div>
                <div class="meta"><b>${TK.app === 'x' ? '' : ''}${escapeHtml(p.name)}</b>
                <span style="color:#888;">${p.full.width}×${p.full.height}</span><br>
                <span class="rate" data-r="${i}" style="color:#ffd166;cursor:pointer;font-size:13px;">${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}</span>
                <span style="float:right;color:#5cb8ff;cursor:pointer;" data-dev="${i}">Develop ➤</span></div>`;
            c.addEventListener('click', e => {
                if (e.target.dataset.r != null) { photos[i].rating = (photos[i].rating + 1) % 6; renderLibrary(); renderFilmstrip(); return; }
                if (e.target.dataset.dev != null) { select(i); setModule('develop'); return; }
                select(i);
            });
            g.appendChild(c);
        });
    }
    const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ---------------- PIPELINE xử lý ảnh ---------------- */
    function processTo(srcCanvas, outCanvas, p, maskCanvas) {
        const w = srcCanvas.width, h = srcCanvas.height;
        outCanvas.width = w; outCanvas.height = h;
        const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
        ctx.save();
        ctx.clearRect(0, 0, w, h);
        if (p.rotate) {
            const rad = p.rotate * Math.PI / 180;
            const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
            const nw = w * cos + h * sin, nh = w * sin + h * cos;
            outCanvas.width = Math.round(nw); outCanvas.height = Math.round(nh);
            ctx.translate(outCanvas.width / 2, outCanvas.height / 2);
            ctx.rotate(rad);
            ctx.drawImage(srcCanvas, -w / 2, -h / 2);
        } else ctx.drawImage(srcCanvas, 0, 0);
        ctx.restore();

        const W = outCanvas.width, H = outCanvas.height;
        const img = ctx.getImageData(0, 0, W, H);
        const d = img.data;

        let maskData = null;
        if (maskCanvas && maskCanvas.width) {
            const mc = document.createElement('canvas');
            mc.width = W; mc.height = H;
            const mx = mc.getContext('2d');
            mx.drawImage(maskCanvas, 0, 0, W, H);
            maskData = mx.getImageData(0, 0, W, H).data;
        }

        // white balance gains
        const t = (p.temp - 5500) / 4500;                 // -0.78 .. 1
        const gR = 1 + t * 0.28, gB = 1 - t * 0.28, gG = 1 - (p.tint / 100) * 0.12;
        const expMul = Math.pow(2, p.exposure / 50);
        const con = p.contrast / 100, dhz = p.dehaze / 100;
        const hl = p.highlights / 100, sh = p.shadows / 100, wh = p.whites / 100, bl = p.blacks / 100;
        const vib = p.vibrance / 100, sat = 1 + p.saturation / 100;
        const vg = p.vignette / 100, grain = p.grain / 100;
        const hsl = p.hsl || {};
        const cx = W / 2, cy = H / 2, maxR = Math.sqrt(cx * cx + cy * cy);
        const hasHsl = Object.keys(hsl).some(k => hsl[k].h || hsl[k].s || hsl[k].l);

        for (let i = 0, y = 0; i < d.length; i += 4) {
            const px = (i / 4) % W;
            if (px === 0 && i > 0) y++;
            let r = d[i] * gR, g = d[i + 1] * gG, b = d[i + 2] * gB;

            r *= expMul; g *= expMul; b *= expMul;

            if (maskData) {
                const m = maskData[i] / 255;
                if (m > 0.01) { const boost = 1 + m * 0.55; r *= boost; g *= boost; b *= boost; }
            }

            // tone theo luminance
            let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            if (hl || sh || wh || bl) {
                const shW = lum < 0.5 ? (0.5 - lum) * 2 : 0;
                const hlW = lum > 0.5 ? (lum - 0.5) * 2 : 0;
                const mul = 1 + sh * shW * 0.7 + hl * hlW * -0.7 + bl * shW * -0.45 + wh * hlW * 0.45;
                r *= mul; g *= mul; b *= mul;
            }
            if (con || dhz) {
                const k = 1 + con * 0.8 + dhz * 0.5;
                r = (r / 255 - 0.5) * k * 255 + 128;
                g = (g / 255 - 0.5) * k * 255 + 128;
                b = (b / 255 - 0.5) * k * 255 + 128;
                if (dhz > 0) { // dehaze: tăng bão hòa nhẹ khi khử sương
                    const lz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    const ks = 1 + dhz * 0.35;
                    r = lz + (r - lz) * ks; g = lz + (g - lz) * ks; b = lz + (b - lz) * ks;
                }
            }
            // saturation / vibrance
            const l2 = (0.2126 * r + 0.7152 * g + 0.0722 * b);
            if (vib || sat !== 1) {
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                const curSat = mx === 0 ? 0 : (mx - mn) / mx;
                const v = 1 + vib * (1 - curSat) * 0.9;
                const k = sat * v;
                r = l2 + (r - l2) * k; g = l2 + (g - l2) * k; b = l2 + (b - l2) * k;
            }
            // HSL theo kênh màu
            if (hasHsl) {
                const [hh, ss, ll] = rgb2hsl(r, g, b);
                const hue = hh * 360;
                let best = null, bestD = 999;
                HSL_CHANNELS.forEach(c => {
                    let diff = Math.abs(((hue - c.c + 540) % 360) - 180);
                    diff = 180 - diff;
                    if (diff < bestD) { bestD = diff; best = c; }
                });
                if (best && bestD < 45) {
                    const adj = hsl[best.id];
                    const wgt = 1 - bestD / 45;
                    let nh = ((hue + adj.h * 0.6 * wgt) % 360 + 360) % 360 / 360;
                    let ns = TK.clamp(ss * (1 + adj.s / 100 * wgt), 0, 1);
                    let nl = TK.clamp(ll + adj.l / 100 * 0.5 * wgt, 0, 1);
                    const [nr, ng, nb] = hsl2rgb(nh, ns, nl);
                    r = nr; g = ng; b = nb;
                }
            }
            // vignette
            if (vg) {
                const dx = px - cx, dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy) / maxR;
                const f = 1 - vg * Math.pow(TK.clamp((dist - 0.45) / 0.55, 0, 1), 2) * 1.1;
                r *= f; g *= f; b *= f;
            }
            // grain
            if (grain) { const n = (Math.random() - 0.5) * grain * 60; r += n; g += n; b += n; }

            d[i] = TK.clamp(r, 0, 255); d[i + 1] = TK.clamp(g, 0, 255); d[i + 2] = TK.clamp(b, 0, 255);
        }
        ctx.putImageData(img, 0, 0);

        // clarity / texture / sharpen / noise — dùng bản blur
        const cl = p.clarity / 100, tx = p.texture / 100, sh2 = p.sharpen / 150, nr = p.noise / 100;
        if (cl || tx || sh2 || nr) {
            const blurC = document.createElement('canvas');
            blurC.width = W; blurC.height = H;
            const bx = blurC.getContext('2d');
            bx.filter = `blur(${(2 + tx * 1.5).toFixed(1)}px)`;
            bx.drawImage(outCanvas, 0, 0);
            bx.filter = 'none';
            const a = ctx.getImageData(0, 0, W, H), bData = bx.getImageData(0, 0, W, H);
            const A = a.data, B = bData.data;
            const kCl = cl * 0.85, kTx = tx * 0.6, kSh = sh2 * 1.1, kNr = nr * 0.65;
            for (let i = 0; i < A.length; i += 4) {
                for (let c = 0; c < 3; c++) {
                    const diff = A[i + c] - B[i + c];
                    let v = A[i + c];
                    v += diff * (kCl + kTx + kSh);      // tăng chi tiết (unsharp)
                    v = v + (B[i + c] - v) * kNr;       // khử ồn (trộn blur)
                    A[i + c] = TK.clamp(v, 0, 255);
                }
            }
            ctx.putImageData(a, 0, 0);
        }

        // chromatic aberration removal: làm dịu biên màu
        if (p.ca) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.filter = 'blur(0.35px)';
            const t2 = document.createElement('canvas'); t2.width = W; t2.height = H;
            t2.getContext('2d').drawImage(outCanvas, 0, 0);
            ctx.clearRect(0, 0, W, H);
            ctx.drawImage(t2, 0, 0);
            ctx.filter = 'none';
        }
        // profile correction: giảm méo nhẹ (scale)
        if (p.profile) {
            const t3 = document.createElement('canvas'); t3.width = W; t3.height = H;
            t3.getContext('2d').drawImage(outCanvas, 0, 0);
            ctx.clearRect(0, 0, W, H);
            ctx.drawImage(t3, 0, 0, W, H, -W * 0.004, -H * 0.004, W * 1.008, H * 1.008);
        }
        return outCanvas;
    }

    function rgb2hsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h = 0, s = 0; const l = (mx + mn) / 2;
        if (mx !== mn) {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
            else if (mx === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h /= 6;
        }
        return [h, s, l];
    }
    function hsl2rgb(h, s, l) {
        if (s === 0) return [l * 255, l * 255, l * 255];
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        const f = t => {
            t = (t + 1) % 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
    }

    /* ---------------- render ---------------- */
    let procCache = document.createElement('canvas');
    function renderNow() {
        if (cur < 0) { drawEmpty(); return; }
        const p = photos[cur];
        processTo(p.prev, procCache, p.params, p.mask);
        view.width = procCache.width; view.height = procCache.height;
        vctx.clearRect(0, 0, view.width, view.height);
        vctx.drawImage(procCache, 0, 0);
        if (compareOn) drawCompare();
        fitView();
        drawHistogram(procCache);
        dirty = false;
    }
    function drawEmpty() {
        view.width = 900; view.height = 560;
        vctx.fillStyle = '#141414'; vctx.fillRect(0, 0, 900, 560);
        vctx.fillStyle = '#4a4a4a'; vctx.font = '20px Segoe UI'; vctx.textAlign = 'center';
        vctx.fillText('Chưa có ảnh — bấm "📥 Nhập ảnh" hoặc nạp ảnh mẫu ở tab Library', 450, 270);
        vctx.font = '13px Segoe UI'; vctx.fillStyle = '#3a3a3a';
        vctx.fillText('Kéo thả file ảnh vào cửa sổ cũng được', 450, 300);
        drawHistogram(null);
    }
    function fitView() {
        const wrap = document.getElementById('previewWrap');
        if (zoomed) { view.style.maxWidth = 'none'; view.style.maxHeight = 'none'; view.style.width = photos[cur].prev.width + 'px'; document.getElementById('stZoom').textContent = '100%'; }
        else { view.style.maxWidth = '100%'; view.style.maxHeight = '100%'; view.style.width = ''; document.getElementById('stZoom').textContent = 'Vừa khung'; }
        if (wrap) wrap.scrollLeft = 0;
    }
    function scheduleRender() {
        dirty = true;
        if (rafId) return;
        rafId = requestAnimationFrame(() => { rafId = null; if (dirty) renderNow(); });
    }

    function drawHistogram(src) {
        const W = histC.width, H = histC.height;
        hctx.clearRect(0, 0, W, H);
        hctx.fillStyle = '#141414'; hctx.fillRect(0, 0, W, H);
        if (!src) return;
        const c = document.createElement('canvas');
        c.width = 200; c.height = Math.max(1, Math.round(200 * src.height / src.width));
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
        for (let i = 0; i < d.length; i += 4) { bins[0][d[i]]++; bins[1][d[i + 1]]++; bins[2][d[i + 2]]++; }
        let max = 1;
        bins.forEach(b => { for (let i = 8; i < 248; i++) max = Math.max(max, b[i]); });
        max = Math.log(max + 1);
        ['rgba(255,60,60,.55)', 'rgba(60,255,90,.5)', 'rgba(70,120,255,.55)'].forEach((col, ci) => {
            hctx.beginPath();
            hctx.moveTo(0, H);
            for (let i = 0; i < 256; i++) {
                const v = Math.log(bins[ci][i] + 1) / max;
                hctx.lineTo(i / 255 * W, H - v * H * 0.96);
            }
            hctx.lineTo(W, H); hctx.closePath();
            hctx.fillStyle = col; hctx.fill();
        });
    }

    function drawCompare() {
        const p = photos[cur];
        const x = Math.round(compareX * view.width);
        const before = document.createElement('canvas');
        before.width = p.prev.width; before.height = p.prev.height;
        before.getContext('2d').drawImage(p.prev, 0, 0);
        vctx.save();
        vctx.beginPath(); vctx.rect(0, 0, x, view.height); vctx.clip();
        vctx.clearRect(0, 0, x, view.height);
        vctx.drawImage(before, 0, 0, view.width, view.height);
        vctx.fillStyle = 'rgba(255,255,255,.85)'; vctx.font = '13px Segoe UI';
        vctx.fillText('TRƯỚC', 10, 22);
        vctx.fillText('SAU', x + 10, 22);
        vctx.restore();
    }

    /* ---------------- module ---------------- */
    function setModule(m) {
        module = m;
        document.querySelectorAll('.module-tab').forEach(t => t.classList.toggle('active', t.dataset.module === m));
        document.querySelectorAll('.module').forEach(x => x.classList.remove('active'));
        const el = document.getElementById('mod-' + m);
        if (el) el.classList.add('active');
        if (m === 'library') renderLibrary();
        if (m === 'map') drawMap();
        if (m === 'book') renderBook();
        if (m === 'slideshow') { slideIdx = Math.max(0, cur); showSlide(); }
        if (m === 'develop') fitView();
        TK.status('Module: ' + m);
    }

    /* ---------------- crop / spot / brush trên preview ---------------- */
    let drag = null;
    view.addEventListener('pointerdown', e => {
        if (cur < 0) return;
        const p = TK.canvasPos(view, e);
        view.setPointerCapture(e.pointerId);
        if (tool === 'crop') drag = { t: 'crop', s: p, e: p };
        else if (tool === 'straighten') drag = { t: 'rot', s: p, start: P().rotate };
        else if (tool === 'brush') { drag = { t: 'brush', s: p }; paintMask(p, e.shiftKey); }
        else if (tool === 'spot') { spotRemove(p); }
        else if (tool === 'zoom') { zoomed = !zoomed; fitView(); }
    });
    view.addEventListener('pointermove', e => {
        if (!drag || cur < 0) return;
        const p = TK.canvasPos(view, e);
        if (drag.t === 'crop') { drag.e = p; drawCropPreview(); }
        else if (drag.t === 'rot') { P().rotate = TK.clamp(drag.start + (p.x - drag.s.x) / 8, -45, 45); syncSliderLabels(); scheduleRender(); }
        else if (drag.t === 'brush') paintMask(p, e.shiftKey);
    });
    view.addEventListener('pointerup', e => {
        if (!drag) return;
        if (drag.t === 'crop') applyCrop();
        drag = null;
        if (cur >= 0) renderNow();
    });

    function drawCropPreview() {
        renderNow();
        const x = Math.min(drag.s.x, drag.e.x), y = Math.min(drag.s.y, drag.e.y);
        const w = Math.abs(drag.e.x - drag.s.x), h = Math.abs(drag.e.y - drag.s.y);
        vctx.save();
        vctx.fillStyle = 'rgba(0,0,0,.5)'; vctx.fillRect(0, 0, view.width, view.height);
        vctx.clearRect(x, y, w, h);
        vctx.drawImage(procCache, x, y, w, h, x, y, w, h);
        vctx.strokeStyle = '#fff'; vctx.setLineDash([6, 4]); vctx.strokeRect(x, y, w, h);
        vctx.setLineDash([]); vctx.fillStyle = '#fff'; vctx.font = '12px monospace';
        vctx.fillText(`${Math.round(w)} × ${Math.round(h)}`, x + 6, y + 16);
        vctx.restore();
        TK.status(`Vùng cắt ${Math.round(w)}×${Math.round(h)} — thả chuột để cắt, Esc để hủy`);
    }

    function applyCrop() {
        const p = photos[cur];
        const sx = view.width / p.prev.width;
        const x = Math.max(0, Math.min(drag.s.x, drag.e.x) / sx), y = Math.max(0, Math.min(drag.s.y, drag.e.y) / sx);
        const w = Math.abs(drag.e.x - drag.s.x) / sx, h = Math.abs(drag.e.y - drag.s.y) / sx;
        if (w < 8 || h < 8) return TK.toast('Vùng cắt quá nhỏ', 'error');
        const kx = p.full.width / p.prev.width;
        [['prev', 1], ['full', kx]].forEach(([key, s]) => {
            const c = document.createElement('canvas');
            c.width = Math.round(w * s); c.height = Math.round(h * s);
            c.getContext('2d').drawImage(p[key], x * s, y * s, w * s, h * s, 0, 0, c.width, c.height);
            p[key] = c;
        });
        const nm = document.createElement('canvas');
        nm.width = p.prev.width; nm.height = p.prev.height;
        nm.getContext('2d').drawImage(p.mask, x, y, w, h, 0, 0, nm.width, nm.height);
        p.mask = nm;
        view.width = p.prev.width; view.height = p.prev.height;
        document.getElementById('stMeta').textContent = `${p.full.width}×${p.full.height} px (đã cắt)`;
        TK.toast('✂️ Đã cắt ảnh còn ' + p.full.width + '×' + p.full.height, 'ok');
        renderFilmstrip();
    }

    function paintMask(p, erase) {
        const m = photos[cur].mask;
        const sx = m.width / view.width;
        const ctx = m.getContext('2d');
        ctx.save();
        ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
        const g = ctx.createRadialGradient(p.x * sx, p.y * sx, 0, p.x * sx, p.y * sx, 34 * sx);
        g.addColorStop(0, 'rgba(255,255,255,.85)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x * sx, p.y * sx, 34 * sx, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        scheduleRender();
        TK.status('🖌️ Cọ cục bộ: tăng sáng vùng được tô (giữ Shift để xóa cọ)');
    }

    function spotRemove(p) {
        const photo = photos[cur];
        const sx = photo.prev.width / view.width;
        const fx = photo.full.width / photo.prev.width;
        const R = 16;
        [['prev', sx], ['full', sx * fx]].forEach(([key, s]) => {
            const c = photo[key], ctx = c.getContext('2d');
            const dx = p.x * s, dy = p.y * s, rr = R * s;
            const srcX = TK.clamp(dx + rr * 2.2, 0, c.width - rr * 2), srcY = TK.clamp(dy + rr * 2.2, 0, c.height - rr * 2);
            ctx.save();
            ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.clip();
            ctx.filter = 'blur(' + (rr * 0.12).toFixed(1) + 'px)';
            ctx.drawImage(c, srcX - rr, srcY - rr, rr * 2, rr * 2, dx - rr, dy - rr, rr * 2, rr * 2);
            ctx.restore();
        });
        TK.toast('🧹 Đã xóa vết bẩn tại ' + Math.round(p.x) + ',' + Math.round(p.y), 'ok');
        scheduleRender();
    }

    /* ---------------- Auto tone ---------------- */
    function autoTone() {
        if (cur < 0) return TK.toast('Chưa có ảnh', 'error');
        const p = photos[cur];
        const c = document.createElement('canvas');
        c.width = 200; c.height = Math.round(200 * p.prev.height / p.prev.width);
        c.getContext('2d').drawImage(p.prev, 0, 0, c.width, c.height);
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let sum = 0, n = 0, hi = 0, lo = 0;
        const hist = new Uint32Array(256);
        for (let i = 0; i < d.length; i += 4) {
            const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            sum += l; n++; hist[Math.round(l)]++;
            if (l > 235) hi++; if (l < 20) lo++;
        }
        const mean = sum / n / 255;
        const total = n;
        p.params.exposure = Math.round(TK.clamp((0.45 - mean) * 180, -60, 80));
        p.params.contrast = Math.round(TK.clamp((hi + lo) / total * 260, 0, 34));
        p.params.highlights = hi / total > 0.06 ? -30 : 0;
        p.params.shadows = lo / total > 0.08 ? 32 : 8;
        p.params.whites = Math.round(TK.clamp(14 - hi / total * 200, -20, 20));
        p.params.blacks = Math.round(TK.clamp(10 - lo / total * 160, -25, 15));
        p.params.vibrance = 20; p.params.clarity = 12; p.params.sharpen = 45; p.params.noise = 20;
        p.params.preset = 'auto';
        markPreset(null);
        syncSliderLabels(); renderNow();
        TK.toast('⚡ Auto tone đã chỉnh theo histogram thật của ảnh', 'ok');
        TK.status(`Auto: EV ${(p.params.exposure / 50).toFixed(2)} · contrast ${p.params.contrast} · highlights ${p.params.highlights}`);
    }

    function applyPreset(id) {
        if (cur < 0) return TK.toast('Chưa có ảnh', 'error');
        const pre = PRESETS[id];
        if (!pre) return;
        const p = photos[cur].params;
        Object.assign(p, DEFAULTS);
        p.hsl = newHsl();
        Object.keys(pre).forEach(k => { if (k in p) p[k] = pre[k]; });
        p.preset = id;
        markPreset(id);
        syncSliderLabels(); renderNow();
        TK.status('Preset: ' + id);
        TK.toast('Đã áp preset ' + id, 'ok');
    }
    function markPreset(id) {
        document.querySelectorAll('.preset-item[data-arg]').forEach(el => el.classList.toggle('on', el.dataset.arg === id));
    }

    /* ---------------- AI ---------------- */
    async function aiPreset(kind) {
        if (cur < 0) return TK.toast('Chưa có ảnh', 'error');
        TK.status('✨ AI đang phân tích ảnh…');
        try {
            const out = await TK.ai(
                `Loại chỉnh: ${kind || 'enhance'}. Thông số hiện tại: ${JSON.stringify(P())}. ` +
                `Trả JSON: {"exposure":-100..100,"contrast":-100..100,"highlights":-100..100,"shadows":-100..100,"whites":-100..100,"blacks":-100..100,"clarity":-100..100,"dehaze":-100..100,"vibrance":-100..100,"saturation":-100..100,"temp":2000..10000,"tint":-100..100,"vignette":-100..100,"sharpen":0..150,"noise":0..100,"note":"tiếng Việt ngắn"}`,
                { json: true, system: 'Bạn là retoucher chuyên nghiệp kiểu Lightroom. Chỉ trả JSON.' }
            );
            if (!out) return;
            const p = P();
            Object.keys(DEFAULTS).forEach(k => { if (typeof out[k] === 'number') p[k] = out[k]; });
            p.preset = 'ai:' + kind;
            markPreset(null);
            syncSliderLabels(); renderNow();
            TK.toast('✨ AI đã chỉnh: ' + (out.note || kind), 'ok');
            TK.status('AI preset: ' + (out.note || kind));
        } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); TK.status('AI lỗi'); }
    }

    function aiMask() {
        if (cur < 0) return TK.toast('Chưa có ảnh', 'error');
        const p = photos[cur];
        const c = document.createElement('canvas');
        c.width = 160; c.height = Math.round(160 * p.prev.height / p.prev.width);
        const cx = c.getContext('2d');
        cx.drawImage(p.prev, 0, 0, c.width, c.height);
        const d = cx.getImageData(0, 0, c.width, c.height).data;
        // heuristic: chủ thể thường ở giữa + tương phản cao + bão hòa hơn nền
        const m = p.mask.getContext('2d');
        m.clearRect(0, 0, p.mask.width, p.mask.height);
        const tmp = document.createElement('canvas');
        tmp.width = c.width; tmp.height = c.height;
        const tx = tmp.getContext('2d');
        const out = tx.createImageData(c.width, c.height);
        const midX = c.width / 2, midY = c.height / 2;
        for (let i = 0; i < d.length; i += 4) {
            const px = (i / 4) % c.width, py = Math.floor((i / 4) / c.width);
            const dist = Math.sqrt(Math.pow((px - midX) / midX, 2) + Math.pow((py - midY) / midY, 2));
            const sat = (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) / 255;
            const center = TK.clamp(1.15 - dist, 0, 1);
            const a = TK.clamp(center * (0.55 + sat * 0.9), 0, 1) * 255;
            out.data[i] = out.data[i + 1] = out.data[i + 2] = 255;
            out.data[i + 3] = a;
        }
        tx.putImageData(out, 0, 0);
        m.filter = 'blur(6px)';
        m.drawImage(tmp, 0, 0, p.mask.width, p.mask.height);
        m.filter = 'none';
        renderNow();
        TK.toast('✨ Đã tạo mask chủ thể (center-weighted saliency) và tăng sáng vùng đó', 'ok');
        TK.status('AI Mask: đã áp dụng — dùng cọ 🖌️ (Shift để xóa) nếu muốn tinh chỉnh');
    }

    /* ---------------- xuất ---------------- */
    async function exportPhoto() {
        if (cur < 0) return TK.toast('Chưa có ảnh để xuất', 'error');
        const fmt = await TK.modal({ title: '⬇ Xuất ảnh', message: `Ảnh: ${photos[cur].name}\nKích thước gốc: ${photos[cur].full.width}×${photos[cur].full.height}\n\nGõ định dạng: jpg (mặc định) hoặc png`, input: true, value: 'jpg', ok: 'Xuất' });
        if (fmt === null) return;
        TK.status('Đang xử lý ảnh độ phân giải đầy đủ…');
        const out = document.createElement('canvas');
        processTo(photos[cur].full, out, photos[cur].params, photos[cur].mask);
        const type = /png/i.test(fmt) ? 'image/png' : 'image/jpeg';
        TK.download(out.toDataURL(type, 0.92), `xlight-${photos[cur].name.replace(/\.[^.]+$/, '')}-${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`);
        TK.status('Đã xuất ảnh full-res: ' + out.width + '×' + out.height);
    }

    /* ---------------- Map ---------------- */
    function drawMap() {
        const c = document.getElementById('mapCanvas');
        if (!c) return;
        const x = c.getContext('2d');
        x.clearRect(0, 0, c.width, c.height);
        x.fillStyle = '#0d1b26'; x.fillRect(0, 0, c.width, c.height);
        x.strokeStyle = 'rgba(255,255,255,.07)';
        for (let i = 0; i <= 18; i++) { x.beginPath(); x.moveTo(i * c.width / 18, 0); x.lineTo(i * c.width / 18, c.height); x.stroke(); }
        for (let i = 0; i <= 9; i++) { x.beginPath(); x.moveTo(0, i * c.height / 9); x.lineTo(c.width, i * c.height / 9); x.stroke(); }
        x.strokeStyle = 'rgba(0,180,255,.35)'; x.lineWidth = 1.4;
        x.beginPath(); // đường xích đạo + kinh tuyến gốc
        x.moveTo(0, c.height / 2); x.lineTo(c.width, c.height / 2);
        x.moveTo(c.width / 2, 0); x.lineTo(c.width / 2, c.height); x.stroke();
        let list = '';
        photos.forEach((p, i) => {
            if (p.lat == null) return;
            const px = (p.lon + 180) / 360 * c.width, py = (90 - p.lat) / 180 * c.height;
            x.fillStyle = i === cur ? '#ffd166' : '#0071bc';
            x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill();
            x.strokeStyle = '#fff'; x.stroke();
            x.fillStyle = '#cfe8ff'; x.font = '11px Segoe UI';
            x.fillText(p.name.slice(0, 22), px + 9, py - 6);
            list += `<div>📍 <b>${escapeHtml(p.name)}</b> — ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</div>`;
        });
        document.getElementById('mapList').innerHTML = list || '<i style="color:#777">Chưa ảnh nào được gắn tọa độ.</i>';
        document.getElementById('mapCurrent').textContent = cur >= 0 ? photos[cur].name : '—';
        if (cur >= 0 && photos[cur].lat != null) {
            document.getElementById('mapLat').value = photos[cur].lat;
            document.getElementById('mapLon').value = photos[cur].lon;
        }
    }

    /* ---------------- Book ---------------- */
    let bookPages = [];
    function renderBook() {
        const box = document.getElementById('bookPages');
        box.innerHTML = '';
        if (!bookPages.length) { box.innerHTML = '<div class="card" style="color:#888">Chưa có trang nào — bấm “✨ Tự xếp tất cả ảnh” hoặc “＋ Thêm trang”.</div>'; return; }
        bookPages.forEach((pg, i) => {
            const d = document.createElement('div');
            d.className = 'book-page';
            const src = pg.photo != null && photos[pg.photo] ? photos[pg.photo].prev.toDataURL('image/jpeg', .8) : '';
            d.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:8px;">
                    <span>Trang ${i + 1}</span><span style="cursor:pointer;color:#b30b00;" data-del="${i}">✕ Xóa trang</span></div>
                ${src ? `<img src="${src}">` : '<div style="height:200px;background:#eee;display:flex;align-items:center;justify-content:center;color:#999;">Bấm để chọn ảnh</div>'}
                <div contenteditable="true" style="margin-top:10px;font-size:14px;color:#333;outline:none;">${escapeHtml(pg.caption || 'Chú thích cho ảnh này…')}</div>`;
            d.querySelector('[data-del]').addEventListener('click', () => { bookPages.splice(i, 1); renderBook(); });
            d.querySelector('img, div[style*="background:#eee"]')?.addEventListener('click', async () => {
                const pick = await TK.modal({ title: 'Chọn ảnh cho trang', message: 'Nhập số thứ tự ảnh (0 = ' + photos.map((p, k) => k + ':' + p.name).join(', ') + ')', input: true, value: String(Math.max(0, cur)), ok: 'Chọn' });
                if (pick === null) return;
                const idx = parseInt(pick, 10);
                if (photos[idx]) { pg.photo = idx; renderBook(); }
            });
            d.querySelector('[contenteditable]').addEventListener('blur', e => { pg.caption = e.target.textContent; });
            box.appendChild(d);
        });
        TK.status('Book: ' + bookPages.length + ' trang');
    }

    /* ---------------- Slideshow ---------------- */
    function showSlide() {
        const stage = document.getElementById('slideStage');
        if (!photos.length) { stage.innerHTML = '<div style="color:#666;">Chưa có ảnh</div>'; return; }
        slideIdx = (slideIdx + photos.length) % photos.length;
        const p = photos[slideIdx];
        const out = document.createElement('canvas');
        processTo(p.prev, out, p.params, p.mask);
        stage.innerHTML = '';
        const img = document.createElement('img');
        img.id = 'slideImg'; img.src = out.toDataURL('image/jpeg', .85);
        stage.appendChild(img);
        document.getElementById('slideCount').textContent = (slideIdx + 1) + ' / ' + photos.length;
    }

    /* ---------------- Print ---------------- */
    function buildPrint() {
        const cols = TK.clamp(parseInt(document.getElementById('printCols').value, 10) || 2, 1, 4);
        const margin = parseInt(document.getElementById('printMargin').value, 10) || 10;
        const caption = document.getElementById('printCaption').checked;
        const size = document.getElementById('printSize').value;
        const w = size === 'a4' ? '210mm' : size === 'letter' ? '8.5in' : '148mm';
        const h = size === 'a4' ? '297mm' : size === 'letter' ? '11in' : '210mm';
        const html = photos.map(p => {
            const out = document.createElement('canvas');
            processTo(p.prev, out, p.params, p.mask);
            return `<figure style="margin:0;break-inside:avoid;"><img src="${out.toDataURL('image/jpeg', .85)}">${caption ? `<figcaption style="font-size:10px;color:#444;margin-top:4px;">${escapeHtml(p.name)}</figcaption>` : ''}</figure>`;
        }).join('');
        const sheet = `<div class="print-sheet" style="grid-template-columns:repeat(${cols},1fr);padding:${margin}mm;width:${w};min-height:${h};margin:0 auto;">${html || '<p>Chưa có ảnh</p>'}</div>`;
        document.getElementById('printArea').innerHTML = sheet;
        document.getElementById('printPreview').innerHTML = sheet;
        TK.status(`Đã dựng trang in ${size.toUpperCase()}, ${cols} cột, lề ${margin}mm — ${photos.length} ảnh`);
        TK.toast('Đã dựng trang in, bấm 🖨️ In / Lưu PDF', 'ok');
    }

    /* ---------------- Web gallery ---------------- */
    function galleryHtml() {
        const title = document.getElementById('webTitle').value || 'Gallery';
        const bg = document.getElementById('webBg').value;
        const cols = TK.clamp(parseInt(document.getElementById('webCols').value, 10) || 3, 1, 6);
        const items = photos.map(p => {
            const out = document.createElement('canvas');
            processTo(p.prev, out, p.params, p.mask);
            return `<figure><img src="${out.toDataURL('image/jpeg', .8)}"><figcaption>${escapeHtml(p.name)}</figcaption></figure>`;
        }).join('');
        return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{margin:0;background:${bg};color:#eee;font-family:Segoe UI,sans-serif;padding:32px}
h1{font-weight:300;letter-spacing:2px}main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px}
figure{margin:0;background:#1b1b1b;border-radius:10px;overflow:hidden}img{width:100%;display:block}
figcaption{padding:8px 10px;font-size:12px;color:#aaa}</style></head>
<body><h1>${escapeHtml(title)}</h1><p style="color:#888;font-size:13px;">Xuất từ Rune xLight · ${photos.length} ảnh · ${new Date().toLocaleString('vi-VN')}</p><main>${items}</main></body></html>`;
    }

    /* ---------------- ảnh mẫu ---------------- */
    function sampleImage(kind) {
        const c = document.createElement('canvas');
        c.width = 1600; c.height = 1000;
        const x = c.getContext('2d');
        if (kind === 0) { // hoàng hôn biển
            const g = x.createLinearGradient(0, 0, 0, 1000);
            g.addColorStop(0, '#20315e'); g.addColorStop(.45, '#e0663c'); g.addColorStop(.62, '#f6c667'); g.addColorStop(.63, '#2b4a6f'); g.addColorStop(1, '#0d1b2a');
            x.fillStyle = g; x.fillRect(0, 0, 1600, 1000);
            const s = x.createRadialGradient(1150, 560, 20, 1150, 560, 240);
            s.addColorStop(0, '#fff6d8'); s.addColorStop(.4, '#ffd27a'); s.addColorStop(1, 'rgba(255,210,122,0)');
            x.fillStyle = s; x.beginPath(); x.arc(1150, 560, 240, 0, Math.PI * 2); x.fill();
            x.fillStyle = 'rgba(10,20,40,.85)';
            x.beginPath(); x.moveTo(0, 640); x.lineTo(300, 470); x.lineTo(620, 640); x.closePath(); x.fill();
            x.fillStyle = 'rgba(255,220,150,.18)';
            for (let i = 0; i < 60; i++) x.fillRect(900 + Math.random() * 500, 660 + i * 5, 40 + Math.random() * 220, 2);
        } else if (kind === 1) { // chân dung studio (khối màu)
            const g = x.createRadialGradient(800, 420, 60, 800, 500, 900);
            g.addColorStop(0, '#f0d3bd'); g.addColorStop(.5, '#b98a6d'); g.addColorStop(1, '#241a17');
            x.fillStyle = g; x.fillRect(0, 0, 1600, 1000);
            x.fillStyle = 'rgba(255,240,225,.9)'; x.beginPath(); x.ellipse(800, 430, 210, 265, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = 'rgba(70,45,40,.85)'; x.beginPath(); x.ellipse(800, 300, 230, 170, 0, Math.PI, 0); x.fill();
            x.fillStyle = 'rgba(30,20,20,.5)'; x.beginPath(); x.ellipse(720, 420, 26, 14, 0, 0, Math.PI * 2); x.fill();
            x.beginPath(); x.ellipse(880, 420, 26, 14, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = 'rgba(190,90,80,.55)'; x.beginPath(); x.ellipse(800, 560, 60, 22, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = 'rgba(20,14,12,.9)'; x.fillRect(520, 760, 560, 240);
        } else { // phố đêm
            x.fillStyle = '#070b18'; x.fillRect(0, 0, 1600, 1000);
            for (let i = 0; i < 90; i++) {
                const bx = Math.random() * 1600, bw = 40 + Math.random() * 130, bh = 150 + Math.random() * 600;
                x.fillStyle = `rgba(${20 + Math.random() * 30},${25 + Math.random() * 35},${45 + Math.random() * 50},.95)`;
                x.fillRect(bx, 1000 - bh, bw, bh);
                for (let w = 0; w < 40; w++) {
                    if (Math.random() > .55) continue;
                    x.fillStyle = `rgba(255,${200 + Math.random() * 55},${120 + Math.random() * 100},.85)`;
                    x.fillRect(bx + 6 + Math.random() * (bw - 14), 1000 - bh + 10 + Math.random() * (bh - 20), 6, 8);
                }
            }
            x.fillStyle = 'rgba(255,120,80,.16)'; x.fillRect(0, 880, 1600, 120);
        }
        return c;
    }
    async function loadSamples() {
        const names = ['sunset-beach.jpg', 'studio-portrait.jpg', 'night-city.jpg'];
        for (let i = 0; i < 3; i++) {
            const c = sampleImage(i);
            const img = await TK.loadImage(c.toDataURL('image/jpeg', .9));
            photos.push(makePhoto(names[i], img));
        }
        select(photos.length - 3 >= 0 ? photos.length - 3 : 0);
        renderFilmstrip(); renderLibrary();
        TK.toast('🎞️ Đã nạp 3 ảnh mẫu — chỉnh thoải mái', 'ok');
    }

    /* ---------------- actions ---------------- */
    TK.init({ app: 'xlight', status: '.statusbar [data-status-text]' });
    document.querySelectorAll('.module-tab').forEach(t => t.addEventListener('click', () => setModule(t.dataset.module)));

    TK.on('importPhotos', async () => {
        const files = await TK.pickFiles('image/*');
        if (files && files.length) await addFiles(files);
    });
    TK.on('loadSamples', loadSamples);
    TK.on('preset', (e, el) => applyPreset(el.dataset.arg));
    TK.on('aiPreset', (e, el) => aiPreset(el.dataset.arg));
    TK.on('aiAuto', () => aiPreset('enhance'));
    TK.on('autoTone', autoTone);
    TK.on('resetAll', () => {
        if (cur < 0) return TK.toast('Chưa có ảnh', 'error');
        const p = photos[cur];
        Object.assign(p.params, DEFAULTS); p.params.hsl = newHsl(); p.params.preset = 'original';
        p.mask.getContext('2d').clearRect(0, 0, p.mask.width, p.mask.height);
        markPreset('original'); syncSliderLabels(); renderNow();
        TK.toast('↺ Đã đặt lại toàn bộ chỉnh sửa', 'ok');
    });
    TK.on('exportPhoto', exportPhoto);
    TK.on('toggleGroup', (e, el) => {
        const g = document.getElementById(el.dataset.arg);
        if (g) g.style.display = g.style.display === 'none' ? '' : 'none';
    });
    TK.on('tool', (e, el) => {
        const t = el.dataset.arg;
        if (t === 'aimask') return aiMask();
        if (t === 'zoom') { zoomed = !zoomed; fitView(); return; }
        tool = tool === t ? null : t;
        document.querySelectorAll('.tool-strip-btn[data-arg]').forEach(b => b.classList.toggle('on', b.dataset.arg === tool));
        view.style.cursor = tool === 'brush' ? 'cell' : tool === 'crop' ? 'crosshair' : tool === 'spot' ? 'copy' : 'default';
        TK.status(tool ? 'Công cụ: ' + tool + (tool === 'brush' ? ' — kéo để tô sáng, Shift+kéo để xóa' : tool === 'crop' ? ' — kéo vùng rồi thả để cắt' : tool === 'spot' ? ' — bấm vào vết bẩn' : tool === 'straighten' ? ' — kéo ngang để xoay' : '') : 'Đã tắt công cụ');
    });
    TK.on('compare', () => {
        if (cur < 0) return TK.toast('Chưa có ảnh', 'error');
        compareOn = !compareOn;
        document.getElementById('compareHandle').classList.toggle('on', compareOn);
        renderNow();
        TK.status(compareOn ? '👁 Chế độ so sánh — kéo vạch trắng để xem TRƯỚC/SAU' : 'Tắt so sánh');
    });
    TK.on('hsl', (e, el) => {
        hslActive = el.dataset.arg;
        document.querySelectorAll('.hsl-btn').forEach(b => b.classList.toggle('on', b.dataset.arg === hslActive));
        document.getElementById('hslPanel').classList.add('on');
        syncHslLabels();
    });
    TK.on('hslReset', () => {
        if (!hslActive || cur < 0) return;
        P().hsl[hslActive] = { h: 0, s: 0, l: 0 };
        syncHslLabels(); renderNow();
    });
    TK.on('mapSave', () => {
        if (cur < 0) return TK.toast('Chưa có ảnh', 'error');
        photos[cur].lat = parseFloat(document.getElementById('mapLat').value);
        photos[cur].lon = parseFloat(document.getElementById('mapLon').value);
        drawMap(); TK.toast('📍 Đã lưu tọa độ cho ' + photos[cur].name, 'ok');
    });
    TK.on('mapUseGps', () => {
        if (!navigator.geolocation) return TK.toast('Trình duyệt không hỗ trợ định vị', 'error');
        navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('mapLat').value = pos.coords.latitude.toFixed(5);
            document.getElementById('mapLon').value = pos.coords.longitude.toFixed(5);
            if (cur >= 0) { photos[cur].lat = pos.coords.latitude; photos[cur].lon = pos.coords.longitude; drawMap(); }
            TK.toast('📍 Đã lấy vị trí hiện tại', 'ok');
        }, err => TK.toast('Không lấy được vị trí: ' + err.message, 'error'));
    });
    TK.on('bookAddPage', () => { bookPages.push({ photo: cur >= 0 ? cur : null, caption: '' }); renderBook(); });
    TK.on('bookAutoFill', () => { bookPages = photos.map((p, i) => ({ photo: i, caption: p.name })); renderBook(); TK.toast('Đã xếp ' + bookPages.length + ' ảnh vào sách', 'ok'); });
    TK.on('bookClear', async () => { if (await TK.confirm('Xóa hết trang sách?', 'Toàn bộ trang sách sẽ bị xóa.')) { bookPages = []; renderBook(); } });
    TK.on('bookPrint', () => {
        const w = window.open('', '_blank');
        w.document.write('<html><head><title>Sách ảnh xLight</title><style>body{margin:0;font-family:Georgia,serif}.p{page-break-after:always;padding:24px;text-align:center}.p img{max-width:100%;max-height:80vh}.p div{margin-top:10px;font-size:14px;color:#444}</style></head><body>' +
            bookPages.map(pg => {
                const p = photos[pg.photo];
                if (!p) return '';
                const out = document.createElement('canvas');
                processTo(p.prev, out, p.params, p.mask);
                return `<div class="p"><img src="${out.toDataURL('image/jpeg', .85)}"><div>${escapeHtml(pg.caption || '')}</div></div>`;
            }).join('') + '</body></html>');
        w.document.close(); w.focus(); setTimeout(() => w.print(), 500);
        TK.toast('Đã mở cửa sổ in sách ảnh', 'ok');
    });
    TK.on('slidePrev', () => { slideIdx -= 2; showSlide(); });
    TK.on('slideNext', () => showSlide());
    TK.on('slidePlay', (e, el) => {
        if (slideTimer) { clearInterval(slideTimer); slideTimer = null; el.textContent = '▶ Phát'; TK.status('Dừng slideshow'); return; }
        if (!photos.length) return TK.toast('Chưa có ảnh', 'error');
        const sec = parseInt(document.getElementById('slideInterval').value, 10) || 3;
        el.textContent = '⏸ Dừng';
        slideTimer = setInterval(() => showSlide(), sec * 1000);
        showSlide();
        TK.status('Đang phát slideshow, ' + sec + 's/ảnh');
    });
    TK.on('printBuild', buildPrint);
    TK.on('printGo', () => {
        buildPrint();
        const area = document.getElementById('printArea');
        area.style.display = 'block';
        setTimeout(() => { window.print(); area.style.display = 'none'; }, 120);
    });
    TK.on('webPreview', () => {
        const box = document.getElementById('webPreviewBox');
        box.innerHTML = '<iframe style="width:100%;height:520px;border:1px solid #333;border-radius:8px;background:#fff;" srcdoc=""></iframe>';
        box.querySelector('iframe').srcdoc = galleryHtml();
        TK.status('Đang xem trước gallery');
    });
    TK.on('webExport', () => {
        TK.download(new Blob([galleryHtml()], { type: 'text/html' }), 'xlight-gallery.html');
        TK.status('Đã xuất gallery HTML');
    });

    document.getElementById('slideInterval').addEventListener('input', () => {
        if (slideTimer) { clearInterval(slideTimer); slideTimer = setInterval(() => showSlide(), (parseInt(document.getElementById('slideInterval').value, 10) || 3) * 1000); }
    });

    // compare handle kéo
    (function () {
        const h = document.getElementById('compareHandle');
        const wrap = document.getElementById('previewWrap');
        let on = false;
        const move = e => {
            const r = view.getBoundingClientRect();
            compareX = TK.clamp(((e.clientX - r.left) / r.width), 0, 1);
            h.style.left = (view.offsetLeft + compareX * view.offsetWidth) + 'px';
            renderNow();
        };
        h.addEventListener('pointerdown', e => { on = true; h.setPointerCapture(e.pointerId); });
        h.addEventListener('pointermove', e => { if (on) move(e); });
        h.addEventListener('pointerup', () => { on = false; });
        wrap.addEventListener('click', e => { if (compareOn && e.target === wrap) move(e); });
    })();

    // phím tắt
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
        const k = e.key.toLowerCase();
        if (k === 'escape') { tool = null; drag = null; document.querySelectorAll('.tool-strip-btn[data-arg]').forEach(b => b.classList.remove('on')); if (cur >= 0) renderNow(); }
        if (k === '\\' ) { const b = document.querySelector('.tool-strip-btn[data-action="compare"]'); b && b.click(); }
        if (k === 'c') document.querySelector('[data-arg="crop"]').click();
        if (k === 'b') document.querySelector('[data-arg="brush"]').click();
        if (k === 'q') document.querySelector('[data-arg="spot"]').click();
        if (k === 'r') document.querySelector('[data-arg="straighten"]').click();
        if (k === 'z') document.querySelector('[data-arg="zoom"]').click();
        if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); autoTone(); }
        if (k === 'arrowright' && cur < photos.length - 1) select(cur + 1);
        if (k === 'arrowleft' && cur > 0) select(cur - 1);
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); exportPhoto(); }
        if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); TK.pickFiles('image/*').then(f => f && f.length && addFiles(f)); }
        if (k >= '0' && k <= '5' && cur >= 0) { photos[cur].rating = +k; renderLibrary(); renderFilmstrip(); document.getElementById('stMeta').textContent = `${photos[cur].full.width}×${photos[cur].full.height} px · ${'★'.repeat(+k)}`; }
        if (k === 'g') setModule('library');
        if (k === 'd') setModule('develop');
    });

    // kéo thả ảnh
    ['dragover', 'drop'].forEach(ev => document.body.addEventListener(ev, e => {
        e.preventDefault();
        if (ev === 'drop' && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    }));

    /* ---------------- lệnh cho AI điều khiển ---------------- */
    TK.cmd('get_info', () => ({ app: 'xLight', photos: photos.length, current: cur >= 0 ? photos[cur].name : null, params: cur >= 0 ? P() : null, module }));
    TK.cmd('apply_preset', a => { applyPreset(a.preset || 'original'); return { preset: a.preset }; });
    TK.cmd('set_params', a => {
        if (cur < 0) return { error: 'Chưa có ảnh' };
        const p = P();
        Object.keys(a).forEach(k => { if (k in DEFAULTS && typeof a[k] === 'number') p[k] = a[k]; });
        syncSliderLabels(); renderNow(); return p;
    });
    TK.cmd('auto_tone', () => { autoTone(); return { ok: true }; });
    TK.cmd('reset', () => { TK._handlers.resetAll(); return { ok: true }; });
    TK.cmd('export', () => { exportPhoto(); return { ok: true }; });
    TK.cmd('set_module', a => { setModule(a.module || 'develop'); return { module }; });
    TK.cmd('crop', a => {
        if (cur < 0) return { error: 'Chưa có ảnh' };
        const p = photos[cur];
        const r = { x: a.x || 0, y: a.y || 0, w: a.w || p.prev.width, h: a.h || p.prev.height };
        const kx = p.full.width / p.prev.width;
        [['prev', 1], ['full', kx]].forEach(([key, s]) => {
            const c = document.createElement('canvas');
            c.width = Math.round(r.w * s); c.height = Math.round(r.h * s);
            c.getContext('2d').drawImage(p[key], r.x * s, r.y * s, r.w * s, r.h * s, 0, 0, c.width, c.height);
            p[key] = c;
        });
        view.width = p.prev.width; view.height = p.prev.height;
        renderNow(); renderFilmstrip();
        return { w: p.full.width, h: p.full.height };
    });
    TK.cmd('ai_edit', a => aiPreset(a.kind || 'enhance'));
    TK.cmd('rotate', a => { if (cur < 0) return { error: 'Chưa có ảnh' }; P().rotate = a.degrees || 0; syncSliderLabels(); renderNow(); return { rotate: P().rotate }; });

    /* ---------------- chạy ---------------- */
    buildSliders();
    drawEmpty();
    loadSamples().then(() => { applyPreset('original'); TK.status('Sẵn sàng — 3 ảnh mẫu, thử preset/Auto/Export'); });
})();
