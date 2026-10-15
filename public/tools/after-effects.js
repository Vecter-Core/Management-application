/* ============================================================
   xFX — motion graphics engine thật: layer, keyframe, easing,
   effect, motion blur, render WebM, AI tạo animation
   ============================================================ */
(function () {
    'use strict';

    const cv = document.getElementById('compCanvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const PPS_BASE = 62;
    let PPS = PPS_BASE;

    let comps = [], cur = 0, sel = null, t = 0, playing = false, loop = true, raf = null, lastTs = 0;
    let selProp = 'position';
    let uid = 1;

    const FX = {
        blur: { n: 'Gaussian Blur', css: 'blur(4px)', cat: 'Blur & Sharpen' },
        motionblur: { n: 'Motion Blur', sim: true, cat: 'Blur & Sharpen' },
        unsharp: { n: 'Unsharp Mask', css: 'contrast(1.25) saturate(1.05)', cat: 'Blur & Sharpen' },
        glow: { n: 'Glow', sim: true, cat: 'Stylize' },
        hue: { n: 'Hue/Saturation', css: 'hue-rotate(45deg) saturate(1.4)', cat: 'Color Correction' },
        curves: { n: 'Curves (tăng tương phản)', css: 'contrast(1.35) brightness(1.05)', cat: 'Color Correction' },
        levels: { n: 'Levels', css: 'brightness(1.15) contrast(.9)', cat: 'Color Correction' },
        bw: { n: 'Black & White', css: 'grayscale(1)', cat: 'Color Correction' },
        invert: { n: 'Invert', css: 'invert(1)', cat: 'Channel' },
        gradient: { n: 'Gradient Ramp', sim: true, cat: 'Generate' },
        flare: { n: 'Lens Flare', sim: true, cat: 'Generate' },
        vignette: { n: 'Vignette', sim: true, cat: 'Stylize' },
        chroma: { n: 'Keylight (tách nền xanh)', sim: true, cat: 'Keying' },
        fill: { n: 'Fill (đổi màu)', sim: true, cat: 'Generate' }
    };

    const C = () => comps[cur];
    const L = () => C().layers.find(l => l.id === sel);

    /* ================= layer factory ================= */
    function makeLayer(type, opts) {
        const c = C();
        const o = opts || {};
        const l = {
            id: 'L' + uid++, type, name: o.name || defaultName(type),
            color: o.color || randColor(), color2: o.color2 || '#06b6d4',
            text: o.text || 'RUNE xFX', font: o.font || 'Segoe UI', size: o.size || 64,
            src: o.src || null, w: o.w || 200, h: o.h || 200,
            inPoint: o.in != null ? o.in : 0, outPoint: o.out != null ? o.out : c.dur,
            visible: true, effects: [], easing: 'linear',
            props: {
                position: { keys: [], value: o.pos || [c.w / 2, c.h / 2] },
                scale: { keys: [], value: o.scale != null ? o.scale : 100 },
                rotation: { keys: [], value: o.rotation || 0 },
                opacity: { keys: [], value: o.opacity != null ? o.opacity : 100 }
            }
        };
        if (o.keys) Object.keys(o.keys).forEach(k => { if (l.props[k]) l.props[k].keys = o.keys[k].map(p => ({ t: p[0], v: Array.isArray(p[1]) ? p[1].slice() : p[1] })); });
        if (o.effects) l.effects = o.effects.slice();
        return l;
    }
    function defaultName(type) {
        const map = { solid: 'Solid', text: 'Text', circle: 'Ellipse', rect: 'Rectangle', triangle: 'Triangle', star: 'Star', gradient: 'Gradient BG', image: 'Image', video: 'Video' };
        return (map[type] || type) + ' ' + uid;
    }
    const randColor = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

    function addComp(name, w, h, fps, dur) {
        const c = { id: 'C' + uid++, name: name || ('Comp ' + (comps.length + 1)), w: w || 960, h: h || 540, fps: fps || 30, dur: dur || 5, bg: '#000000', layers: [] };
        comps.push(c);
        return c;
    }

    /* ================= keyframe ================= */
    function interp(keys, time, fallback) {
        if (!keys || !keys.length) return fallback;
        if (time <= keys[0].t) return keys[0].v;
        if (time >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
        for (let i = 0; i < keys.length - 1; i++) {
            const a = keys[i], b = keys[i + 1];
            if (time >= a.t && time <= b.t) {
                let u = (time - a.t) / (b.t - a.t || 1);
                u = u * u * (3 - 2 * u); // smoothstep (ease in-out)
                if (Array.isArray(a.v)) return a.v.map((v, k) => v + (b.v[k] - v) * u);
                return a.v + (b.v - a.v) * u;
            }
        }
        return fallback;
    }
    function keyAt(prop, time) { return prop.keys.find(k => Math.abs(k.t - time) < 0.03); }
    function toggleKey(propName) {
        const l = L(); if (!l) return TK.toast('Chưa chọn layer', 'error');
        const p = l.props[propName];
        const ex = keyAt(p, t);
        if (ex) { p.keys = p.keys.filter(k => k !== ex); TK.status('Đã gỡ keyframe ' + propName + ' tại ' + t.toFixed(2) + 's'); }
        else {
            p.keys.push({ t: Math.round(t * 100) / 100, v: Array.isArray(p.value) ? p.value.slice() : p.value });
            p.keys.sort((a, b) => a.t - b.t);
            TK.status('◆ Đã đặt keyframe ' + propName + ' tại ' + t.toFixed(2) + 's');
        }
        renderTimeline(); renderEC(); draw();
    }
    function setProp(propName, v) {
        const l = L(); if (!l) return;
        const p = l.props[propName];
        const k = keyAt(p, t);
        if (k) k.v = Array.isArray(v) ? v.slice() : v;
        else p.value = Array.isArray(v) ? v.slice() : v;
        draw();
    }

    /* ================= render ================= */
    function draw(atTime, target, motionSamples) {
        const c = C(); if (!c) return;
        const time = atTime == null ? t : atTime;
        const g = (target || ctx);
        const canvas = target ? target.canvas : cv;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, canvas.width, canvas.height);
        const bg = document.getElementById('compBg').value;
        if (bg !== 'transparent') { g.fillStyle = c.bg === 'transparent' ? bg : (bg || c.bg); g.fillRect(0, 0, canvas.width, canvas.height); }

        const samples = motionSamples || 1;
        for (let i = c.layers.length - 1; i >= 0; i--) {
            const l = c.layers[i];
            if (!l.visible || time < l.inPoint || time > l.outPoint) continue;
            for (let s = 0; s < samples; s++) {
                const st = samples > 1 ? time - 0.5 / c.fps + (s / (samples - 1)) * (1 / c.fps) : time;
                drawLayer(g, l, st, samples > 1 ? 1 / samples : 1);
            }
        }
        // vignette toàn comp (nếu layer nào có)
        if (c.layers.some(l => l.visible && l.effects.includes('vignette') && time >= l.inPoint && time <= l.outPoint)) {
            const rg = g.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.25, canvas.width / 2, canvas.height / 2, canvas.height * 0.85);
            rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,.75)');
            g.fillStyle = rg; g.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    function drawLayer(g, l, time, alphaMul) {
        const pos = interp(l.props.position.keys, time, l.props.position.value);
        const scale = interp(l.props.scale.keys, time, l.props.scale.value) / 100;
        const rot = interp(l.props.rotation.keys, time, l.props.rotation.value) * Math.PI / 180;
        const op = interp(l.props.opacity.keys, time, l.props.opacity.value) / 100;

        g.save();
        g.globalAlpha = TK.clamp(op * (alphaMul == null ? 1 : alphaMul), 0, 1);
        g.translate(pos[0], pos[1]);
        g.rotate(rot);
        g.scale(scale, scale);

        // css filter từ effect
        const css = l.effects.filter(f => FX[f] && FX[f].css).map(f => FX[f].css).join(' ');
        if (css) g.filter = css;

        const w = l.w, h = l.h;
        const fill = l.color, fill2 = l.color2;

        if (l.type === 'text') {
            g.font = `800 ${l.size}px "${l.font}", sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            let txt = l.text || '';
            if (l.effects.includes('typewriter')) {
                const prog = TK.clamp((time - l.inPoint) / Math.max(0.4, (l.outPoint - l.inPoint) * 0.6), 0, 1);
                txt = txt.slice(0, Math.round(prog * txt.length));
            }
            if (l.effects.includes('glow')) { g.shadowColor = fill; g.shadowBlur = 26; }
            const grad = g.createLinearGradient(-g.measureText(txt).width / 2, 0, g.measureText(txt).width / 2, 0);
            if (l.effects.includes('gradient')) { grad.addColorStop(0, fill); grad.addColorStop(1, fill2); g.fillStyle = grad; }
            else g.fillStyle = fill;
            g.fillText(txt, 0, 0);
            g.shadowBlur = 0;
        } else if (l.type === 'solid') {
            g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
        } else if (l.type === 'gradient') {
            const gr = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
            gr.addColorStop(0, fill); gr.addColorStop(1, fill2);
            g.fillStyle = gr; g.fillRect(-w / 2, -h / 2, w, h);
        } else if (l.type === 'circle') {
            g.beginPath(); g.arc(0, 0, w / 2, 0, Math.PI * 2);
            if (l.effects.includes('gradient')) { const gr = g.createRadialGradient(0, 0, 2, 0, 0, w / 2); gr.addColorStop(0, fill2); gr.addColorStop(1, fill); g.fillStyle = gr; }
            else g.fillStyle = fill;
            g.fill();
        } else if (l.type === 'rect') {
            g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
            if (l.effects.includes('gradient')) { const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, fill); gr.addColorStop(1, fill2); g.fillStyle = gr; g.fillRect(-w / 2, -h / 2, w, h); }
        } else if (l.type === 'triangle') {
            g.beginPath(); g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); g.fillStyle = fill; g.fill();
        } else if (l.type === 'star') {
            g.beginPath();
            for (let i = 0; i < 10; i++) {
                const r = i % 2 ? w * 0.22 : w * 0.5;
                const a = Math.PI / 5 * i - Math.PI / 2;
                i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            g.closePath(); g.fillStyle = fill;
            if (l.effects.includes('glow')) { g.shadowColor = fill; g.shadowBlur = 30; }
            g.fill(); g.shadowBlur = 0;
        } else if ((l.type === 'image' || l.type === 'video') && l.src) {
            const src = l.processed || l.src;
            try {
                if (l.effects.includes('glow')) { g.save(); g.filter = 'blur(14px)'; g.globalAlpha *= .8; g.drawImage(src, -w / 2, -h / 2, w, h); g.restore(); }
                g.drawImage(src, -w / 2, -h / 2, w, h);
            } catch (e) {}
            if (l.type === 'video' && l.src.currentTime !== undefined) {
                const target = l.inPoint + (time - l.inPoint);
                if (Math.abs(l.src.currentTime - target) > 0.3) { try { l.src.currentTime = TK.clamp(target, 0, l.src.duration || 999); } catch (e) {} }
                if (playing && l.src.paused) l.src.play().catch(() => {});
                if (!playing && !l.src.paused) l.src.pause();
            }
        }

        // lens flare
        if (l.effects.includes('flare')) {
            const fg = g.createRadialGradient(w * 0.25, -h * 0.25, 2, w * 0.25, -h * 0.25, w * 0.55);
            fg.addColorStop(0, 'rgba(255,255,240,.95)');
            fg.addColorStop(.25, 'rgba(255,220,150,.45)');
            fg.addColorStop(1, 'rgba(255,180,80,0)');
            g.fillStyle = fg; g.beginPath(); g.arc(w * 0.25, -h * 0.25, w * 0.55, 0, Math.PI * 2); g.fill();
        }
        g.filter = 'none';
        g.restore();
    }

    /* ================= UI: comps / footage ================= */
    function renderComps() {
        const box = document.getElementById('compList');
        box.innerHTML = '';
        comps.forEach((c, i) => {
            const d = document.createElement('div');
            d.className = 'comp-item' + (i === cur ? ' on' : '');
            d.innerHTML = `<span>🎞️ ${escapeHtml(c.name)}</span><span class="x" title="Xóa comp">✕</span>`;
            d.addEventListener('click', e => {
                if (e.target.classList.contains('x')) {
                    if (comps.length <= 1) return TK.toast('Phải còn ít nhất 1 composition', 'error');
                    comps.splice(i, 1); cur = Math.max(0, cur - 1); sel = null; t = 0; syncAll(); return;
                }
                cur = i; sel = null; t = 0; syncAll();
                TK.status('Comp: ' + c.name);
            });
            box.appendChild(d);
        });
        document.getElementById('stComp').textContent = `Comp: ${C().name} ${C().w}×${C().h} · ${C().fps}fps · ${C().dur}s`;
        document.getElementById('stLayers').textContent = C().layers.length + ' layer';
    }
    const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    let footage = [];
    function renderFootage() {
        const box = document.getElementById('footageList');
        box.innerHTML = footage.length ? '' : '<div style="color:#777;font-size:11.5px;padding:4px;">Chưa có footage</div>';
        footage.forEach((f, i) => {
            const d = document.createElement('div');
            d.className = 'proj-item';
            d.innerHTML = `<span>${f.type === 'video' ? '🎬' : '🖼️'} ${escapeHtml(f.name)}</span><span class="x">✕</span>`;
            d.addEventListener('click', e => {
                if (e.target.classList.contains('x')) { footage.splice(i, 1); renderFootage(); return; }
                addFootageLayer(f);
            });
            box.appendChild(d);
        });
    }
    function addFootageLayer(f) {
        const c = C();
        const ratio = (f.w || 800) / (f.h || 600);
        const h = c.h * 0.8, w = h * ratio;
        const l = makeLayer(f.type === 'video' ? 'video' : 'image', { src: f.el, w, h, name: f.name, out: c.dur });
        c.layers.unshift(l);
        sel = l.id; syncAll();
        TK.toast('Đã thêm layer "' + f.name + '" vào comp', 'ok');
    }

    /* ================= UI: timeline ================= */
    function renderTimeline() {
        const c = C();
        const totalW = Math.max(600, (c.dur + 2) * PPS);
        document.getElementById('tlInner').style.width = totalW + 'px';

        const left = document.getElementById('tlLeft');
        left.innerHTML = '<div class="layer-row" style="color:#888;font-size:11px;">Layers (' + c.layers.length + ')</div>';
        c.layers.forEach(l => {
            const d = document.createElement('div');
            d.className = 'layer-row' + (l.id === sel ? ' on' : '');
            d.innerHTML = `<span class="vis">${l.visible ? '👁' : '−'}</span><span>${iconOf(l.type)}</span><span class="nm">${escapeHtml(l.name)}</span>`;
            d.querySelector('.vis').addEventListener('click', e => { e.stopPropagation(); l.visible = !l.visible; renderTimeline(); draw(); });
            d.addEventListener('click', () => { sel = l.id; renderTimeline(); renderEC(); draw(); });
            left.appendChild(d);
        });

        const ruler = document.getElementById('timeRuler');
        ruler.innerHTML = '';
        const step = PPS > 90 ? 0.5 : PPS > 45 ? 1 : 2;
        for (let s = 0; s <= c.dur + 2; s += step) {
            const d = document.createElement('div');
            d.className = 'ruler-tick';
            d.style.left = (s * PPS) + 'px';
            d.textContent = s.toFixed(step < 1 ? 1 : 0) + 's';
            ruler.appendChild(d);
        }

        const box = document.getElementById('tracksBox');
        box.innerHTML = '';
        c.layers.forEach(l => {
            const row = document.createElement('div');
            row.className = 'layer-track';
            const bar = document.createElement('div');
            bar.className = 'layer-bar' + (l.id === sel ? ' sel' : '');
            bar.style.left = (l.inPoint * PPS) + 'px';
            bar.style.width = Math.max(6, (l.outPoint - l.inPoint) * PPS) + 'px';
            bar.title = `${l.name}: ${l.inPoint.toFixed(2)}s → ${l.outPoint.toFixed(2)}s (kéo để dời)`;
            row.appendChild(bar);

            // keyframe dots của property đang chọn
            (l.props[selProp] ? l.props[selProp].keys : []).forEach(k => {
                const dot = document.createElement('div');
                dot.className = 'kdot' + (Math.abs(k.t - t) < 0.03 ? ' on' : '');
                dot.style.left = (k.t * PPS - 4.5) + 'px';
                dot.title = `Keyframe ${selProp} @ ${k.t.toFixed(2)}s — bấm để tới, kéo để dời`;
                let dg = null;
                dot.addEventListener('pointerdown', e => {
                    e.stopPropagation(); sel = l.id; dg = { x0: e.clientX, t0: k.t };
                    dot.setPointerCapture(e.pointerId); renderEC();
                });
                dot.addEventListener('pointermove', e => {
                    if (!dg) return;
                    const nt = TK.clamp(dg.t0 + (e.clientX - dg.x0) / PPS, 0, c.dur);
                    k.t = Math.round(nt * 100) / 100;
                    l.props[selProp].keys.sort((a, b) => a.t - b.t);
                    renderTimeline(); draw();
                });
                dot.addEventListener('pointerup', e => { if (dg) { dg = null; seek(k.t); } });
                dot.addEventListener('dblclick', () => { l.props[selProp].keys = l.props[selProp].keys.filter(x => x !== k); renderTimeline(); renderEC(); draw(); });
                row.appendChild(dot);
            });

            // kéo bar để dời in/out
            let bdrag = null;
            bar.addEventListener('pointerdown', e => {
                e.stopPropagation();
                sel = l.id; renderEC();
                bdrag = { x0: e.clientX, in0: l.inPoint, out0: l.outPoint };
                bar.setPointerCapture(e.pointerId);
            });
            bar.addEventListener('pointermove', e => {
                if (!bdrag) return;
                const dt = (e.clientX - bdrag.x0) / PPS;
                const dur = bdrag.out0 - bdrag.in0;
                l.inPoint = TK.clamp(bdrag.in0 + dt, 0, c.dur - 0.1);
                l.outPoint = l.inPoint + dur;
                renderTimeline(); draw();
            });
            bar.addEventListener('pointerup', () => { bdrag = null; renderTimeline(); });
            box.appendChild(row);
        });

        document.getElementById('timeMarker').style.left = (t * PPS) + 'px';
        const f = Math.round((t % 1) * c.fps);
        const s = Math.floor(t);
        document.getElementById('timeDisp').textContent =
            `00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')} / 00:00:${String(Math.floor(c.dur)).padStart(2, '0')}:00`;
    }
    const iconOf = ty => ({ solid: '🟦', text: '🔤', circle: '⭕', rect: '▭', triangle: '△', star: '✦', gradient: '🌈', image: '🖼️', video: '🎬' }[ty] || '▪');

    /* ruler scrub */
    (function () {
        const ruler = document.getElementById('timeRuler');
        let on = false;
        const set = e => { const r = ruler.getBoundingClientRect(); seek((e.clientX - r.left) / PPS); };
        ruler.addEventListener('pointerdown', e => { on = true; ruler.setPointerCapture(e.pointerId); set(e); });
        ruler.addEventListener('pointermove', e => { if (on) set(e); });
        ruler.addEventListener('pointerup', () => on = false);
    })();

    /* ================= Effect Controls ================= */
    function renderEC() {
        const head = document.getElementById('ecHead');
        const grid = document.getElementById('ecGrid');
        const l = L();
        if (!l) { head.textContent = 'Effect Controls — chưa chọn layer (bấm 1 layer ở timeline bên dưới)'; grid.innerHTML = ''; document.getElementById('layerFx').innerHTML = ''; return; }
        head.textContent = `Effect Controls — ${l.name} (${l.type}) @ ${t.toFixed(2)}s · property: ${selProp}`;

        const row = (prop, label, min, max, step, fmt, extra) => {
            const p = l.props[prop];
            const v = Array.isArray(p.value) ? null : (keyAt(p, t) ? keyAt(p, t).v : p.value);
            const has = !!keyAt(p, t);
            return `<div class="prop"><button class="kf ${has ? 'has' : ''}" data-kf="${prop}" title="Đặt/gỡ keyframe tại thời điểm này">◆</button>
                <label>${label}</label>
                ${v == null ? extra : `<input type="range" data-p="${prop}" min="${min}" max="${max}" step="${step || 1}" value="${v}"><span class="val" data-v="${prop}">${fmt ? fmt(v) : v}</span>`}
            </div>`;
        };
        const pos = interp(l.props.position.keys, t, l.props.position.value);
        let html = `<div class="prop"><button class="kf ${keyAt(l.props.position, t) ? 'has' : ''}" data-kf="position" title="Keyframe vị trí">◆</button>
                <label>Position</label>
                <input type="number" data-px value="${Math.round(pos[0])}" step="1"><input type="number" data-py value="${Math.round(pos[1])}" step="1"></div>`;
        html += row('scale', 'Scale', 0, 400, 1, v => Math.round(v) + '%');
        html += row('rotation', 'Rotation', -720, 720, 1, v => Math.round(v) + '°');
        html += row('opacity', 'Opacity', 0, 100, 1, v => Math.round(v) + '%');
        html += `<div class="prop"><label>In / Out</label><input type="number" data-in value="${l.inPoint.toFixed(2)}" step="0.1" style="width:56px;"><input type="number" data-out value="${l.outPoint.toFixed(2)}" step="0.1" style="width:56px;"></div>`;
        if (l.type === 'text') {
            html += `<div class="prop" style="grid-column:1/-1;"><label>Nội dung</label><input type="text" data-text value="${escapeHtml(l.text)}" style="flex:1;width:auto;"></div>`;
            html += `<div class="prop"><label>Cỡ chữ</label><input type="range" data-size min="8" max="220" value="${l.size}"><span class="val">${l.size}</span></div>`;
        }
        if (['solid', 'rect', 'circle', 'gradient', 'triangle', 'star'].includes(l.type)) {
            html += `<div class="prop"><label>Width</label><input type="range" data-w min="10" max="${C().w * 2}" value="${Math.round(l.w)}"><span class="val">${Math.round(l.w)}</span></div>`;
            html += `<div class="prop"><label>Height</label><input type="range" data-h min="10" max="${C().h * 2}" value="${Math.round(l.h)}"><span class="val">${Math.round(l.h)}</span></div>`;
        }
        html += `<div class="prop"><label>Màu 1</label><input type="color" data-color value="${toHex(l.color)}" style="width:56px;height:26px;"></div>`;
        html += `<div class="prop"><label>Màu 2</label><input type="color" data-color2 value="${toHex(l.color2)}" style="width:56px;height:26px;"></div>`;
        grid.innerHTML = html;

        // bind
        grid.querySelectorAll('[data-kf]').forEach(b => b.addEventListener('click', () => { selProp = b.dataset.kf; toggleKey(b.dataset.kf); }));
        grid.querySelectorAll('[data-p]').forEach(inp => {
            inp.addEventListener('input', () => {
                setProp(inp.dataset.p, parseFloat(inp.value));
                const v = grid.querySelector(`[data-v="${inp.dataset.p}"]`);
                if (v) v.textContent = inp.dataset.p === 'scale' ? Math.round(inp.value) + '%' : inp.dataset.p === 'rotation' ? Math.round(inp.value) + '°' : Math.round(inp.value) + '%';
            });
            inp.addEventListener('change', () => renderTimeline());
        });
        const px = grid.querySelector('[data-px]'), py = grid.querySelector('[data-py]');
        if (px && py) {
            const upd = () => setProp('position', [parseFloat(px.value) || 0, parseFloat(py.value) || 0]);
            px.addEventListener('input', upd); py.addEventListener('input', upd);
            px.addEventListener('change', () => renderTimeline()); py.addEventListener('change', () => renderTimeline());
        }
        const bindNum = (attr, fn) => { const el = grid.querySelector('[' + attr + ']'); if (el) { el.addEventListener('input', () => { fn(el); draw(); }); el.addEventListener('change', () => renderTimeline()); } };
        bindNum('data-in', el => l.inPoint = Math.max(0, parseFloat(el.value) || 0));
        bindNum('data-out', el => l.outPoint = Math.max(l.inPoint + 0.1, parseFloat(el.value) || C().dur));
        bindNum('data-text', el => l.text = el.value);
        bindNum('data-size', el => { l.size = parseInt(el.value, 10); el.parentElement.querySelector('.val').textContent = l.size; });
        bindNum('data-w', el => { l.w = parseInt(el.value, 10); el.parentElement.querySelector('.val').textContent = l.w; });
        bindNum('data-h', el => { l.h = parseInt(el.value, 10); el.parentElement.querySelector('.val').textContent = l.h; });
        bindNum('data-color', el => l.color = el.value);
        bindNum('data-color2', el => l.color2 = el.value);

        // effect chips
        const fxb = document.getElementById('layerFx');
        fxb.innerHTML = l.effects.length ? l.effects.map(f => `<span class="chip" data-rm="${f}">${FX[f] ? FX[f].n : f} ✕</span>`).join('') : '<span style="color:#777;font-size:11.5px;">Chưa có hiệu ứng — chọn ở panel phải</span>';
        fxb.querySelectorAll('[data-rm]').forEach(ch => ch.addEventListener('click', () => {
            l.effects = l.effects.filter(x => x !== ch.dataset.rm);
            renderEC(); renderFxList(); draw();
            TK.status('Đã gỡ hiệu ứng ' + ch.dataset.rm);
        }));
    }
    function toHex(c) { return /^#[0-9a-f]{6}$/i.test(c) ? c : '#888888'; }

    function renderFxList() {
        const box = document.getElementById('fxList');
        const cats = {};
        Object.keys(FX).forEach(k => { (cats[FX[k].cat] = cats[FX[k].cat] || []).push(k); });
        const l = L();
        box.innerHTML = Object.keys(cats).map(cat =>
            `<div class="effect-category">${cat}</div>` +
            cats[cat].map(k => `<div class="effect-entry ${l && l.effects.includes(k) ? 'added' : ''}" data-fx="${k}">${FX[k].n}</div>`).join('')
        ).join('') + `<div class="effect-category">Typing</div><div class="effect-entry" data-fx="typewriter">Typewriter (chữ gõ dần)</div>`;
        box.querySelectorAll('[data-fx]').forEach(e => e.addEventListener('click', () => {
            if (!L()) return TK.toast('Chọn 1 layer trước khi thêm hiệu ứng', 'error');
            const k = e.dataset.fx, l = L();
            if (l.effects.includes(k)) l.effects = l.effects.filter(x => x !== k);
            else l.effects.push(k);
            renderFxList(); renderEC(); draw();
            TK.status((l.effects.includes(k) ? 'Đã thêm ' : 'Đã gỡ ') + (FX[k] ? FX[k].n : k) + ' cho ' + l.name);
        }));
    }

    /* ================= playback ================= */
    function seek(v) {
        t = TK.clamp(v, 0, C().dur);
        draw(); renderTimeline(); renderEC();
    }
    function setPlay(p) {
        if (p && !C().layers.length) return TK.toast('Comp trống — thêm layer trước', 'error');
        playing = p;
        document.getElementById('playBtn').textContent = p ? '⏸ Dừng' : '▶ Phát';
        document.getElementById('playBtn').classList.toggle('on', p);
        TK.status(p ? '▶ Đang phát preview' : '⏸ Dừng');
    }
    function tick(ts) {
        raf = requestAnimationFrame(tick);
        if (!lastTs) lastTs = ts;
        const dt = (ts - lastTs) / 1000; lastTs = ts;
        if (playing) {
            t += dt;
            if (t >= C().dur) { if (loop) t = 0; else { t = C().dur; setPlay(false); } }
            const mb = L() && L().effects.includes('motionblur');
            draw(t, null, mb ? 4 : 1);
            document.getElementById('timeMarker').style.left = (t * PPS) + 'px';
            const f = Math.round((t % 1) * C().fps), s = Math.floor(t);
            document.getElementById('timeDisp').textContent = `00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')} / 00:00:${String(Math.floor(C().dur)).padStart(2, '0')}:00`;
        }
    }

    /* ================= render / export ================= */
    async function renderVideo() {
        const c = C();
        if (!c.layers.length) return TK.toast('Comp trống', 'error');
        TK.status('🎬 Đang render ' + c.dur + 's theo thời gian thực…');
        TK.toast('Đang render realtime — đừng chuyển tab');
        const stream = cv.captureStream(c.fps);
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
        const r = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
        const chunks = []; r.ondataavailable = e => chunks.push(e.data);
        const done = new Promise(res => r.onstop = res);
        r.start(200);
        const wasPlaying = playing;
        seek(0); setPlay(true);
        const t0 = performance.now();
        while ((performance.now() - t0) / 1000 < c.dur) {
            await new Promise(res => setTimeout(res, 100));
            document.getElementById('stComp').textContent = `Rendering… ${Math.min(100, Math.round((performance.now() - t0) / 1000 / c.dur * 100))}%`;
        }
        setPlay(wasPlaying);
        r.stop(); await done;
        const blob = new Blob(chunks, { type: 'video/webm' });
        TK.download(blob, `xfx-${c.name.replace(/\s+/g, '-')}-${Date.now()}.webm`);
        renderComps();
        TK.status(`✅ Render xong: ${c.w}×${c.h}, ${(blob.size / 1048576).toFixed(1)} MB`);
    }
    function exportFrame() {
        draw(t, null, 1);
        TK.download(cv.toDataURL('image/png'), `xfx-frame-${t.toFixed(2)}s.png`);
        TK.status('📸 Đã xuất frame tại ' + t.toFixed(2) + 's');
    }

    /* ================= presets animation ================= */
    function applyPreset(kind) {
        const l = L(); if (!l) return TK.toast('Chọn layer trước', 'error');
        const c = C(), d = c.dur;
        const P = l.props;
        if (kind === 'fadein') { P.opacity.keys = [{ t: l.inPoint, v: 0 }, { t: l.inPoint + 0.8, v: 100 }]; }
        if (kind === 'slidein') { P.position.keys = [{ t: l.inPoint, v: [-200, P.position.value[1]] }, { t: l.inPoint + 1, v: P.position.value.slice() }]; P.opacity.keys = [{ t: l.inPoint, v: 0 }, { t: l.inPoint + 0.6, v: 100 }]; }
        if (kind === 'pop') { P.scale.keys = [{ t: l.inPoint, v: 0 }, { t: l.inPoint + 0.35, v: 130 }, { t: l.inPoint + 0.6, v: 100 }]; }
        if (kind === 'spin') { P.rotation.keys = [{ t: l.inPoint, v: 0 }, { t: l.inPoint + d * 0.8, v: 360 }]; }
        if (kind === 'bounce') { P.position.keys = [{ t: l.inPoint, v: [P.position.value[0], -80] }, { t: l.inPoint + 0.4, v: P.position.value.slice() }, { t: l.inPoint + 0.65, v: [P.position.value[0], P.position.value[1] - 60] }, { t: l.inPoint + 0.9, v: P.position.value.slice() }]; }
        if (kind === 'typewriter') { if (!l.effects.includes('typewriter')) l.effects.push('typewriter'); }
        renderEC(); renderTimeline(); renderFxList(); draw();
        TK.toast('✨ Đã áp preset "' + kind + '" cho ' + l.name, 'ok');
    }

    /* ================= AI ================= */
    async function aiBuild() {
        const p = await TK.prompt('✨ AI tạo animation', 'Mô tả đoạn motion graphics bạn muốn (AI sẽ tạo comp + layer + keyframe thật):', 'Logo ngôi sao tím xoay và phóng to, chữ RUNE hiện dần từ dưới lên, nền gradient xanh-tím, 5 giây');
        if (!p) return;
        TK.status('AI đang dựng comp…');
        try {
            const j = await TK.ai(`Tạo composition After Effects cho yêu cầu: "${p}". Khung 960x540, 30fps, thời lượng 4-6 giây.
Trả JSON đúng schema:
{"name":"...","duration":5,"bg":"#000000",
 "layers":[{"type":"solid|text|circle|rect|triangle|star|gradient","name":"...","text":"(nếu là text)","color":"#rrggbb","color2":"#rrggbb","size":64,"w":300,"h":200,"in":0,"out":5,
   "effects":["glow","blur","gradient","typewriter","flare","vignette","bw","hue","invert","motionblur"],
   "keys":{"position":[[0,[480,540]],[1,[480,270]]],"scale":[[0,0],[0.6,120],[1,100]],"rotation":[[0,0],[5,360]],"opacity":[[0,0],[1,100]]}}]}
Mỗi layer phải có keyframe để tạo chuyển động. CHỈ trả JSON.`, { json: true, system: 'Bạn là motion designer. Chỉ trả JSON hợp lệ đúng schema.' });
            if (!j || !j.layers) throw new Error('AI không trả về cấu trúc hợp lệ');
            buildFromJson(j);
            TK.toast('✨ AI đã tạo comp "' + (j.name || 'AI Comp') + '" với ' + j.layers.length + ' layer — bấm ▶ Phát', 'ok');
        } catch (e) {
            TK.toast('AI lỗi: ' + RuneAI.humanError(e.message) + ' → đang tạo bản dựng mẫu theo từ khóa', 'error');
            buildFromJson(heuristicComp(p));
        }
    }

    function buildFromJson(j) {
        const c = addComp(j.name || 'AI Comp', j.width || 960, j.height || 540, j.fps || 30, TK.clamp(j.duration || 5, 1, 60));
        c.bg = j.bg || '#000000';
        document.getElementById('compBg').value = j.bg && j.bg !== 'transparent' ? '#000000' : 'transparent';
        (j.layers || []).forEach(sl => {
            const l = makeLayer(sl.type || 'solid', {
                name: sl.name, text: sl.text, color: sl.color, color2: sl.color2, size: sl.size,
                w: sl.w || (sl.type === 'gradient' || sl.type === 'solid' ? c.w : 200),
                h: sl.h || (sl.type === 'gradient' || sl.type === 'solid' ? c.h : 200),
                in: sl.in || 0, out: sl.out == null ? c.dur : sl.out,
                pos: Array.isArray(sl.position) ? sl.position : null,
                effects: sl.effects
            });
            if (sl.keys) Object.keys(sl.keys).forEach(k => {
                if (!l.props[k]) return;
                l.props[k].keys = (sl.keys[k] || []).map(pair => ({ t: pair[0], v: Array.isArray(pair[1]) ? pair[1].slice() : pair[1] })).sort((a, b) => a.t - b.t);
            });
            c.layers.push(l);
        });
        cur = comps.length - 1; sel = c.layers.length ? c.layers[0].id : null; t = 0;
        syncAll();
        setPlay(true);
    }

    function heuristicComp(p) {
        const s = p.toLowerCase();
        const layers = [];
        layers.push({ type: 'gradient', name: 'BG Gradient', color: '#2a0a5e', color2: /xanh|blue|teal/.test(s) ? '#0891b2' : '#7c3aed', w: 960, h: 540, in: 0, out: 5, keys: { rotation: [[0, 0], [5, 12]], scale: [[0, 110], [5, 130]] } });
        if (/sao|star|logo/.test(s)) layers.push({ type: 'star', name: 'Star Logo', color: '#ffd166', w: 220, h: 220, in: 0, out: 5, effects: ['glow'], keys: { position: [[0, [480, 540]], [1, [480, 220]]], scale: [[0, 0], [0.7, 130], [1.2, 100]], rotation: [[0, 0], [5, 360]] } });
        if (/tròn|circle|bóng/.test(s)) layers.push({ type: 'circle', name: 'Circle', color: '#06b6d4', w: 180, h: 180, in: 0.5, out: 5, effects: ['blur'], keys: { position: [[0.5, [120, 420]], [4.5, [840, 140]]], opacity: [[0.5, 0], [1.2, 90], [4, 90], [5, 0]] } });
        const txt = (/"([^"]+)"/.exec(p) || [, 'RUNE'])[1];
        layers.push({ type: 'text', name: 'Title', text: txt, color: '#ffffff', size: 76, in: 0.8, out: 5, effects: /gõ|typewriter/.test(s) ? ['typewriter'] : ['glow'], keys: { position: [[0.8, [480, 430]], [1.6, [480, 380]]], opacity: [[0.8, 0], [1.6, 100]] } });
        if (/chữ|text|tiêu đề|subtitle/.test(s)) layers.push({ type: 'text', name: 'Subtitle', text: 'Tạo bởi Rune xFX', color: '#cfc6ff', size: 28, in: 1.6, out: 5, keys: { opacity: [[1.6, 0], [2.4, 100]], position: [[1.6, [480, 470]], [2.4, [480, 450]]] } });
        return { name: 'AI Comp (heuristic)', duration: 5, bg: '#000000', layers };
    }

    /* AI roto / upscale / slowmo */
    function aiRoto() {
        const l = L();
        if (!l || !l.src) return TK.toast('Chọn layer ảnh/video (nhập footage trước) để tách nền', 'error');
        const s = l.src;
        const c = document.createElement('canvas');
        c.width = s.videoWidth || s.naturalWidth || s.width;
        c.height = s.videoHeight || s.naturalHeight || s.height;
        const x = c.getContext('2d');
        x.drawImage(s, 0, 0);
        const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
        // lấy màu nền từ 4 góc
        const corners = [[2, 2], [c.width - 3, 2], [2, c.height - 3], [c.width - 3, c.height - 3]].map(([px, py]) => {
            const i = (py * c.width + px) * 4; return [d[i], d[i + 1], d[i + 2]];
        });
        const bg = [0, 1, 2].map(k => corners.reduce((a, c2) => a + c2[k], 0) / 4);
        let removed = 0;
        for (let i = 0; i < d.length; i += 4) {
            const dist = Math.sqrt(Math.pow(d[i] - bg[0], 2) + Math.pow(d[i + 1] - bg[1], 2) + Math.pow(d[i + 2] - bg[2], 2));
            if (dist < 70) { d[i + 3] = 0; removed++; }
            else if (dist < 120) d[i + 3] = Math.round(d[i + 3] * (dist - 70) / 50);
        }
        x.putImageData(img, 0, 0);
        l.processed = c;
        draw();
        TK.toast(`✨ AI Rotoscoping: đã tách ${(removed / (d.length / 4) * 100).toFixed(1)}% nền (màu nền ${bg.map(Math.round).join(',')})`, 'ok');
        TK.status('Roto xong cho ' + l.name);
    }
    function aiUpscale() {
        const l = L();
        if (!l || !l.src) return TK.toast('Chọn layer ảnh/video để upscale', 'error');
        const s = l.processed || l.src;
        const w = s.videoWidth || s.naturalWidth || s.width, h = s.videoHeight || s.naturalHeight || s.height;
        const c = document.createElement('canvas');
        c.width = w * 2; c.height = h * 2;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.drawImage(s, 0, 0, c.width, c.height);
        // unsharp mask nhẹ
        const b = document.createElement('canvas'); b.width = c.width; b.height = c.height;
        const bx = b.getContext('2d'); bx.filter = 'blur(2px)'; bx.drawImage(c, 0, 0); bx.filter = 'none';
        const A = x.getImageData(0, 0, c.width, c.height), B = bx.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < A.data.length; i += 4) for (let k = 0; k < 3; k++) A.data[i + k] = TK.clamp(A.data[i + k] + (A.data[i + k] - B.data[i + k]) * 0.6, 0, 255);
        x.putImageData(A, 0, 0);
        l.processed = c; l.w *= 1.25; l.h *= 1.25;
        draw(); renderEC();
        TK.toast('✨ AI Upscale ×2 + làm nét: ' + c.width + '×' + c.height, 'ok');
    }
    async function aiSlowmo() {
        const f = await TK.prompt('AI Slow Motion', 'Nhân đôi thời lượng comp (mọi keyframe & layer giãn ra 2× = slow motion 0.5×). Gõ hệ số (0.25 – 2):', '0.5');
        if (!f) return;
        const k = 1 / TK.clamp(parseFloat(f) || 0.5, 0.25, 2);
        const c = C();
        c.dur = c.dur * k;
        c.layers.forEach(l => {
            l.inPoint *= k; l.outPoint *= k;
            Object.keys(l.props).forEach(p => l.props[p].keys.forEach(kf => kf.t *= k));
        });
        t = 0; syncAll();
        TK.toast(`✨ Đã làm chậm ${f}× — comp giờ dài ${c.dur.toFixed(2)}s`, 'ok');
    }

    /* ================= import footage ================= */
    async function importFootage() {
        const files = await TK.pickFiles('image/*,video/*');
        if (!files || !files.length) return;
        for (const f of files) {
            const url = URL.createObjectURL(f);
            if (f.type.startsWith('video')) {
                const v = document.createElement('video'); v.src = url; v.loop = true; v.muted = true; v.playsInline = true;
                await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; setTimeout(r, 4000); });
                footage.push({ name: f.name, type: 'video', el: v, w: v.videoWidth, h: v.videoHeight });
            } else {
                const img = await TK.loadImage(url);
                footage.push({ name: f.name, type: 'image', el: img, w: img.naturalWidth, h: img.naturalHeight });
            }
        }
        renderFootage();
        TK.toast('📥 Đã nhập ' + files.length + ' footage — bấm vào để thêm vào comp', 'ok');
    }

    /* ================= comp mẫu ================= */
    function buildSamples() {
        const c1 = addComp('Logo Reveal', 960, 540, 30, 5);
        c1.bg = '#0a0418';
        c1.layers.push(makeLayer('gradient', { name: 'BG', color: '#1a0b3d', color2: '#06b6d4', w: 1100, h: 640, keys: { scale: [[0, 100], [5, 125]], rotation: [[0, -3], [5, 3]] }, effects: ['vignette'] }));
        c1.layers.push(makeLayer('star', { name: 'Star', color: '#ffd166', w: 190, h: 190, keys: { position: [[0, [480, 600]], [1.1, [480, 235]]], scale: [[0, 0], [0.9, 140], [1.4, 100]], rotation: [[0, 0], [5, 300]] }, effects: ['glow', 'motionblur'] }));
        c1.layers.push(makeLayer('text', { name: 'Title', text: 'RUNE', size: 92, color: '#ffffff', keys: { opacity: [[1, 0], [1.8, 100]], position: [[1, [480, 380]], [1.8, [480, 350]]], scale: [[1, 80], [1.8, 100]] }, effects: ['glow'] }));
        c1.layers.push(makeLayer('text', { name: 'Tagline', text: 'Motion Graphics · VFX', size: 26, color: '#cfc6ff', keys: { opacity: [[2, 0], [2.8, 100]], position: [[2, [480, 430]], [2.8, [480, 418]]] } }));

        const c2 = addComp('Lower Third', 960, 540, 30, 5);
        c2.bg = '#101828';
        c2.layers.push(makeLayer('gradient', { name: 'BG', color: '#0f172a', color2: '#312e81', w: 960, h: 540 }));
        c2.layers.push(makeLayer('rect', { name: 'Bar', color: '#7c3aed', w: 420, h: 74, pos: [250, 430], keys: { position: [[0.5, [-180, 430]], [1.3, [250, 430]]] } }));
        c2.layers.push(makeLayer('text', { name: 'Name', text: 'Nguyễn Văn A', size: 34, color: '#fff', pos: [250, 422], keys: { opacity: [[1, 0], [1.5, 100]] } }));
        c2.layers.push(makeLayer('text', { name: 'Role', text: 'Creative Director', size: 18, color: '#cfc6ff', pos: [250, 452], keys: { opacity: [[1.2, 0], [1.8, 100]] } }));

        const c3 = addComp('Kinetic Type', 960, 540, 30, 6);
        c3.bg = '#000000';
        const words = ['SÁNG', 'TẠO', 'KHÔNG', 'GIỚI HẠN'];
        words.forEach((w, i) => {
            c3.layers.push(makeLayer('text', {
                name: 'Word ' + (i + 1), text: w, size: 96, color: ['#f472b6', '#60a5fa', '#34d399', '#fbbf24'][i],
                in: i * 1.2, out: i * 1.2 + 1.6,
                keys: { scale: [[i * 1.2, 20], [i * 1.2 + 0.35, 120], [i * 1.2 + 0.6, 100], [i * 1.2 + 1.5, 100]], opacity: [[i * 1.2, 0], [i * 1.2 + 0.3, 100], [i * 1.2 + 1.4, 100], [i * 1.2 + 1.6, 0]], rotation: [[i * 1.2, -8], [i * 1.2 + 0.6, 0]] },
                effects: i % 2 ? ['glow'] : ['motionblur']
            }));
        });
        cur = 0; sel = comps[0].layers[1] ? comps[0].layers[1].id : null;
    }

    /* ================= actions ================= */
    TK.init({ app: 'xfx', status: '.statusbar [data-status-text]' });
    const A = {
        newComp: async () => {
            const v = await TK.prompt('Composition mới', 'Nhập: Tên, RỘNGxCAO, fps, giây\nVí dụ: Intro 1920x1080 30 6', 'Intro, 1920x1080, 30, 6');
            if (!v) return;
            const parts = v.split(/[,\n]/).map(s => s.trim());
            const size = /(\d+)\s*[x×]\s*(\d+)/i.exec(v);
            const nums = parts.map(p => parseFloat(p)).filter(n => !isNaN(n));
            const c = addComp(parts.find(p => isNaN(parseFloat(p))) || 'Comp mới', size ? +size[1] : 960, size ? +size[2] : 540, nums.filter(n => n >= 12 && n <= 120)[0] || 30, TK.clamp(nums[nums.length - 1] || 5, 1, 120));
            cv.width = c.w; cv.height = c.h;
            cur = comps.length - 1; sel = null; t = 0; syncAll();
            TK.toast('Đã tạo comp ' + c.name + ' ' + c.w + '×' + c.h, 'ok');
        },
        importFootage,
        addLayer: (e, el) => {
            const type = el.dataset.arg;
            const c = C();
            const o = { in: t, out: c.dur };
            if (type === 'solid' || type === 'gradient') { o.w = c.w; o.h = c.h; o.pos = [c.w / 2, c.h / 2]; o.in = 0; }
            if (type === 'text') { o.size = 64; o.w = 400; o.h = 100; }
            if (['circle', 'rect', 'triangle', 'star'].includes(type)) { o.w = 180; o.h = 180; }
            const l = makeLayer(type, o);
            c.layers.unshift(l);
            sel = l.id; syncAll();
            TK.status('Đã thêm layer ' + l.name);
        },
        deleteLayer: () => {
            const l = L(); if (!l) return TK.toast('Chưa chọn layer', 'error');
            C().layers = C().layers.filter(x => x !== l);
            sel = null; syncAll(); TK.status('Đã xóa layer ' + l.name);
        },
        playPause: () => setPlay(!playing),
        goStart: () => seek(0), goEnd: () => seek(C().dur),
        stepBack: () => seek(t - 1 / C().fps), stepFwd: () => seek(t + 1 / C().fps),
        loopToggle: (e, el) => { loop = !loop; el.classList.toggle('on', loop); TK.status(loop ? '🔁 Lặp: BẬT' : 'Lặp: TẮT'); },
        exportFrame, render: renderVideo,
        preset: (e, el) => applyPreset(el.dataset.arg),
        aiBuild, aiRoto, aiUpscale, aiSlowmo
    };
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    document.getElementById('viewZoom').addEventListener('input', e => {
        const z = parseInt(e.target.value, 10) / 100;
        cv.style.width = (C().w * z) + 'px';
        cv.style.height = (C().h * z) + 'px';
        cv.style.maxWidth = 'none'; cv.style.maxHeight = 'none';
    });
    document.getElementById('compBg').addEventListener('change', () => draw());

    function syncAll() {
        const c = C();
        cv.width = c.w; cv.height = c.h;
        const z = parseInt(document.getElementById('viewZoom').value, 10) / 100;
        if (z !== 1) { cv.style.width = (c.w * z) + 'px'; cv.style.height = (c.h * z) + 'px'; }
        renderComps(); renderFootage(); renderTimeline(); renderEC(); renderFxList(); draw();
    }

    /* phím tắt */
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
        const k = e.key.toLowerCase();
        if (k === ' ') { e.preventDefault(); A.playPause(); }
        else if (k === 'home') seek(0);
        else if (k === 'end') seek(C().dur);
        else if (k === 'arrowleft') seek(t - (e.shiftKey ? 1 : 1 / C().fps));
        else if (k === 'arrowright') seek(t + (e.shiftKey ? 1 : 1 / C().fps));
        else if (k === 'p') toggleKey('position');
        else if (k === 's' && !e.ctrlKey) toggleKey('scale');
        else if (k === 'r') toggleKey('rotation');
        else if (k === 't' && !e.ctrlKey) toggleKey('opacity');
        else if (k === 'delete' || k === 'backspace') A.deleteLayer();
        else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); const l = L(); if (l) { const c2 = Object.assign({}, l); c2.id = 'L' + uid++; c2.props = JSON.parse(JSON.stringify(l.props)); C().layers.unshift(c2); sel = c2.id; syncAll(); } }
        else if (k === 'u') { selProp = selProp === 'position' ? 'scale' : selProp === 'scale' ? 'rotation' : selProp === 'rotation' ? 'opacity' : 'position'; renderTimeline(); renderEC(); TK.status('Property hiển thị keyframe: ' + selProp); }
        else if ((e.ctrlKey || e.metaKey) && k === 'e') { e.preventDefault(); renderVideo(); }
    });

    /* lệnh cho AI điều khiển */
    TK.cmd('get_info', () => ({ app: 'xFX', comps: comps.map(c => ({ name: c.name, layers: c.layers.length, dur: c.dur })), current: C().name, time: +t.toFixed(2) }));
    TK.cmd('new_comp', a => { const c = addComp(a.name, a.w, a.h, a.fps, a.duration); cv.width = c.w; cv.height = c.h; cur = comps.length - 1; sel = null; t = 0; syncAll(); return { comp: c.name }; });
    TK.cmd('add_layer', a => { const l = makeLayer(a.type || 'solid', a); C().layers.unshift(l); sel = l.id; syncAll(); return { layer: l.name }; });
    TK.cmd('delete_layer', () => { A.deleteLayer(); return { ok: true }; });
    TK.cmd('set_keyframe', a => { const l = L(); if (!l) return { error: 'chưa chọn layer' }; const p = l.props[a.property || 'position']; if (!p) return { error: 'property không tồn tại' }; p.keys.push({ t: a.time != null ? a.time : t, v: a.value != null ? a.value : (Array.isArray(p.value) ? p.value.slice() : p.value) }); p.keys.sort((x, y) => x.t - y.t); renderTimeline(); renderEC(); draw(); return { keys: p.keys.length }; });
    TK.cmd('apply_effect', a => { const l = L(); if (!l) return { error: 'chưa chọn layer' }; if (!l.effects.includes(a.effect)) l.effects.push(a.effect); renderFxList(); renderEC(); draw(); return { effects: l.effects }; });
    TK.cmd('apply_preset', a => { applyPreset(a.preset || 'fadein'); return { preset: a.preset }; });
    TK.cmd('play', a => { setPlay(a.play !== false); return { playing }; });
    TK.cmd('seek', a => { seek(a.time || 0); return { t }; });
    TK.cmd('build_animation', a => { buildFromJson(a.comp || a); return { ok: true }; });
    TK.cmd('ai_build', a => { aiBuildPrompt(a.prompt); return { started: true }; });
    TK.cmd('render', () => { renderVideo(); return { started: true }; });
    TK.cmd('export_frame', () => { exportFrame(); return { ok: true }; });
    TK.cmd('upscale', () => { aiUpscale(); return { ok: true }; });
    TK.cmd('roto', () => { aiRoto(); return { ok: true }; });

    async function aiBuildPrompt(p) {
        try {
            const j = await TK.ai(`Tạo composition: "${p}". Trả JSON schema như After Effects: {"name","duration","bg","layers":[{"type","name","text","color","color2","size","w","h","in","out","effects":[],"keys":{"position":[[t,[x,y]]],"scale":[[t,v]],"rotation":[[t,v]],"opacity":[[t,v]]}}]}`, { json: true, system: 'Chỉ trả JSON.' });
            if (j && j.layers) buildFromJson(j);
            else buildFromJson(heuristicComp(p));
        } catch (e) { buildFromJson(heuristicComp(p)); }
    }

    /* chạy */
    buildSamples();
    syncAll();
    raf = requestAnimationFrame(tick);
    TK.status('Sẵn sàng — 3 comp mẫu (Logo Reveal / Lower Third / Kinetic Type). Bấm ▶ Phát để xem animation thật.');
})();
