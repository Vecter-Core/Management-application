/* ============================================================
   xLayout — dàn trang thật: trang, khung chữ/ảnh/hình, master page,
   paragraph styles, mục lục, in/PDF, xuất HTML, AI viết & dàn trang
   ============================================================ */
(function () {
    'use strict';

    const TOOLS = [
        ['select', '🖱️', 'Chọn / kéo khung (V)'], ['text', 'T', 'Khung chữ — kéo để vẽ (T)'],
        ['frame', '▢', 'Khung ảnh — kéo để vẽ, click để tải ảnh (F)'], ['rect', '▭', 'Hộp màu (M)'],
        ['ellipse', '◯', 'Hình tròn (L)'], ['line', '╱', 'Đường kẻ'], ['hand', '✋', 'Vừa màn hình']
    ];

    const doc = {
        name: 'Bố cục RUNE',
        size: { w: 595, h: 842 },
        master: { header: 'RUNE — TẠP CHÍ SỐ 01', footer: 'www.rune.app', numbers: true, margin: 42, columns: 1 },
        guides: true,
        pages: [],
        paraStyles: [
            { name: 'H1 — Tiêu đề lớn', size: 40, weight: '800', lh: 1.1, color: '#111111', family: 'Georgia', align: 'left', ls: -0.5 },
            { name: 'H2 — Tiêu đề phụ', size: 22, weight: '700', lh: 1.2, color: '#c2185b', family: 'Segoe UI', align: 'left', ls: 0 },
            { name: 'Body — Nội dung', size: 12, weight: '400', lh: 1.55, color: '#222222', family: 'Georgia', align: 'justify', ls: 0 },
            { name: 'Caption — Chú thích', size: 9.5, weight: '400', lh: 1.3, color: '#777777', family: 'Segoe UI', align: 'left', ls: 0.2 }
        ],
        charStyles: [
            { name: 'Đậm nhấn', weight: '800', color: '#c2185b', underline: false },
            { name: 'In nghiêng', weight: '400', color: '#111111', italic: true }
        ]
    };

    const S = { page: 0, sel: null, tool: 'select', zoom: 1, uid: 1 };
    const hist = TK.history(40);

    const pageEl = document.getElementById('page');
    const framesEl = document.getElementById('frames');
    const guidesEl = document.getElementById('guides');
    const handlesEl = document.getElementById('handles');
    const stage = document.getElementById('stage');

    /* ---------- tiện ích ---------- */
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const newPage = () => ({ frames: [] });
    const frame = id => doc.pages[S.page].frames.find(f => f.id === id);
    const selFrame = () => (S.sel ? frame(S.sel) : null);
    const stripTags = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

    function mkFrame(type, o) {
        return Object.assign({
            id: 'f' + S.uid++, type, x: 40, y: 40, w: 240, h: 120, rot: 0, op: 100,
            fill: type === 'text' ? 'transparent' : '#f1f1f4', stroke: type === 'shape' ? '#111111' : 'transparent',
            strokeW: type === 'shape' ? 1 : 0, radius: 0, pad: type === 'text' ? 6 : 0,
            shape: 'rect', src: '', html: '', z: doc.pages[S.page].frames.length,
            font: { family: 'Georgia', size: 12, lh: 1.55, color: '#222222', ls: 0, weight: '400', italic: false, underline: false, align: 'left' }
        }, o || {});
    }

    /* ---------- toolbar ---------- */
    const toolBar = document.getElementById('toolBar');
    toolBar.innerHTML = TOOLS.map(t => `<button class="tb ${t[0] === S.tool ? 'active' : ''}" data-tool="${t[0]}" title="${t[2]}">${t[1]}</button>`).join('');
    toolBar.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    function setTool(n) {
        if (n === 'hand') { zoomFit(); return; }
        S.tool = n;
        toolBar.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === n));
        pageEl.style.cursor = n === 'select' ? 'default' : 'crosshair';
        TK.status('Công cụ: ' + (TOOLS.find(t => t[0] === n) || [])[2]);
    }

    /* ---------- render ---------- */
    function renderAll(structural) {
        renderPages();
        renderPage();
        renderStyles();
        if (structural !== false) push();
        updateStatus();
    }

    function renderPage() {
        const p = doc.pages[S.page];
        pageEl.style.width = doc.size.w + 'px';
        pageEl.style.height = doc.size.h + 'px';
        pageEl.style.transform = `scale(${S.zoom})`;
        // master furniture
        let html = '';
        const m = doc.master;
        if (m.header) html += `<div style="position:absolute;left:${m.margin}px;right:${m.margin}px;top:${m.margin * 0.42}px;font:600 9px 'Segoe UI';letter-spacing:1.6px;color:#888;text-transform:uppercase;border-bottom:.6px solid #ddd;padding-bottom:4px;">${esc(m.header)}</div>`;
        if (m.footer || m.numbers) html += `<div style="position:absolute;left:${m.margin}px;right:${m.margin}px;bottom:${m.margin * 0.42}px;display:flex;justify-content:space-between;font:400 9px 'Segoe UI';color:#888;border-top:.6px solid #ddd;padding-top:4px;"><span>${esc(m.footer)}</span>${m.numbers ? `<span>Trang ${S.page + 1} / ${doc.pages.length}</span>` : ''}</div>`;
        // guides
        let g = '';
        if (doc.guides) {
            g += `<div class="guide" style="left:${m.margin}px;top:${m.margin}px;bottom:${m.margin}px;width:.6px;"></div>`;
            g += `<div class="guide" style="right:${m.margin}px;top:${m.margin}px;bottom:${m.margin}px;width:.6px;"></div>`;
            g += `<div class="guide" style="top:${m.margin}px;left:${m.margin}px;right:${m.margin}px;height:.6px;"></div>`;
            g += `<div class="guide" style="bottom:${m.margin}px;left:${m.margin}px;right:${m.margin}px;height:.6px;"></div>`;
            const cols = Math.max(1, m.columns | 0);
            const usable = doc.size.w - m.margin * 2, gap = cols > 1 ? 14 : 0;
            for (let i = 1; i < cols; i++) {
                const x = m.margin + (usable / cols) * i + gap / 2;
                g += `<div class="guide" style="left:${x}px;top:${m.margin}px;bottom:${m.margin}px;width:.6px;background:rgba(0,150,255,.35);"></div>`;
            }
        }
        guidesEl.innerHTML = g;
        document.getElementById('furniture').innerHTML = html;

        // frames
        framesEl.innerHTML = '';
        p.frames.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).forEach(f => framesEl.appendChild(frameNode(f)));
        drawHandles();
    }

    function frameNode(f) {
        const d = document.createElement('div');
        d.className = 'frame' + (f.id === S.sel ? ' sel' : '');
        d.dataset.id = f.id;
        d.style.cssText = `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px;transform:rotate(${f.rot || 0}deg);opacity:${(f.op == null ? 100 : f.op) / 100};background:${f.fill || 'transparent'};border:${(f.strokeW || 0)}px solid ${f.stroke || 'transparent'};border-radius:${f.radius || 0}px;padding:${f.pad || 0}px;`;
        if (f.type === 'image') {
            d.innerHTML = f.src ? `<img src="${f.src}" alt="">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px;background:repeating-linear-gradient(45deg,#eee,#eee 8px,#f7f7f7 8px,#f7f7f7 16px);">Ảnh — click đúp để chọn file</div>`;
        } else if (f.type === 'shape') {
            if (f.shape === 'ellipse') d.style.borderRadius = '50%';
            if (f.shape === 'line') { d.style.height = Math.max(1, f.h) + 'px'; d.style.background = f.stroke || '#111'; d.style.border = 'none'; }
        } else {
            const t = document.createElement('div');
            t.className = 'txt';
            t.style.cssText = `font-family:'${f.font.family}',serif;font-size:${f.font.size}px;line-height:${f.font.lh};color:${f.font.color};letter-spacing:${f.font.ls}px;text-align:${f.font.align};font-weight:${f.font.weight};font-style:${f.font.italic ? 'italic' : 'normal'};text-decoration:${f.font.underline ? 'underline' : 'none'};`;
            t.innerHTML = f.html || '';
            t.contentEditable = 'false';
            t.addEventListener('input', () => { f.html = t.innerHTML; clearTimeout(f._t); f._t = setTimeout(() => { push(); updateStatus(); }, 700); });
            t.addEventListener('blur', () => { t.contentEditable = 'false'; f.html = t.innerHTML; push(); });
            d.appendChild(t);
        }
        return d;
    }

    function drawHandles() {
        handlesEl.innerHTML = '';
        const f = selFrame();
        if (!f) return;
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([hx, hy], i) => {
            const h = document.createElement('div');
            h.className = 'hd';
            h.dataset.h = ['nw', 'ne', 'sw', 'se'][i];
            h.style.cssText = `left:${f.x + f.w * hx - 5}px;top:${f.y + f.h * hy - 5}px;cursor:${i === 0 || i === 3 ? 'nwse-resize' : 'nesw-resize'};`;
            handlesEl.appendChild(h);
        });
    }

    function renderPages() {
        const box = document.getElementById('pgList');
        document.getElementById('pgCount').textContent = '(' + doc.pages.length + ')';
        box.innerHTML = '';
        doc.pages.forEach((p, i) => {
            const d = document.createElement('div');
            d.className = 'pg' + (i === S.page ? ' on' : '');
            const k = doc.size.w / 130;
            let inner = '';
            p.frames.slice(0, 22).forEach(f => {
                if (f.type === 'image') inner += `<div style="position:absolute;left:${f.x / k}px;top:${f.y / k}px;width:${Math.max(2, f.w / k)}px;height:${Math.max(2, f.h / k)}px;background:${f.src ? `url(${f.src}) center/cover` : '#eee'};border-radius:1px;"></div>`;
                else if (f.type === 'shape') inner += `<div style="position:absolute;left:${f.x / k}px;top:${f.y / k}px;width:${Math.max(2, f.w / k)}px;height:${Math.max(1, f.h / k)}px;background:${f.fill === 'transparent' ? f.stroke : f.fill};border-radius:${f.shape === 'ellipse' ? '50%' : '1px'};"></div>`;
                else {
                    const n = Math.max(1, Math.round((f.h / Math.max(6, f.font.size * f.font.lh))));
                    let bars = '';
                    for (let b = 0; b < Math.min(8, n); b++) bars += `<div class="bar" style="width:${60 + ((b * 37) % 40)}%;height:${Math.max(1, f.font.size / k * 1.4)}px;background:${b === 0 && f.font.size > 20 ? '#222' : '#ccc'};"></div>`;
                    inner += `<div style="position:absolute;left:${f.x / k}px;top:${f.y / k}px;width:${Math.max(4, f.w / k)}px;">${bars}</div>`;
                }
            });
            d.innerHTML = `<b>Trang ${i + 1}</b><div style="position:absolute;inset:14px 6px 12px;overflow:hidden;">${inner}</div><span class="num">${p.frames.length} khung</span>`;
            d.addEventListener('click', () => goPage(i));
            box.appendChild(d);
        });
    }

    function renderStyles() {
        const p = document.getElementById('paraStyles');
        p.innerHTML = '';
        doc.paraStyles.forEach((s, i) => {
            const d = document.createElement('div');
            d.className = 'style-item';
            d.innerHTML = `<span style="font-family:'${s.family}';font-weight:${s.weight};font-size:${Math.min(15, s.size * 0.55)}px;color:${s.color};">${esc(s.name)}</span><span style="color:#c99;" data-del>✕</span>`;
            d.addEventListener('click', e => {
                if (e.target.dataset.del != null) { doc.paraStyles.splice(i, 1); renderStyles(); push(); return; }
                applyParaStyle(s);
            });
            p.appendChild(d);
        });
        const c = document.getElementById('charStyles');
        c.innerHTML = '';
        doc.charStyles.forEach((s, i) => {
            const d = document.createElement('div');
            d.className = 'style-item';
            d.innerHTML = `<span style="font-weight:${s.weight || 400};color:${s.color || '#fff'};font-style:${s.italic ? 'italic' : 'normal'};">${esc(s.name)}</span><span style="color:#c99;" data-del>✕</span>`;
            d.addEventListener('click', e => {
                if (e.target.dataset.del != null) { doc.charStyles.splice(i, 1); renderStyles(); push(); return; }
                applyCharStyle(s);
            });
            c.appendChild(d);
        });
    }

    function updateStatus() {
        document.getElementById('stPage').textContent = `Trang ${S.page + 1}/${doc.pages.length}`;
        document.getElementById('stFrames').textContent = doc.pages[S.page].frames.length + ' khung';
        const words = doc.pages.reduce((n, p) => n + p.frames.filter(f => f.type === 'text').reduce((m, f) => m + (stripTags(f.html).split(/\s+/).filter(Boolean).length), 0), 0);
        document.getElementById('stWords').textContent = words + ' từ (toàn tài liệu)';
        document.getElementById('stSize').textContent = `${doc.size.w} × ${doc.size.h} pt`;
        document.getElementById('stZoom').textContent = Math.round(S.zoom * 100) + '%';
        const f = selFrame();
        document.getElementById('selInfo').textContent = f ? `— ${f.type}${f.type === 'shape' ? '/' + f.shape : ''}` : '— chưa chọn';
        syncPanel();
    }

    function goPage(i) {
        if (i < 0 || i >= doc.pages.length) return;
        S.page = i; S.sel = null;
        renderAll(false);
        TK.status('Đang xem trang ' + (i + 1));
    }

    /* ---------- panel ---------- */
    function syncPanel() {
        const f = selFrame();
        ['pX', 'pY', 'pW', 'pH', 'pRot', 'pOp', 'pFill', 'pStroke', 'pStrokeW', 'pRadius'].forEach(id => { if (!f) document.getElementById(id).value = ''; });
        if (!f) return;
        document.getElementById('pX').value = Math.round(f.x);
        document.getElementById('pY').value = Math.round(f.y);
        document.getElementById('pW').value = Math.round(f.w);
        document.getElementById('pH').value = Math.round(f.h);
        document.getElementById('pRot').value = f.rot || 0;
        document.getElementById('pRotV').textContent = f.rot || 0;
        document.getElementById('pOp').value = f.op == null ? 100 : f.op;
        document.getElementById('pOpV').textContent = f.op == null ? 100 : f.op;
        document.getElementById('pFill').value = toHex(f.fill);
        document.getElementById('pStroke').value = toHex(f.stroke);
        document.getElementById('pStrokeW').value = f.strokeW || 0;
        document.getElementById('pRadius').value = f.radius || 0;
        if (f.type === 'text') {
            document.getElementById('tFamily').value = f.font.family;
            document.getElementById('tSize').value = f.font.size;
            document.getElementById('tLh').value = f.font.lh;
            document.getElementById('tColor').value = toHex(f.font.color);
            document.getElementById('tLs').value = f.font.ls;
            document.querySelectorAll('[data-action="alignText"]').forEach(b => b.classList.toggle('on', b.dataset.arg === f.font.align));
            document.querySelector('[data-action="fmt"][data-arg="bold"]').classList.toggle('on', +f.font.weight >= 700);
            document.querySelector('[data-action="fmt"][data-arg="italic"]').classList.toggle('on', !!f.font.italic);
            document.querySelector('[data-action="fmt"][data-arg="underline"]').classList.toggle('on', !!f.font.underline);
        }
    }
    function toHex(c) {
        if (!c || c === 'transparent') return '#ffffff';
        if (c[0] === '#') return c.length === 4 ? '#' + c.slice(1).split('').map(x => x + x).join('') : c;
        const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c);
        return m ? '#' + m.slice(1).map(v => (+v).toString(16).padStart(2, '0')).join('') : '#000000';
    }

    function bindPanel() {
        const set = (id, fn, live) => {
            const e = document.getElementById(id);
            e.addEventListener(live ? 'input' : 'change', () => { const f = selFrame(); if (f) { fn(f, e.value); renderPage(); updateStatus(); } });
            if (!live) e.addEventListener('change', () => push());
        };
        set('pX', (f, v) => f.x = +v || 0); set('pY', (f, v) => f.y = +v || 0);
        set('pW', (f, v) => f.w = Math.max(6, +v || 6)); set('pH', (f, v) => f.h = Math.max(6, +v || 6));
        set('pRot', (f, v) => { f.rot = +v || 0; document.getElementById('pRotV').textContent = f.rot; }, true);
        set('pOp', (f, v) => { f.op = +v; document.getElementById('pOpV').textContent = f.op; }, true);
        set('pFill', (f, v) => f.fill = v); set('pStroke', (f, v) => f.stroke = v);
        set('pStrokeW', (f, v) => f.strokeW = +v || 0); set('pRadius', (f, v) => f.radius = +v || 0);
        set('tFamily', (f, v) => f.font.family = v);
        set('tSize', (f, v) => f.font.size = Math.max(4, +v || 12));
        set('tLh', (f, v) => f.font.lh = +v || 1.4);
        set('tColor', (f, v) => f.font.color = v);
        set('tLs', (f, v) => f.font.ls = +v || 0);
        document.getElementById('mHeader').addEventListener('change', e => { doc.master.header = e.target.value; renderAll(); });
        document.getElementById('mFooter').addEventListener('change', e => { doc.master.footer = e.target.value; renderAll(); });
        document.getElementById('pageSize').addEventListener('change', e => {
            const [w, h] = e.target.value.split('x').map(Number);
            doc.size = { w, h }; renderAll(); TK.toast('Đã đổi cỡ trang: ' + w + '×' + h + 'pt', 'ok');
        });
    }

    /* ---------- kéo / thả trên trang ---------- */
    let drag = null;
    pageEl.addEventListener('pointerdown', e => {
        const h = e.target.dataset && e.target.dataset.h;
        const fEl = e.target.closest('.frame');
        pageEl.setPointerCapture(e.pointerId);
        const pt = local(e);

        if (h && S.sel) {
            const f = selFrame();
            drag = { mode: 'resize', h, f, p0: pt, x0: f.x, y0: f.y, w0: f.w, h0: f.h };
            return;
        }
        if (S.tool === 'select') {
            if (fEl) {
                const f = frame(fEl.dataset.id);
                S.sel = f.id; renderPage(); updateStatus();
                drag = { mode: 'move', f, p0: pt, x0: f.x, y0: f.y };
            } else { S.sel = null; renderPage(); updateStatus(); }
            return;
        }
        // công cụ vẽ: kéo tạo khung
        drag = { mode: 'create', p0: pt };
    });
    pageEl.addEventListener('pointermove', e => {
        if (!drag) return;
        const pt = local(e);
        if (drag.mode === 'move') {
            drag.f.x = Math.round(drag.x0 + pt.x - drag.p0.x);
            drag.f.y = Math.round(drag.y0 + pt.y - drag.p0.y);
            if (e.shiftKey) drag.f.y = drag.y0;
            renderPage();
        } else if (drag.mode === 'resize') {
            const f = drag.f;
            const dx = pt.x - drag.p0.x, dy = pt.y - drag.p0.y;
            if (drag.h === 'se') { f.w = Math.max(10, Math.round(drag.w0 + dx)); f.h = Math.max(10, Math.round(drag.h0 + dy)); }
            if (drag.h === 'nw') { f.x = Math.round(drag.x0 + dx); f.y = Math.round(drag.y0 + dy); f.w = Math.max(10, Math.round(drag.w0 - dx)); f.h = Math.max(10, Math.round(drag.h0 - dy)); }
            if (drag.h === 'ne') { f.y = Math.round(drag.y0 + dy); f.w = Math.max(10, Math.round(drag.w0 + dx)); f.h = Math.max(10, Math.round(drag.h0 - dy)); }
            if (drag.h === 'sw') { f.x = Math.round(drag.x0 + dx); f.w = Math.max(10, Math.round(drag.w0 - dx)); f.h = Math.max(10, Math.round(drag.h0 + dy)); }
            renderPage();
        } else if (drag.mode === 'create') {
            if (!drag.box) {
                drag.box = document.createElement('div');
                drag.box.style.cssText = 'position:absolute;border:1.5px dashed #ff4081;background:rgba(255,64,129,.12);pointer-events:none;';
                pageEl.appendChild(drag.box);
            }
            const x = Math.min(pt.x, drag.p0.x), y = Math.min(pt.y, drag.p0.y);
            const w = Math.abs(pt.x - drag.p0.x), h = Math.abs(pt.y - drag.p0.y);
            drag.box.style.left = x + 'px'; drag.box.style.top = y + 'px';
            drag.box.style.width = w + 'px'; drag.box.style.height = h + 'px';
            drag.rect = { x, y, w, h };
        }
        updateStatus();
    });
    pageEl.addEventListener('pointerup', async e => {
        if (!drag) return;
        if (drag.mode === 'create') {
            if (drag.box) drag.box.remove();
            let r = drag.rect;
            const t = S.tool;
            if (!r || r.w < 8 || r.h < 8) {
                // click không kéo
                const p = local(e);
                if (t === 'frame') { await placeImage({ x: p.x - 100, y: p.y - 70, w: 200, h: 140 }); drag = null; setTool('select'); return; }
                r = { x: p.x, y: p.y, w: t === 'line' ? 200 : 220, h: t === 'line' ? 2 : t === 'text' ? 110 : 140 };
            }
            if (t === 'text') {
                const f = mkFrame('text', { x: r.x, y: r.y, w: r.w, h: r.h, html: '<div>Nhấp đúp để gõ chữ…</div>' });
                doc.pages[S.page].frames.push(f); S.sel = f.id;
                TK.status('Đã tạo khung chữ ' + Math.round(r.w) + '×' + Math.round(r.h));
            } else if (t === 'frame') {
                const f = mkFrame('image', { x: r.x, y: r.y, w: r.w, h: r.h, fill: 'transparent' });
                doc.pages[S.page].frames.push(f); S.sel = f.id;
                await placeImage(f, true);
            } else {
                const shape = t === 'rect' ? 'rect' : t === 'ellipse' ? 'ellipse' : 'line';
                const f = mkFrame('shape', { x: r.x, y: r.y, w: r.w, h: shape === 'line' ? 2 : r.h, shape, fill: shape === 'line' ? 'transparent' : '#ffd6e5', stroke: '#c2185b', strokeW: shape === 'line' ? 0 : 1 });
                doc.pages[S.page].frames.push(f); S.sel = f.id;
                TK.status('Đã vẽ ' + shape);
            }
            setTool('select');
        } else if (drag.mode === 'move' || drag.mode === 'resize') push();
        drag = null;
        renderAll(false);
    });
    function local(e) {
        const r = pageEl.getBoundingClientRect();
        return { x: (e.clientX - r.left) / S.zoom, y: (e.clientY - r.top) / S.zoom };
    }
    pageEl.addEventListener('dblclick', async e => {
        const fEl = e.target.closest('.frame');
        if (!fEl) return;
        const f = frame(fEl.dataset.id);
        S.sel = f.id;
        if (f.type === 'text') {
            const t = fEl.querySelector('.txt');
            t.contentEditable = 'true'; t.focus();
            const rng = document.createRange(); rng.selectNodeContents(t); rng.collapse(false);
            const s = window.getSelection(); s.removeAllRanges(); s.addRange(rng);
            TK.status('Đang sửa chữ — gõ nội dung, click ra ngoài để lưu');
        } else if (f.type === 'image') {
            await placeImage(f, true);
        }
    });

    async function placeImage(f, existing) {
        const file = await TK.pickFile('image/*');
        if (!file) { if (!existing) { doc.pages[S.page].frames = doc.pages[S.page].frames.filter(x => x !== f); renderAll(); } return; }
        const url = await TK.readAsDataURL(file);
        if (!existing) { f = Object.assign(f, { x: f.x, y: f.y }); }
        f.src = url; f.type = 'image';
        if (!doc.pages[S.page].frames.includes(f)) doc.pages[S.page].frames.push(f);
        S.sel = f.id;
        renderAll();
        TK.status('Đã đặt ảnh ' + file.name);
    }

    /* ---------- thao tác ---------- */
    function push() { hist.push(JSON.stringify(doc)); }
    function restore(json) {
        const d = JSON.parse(json);
        Object.assign(doc, d);
        if (S.page >= doc.pages.length) S.page = doc.pages.length - 1;
        document.getElementById('mHeader').value = doc.master.header || '';
        document.getElementById('mFooter').value = doc.master.footer || '';
        renderAll(false);
    }

    function applyParaStyle(s) {
        const f = selFrame();
        if (!f || f.type !== 'text') return TK.toast('Chọn một khung chữ trước', 'error');
        Object.assign(f.font, { size: s.size, weight: s.weight, lh: s.lh, color: s.color, family: s.family, align: s.align, ls: s.ls == null ? 0 : s.ls });
        renderAll(); TK.toast('Đã áp Paragraph Style: ' + s.name, 'ok');
    }
    function applyCharStyle(s) {
        const f = selFrame();
        if (!f || f.type !== 'text') return TK.toast('Chọn một khung chữ trước', 'error');
        Object.assign(f.font, { weight: s.weight || f.font.weight, color: s.color || f.font.color, italic: !!s.italic });
        renderAll(); TK.toast('Đã áp Character Style: ' + s.name, 'ok');
    }

    const A = {
        undo() { if (hist.canUndo()) { restore(hist.undo()); TK.status('↶ Hoàn tác'); } else TK.toast('Không còn gì để hoàn tác'); },
        redo() { if (hist.canRedo()) { restore(hist.redo()); TK.status('↷ Làm lại'); } else TK.toast('Không còn gì để làm lại'); },
        async newDoc() {
            const v = await TK.prompt('Tài liệu mới', 'Chọn mẫu: "tapchi" (tạp chí 3 trang), "poster" (1 trang 1080×1350), "bao" (báo A4 2 cột), hoặc "trong" (1 trang trắng).', 'tapchi');
            if (!v) return;
            const k = v.trim().toLowerCase();
            doc.pages = []; S.page = 0; S.sel = null; S.uid = 1;
            if (k === 'poster') { doc.size = { w: 1080, h: 1350 }; doc.master.columns = 1; doc.pages.push(newPage()); buildPoster(); }
            else if (k === 'bao') { doc.size = { w: 595, h: 842 }; doc.master.columns = 2; doc.pages.push(newPage(), newPage()); buildNews(); }
            else if (k === 'trong' || k === 'blank') { doc.size = { w: 595, h: 842 }; doc.master.columns = 1; doc.pages.push(newPage()); }
            else { doc.size = { w: 595, h: 842 }; doc.master.columns = 1; doc.pages.push(newPage(), newPage(), newPage()); buildMagazine(); }
            renderAll(); zoomFit();
            TK.toast('Đã tạo tài liệu mới: ' + doc.pages.length + ' trang', 'ok');
        },
        addPage() { doc.pages.push(newPage()); S.page = doc.pages.length - 1; S.sel = null; renderAll(); TK.status('Đã thêm trang ' + doc.pages.length); },
        dupPage() {
            const c = JSON.parse(JSON.stringify(doc.pages[S.page]));
            c.frames.forEach(f => f.id = 'f' + S.uid++);
            doc.pages.splice(S.page + 1, 0, c); S.page++; renderAll(); TK.toast('Đã nhân đôi trang', 'ok');
        },
        async delPage() {
            if (doc.pages.length === 1) return TK.toast('Tài liệu cần ít nhất 1 trang', 'error');
            if (!(await TK.confirm('Xóa trang', 'Xóa trang ' + (S.page + 1) + ' và toàn bộ khung trong nó?'))) return;
            doc.pages.splice(S.page, 1); S.page = Math.min(S.page, doc.pages.length - 1); S.sel = null; renderAll();
        },
        duplicate() {
            const f = selFrame(); if (!f) return TK.toast('Chưa chọn khung', 'error');
            const c = JSON.parse(JSON.stringify(f)); c.id = 'f' + S.uid++; c.x += 18; c.y += 18; c.z = doc.pages[S.page].frames.length;
            doc.pages[S.page].frames.push(c); S.sel = c.id; renderAll();
        },
        deleteFrame() {
            const f = selFrame(); if (!f) return TK.toast('Chưa chọn khung', 'error');
            doc.pages[S.page].frames = doc.pages[S.page].frames.filter(x => x.id !== f.id);
            S.sel = null; renderAll(); TK.status('Đã xóa khung');
        },
        async clearPage() {
            if (!(await TK.confirm('Xóa hết', 'Xóa toàn bộ ' + doc.pages[S.page].frames.length + ' khung của trang này?'))) return;
            doc.pages[S.page].frames = []; S.sel = null; renderAll();
        },
        front() { const f = selFrame(); if (!f) return TK.toast('Chưa chọn', 'error'); f.z = Math.max(...doc.pages[S.page].frames.map(x => x.z || 0)) + 1; renderAll(); },
        back() { const f = selFrame(); if (!f) return TK.toast('Chưa chọn', 'error'); f.z = Math.min(...doc.pages[S.page].frames.map(x => x.z || 0)) - 1; renderAll(); },
        align(e, elm) {
            const f = selFrame(); if (!f) return TK.toast('Chưa chọn khung', 'error');
            const m = doc.master.margin, W = doc.size.w, H = doc.size.h;
            const a = elm.dataset.arg;
            if (a === 'left') f.x = m; if (a === 'right') f.x = W - m - f.w; if (a === 'centerH') f.x = (W - f.w) / 2;
            if (a === 'top') f.y = m; if (a === 'bottom') f.y = H - m - f.h; if (a === 'centerV') f.y = (H - f.h) / 2;
            renderAll(); TK.status('Đã căn ' + a);
        },
        fitWidth() {
            const f = selFrame(); if (!f) return TK.toast('Chưa chọn khung', 'error');
            const m = doc.master.margin, cols = Math.max(1, doc.master.columns | 0);
            const usable = (doc.size.w - m * 2 - (cols - 1) * 14) / cols;
            f.x = m; f.w = Math.round(usable); renderAll(); TK.toast('Khung đã vừa 1 cột nội dung', 'ok');
        },
        addText() {
            const m = doc.master.margin;
            const f = mkFrame('text', { x: m, y: m + 30, w: doc.size.w - m * 2, h: 140, html: '<div>Nhấp đúp để gõ chữ…</div>' });
            doc.pages[S.page].frames.push(f); S.sel = f.id; renderAll(); setTool('select');
            TK.status('Đã thêm khung chữ — nhấp đúp để gõ');
        },
        async addImage() {
            const m = doc.master.margin;
            const f = mkFrame('image', { x: m, y: m + 40, w: (doc.size.w - m * 2) / 2, h: 200, fill: 'transparent' });
            doc.pages[S.page].frames.push(f); S.sel = f.id;
            renderAll(false);
            await placeImage(f, true);
        },
        addShape(e, elm) {
            const shape = elm.dataset.arg;
            const m = doc.master.margin;
            const f = mkFrame('shape', {
                x: m + 20, y: doc.size.h / 2 - 60, w: shape === 'line' ? 300 : 160, h: shape === 'line' ? 3 : 160, shape,
                fill: shape === 'line' ? 'transparent' : '#ffe3ee', stroke: '#c2185b', strokeW: shape === 'line' ? 0 : 1.5
            });
            doc.pages[S.page].frames.push(f); S.sel = f.id; renderAll();
        },
        fmt(e, elm) {
            const f = selFrame(); if (!f || f.type !== 'text') return TK.toast('Chọn khung chữ', 'error');
            const k = elm.dataset.arg;
            if (k === 'bold') f.font.weight = +f.font.weight >= 700 ? '400' : '800';
            if (k === 'italic') f.font.italic = !f.font.italic;
            if (k === 'underline') f.font.underline = !f.font.underline;
            renderAll();
        },
        alignText(e, elm) {
            const f = selFrame(); if (!f || f.type !== 'text') return TK.toast('Chọn khung chữ', 'error');
            f.font.align = elm.dataset.arg; renderAll();
        },
        heading(e, elm) {
            const f = selFrame(); if (!f || f.type !== 'text') return TK.toast('Chọn khung chữ', 'error');
            const lvl = +elm.dataset.arg;
            const s = lvl === 0 ? doc.paraStyles[2] : lvl === 1 ? doc.paraStyles[0] : doc.paraStyles[1];
            Object.assign(f.font, { size: s.size, weight: s.weight, lh: s.lh, color: s.color, family: s.family, ls: s.ls || 0 });
            renderAll(); TK.toast('Đã đặt ' + (lvl ? 'Heading ' + lvl : 'Body text'), 'ok');
        },
        async createParaStyle() {
            const f = selFrame(); if (!f || f.type !== 'text') return TK.toast('Chọn khung chữ có định dạng bạn muốn lưu', 'error');
            const n = await TK.prompt('Paragraph Style mới', 'Tên style:', 'Style ' + (doc.paraStyles.length + 1));
            if (!n) return;
            doc.paraStyles.push({ name: n, size: f.font.size, weight: f.font.weight, lh: f.font.lh, color: f.font.color, family: f.font.family, align: f.font.align, ls: f.font.ls });
            renderAll(); TK.toast('Đã lưu Paragraph Style: ' + n, 'ok');
        },
        async createCharStyle() {
            const f = selFrame(); if (!f || f.type !== 'text') return TK.toast('Chọn khung chữ trước', 'error');
            const n = await TK.prompt('Character Style mới', 'Tên style:', 'Char ' + (doc.charStyles.length + 1));
            if (!n) return;
            doc.charStyles.push({ name: n, weight: f.font.weight, color: f.font.color, italic: f.font.italic });
            renderAll(); TK.toast('Đã lưu Character Style: ' + n, 'ok');
        },
        makeToc() {
            const heads = [];
            doc.pages.forEach((p, pi) => p.frames.forEach(f => {
                if (f.type !== 'text') return;
                const t = stripTags(f.html);
                if (t && f.font.size >= 20) heads.push({ t: t.slice(0, 70), page: pi + 1 });
            }));
            if (!heads.length) return TK.toast('Chưa có tiêu đề nào (cỡ chữ ≥ 20) để tạo mục lục', 'error');
            const html = '<div style="font-weight:800;font-size:18px;margin-bottom:6px;">MỤC LỤC</div>' +
                heads.map(h => `<div>${esc(h.t)} <span style="color:#999;">……… trang ${h.page}</span></div>`).join('');
            const f = mkFrame('text', { x: doc.master.margin, y: doc.master.margin + 20, w: doc.size.w - doc.master.margin * 2, h: Math.min(doc.size.h - 160, 60 + heads.length * 20), html, font: { family: 'Segoe UI', size: 11.5, lh: 1.7, color: '#222', ls: 0, weight: '400', italic: false, underline: false, align: 'left' }, fill: '#fffdf5', stroke: '#e6d9a8', strokeW: 1, radius: 4, pad: 10 });
            doc.pages[S.page].frames.push(f); S.sel = f.id; renderAll();
            TK.toast('Đã tạo mục lục với ' + heads.length + ' mục', 'ok');
        },
        twoColumn() {
            const f = selFrame();
            if (!f || f.type !== 'text') return TK.toast('Chọn khung chữ muốn chia 2 cột', 'error');
            const texts = stripTags(f.html).split(/\s+/);
            const half = Math.ceil(texts.length / 2);
            const col1 = texts.slice(0, half).join(' '), col2 = texts.slice(half).join(' ');
            const gap = 16, w = Math.round((f.w - gap) / 2);
            f.w = w; f.html = '<div>' + esc(col1) + '</div>';
            const f2 = mkFrame('text', { x: f.x + w + gap, y: f.y, w, h: f.h, html: '<div>' + esc(col2) + '</div>', font: JSON.parse(JSON.stringify(f.font)) });
            doc.pages[S.page].frames.push(f2);
            doc.master.columns = 2;
            renderAll(); TK.toast('Đã chia nội dung thành 2 cột', 'ok');
        },
        async applyMargins() {
            const v = await TK.prompt('Lề & cột', 'Nhập "lề,số cột" (đơn vị pt). Ví dụ: 42,2', doc.master.margin + ',' + doc.master.columns);
            if (!v) return;
            const m = v.split(/[,\s]+/).map(Number);
            doc.master.margin = TK.clamp(m[0] || 40, 0, 200);
            doc.master.columns = TK.clamp(m[1] || 1, 1, 6);
            renderAll(); TK.toast(`Lề ${doc.master.margin}pt · ${doc.master.columns} cột`, 'ok');
        },
        toggleGuides() { doc.guides = !doc.guides; renderPage(); TK.status(doc.guides ? 'Đang hiện lề & cột' : 'Đã ẩn lề & cột'); },
        toggleNumbers() {
            doc.master.numbers = !doc.master.numbers;
            document.getElementById('numBtn').textContent = 'Số trang: ' + (doc.master.numbers ? 'BẬT' : 'TẮT');
            renderAll();
        },
        zoomIn() { S.zoom = TK.clamp(S.zoom * 1.15, 0.1, 4); renderPage(); updateStatus(); },
        zoomOut() { S.zoom = TK.clamp(S.zoom / 1.15, 0.1, 4); renderPage(); updateStatus(); },
        zoom100() { S.zoom = 1; renderPage(); updateStatus(); },
        saveProject() {
            TK.download(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }), (doc.name || 'xlayout') + '.json');
        },
        async openProject() {
            const f = await TK.pickFile('.json,application/json');
            if (!f) return;
            try {
                const j = JSON.parse(await TK.readAsText(f));
                if (!j.pages) throw new Error('không có pages');
                Object.keys(doc).forEach(k => { if (j[k] !== undefined) doc[k] = j[k]; });
                S.page = 0; S.sel = null; S.uid = 1 + doc.pages.reduce((n, p) => Math.max(n, ...p.frames.map(f => parseInt(String(f.id).replace(/\D/g, '')) || 0)), 0);
                document.getElementById('mHeader').value = doc.master.header || '';
                document.getElementById('mFooter').value = doc.master.footer || '';
                renderAll(); zoomFit(); TK.toast('Đã mở dự án: ' + f.name, 'ok');
            } catch (e) { TK.toast('File dự án lỗi: ' + e.message, 'error'); }
        },
        exportHtml() {
            const html = buildStandaloneHtml();
            TK.download(new Blob([html], { type: 'text/html' }), (doc.name || 'xlayout') + '.html');
        },
        exportTxt() {
            let out = '';
            doc.pages.forEach((p, i) => {
                out += `\n===== TRANG ${i + 1} =====\n`;
                p.frames.filter(f => f.type === 'text').forEach(f => { out += stripTags(f.html) + '\n\n'; });
            });
            TK.download(new Blob([out], { type: 'text/plain' }), (doc.name || 'xlayout') + '.txt');
        },
        printDoc() {
            const area = document.getElementById('printArea');
            if (area) area.remove();
            const d = document.createElement('div');
            d.id = 'printArea';
            d.innerHTML = doc.pages.map((p, i) => pageHtml(p, i, true)).join('');
            document.body.appendChild(d);
            TK.toast('Mở hộp thoại in — chọn "Save as PDF" để xuất PDF', 'ok');
            setTimeout(() => { window.print(); setTimeout(() => d.remove(), 1200); }, 250);
        },
        async aiLayout() {
            const p = await TK.prompt('✨ AI dàn trang', 'Mô tả ấn phẩm (AI sẽ tự đặt khung chữ/ảnh thật lên trang):', 'Trang bìa tạp chí công nghệ: tiêu đề lớn "TƯƠNG LAI AI", ảnh nền, 3 dòng giới thiệu, footer');
            if (!p) return;
            TK.status('AI đang dàn trang…');
            try {
                const j = await TK.ai(`Dàn trang ấn phẩm ${doc.size.w}x${doc.size.h}pt theo mô tả: "${p}".
Trả JSON: {"pages":[{"frames":[{"type":"text|image|shape","x":40,"y":60,"w":500,"h":120,"rot":0,"op":100,"fill":"#ffffff","stroke":"#000000","strokeW":0,"radius":0,"pad":6,"shape":"rect|ellipse|line","html":"<div>Chữ</div>","font":{"family":"Georgia","size":24,"lh":1.4,"color":"#111111","ls":0,"weight":"700","italic":false,"underline":false,"align":"left"}}]}]}
Khung image để "src":"" (người dùng sẽ chèn ảnh sau). Dùng 4-12 khung/trang, bố cục chuyên nghiệp, không chồng lấn lung tung. CHỈ trả JSON.`, { json: true, system: 'Bạn là art director dàn trang báo/tạp chí. Chỉ trả JSON hợp lệ.' });
                if (!j || !j.pages || !j.pages.length) throw new Error('AI không trả về pages');
                applyAiDoc(j);
                TK.toast('✨ AI đã dàn ' + j.pages.length + ' trang', 'ok');
            } catch (e) {
                TK.toast('AI lỗi (' + RuneAI.humanError(e.message) + ') → dùng mẫu dựng sẵn', 'error');
                doc.pages = [newPage()]; S.page = 0; buildPoster(p); renderAll(); zoomFit();
            }
        },
        async aiWrite() {
            const p = await TK.prompt('✨ AI viết nội dung', 'Viết gì? (nội dung sẽ chèn vào khung chữ đang chọn hoặc khung mới):', 'Đoạn mở đầu 120 từ về xu hướng thiết kế 2026');
            if (!p) return;
            TK.status('AI đang viết…');
            try {
                const t = await TK.ai(`Viết bằng tiếng Việt cho ấn phẩm dàn trang. Yêu cầu: ${p}\nTrả về nội dung dạng HTML đơn giản dùng <div> cho mỗi đoạn, có thể có 1 tiêu đề <div style="font-weight:800;font-size:20px">. Không giải thích thêm.`, { system: 'Bạn là biên tập viên. Chỉ trả HTML nội dung.' });
                const html = String(t || '').trim() || '<div>(AI không trả về nội dung)</div>';
                let f = selFrame();
                if (!f || f.type !== 'text') {
                    f = mkFrame('text', { x: doc.master.margin, y: doc.master.margin + 40, w: doc.size.w - doc.master.margin * 2, h: 220, html });
                    doc.pages[S.page].frames.push(f);
                } else f.html = html;
                S.sel = f.id; renderAll();
                TK.toast('✨ Đã chèn nội dung AI (' + stripTags(html).split(/\s+/).length + ' từ)', 'ok');
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        },
        async aiRewrite() {
            const f = selFrame();
            if (!f || f.type !== 'text') return TK.toast('Chọn khung chữ muốn viết lại', 'error');
            const selTxt = String(window.getSelection() || '').trim();
            const src = selTxt || stripTags(f.html);
            if (!src) return TK.toast('Khung đang trống', 'error');
            const how = await TK.prompt('✨ AI viết lại', 'Viết lại theo hướng nào? (ngắn gọn / trang trọng / hấp dẫn / dễ hiểu / khác)', 'hấp dẫn, ngắn gọn hơn');
            if (!how) return;
            TK.status('AI đang viết lại…');
            try {
                const t = await TK.ai(`Viết lại đoạn sau bằng tiếng Việt theo hướng "${how}". Giữ nguyên ý chính, chỉ trả về đoạn văn mới, không giải thích:\n\n${src}`, { system: 'Bạn là biên tập viên.' });
                if (!t) return;
                if (selTxt) f.html = f.html.replace(selTxt, esc(String(t).trim()));
                else f.html = '<div>' + esc(String(t).trim()) + '</div>';
                renderAll(); TK.toast('✨ Đã viết lại nội dung', 'ok');
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        },
        async aiTranslate() {
            const f = selFrame();
            if (!f || f.type !== 'text') return TK.toast('Chọn khung chữ cần dịch', 'error');
            const lang = await TK.prompt('✨ AI dịch', 'Dịch sang ngôn ngữ nào?', 'English');
            if (!lang) return;
            TK.status('AI đang dịch…');
            try {
                const t = await TK.ai(`Dịch nội dung sau sang ${lang}, chỉ trả bản dịch:\n\n${stripTags(f.html)}`, { system: 'Bạn là dịch thuật viên.' });
                if (!t) return;
                f.html = '<div>' + esc(String(t).trim()) + '</div>';
                renderAll(); TK.toast('✨ Đã dịch sang ' + lang, 'ok');
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        }
    };

    function applyAiDoc(j) {
        doc.pages = [];
        j.pages.forEach(pg => {
            const p = newPage();
            (pg.frames || []).forEach(f => {
                const type = ['text', 'image', 'shape'].includes(f.type) ? f.type : 'text';
                const nf = mkFrame(type, {
                    x: +f.x || 40, y: +f.y || 40, w: Math.max(10, +f.w || 200), h: Math.max(10, +f.h || 100),
                    rot: +f.rot || 0, op: f.op == null ? 100 : +f.op,
                    fill: f.fill || (type === 'text' ? 'transparent' : '#eeeeee'),
                    stroke: f.stroke || 'transparent', strokeW: +f.strokeW || 0, radius: +f.radius || 0, pad: f.pad == null ? 6 : +f.pad,
                    shape: ['rect', 'ellipse', 'line'].includes(f.shape) ? f.shape : 'rect',
                    html: f.html != null ? String(f.html) : '', src: f.src || ''
                });
                if (f.font) Object.assign(nf.font, {
                    family: f.font.family || nf.font.family, size: +f.font.size || nf.font.size, lh: +f.font.lh || nf.font.lh,
                    color: f.font.color || nf.font.color, ls: +f.font.ls || 0, weight: String(f.font.weight || nf.font.weight),
                    italic: !!f.font.italic, underline: !!f.font.underline, align: ['left', 'center', 'right', 'justify'].includes(f.font.align) ? f.font.align : 'left'
                });
                p.frames.push(nf);
            });
            doc.pages.push(p);
        });
        S.page = 0; S.sel = null;
        renderAll(); zoomFit();
    }

    /* ---------- mẫu dựng sẵn ---------- */
    function buildMagazine() {
        const W = doc.size.w, m = doc.master.margin;
        const p1 = doc.pages[0];
        p1.frames.push(mkFrame('shape', { x: 0, y: 0, w: W, h: 300, shape: 'rect', fill: '#1b1035', stroke: 'transparent', strokeW: 0 }));
        p1.frames.push(mkFrame('text', { x: m, y: 40, w: W - m * 2, h: 40, html: '<div>RUNE MAGAZINE</div>', font: { family: 'Segoe UI', size: 13, lh: 1, color: '#ffd166', ls: 6, weight: '700', italic: false, underline: false, align: 'left' } }));
        p1.frames.push(mkFrame('text', { x: m, y: 100, w: W - m * 2, h: 120, html: '<div>Tương lai của<br>sáng tạo số</div>', font: { family: 'Georgia', size: 54, lh: 1.05, color: '#ffffff', ls: -1, weight: '800', italic: false, underline: false, align: 'left' } }));
        p1.frames.push(mkFrame('image', { x: m, y: 320, w: W - m * 2, h: 280, fill: 'transparent' }));
        p1.frames.push(mkFrame('text', { x: m, y: 616, w: W - m * 2, h: 150, html: '<div>Số 01 · Tháng 10/2026 · 12 bài viết chuyên sâu về AI, thiết kế và công cụ sáng tạo mã nguồn mở. Bên trong: phỏng vấn nhà phát triển, hướng dẫn dựng phim bằng trình duyệt, và bộ preset màu miễn phí.</div>', font: { family: 'Georgia', size: 12, lh: 1.6, color: '#333333', ls: 0, weight: '400', italic: false, underline: false, align: 'justify' } }));
        const p2 = doc.pages[1];
        p2.frames.push(mkFrame('text', { x: m, y: m + 20, w: W - m * 2, h: 50, html: '<div>Bài mở đầu</div>', font: { family: 'Georgia', size: 30, lh: 1.1, color: '#111111', ls: 0, weight: '800', italic: false, underline: false, align: 'left' } }));
        p2.frames.push(mkFrame('text', { x: m, y: m + 90, w: (W - m * 2 - 16) / 2, h: 480, html: '<div>' + lorem(150) + '</div>', font: { family: 'Georgia', size: 11, lh: 1.65, color: '#222222', ls: 0, weight: '400', italic: false, underline: false, align: 'justify' } }));
        p2.frames.push(mkFrame('text', { x: m + (W - m * 2) / 2 + 8, y: m + 90, w: (W - m * 2 - 16) / 2, h: 480, html: '<div>' + lorem(150) + '</div>', font: { family: 'Georgia', size: 11, lh: 1.65, color: '#222222', ls: 0, weight: '400', italic: false, underline: false, align: 'justify' } }));
        const p3 = doc.pages[2];
        p3.frames.push(mkFrame('image', { x: m, y: m + 20, w: W - m * 2, h: 380, fill: 'transparent' }));
        p3.frames.push(mkFrame('text', { x: m, y: m + 420, w: W - m * 2, h: 60, html: '<div>Bộ công cụ RUNE chạy ngay trong trình duyệt</div>', font: { family: 'Segoe UI', size: 20, lh: 1.2, color: '#c2185b', ls: 0, weight: '700', italic: false, underline: false, align: 'left' } }));
        p3.frames.push(mkFrame('text', { x: m, y: m + 490, w: W - m * 2, h: 200, html: '<div>' + lorem(90) + '</div>', font: { family: 'Georgia', size: 11.5, lh: 1.6, color: '#333333', ls: 0, weight: '400', italic: false, underline: false, align: 'justify' } }));
    }
    function buildPoster(text) {
        const W = doc.size.w, H = doc.size.h, p = doc.pages[0];
        p.frames.push(mkFrame('shape', { x: 0, y: 0, w: W, h: H, shape: 'rect', fill: '#0f172a', stroke: 'transparent', strokeW: 0 }));
        p.frames.push(mkFrame('shape', { x: W * 0.5 - 190, y: H * 0.18, w: 380, h: 380, shape: 'ellipse', fill: '#f472b6', stroke: '#fbbf24', strokeW: 8, op: 92 }));
        p.frames.push(mkFrame('text', { x: 60, y: H * 0.52, w: W - 120, h: 150, html: '<div>' + esc((text || 'SÁNG TẠO KHÔNG GIỚI HẠN').slice(0, 46).toUpperCase()) + '</div>', font: { family: 'Impact', size: 76, lh: 0.95, color: '#ffffff', ls: 1, weight: '400', italic: false, underline: false, align: 'center' } }));
        p.frames.push(mkFrame('text', { x: 90, y: H * 0.72, w: W - 180, h: 90, html: '<div>Workshop thiết kế · Hà Nội · 20.11.2026 · Đăng ký miễn phí tại rune.app</div>', font: { family: 'Segoe UI', size: 20, lh: 1.5, color: '#fbbf24', ls: 0.5, weight: '400', italic: false, underline: false, align: 'center' } }));
        p.frames.push(mkFrame('shape', { x: W * 0.5 - 90, y: H * 0.84, w: 180, h: 6, shape: 'rect', fill: '#38bdf8', stroke: 'transparent', strokeW: 0 }));
    }
    function buildNews() {
        const W = doc.size.w, m = doc.master.margin, colW = (W - m * 2 - 16) / 2;
        const p1 = doc.pages[0];
        p1.frames.push(mkFrame('text', { x: m, y: m - 10, w: W - m * 2, h: 46, html: '<div>NHỊP SỐNG CÔNG NGHỆ</div>', font: { family: 'Times New Roman', size: 34, lh: 1, color: '#111111', ls: 1, weight: '700', italic: false, underline: false, align: 'center' } }));
        p1.frames.push(mkFrame('shape', { x: m, y: m + 40, w: W - m * 2, h: 2, shape: 'line', fill: 'transparent', stroke: '#111111', strokeW: 0 }));
        p1.frames.push(mkFrame('text', { x: m, y: m + 54, w: W - m * 2, h: 60, html: '<div>Trình duyệt trở thành xưởng sáng tạo mới</div>', font: { family: 'Georgia', size: 26, lh: 1.15, color: '#111111', ls: 0, weight: '800', italic: false, underline: false, align: 'left' } }));
        p1.frames.push(mkFrame('image', { x: m, y: m + 122, w: W - m * 2, h: 220, fill: 'transparent' }));
        p1.frames.push(mkFrame('text', { x: m, y: m + 356, w: colW, h: 340, html: '<div>' + lorem(180) + '</div>', font: { family: 'Times New Roman', size: 11, lh: 1.55, color: '#222222', ls: 0, weight: '400', italic: false, underline: false, align: 'justify' } }));
        p1.frames.push(mkFrame('text', { x: m + colW + 16, y: m + 356, w: colW, h: 340, html: '<div>' + lorem(180) + '</div>', font: { family: 'Times New Roman', size: 11, lh: 1.55, color: '#222222', ls: 0, weight: '400', italic: false, underline: false, align: 'justify' } }));
        const p2 = doc.pages[1];
        p2.frames.push(mkFrame('text', { x: m, y: m, w: W - m * 2, h: 40, html: '<div>Tin vắn</div>', font: { family: 'Georgia', size: 24, lh: 1.1, color: '#c2185b', ls: 0, weight: '800', italic: false, underline: false, align: 'left' } }));
        for (let i = 0; i < 4; i++) {
            p2.frames.push(mkFrame('text', { x: m + (i % 2) * (colW + 16), y: m + 60 + Math.floor(i / 2) * 330, w: colW, h: 300, html: '<div><b>Tin ' + (i + 1) + ':</b> ' + lorem(90) + '</div>', font: { family: 'Times New Roman', size: 11, lh: 1.55, color: '#222222', ls: 0, weight: '400', italic: false, underline: false, align: 'justify' } }));
        }
    }
    function lorem(n) {
        const base = 'Công cụ sáng tạo chạy ngay trong trình duyệt giúp người dùng chỉnh ảnh, dựng phim, dàn trang và xuất bản mà không cần cài đặt phần mềm nặng. Mọi thao tác đều xử lý cục bộ, dữ liệu không rời khỏi máy của bạn.';
        let out = '';
        while (out.split(/\s+/).length < n) out += base + ' ';
        return esc(out.split(/\s+/).slice(0, n).join(' '));
    }

    /* ---------- xuất HTML / in ---------- */
    function pageHtml(p, idx, print) {
        const m = doc.master;
        let inner = '';
        p.frames.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).forEach(f => {
            const st = `position:absolute;left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px;transform:rotate(${f.rot || 0}deg);opacity:${(f.op == null ? 100 : f.op) / 100};background:${f.fill || 'transparent'};border:${f.strokeW || 0}px solid ${f.stroke || 'transparent'};border-radius:${f.type === 'shape' && f.shape === 'ellipse' ? '50%' : (f.radius || 0) + 'px'};padding:${f.pad || 0}px;overflow:hidden;${f.type === 'shape' && f.shape === 'line' ? `background:${f.stroke};height:${Math.max(1, f.h)}px;border:none;` : ''}`;
            if (f.type === 'image') inner += `<div style="${st}">${f.src ? `<img src="${f.src}" style="width:100%;height:100%;object-fit:cover;">` : ''}</div>`;
            else if (f.type === 'shape') inner += `<div style="${st}"></div>`;
            else inner += `<div style="${st}font-family:'${f.font.family}',serif;font-size:${f.font.size}px;line-height:${f.font.lh};color:${f.font.color};letter-spacing:${f.font.ls}px;text-align:${f.font.align};font-weight:${f.font.weight};font-style:${f.font.italic ? 'italic' : 'normal'};text-decoration:${f.font.underline ? 'underline' : 'none'};">${f.html || ''}</div>`;
        });
        let furn = '';
        if (m.header) furn += `<div style="position:absolute;left:${m.margin}px;right:${m.margin}px;top:${m.margin * 0.42}px;font:600 9px 'Segoe UI';letter-spacing:1.6px;color:#888;text-transform:uppercase;border-bottom:.6px solid #ddd;padding-bottom:4px;">${esc(m.header)}</div>`;
        if (m.footer || m.numbers) furn += `<div style="position:absolute;left:${m.margin}px;right:${m.margin}px;bottom:${m.margin * 0.42}px;display:flex;justify-content:space-between;font:400 9px 'Segoe UI';color:#888;border-top:.6px solid #ddd;padding-top:4px;"><span>${esc(m.footer)}</span>${m.numbers ? `<span>Trang ${idx + 1} / ${doc.pages.length}</span>` : ''}</div>`;
        return `<div class="pgx" style="position:relative;width:${doc.size.w}px;height:${doc.size.h}px;background:#fff;margin:${print ? '0 0 12px' : '0 auto 28px'};box-shadow:${print ? 'none' : '0 4px 18px rgba(0,0,0,.14)'};overflow:hidden;page-break-after:always;">${inner}${furn}</div>`;
    }
    function buildStandaloneHtml() {
        return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${esc(doc.name)}</title>
<style>body{margin:0;background:#e8e8ec;font-family:'Segoe UI',sans-serif;padding:24px 0;}@media print{body{background:#fff;padding:0}.pgx{box-shadow:none;margin:0}}</style>
</head><body>${doc.pages.map((p, i) => pageHtml(p, i, false)).join('')}</body></html>`;
    }

    function zoomFit() {
        const avail = stage.clientWidth - 60;
        S.zoom = TK.clamp(Math.min(avail / doc.size.w, (stage.clientHeight - 60) / doc.size.h), 0.1, 2);
        renderPage(); updateStatus();
    }

    /* ---------- khởi động ---------- */
    TK.init({ app: 'xlayout', status: '.statusbar [data-status-text]' });
    Object.keys(A).forEach(k => TK.on(k, A[k]));
    TK.on('zoomFit', () => zoomFit());
    bindPanel();
    document.getElementById('mHeader').value = doc.master.header;
    document.getElementById('mFooter').value = doc.master.footer;
    doc.pages.push(newPage(), newPage(), newPage());
    buildMagazine();
    renderAll(false);
    zoomFit();
    hist.reset(); push();

    /* ---------- phím tắt ---------- */
    document.addEventListener('keydown', e => {
        if (e.target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); A.redo(); }
        else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); A.saveProject(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'p') { e.preventDefault(); A.printDoc(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); A.duplicate(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'n') { e.preventDefault(); A.newDoc(); }
        else if ((e.ctrlKey || e.metaKey) && k === '0') { e.preventDefault(); zoomFit(); }
        else if ((e.ctrlKey || e.metaKey) && k === '1') { e.preventDefault(); A.zoom100(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'enter') { e.preventDefault(); A.addPage(); }
        else if (k === 'delete' || k === 'backspace') { if (S.sel) { e.preventDefault(); A.deleteFrame(); } }
        else if (k === 'escape') { S.sel = null; renderPage(); updateStatus(); }
        else if (k === 'v') setTool('select');
        else if (k === 't') setTool('text');
        else if (k === 'f') setTool('frame');
        else if (k === 'm') setTool('rect');
        else if (k === 'l') setTool('ellipse');
        else if (['+', '='].includes(k)) A.zoomIn();
        else if (k === '-') A.zoomOut();
        else if (S.sel && k.startsWith('arrow')) {
            e.preventDefault();
            const f = selFrame(), d = e.shiftKey ? 10 : 1;
            if (k === 'arrowup') f.y -= d; if (k === 'arrowdown') f.y += d;
            if (k === 'arrowleft') f.x -= d; if (k === 'arrowright') f.x += d;
            renderPage(); updateStatus();
        }
    });

    /* ---------- lệnh AI / trang cha ---------- */
    TK.cmd('get_info', () => ({ app: 'xLayout', name: doc.name, pages: doc.pages.length, page: S.page + 1, size: doc.size, frames: doc.pages[S.page].frames.length, selected: S.sel }));
    TK.cmd('new_doc', a => {
        const k = String(a.preset || a.kind || 'tapchi').toLowerCase();
        doc.pages = []; S.page = 0; S.sel = null;
        if (k === 'poster') { doc.size = { w: 1080, h: 1350 }; doc.pages.push(newPage()); buildPoster(a.title || 'SÁNG TẠO KHÔNG GIỚI HẠN'); }
        else if (k === 'bao' || k === 'news') { doc.size = { w: 595, h: 842 }; doc.master.columns = 2; doc.pages.push(newPage(), newPage()); buildNews(); }
        else if (k === 'trong' || k === 'blank') { doc.size = { w: 595, h: 842 }; doc.pages.push(newPage()); }
        else { doc.size = { w: 595, h: 842 }; doc.pages.push(newPage(), newPage(), newPage()); buildMagazine(); }
        renderAll(); zoomFit();
        return { pages: doc.pages.length };
    });
    TK.cmd('add_page', () => { A.addPage(); return { pages: doc.pages.length }; });
    TK.cmd('go_page', a => { goPage(TK.clamp((a.page || 1) - 1, 0, doc.pages.length - 1)); return { page: S.page + 1 }; });
    TK.cmd('delete_page', () => { if (doc.pages.length > 1) { doc.pages.splice(S.page, 1); S.page = Math.min(S.page, doc.pages.length - 1); renderAll(); } return { pages: doc.pages.length }; });
    TK.cmd('add_text', a => {
        const m = doc.master.margin;
        const f = mkFrame('text', {
            x: a.x == null ? m : +a.x, y: a.y == null ? m + 40 : +a.y,
            w: a.w == null ? doc.size.w - m * 2 : +a.w, h: a.h == null ? 120 : +a.h,
            html: '<div>' + esc(a.text || a.content || 'Nội dung mới') + '</div>'
        });
        if (a.size) f.font.size = +a.size;
        if (a.color) f.font.color = a.color;
        if (a.bold) f.font.weight = '800';
        if (a.align) f.font.align = a.align;
        if (a.font) f.font.family = a.font;
        doc.pages[S.page].frames.push(f); S.sel = f.id; renderAll();
        return { id: f.id };
    });
    TK.cmd('set_content', a => {
        let f = selFrame();
        if (!f || f.type !== 'text') {
            const m = doc.master.margin;
            f = mkFrame('text', { x: m, y: m + 40, w: doc.size.w - m * 2, h: 200 });
            doc.pages[S.page].frames.push(f); S.sel = f.id;
        }
        f.html = a.html ? String(a.html) : '<div>' + esc(a.text || a.content || '').replace(/\n/g, '</div><div>') + '</div>';
        renderAll();
        return { ok: true, words: stripTags(f.html).split(/\s+/).filter(Boolean).length };
    });
    TK.cmd('add_image', a => {
        const m = doc.master.margin;
        const f = mkFrame('image', { x: a.x == null ? m : +a.x, y: a.y == null ? m + 60 : +a.y, w: +a.w || 300, h: +a.h || 200, src: a.src || '', fill: 'transparent' });
        doc.pages[S.page].frames.push(f); S.sel = f.id; renderAll();
        return { id: f.id, note: f.src ? 'đã có ảnh' : 'khung chờ — nhấp đúp để chọn file ảnh' };
    });
    TK.cmd('add_shape', a => {
        const shape = ['rect', 'ellipse', 'line'].includes(a.shape) ? a.shape : 'rect';
        const f = mkFrame('shape', { x: +a.x || 40, y: +a.y || 40, w: +a.w || 160, h: shape === 'line' ? 3 : (+a.h || 160), shape, fill: a.fill || '#ffe3ee', stroke: a.stroke || '#c2185b', strokeW: a.strokeW == null ? 1 : +a.strokeW });
        doc.pages[S.page].frames.push(f); S.sel = f.id; renderAll();
        return { id: f.id };
    });
    TK.cmd('delete_frame', () => { A.deleteFrame(); return { ok: true }; });
    TK.cmd('apply_style', a => {
        const s = doc.paraStyles.find(x => x.name.toLowerCase().includes(String(a.style || a.name || '').toLowerCase()));
        if (!s) return { ok: false, error: 'Không tìm thấy style. Có: ' + doc.paraStyles.map(x => x.name).join(', ') };
        applyParaStyle(s); return { ok: true, style: s.name };
    });
    TK.cmd('set_master', a => {
        if (a.header != null) { doc.master.header = String(a.header); document.getElementById('mHeader').value = doc.master.header; }
        if (a.footer != null) { doc.master.footer = String(a.footer); document.getElementById('mFooter').value = doc.master.footer; }
        if (a.margin != null) doc.master.margin = TK.clamp(+a.margin, 0, 200);
        if (a.columns != null) doc.master.columns = TK.clamp(+a.columns, 1, 6);
        if (a.numbers != null) doc.master.numbers = !!a.numbers;
        renderAll(); return doc.master;
    });
    TK.cmd('make_toc', () => { A.makeToc(); return { ok: true }; });
    TK.cmd('export', a => {
        const fmt = String(a.format || 'html').toLowerCase();
        if (fmt === 'pdf') A.printDoc();
        else if (fmt === 'txt') A.exportTxt();
        else if (fmt === 'json') A.saveProject();
        else A.exportHtml();
        return { format: fmt };
    });
    TK.cmd('print', () => { A.printDoc(); return { ok: true }; });
    TK.cmd('zoom', a => { if (a.fit) zoomFit(); else if (a.level) { S.zoom = TK.clamp(+a.level / 100, 0.1, 4); renderPage(); updateStatus(); } return { zoom: S.zoom }; });
    TK.cmd('ai_layout', a => { aiPrompt(a.prompt || a.description); return { started: true }; });
    async function aiPrompt(p) {
        try {
            const j = await TK.ai(`Dàn trang ${doc.size.w}x${doc.size.h}pt: "${p}". Trả JSON {"pages":[{"frames":[{"type":"text|image|shape","x":0,"y":0,"w":100,"h":50,"html":"<div>..</div>","fill":"#fff","font":{"size":14,"weight":"700","color":"#111","align":"left","family":"Georgia","lh":1.4}}]}]}. CHỈ JSON.`, { json: true, system: 'Chỉ trả JSON.' });
            if (j && j.pages && j.pages.length) applyAiDoc(j);
            else { doc.pages = [newPage()]; buildPoster(p); renderAll(); zoomFit(); }
        } catch (e) { doc.pages = [newPage()]; buildPoster(p); renderAll(); zoomFit(); }
    }

    TK.status('Sẵn sàng — tài liệu mẫu 3 trang. Kéo khung để di chuyển, nhấp đúp khung chữ để gõ, panel phải để định dạng.');
})();
