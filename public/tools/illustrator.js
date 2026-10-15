/* ============================================================
   xVector — editor vector SVG thật: pen, shape, text, brush,
   transform, gradient, align, layers, undo/redo, xuất SVG/PNG, AI
   ============================================================ */
(function () {
    'use strict';

    const svg = document.getElementById('svg');
    const art = document.getElementById('art');
    const defs = document.getElementById('svgDefs');
    const selLayer = document.getElementById('selLayer');
    const gridLayer = document.getElementById('gridLayer');
    const NS = 'http://www.w3.org/2000/svg';

    const S = {
        tool: 'select', fill: '#ff9a00', stroke: '#222222', strokeW: 2, dash: '', cap: 'round', join: 'round',
        opacity: 100, zoom: 1, snap: false, grid: false, outline: false, sel: null, pen: null, uid: 1, vb: { w: 800, h: 600 }
    };
    const hist = TK.history(30);

    const TOOLS = [
        ['select', '🖱️', 'Chọn / di chuyển (V)'], ['direct', '⇱', 'Chọn điểm neo (A)'], ['pen', '🖋️', 'Pen tool (P)'],
        ['text', 'T', 'Chữ (T)'], ['rect', '▢', 'Hình chữ nhật (M)'], ['ellipse', '○', 'Ellipse (L)'],
        ['polygon', '⬟', 'Đa giác (5 cạnh)'], ['star', '✦', 'Ngôi sao'], ['line', '\\', 'Đường thẳng'],
        ['brush', '🖌️', 'Cọ tự do (B)'], ['pencil', '✏️', 'Bút chì (nét mảnh)'], ['eyedropper', '💧', 'Hút màu (I)'],
        ['eraser', '🧽', 'Xóa đối tượng'], ['rotate', '🔄', 'Xoay'], ['scale', '📐', 'Co giãn'], ['gradient', '🌈', 'Tô gradient'], ['hand', '✋', 'Xem toàn artboard']
    ];

    /* ---------- dựng toolbar ---------- */
    const toolsBox = document.getElementById('tools');
    toolsBox.innerHTML = TOOLS.map(t => `<button class="tool-btn ${t[0] === 'select' ? 'active' : ''}" data-tool="${t[0]}" title="${t[2]}">${t[1]}</button>`).join('');
    toolsBox.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

    function setTool(name) {
        S.tool = name;
        toolsBox.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === name));
        svg.style.cursor = name === 'select' ? 'default' : name === 'eyedropper' ? 'crosshair' : name === 'hand' ? 'grab' : 'crosshair';
        if (name === 'hand') { fitZoom(); setTool('select'); return; }
        TK.status('Công cụ: ' + (TOOLS.find(t => t[0] === name) || [])[2]);
        if (name !== 'pen' && S.pen) finishPen(true);
    }

    /* ---------- helpers ---------- */
    function el(tag, attrs) {
        const e = document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k]));
        return e;
    }
    function svgPt(clientX, clientY) {
        const r = svg.getBoundingClientRect();
        return { x: (clientX - r.left) / r.width * S.vb.w, y: (clientY - r.top) / r.height * S.vb.h };
    }
    function snap(v) { return S.snap ? Math.round(v / 10) * 10 : Math.round(v * 10) / 10; }
    function objBox(g) {
        const r = g.getBoundingClientRect(), s = svg.getBoundingClientRect();
        const kx = S.vb.w / s.width, ky = S.vb.h / s.height;
        return { x: (r.left - s.left) * kx, y: (r.top - s.top) * ky, w: r.width * kx, h: r.height * ky, cx: (r.left - s.left + r.width / 2) * kx, cy: (r.top - s.top + r.height / 2) * ky };
    }
    function applyT(g) {
        g.setAttribute('transform', `translate(${g.dataset.tx || 0},${g.dataset.ty || 0}) rotate(${g.dataset.r || 0}) scale(${g.dataset.sx || 1},${g.dataset.sy || 1})`);
    }
    function objs() { return Array.prototype.slice.call(art.children); }

    /* ---------- tạo đối tượng ---------- */
    function makeObject(type, w, h, inner) {
        const g = el('g', { class: 'obj' });
        g.dataset.type = type;
        g.dataset.name = type.charAt(0).toUpperCase() + type.slice(1) + ' ' + S.uid++;
        g.dataset.tx = 0; g.dataset.ty = 0; g.dataset.r = 0; g.dataset.sx = 1; g.dataset.sy = 1;
        g.dataset.w = w; g.dataset.h = h;
        g.appendChild(inner);
        art.appendChild(g);
        return g;
    }
    function styleOf(e) {
        e.setAttribute('fill', S.fill === 'none' ? 'none' : S.fill);
        e.setAttribute('stroke', S.stroke);
        e.setAttribute('stroke-width', S.strokeW);
        e.setAttribute('stroke-linecap', S.cap);
        e.setAttribute('stroke-linejoin', S.join);
        if (S.dash) e.setAttribute('stroke-dasharray', S.dash);
        e.setAttribute('opacity', S.opacity / 100);
        return e;
    }
    function shapeEl(kind, w, h, pts) {
        if (kind === 'rect') return styleOf(el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 2 }));
        if (kind === 'ellipse') return styleOf(el('ellipse', { cx: 0, cy: 0, rx: w / 2, ry: h / 2 }));
        if (kind === 'line') { const e = styleOf(el('line', { x1: -w / 2, y1: 0, x2: w / 2, y2: 0 })); e.setAttribute('fill', 'none'); return e; }
        if (kind === 'polygon' || kind === 'star') {
            const n = kind === 'polygon' ? 5 : 10, R = Math.min(w, h) / 2;
            let d = '';
            for (let i = 0; i < n; i++) {
                const rr = kind === 'star' && i % 2 ? R * 0.42 : R;
                const a = Math.PI * 2 * i / n - Math.PI / 2;
                d += (i ? ' L' : 'M') + (Math.cos(a) * rr).toFixed(2) + ',' + (Math.sin(a) * rr).toFixed(2);
            }
            return styleOf(el('path', { d: d + ' Z' }));
        }
        if (kind === 'text') {
            const e = styleOf(el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': h, 'font-family': 'Segoe UI, sans-serif', 'font-weight': '700' }));
            e.setAttribute('stroke-width', Math.min(S.strokeW, 2));
            e.textContent = pts || 'Text';
            return e;
        }
        if (kind === 'path') return styleOf(el('path', { d: pts }));
        return styleOf(el('rect', { x: -w / 2, y: -h / 2, width: w, height: h }));
    }

    /* ---------- select ---------- */
    function select(g) {
        S.sel = g;
        drawSel();
        renderLayers();
        syncTransformPanel();
        document.getElementById('stSel').textContent = g ? `${g.dataset.name} (${g.dataset.type})` : 'Chưa chọn đối tượng';
    }
    function drawSel() {
        selLayer.innerHTML = '';
        if (!S.sel || !S.sel.isConnected) return;
        const b = objBox(S.sel);
        const r = el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none', stroke: '#ff9a00', 'stroke-width': 1.2 / S.zoom, 'stroke-dasharray': `${4 / S.zoom} ${3 / S.zoom}` });
        selLayer.appendChild(r);
        [[b.x, b.y, 'nw'], [b.x + b.w, b.y, 'ne'], [b.x, b.y + b.h, 'sw'], [b.x + b.w, b.y + b.h, 'se']].forEach(([x, y, k]) => {
            const h = el('rect', { x: x - 4 / S.zoom, y: y - 4 / S.zoom, width: 8 / S.zoom, height: 8 / S.zoom, fill: '#fff', stroke: '#ff9a00', 'stroke-width': 1.2 / S.zoom, 'data-handle': k });
            h.style.cursor = k === 'nw' || k === 'se' ? 'nwse-resize' : 'nesw-resize';
            selLayer.appendChild(h);
        });
        const rot = el('circle', { cx: b.x + b.w / 2, cy: b.y - 16 / S.zoom, r: 5 / S.zoom, fill: '#ffd166', stroke: '#a06000', 'stroke-width': 1 / S.zoom, 'data-handle': 'rot' });
        rot.style.cursor = 'grab';
        selLayer.appendChild(rot);
        selLayer.appendChild(el('line', { x1: b.x + b.w / 2, y1: b.y, x2: b.x + b.w / 2, y2: b.y - 16 / S.zoom, stroke: '#ffd166', 'stroke-width': 1 / S.zoom }));
    }

    /* ---------- tương tác chuột ---------- */
    let drag = null;
    svg.addEventListener('pointerdown', e => {
        const p = svgPt(e.clientX, e.clientY);
        svg.setPointerCapture(e.pointerId);
        const handle = e.target.dataset && e.target.dataset.handle;

        if (handle && S.sel) {
            const b = objBox(S.sel);
            drag = { mode: handle === 'rot' ? 'rotate' : 'resize', handle, b, p0: p, sx0: parseFloat(S.sel.dataset.sx), sy0: parseFloat(S.sel.dataset.sy), r0: parseFloat(S.sel.dataset.r) };
            return;
        }

        const hit = e.target.closest ? e.target.closest('g.obj') : null;

        if (S.tool === 'select' || S.tool === 'direct') {
            if (hit) {
                select(hit);
                drag = { mode: 'move', g: hit, p0: p, tx0: parseFloat(hit.dataset.tx), ty0: parseFloat(hit.dataset.ty) };
            } else select(null);
            return;
        }
        if (S.tool === 'eyedropper') {
            if (hit) {
                const f = hit.firstElementChild.getAttribute('fill');
                const s = hit.firstElementChild.getAttribute('stroke');
                if (f && f !== 'none') { S.fill = toHexColor(f); document.getElementById('fillColor').value = S.fill; }
                if (s && s !== 'none') { S.stroke = toHexColor(s); document.getElementById('strokeColor').value = S.stroke; }
                TK.toast('💧 Đã hút màu: fill ' + S.fill + ' / stroke ' + S.stroke, 'ok');
            }
            return;
        }
        if (S.tool === 'eraser') { if (hit) { hit.remove(); select(null); push(); renderLayers(); TK.status('Đã xóa đối tượng'); } return; }
        if (S.tool === 'gradient' || S.tool === 'scale' || S.tool === 'rotate') {
            if (!hit) return TK.toast('Chọn đối tượng trước', 'error');
            select(hit);
            if (S.tool === 'gradient') applyGradient(false);
            if (S.tool === 'rotate') { drag = { mode: 'rotate', b: objBox(hit), p0: p, r0: parseFloat(hit.dataset.r) }; }
            if (S.tool === 'scale') { drag = { mode: 'resize', handle: 'se', b: objBox(hit), p0: p, sx0: parseFloat(hit.dataset.sx), sy0: parseFloat(hit.dataset.sy) }; }
            return;
        }
        if (S.tool === 'text') { addTextAt(p); return; }
        if (S.tool === 'pen') { penClick(p, e); return; }
        if (S.tool === 'brush' || S.tool === 'pencil') { drag = { mode: 'draw', pts: [p] }; return; }
        // shape tools
        drag = { mode: 'create', p0: p, kind: S.tool };
    });

    svg.addEventListener('pointermove', e => {
        const p = svgPt(e.clientX, e.clientY);
        document.getElementById('stPos').textContent = `x: ${Math.round(p.x)}, y: ${Math.round(p.y)}`;
        if (!drag) return;

        if (drag.mode === 'move') {
            drag.g.dataset.tx = snap(drag.tx0 + (p.x - drag.p0.x));
            drag.g.dataset.ty = snap(drag.ty0 + (p.y - drag.p0.y));
            applyT(drag.g); drawSel(); syncTransformPanel();
        } else if (drag.mode === 'resize' && S.sel) {
            const b = drag.b;
            let kx = 1, ky = 1;
            if (drag.handle === 'se') { kx = (p.x - b.x) / (b.w || 1); ky = (p.y - b.y) / (b.h || 1); }
            if (drag.handle === 'nw') { kx = (b.x + b.w - p.x) / (b.w || 1); ky = (b.y + b.h - p.y) / (b.h || 1); }
            if (drag.handle === 'ne') { kx = (p.x - b.x) / (b.w || 1); ky = (b.y + b.h - p.y) / (b.h || 1); }
            if (drag.handle === 'sw') { kx = (b.x + b.w - p.x) / (b.w || 1); ky = (p.y - b.y) / (b.h || 1); }
            if (e.shiftKey) ky = kx;
            S.sel.dataset.sx = TK.clamp(drag.sx0 * kx, 0.05, 40);
            S.sel.dataset.sy = TK.clamp(drag.sy0 * ky, 0.05, 40);
            applyT(S.sel); drawSel(); syncTransformPanel();
        } else if (drag.mode === 'rotate' && S.sel) {
            const b = drag.b;
            const a0 = Math.atan2(drag.p0.y - (b.y + b.h / 2), drag.p0.x - (b.x + b.w / 2));
            const a1 = Math.atan2(p.y - (b.y + b.h / 2), p.x - (b.x + b.w / 2));
            let deg = drag.r0 + (a1 - a0) * 180 / Math.PI;
            if (e.shiftKey) deg = Math.round(deg / 15) * 15;
            S.sel.dataset.r = Math.round(deg * 10) / 10;
            applyT(S.sel); drawSel(); syncTransformPanel();
        } else if (drag.mode === 'create') {
            if (!drag.tmp) {
                const w = 10, h = 10;
                drag.tmp = makeObject(drag.kind === 'polygon' ? 'polygon' : drag.kind, w, h, shapeEl(drag.kind, w, h));
                drag.tmp.dataset.tx = drag.p0.x; drag.tmp.dataset.ty = drag.p0.y;
            }
            const w = Math.max(2, Math.abs(p.x - drag.p0.x)), h = Math.max(2, Math.abs(p.y - drag.p0.y));
            const inner = drag.tmp.firstElementChild;
            drag.tmp.dataset.w = w; drag.tmp.dataset.h = h;
            redrawShape(inner, drag.kind, w, h);
            drag.tmp.dataset.tx = (drag.p0.x + p.x) / 2; drag.tmp.dataset.ty = (drag.p0.y + p.y) / 2;
            applyT(drag.tmp);
        } else if (drag.mode === 'draw') {
            drag.pts.push(p);
            if (drag.tmp) drag.tmp.remove();
            const first = drag.pts[0];
            const d = drag.pts.map((q, i) => `${i ? 'L' : 'M'}${(q.x - first.x).toFixed(1)},${(q.y - first.y).toFixed(1)}`).join(' ');
            const path = shapeEl('path', 0, 0, d);
            if (S.tool === 'pencil') { path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', Math.max(1, S.strokeW * 0.6)); }
            drag.tmp = makeObject('path', 0, 0, path);
            drag.tmp.dataset.tx = first.x; drag.tmp.dataset.ty = first.y;
            applyT(drag.tmp);
        }
    });

    svg.addEventListener('pointerup', e => {
        if (!drag) return;
        if (drag.mode === 'create' && drag.tmp) {
            const w = parseFloat(drag.tmp.dataset.w), h = parseFloat(drag.tmp.dataset.h);
            if (w < 4 || h < 4) { // click không kéo → tạo hình mặc định
                const size = drag.kind === 'line' ? 160 : 120;
                redrawShape(drag.tmp.firstElementChild, drag.kind, size, drag.kind === 'line' ? 4 : size);
                drag.tmp.dataset.w = size; drag.tmp.dataset.h = size;
            }
            select(drag.tmp); push(); renderLayers();
            TK.status('Đã vẽ ' + drag.kind + ' ' + Math.round(w) + '×' + Math.round(h));
        } else if (drag.mode === 'draw' && drag.tmp) {
            select(drag.tmp); push(); renderLayers();
            TK.status('Đã vẽ nét tự do ' + drag.pts.length + ' điểm');
        } else if (['move', 'resize', 'rotate'].includes(drag.mode)) { push(); }
        drag = null;
        drawSel();
    });

    svg.addEventListener('dblclick', e => {
        if (S.tool === 'pen' && S.pen) { finishPen(true); return; }
        const hit = e.target.closest && e.target.closest('g.obj');
        if (hit && hit.dataset.type === 'text') {
            TK.prompt('Sửa chữ', 'Nội dung:', hit.firstElementChild.textContent).then(v => {
                if (v == null) return;
                hit.firstElementChild.textContent = v;
                push(); drawSel(); TK.status('Đã sửa chữ');
            });
        }
    });

    function redrawShape(inner, kind, w, h) {
        if (kind === 'rect') { inner.setAttribute('x', -w / 2); inner.setAttribute('y', -h / 2); inner.setAttribute('width', w); inner.setAttribute('height', h); }
        else if (kind === 'ellipse') { inner.setAttribute('rx', w / 2); inner.setAttribute('ry', h / 2); }
        else if (kind === 'line') { inner.setAttribute('x1', -w / 2); inner.setAttribute('x2', w / 2); }
        else if (kind === 'polygon' || kind === 'star') {
            const n = kind === 'polygon' ? 5 : 10, R = Math.min(w, h) / 2;
            let d = '';
            for (let i = 0; i < n; i++) {
                const rr = kind === 'star' && i % 2 ? R * 0.42 : R;
                const a = Math.PI * 2 * i / n - Math.PI / 2;
                d += (i ? ' L' : 'M') + (Math.cos(a) * rr).toFixed(2) + ',' + (Math.sin(a) * rr).toFixed(2);
            }
            inner.setAttribute('d', d + ' Z');
        }
    }

    /* ---------- pen ---------- */
    function penClick(p, e) {
        if (!S.pen) {
            S.pen = { pts: [p], g: null };
            TK.status('Pen: bấm để thêm điểm neo · Enter/nhấp đúp để kết thúc · Esc để hủy');
        } else S.pen.pts.push(p);
        drawPenPreview();
    }
    function drawPenPreview() {
        if (drag && drag.mode === 'penprev') drag.g.remove();
        if (!S.pen) return;
        const first = S.pen.pts[0];
        const d = S.pen.pts.map((q, i) => `${i ? 'L' : 'M'}${(q.x - first.x).toFixed(1)},${(q.y - first.y).toFixed(1)}`).join(' ');
        const path = el('path', { d, fill: 'none', stroke: '#00c2ff', 'stroke-width': 1.5 / S.zoom, 'stroke-dasharray': '4 3' });
        selLayer.appendChild(path);
        S.pen.pts.forEach(q => selLayer.appendChild(el('circle', { cx: q.x, cy: q.y, r: 3 / S.zoom, fill: '#fff', stroke: '#00c2ff' })));
    }
    function finishPen(close) {
        selLayer.querySelectorAll('path,circle').forEach(n => n.remove());
        if (!S.pen || S.pen.pts.length < 2) { S.pen = null; drawSel(); return; }
        const first = S.pen.pts[0];
        let d = S.pen.pts.map((q, i) => `${i ? 'L' : 'M'}${(q.x - first.x).toFixed(1)},${(q.y - first.y).toFixed(1)}`).join(' ');
        if (close) d += ' Z';
        const path = styleOf(el('path', { d }));
        if (!close) path.setAttribute('fill', 'none');
        const g = makeObject('path', 0, 0, path);
        g.dataset.tx = first.x; g.dataset.ty = first.y;
        applyT(g);
        S.pen = null;
        select(g); push(); renderLayers();
        TK.status('✒️ Đã tạo path ' + (close ? 'khép kín (có fill)' : 'mở (chỉ nét)'));
    }

    async function addTextAt(p) {
        const v = await TK.prompt('Thêm chữ', 'Nhập nội dung chữ:', 'RUNE VECTOR');
        if (!v) return;
        const size = await TK.askNumber('Cỡ chữ', 'Chiều cao chữ (px):', 56);
        const h = parseInt(size, 10) || 56;
        const inner = shapeEl('text', h * v.length * 0.6, h, v);
        const g = makeObject('text', h * v.length * 0.6, h, inner);
        g.dataset.tx = snap(p.x); g.dataset.ty = snap(p.y);
        applyT(g); select(g); push(); renderLayers();
        TK.status('Đã thêm chữ: ' + v);
    }

    function toHexColor(c) {
        if (/^#/.test(c)) return c.length === 4 ? '#' + c.slice(1).split('').map(x => x + x).join('') : c;
        const m = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c);
        if (m) return '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('');
        return '#000000';
    }

    /* ---------- gradient ---------- */
    function applyGradient(radial) {
        const g = S.sel;
        if (!g) return TK.toast('Chọn đối tượng trước', 'error');
        const id = 'grad' + S.uid++;
        const gr = el(radial ? 'radialGradient' : 'linearGradient', { id, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
        gr.appendChild(el('stop', { offset: '0%', 'stop-color': S.fill === 'none' ? '#ffffff' : S.fill }));
        gr.appendChild(el('stop', { offset: '100%', 'stop-color': S.stroke }));
        defs.appendChild(gr);
        g.firstElementChild.setAttribute('fill', `url(#${id})`);
        push(); TK.toast((radial ? '◎ Radial' : '🌈 Linear') + ' gradient đã áp cho ' + g.dataset.name, 'ok');
    }

    /* ---------- transform panel ---------- */
    function syncTransformPanel() {
        const g = S.sel;
        const ids = ['tX', 'tY', 'tW', 'tH', 'tR', 'tS'];
        if (!g) { ids.forEach(i => document.getElementById(i).value = ''); return; }
        const b = objBox(g);
        document.getElementById('tX').value = Math.round(b.x);
        document.getElementById('tY').value = Math.round(b.y);
        document.getElementById('tW').value = Math.round(b.w);
        document.getElementById('tH').value = Math.round(b.h);
        document.getElementById('tR').value = g.dataset.r || 0;
        document.getElementById('tS').value = Math.round((parseFloat(g.dataset.sx) || 1) * 100);
    }
    function bindTransform() {
        const move = (dx, dy) => { const g = S.sel; g.dataset.tx = parseFloat(g.dataset.tx) + dx; g.dataset.ty = parseFloat(g.dataset.ty) + dy; applyT(g); drawSel(); };
        const setPos = (id, fn) => {
            const inp = document.getElementById(id);
            inp.addEventListener('change', () => { if (S.sel) { fn(parseFloat(inp.value) || 0); push(); } });
        };
        setPos('tX', v => move(v - objBox(S.sel).x, 0));
        setPos('tY', v => move(0, v - objBox(S.sel).y));
        setPos('tW', v => { const b = objBox(S.sel); S.sel.dataset.sx = (parseFloat(S.sel.dataset.sx) || 1) * (v / (b.w || 1)); applyT(S.sel); drawSel(); });
        setPos('tH', v => { const b = objBox(S.sel); S.sel.dataset.sy = (parseFloat(S.sel.dataset.sy) || 1) * (v / (b.h || 1)); applyT(S.sel); drawSel(); });
        setPos('tR', v => { S.sel.dataset.r = v; applyT(S.sel); drawSel(); });
        setPos('tS', v => { const k = v / 100; S.sel.dataset.sx = k; S.sel.dataset.sy = k; applyT(S.sel); drawSel(); });
    }

    /* ---------- layers ---------- */
    function renderLayers() {
        const box = document.getElementById('layers');
        const list = objs().slice().reverse();
        document.getElementById('layerCount').textContent = '(' + list.length + ')';
        box.innerHTML = list.length ? '' : '<div style="color:#777;font-size:11.5px;">Chưa có đối tượng nào</div>';
        list.forEach(g => {
            const d = document.createElement('div');
            d.className = 'vector-layer' + (g === S.sel ? ' on' : '');
            d.innerHTML = `<span data-vis title="Ẩn/hiện">${g.style.display === 'none' ? '🚫' : '👁️'}</span><span>${iconType(g.dataset.type)}</span><span class="nm">${escapeHtml(g.dataset.name)}</span><span class="x" title="Xóa">✕</span>`;
            d.addEventListener('click', e => {
                if (e.target.dataset.vis != null) { g.style.display = g.style.display === 'none' ? '' : 'none'; renderLayers(); return; }
                if (e.target.classList.contains('x')) { g.remove(); if (S.sel === g) select(null); push(); renderLayers(); return; }
                select(g);
            });
            d.querySelector('.nm').addEventListener('dblclick', async () => {
                const n = await TK.prompt('Đổi tên layer', '', g.dataset.name);
                if (n) { g.dataset.name = n; renderLayers(); }
            });
            box.appendChild(d);
        });
    }
    const iconType = t => ({ rect: '▭', ellipse: '○', polygon: '⬟', star: '✦', line: '╱', text: 'T', path: '✏️' }[t] || '▪');
    const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ---------- zoom / view ---------- */
    function setZoom(z) {
        S.zoom = TK.clamp(z, 0.1, 8);
        svg.style.width = (S.vb.w * S.zoom) + 'px';
        svg.style.height = (S.vb.h * S.zoom) + 'px';
        drawSel(); drawGrid();
    }
    function fitZoom() {
        const a = document.getElementById('artboardArea');
        setZoom(Math.min((a.clientWidth - 40) / S.vb.w, (a.clientHeight - 40) / S.vb.h));
    }
    function drawGrid() {
        gridLayer.innerHTML = '';
        if (!S.grid) return;
        for (let x = 0; x <= S.vb.w; x += 20) gridLayer.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: S.vb.h, stroke: x % 100 === 0 ? 'rgba(0,0,0,.16)' : 'rgba(0,0,0,.07)', 'stroke-width': x % 100 === 0 ? 1 : 0.5 }));
        for (let y = 0; y <= S.vb.h; y += 20) gridLayer.appendChild(el('line', { x1: 0, y1: y, x2: S.vb.w, y2: y, stroke: y % 100 === 0 ? 'rgba(0,0,0,.16)' : 'rgba(0,0,0,.07)', 'stroke-width': y % 100 === 0 ? 1 : 0.5 }));
    }
    function setOutline(on) {
        S.outline = on;
        objs().forEach(g => {
            const c = g.firstElementChild;
            if (!c) return;
            if (on) { c.dataset.of = c.getAttribute('fill') || ''; c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#111'); c.setAttribute('stroke-width', 1); }
            else if (c.dataset.of != null) { c.setAttribute('fill', c.dataset.of || 'none'); c.setAttribute('stroke', S.stroke); c.setAttribute('stroke-width', S.strokeW); }
        });
        TK.status(on ? 'Chế độ khung dây (outline)' : 'Chế độ thường');
    }

    /* ---------- history ---------- */
    function push() { hist.push({ art: art.innerHTML, defs: defs.innerHTML }); }
    function restore(h) { art.innerHTML = h.art; defs.innerHTML = h.defs; select(null); renderLayers(); }

    /* ---------- export / import ---------- */
    function svgMarkup() {
        const clone = svg.cloneNode(true);
        clone.querySelector('#selLayer').innerHTML = '';
        clone.querySelector('#gridLayer').innerHTML = '';
        clone.removeAttribute('style');
        clone.setAttribute('xmlns', NS);
        clone.setAttribute('width', S.vb.w); clone.setAttribute('height', S.vb.h);
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + clone.outerHTML;
    }
    function exportSvg() {
        TK.download(new Blob([svgMarkup()], { type: 'image/svg+xml' }), `xvector-${Date.now()}.svg`);
        TK.status('Đã xuất SVG vector');
    }
    function exportPng(scale) {
        const s = scale || 2;
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svgMarkup()], { type: 'image/svg+xml' }));
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = S.vb.w * s; c.height = S.vb.h * s;
            const x = c.getContext('2d');
            x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
            x.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            TK.download(c.toDataURL('image/png'), `xvector-${Date.now()}@${s}x.png`);
            TK.status('Đã xuất PNG ' + c.width + '×' + c.height);
        };
        img.onerror = () => { URL.revokeObjectURL(url); TK.toast('Không xuất được PNG (SVG có tài nguyên ngoài)', 'error'); };
        img.src = url;
    }

    /* ---------- AI ---------- */
    async function aiVector() {
        const p = await TK.prompt('✨ AI vẽ vector', 'Mô tả logo/hình bạn muốn AI vẽ bằng vector (AI trả về tọa độ thật):', 'Logo ngọn núi mặt trời: núi tím, mặt trời vàng, chữ RUNE bên dưới');
        if (!p) return;
        TK.status('AI đang dựng vector…');
        try {
            const j = await TK.ai(`Vẽ vector trong artboard ${S.vb.w}x${S.vb.h} theo mô tả: "${p}".
Trả JSON: {"shapes":[{"type":"rect|ellipse|polygon|star|line|text|path","x":400,"y":300,"w":200,"h":200,"fill":"#7c3aed","stroke":"#111111","strokeW":2,"rotate":0,"opacity":100,"text":"(nếu type=text)","points":"M0,0 L100,0 L50,-80 Z (nếu type=path, tọa độ tương đối tâm)"}]}
Dùng 4-10 shape, bố cục cân đối, màu hài hòa. CHỈ trả JSON.`, { json: true, system: 'Bạn là designer vector. Chỉ trả JSON hợp lệ.' });
            if (!j || !j.shapes) throw new Error('AI không trả về shapes');
            buildShapes(j.shapes);
            TK.toast('✨ AI đã vẽ ' + j.shapes.length + ' đối tượng vector', 'ok');
        } catch (e) {
            TK.toast('AI lỗi (' + RuneAI.humanError(e.message) + ') → dùng bản dựng heuristic', 'error');
            buildShapes(heuristicShapes(p));
        }
    }
    function buildShapes(shapes) {
        shapes.forEach(s => {
            const type = ['rect', 'ellipse', 'polygon', 'star', 'line', 'text', 'path'].includes(s.type) ? s.type : 'rect';
            S.fill = s.fill || S.fill; S.stroke = s.stroke || '#111'; S.strokeW = s.strokeW == null ? 2 : s.strokeW; S.opacity = s.opacity == null ? 100 : s.opacity;
            const w = s.w || 100, h = s.h || 100;
            const inner = type === 'path' ? styleOf(el('path', { d: s.points || 'M-50,0 L50,0' })) : shapeEl(type, w, h, s.text);
            const g = makeObject(type, w, h, inner);
            g.dataset.tx = s.x == null ? S.vb.w / 2 : s.x;
            g.dataset.ty = s.y == null ? S.vb.h / 2 : s.y;
            g.dataset.r = s.rotate || 0;
            applyT(g);
        });
        push(); renderLayers(); drawSel();
        TK.status('Đã thêm ' + shapes.length + ' đối tượng');
    }
    function heuristicShapes(p) {
        const s = p.toLowerCase(), out = [];
        out.push({ type: 'ellipse', x: S.vb.w / 2, y: 210, w: 150, h: 150, fill: /mặt trời|sun|vàng/.test(s) ? '#ffd166' : '#f472b6', stroke: '#ffffff', strokeW: 0 });
        if (/núi|mountain/.test(s)) out.push({ type: 'path', x: S.vb.w / 2 - 130, y: 330, w: 260, h: 160, fill: '#7c3aed', stroke: '#4c1d95', strokeW: 3, points: 'M-130,80 L0,-80 L130,80 Z' });
        if (/núi|mountain/.test(s)) out.push({ type: 'path', x: S.vb.w / 2 + 120, y: 350, w: 200, h: 130, fill: '#a78bfa', stroke: '#4c1d95', strokeW: 3, points: 'M-100,65 L0,-65 L100,65 Z' });
        if (/sao|star/.test(s)) out.push({ type: 'star', x: S.vb.w / 2, y: 180, w: 180, h: 180, fill: '#ffd166', stroke: '#b45309', strokeW: 2 });
        const txt = (/"([^"]+)"/.exec(p) || [, 'RUNE'])[1];
        out.push({ type: 'text', x: S.vb.w / 2, y: 470, w: 400, h: 64, fill: '#1f2937', stroke: 'none', strokeW: 0, text: txt });
        out.push({ type: 'rect', x: S.vb.w / 2, y: 520, w: 260, h: 8, fill: '#ff9a00', stroke: 'none', strokeW: 0 });
        return out;
    }

    /* ---------- actions ---------- */
    TK.init({ app: 'xdraw', status: '.statusbar [data-status-text]' });
    const A = {
        undo() { if (hist.canUndo()) { restore(hist.undo()); TK.status('↶ Hoàn tác'); } else TK.toast('Không còn gì để hoàn tác'); },
        redo() { if (hist.canRedo()) { restore(hist.redo()); TK.status('↷ Làm lại'); } else TK.toast('Không còn gì để làm lại'); },
        async newDoc() {
            const v = await TK.prompt('Artboard mới', 'Nhập RỘNGxCAO (vd 1080x1080). Gõ "giữ" để giữ nội dung:', '800x600');
            if (!v) return;
            const m = /(\d+)\s*[x×,]\s*(\d+)/i.exec(v);
            const keep = /giữ|keep/i.test(v);
            if (m) {
                S.vb.w = +m[1]; S.vb.h = +m[2];
                svg.setAttribute('viewBox', `0 0 ${S.vb.w} ${S.vb.h}`);
                svg.setAttribute('width', S.vb.w); svg.setAttribute('height', S.vb.h);
                document.getElementById('stArtboard').textContent = `Artboard ${S.vb.w} × ${S.vb.h}`;
            }
            if (!keep) { art.innerHTML = ''; defs.innerHTML = ''; select(null); renderLayers(); }
            fitZoom(); drawGrid(); push();
        },
        async importSvg() {
            const f = await TK.pickFile('.svg,image/svg+xml');
            if (!f) return;
            try {
                const txt = await TK.readAsText(f);
                const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
                const root = doc.documentElement;
                const vb = root.getAttribute('viewBox');
                if (vb) { const p = vb.split(/[\s,]+/).map(Number); S.vb.w = p[2] || S.vb.w; S.vb.h = p[3] || S.vb.h; svg.setAttribute('viewBox', `0 0 ${S.vb.w} ${S.vb.h}`); }
                Array.prototype.slice.call(root.childNodes).forEach(n => {
                    if (n.nodeType !== 1) return;
                    if (['defs', 'metadata', 'title', 'desc'].includes(n.tagName.toLowerCase())) { if (n.tagName.toLowerCase() === 'defs') defs.appendChild(document.importNode(n, true)); return; }
                    const g = el('g', { class: 'obj' });
                    g.dataset.type = n.tagName.toLowerCase();
                    g.dataset.name = f.name.replace('.svg', '') + ' ' + S.uid++;
                    g.dataset.tx = 0; g.dataset.ty = 0; g.dataset.r = 0; g.dataset.sx = 1; g.dataset.sy = 1;
                    g.appendChild(document.importNode(n, true));
                    art.appendChild(g);
                });
                fitZoom(); renderLayers(); push();
                TK.toast('Đã mở SVG: ' + f.name, 'ok');
            } catch (e) { TK.toast('Không đọc được SVG: ' + e.message, 'error'); }
        },
        exportSvg, exportPng: () => exportPng(2),
        saveProject() { TK.download(new Blob([JSON.stringify({ vb: S.vb, defs: defs.innerHTML, art: art.innerHTML })], { type: 'application/json' }), 'xvector-project.json'); },
        async loadProject() {
            const f = await TK.pickFile('.json,application/json');
            if (!f) return;
            try {
                const j = JSON.parse(await TK.readAsText(f));
                S.vb = j.vb || S.vb;
                svg.setAttribute('viewBox', `0 0 ${S.vb.w} ${S.vb.h}`);
                defs.innerHTML = j.defs || ''; art.innerHTML = j.art || '';
                document.getElementById('stArtboard').textContent = `Artboard ${S.vb.w} × ${S.vb.h}`;
                fitZoom(); renderLayers(); push();
                TK.toast('Đã mở dự án xVector', 'ok');
            } catch (e) { TK.toast('File dự án lỗi: ' + e.message, 'error'); }
        },
        duplicate() {
            if (!S.sel) return TK.toast('Chưa chọn đối tượng', 'error');
            const c = S.sel.cloneNode(true);
            c.dataset.name = S.sel.dataset.name + ' copy';
            c.dataset.tx = parseFloat(S.sel.dataset.tx) + 24;
            c.dataset.ty = parseFloat(S.sel.dataset.ty) + 24;
            art.appendChild(c); applyT(c); select(c); push(); renderLayers();
        },
        deleteSel() { if (!S.sel) return TK.toast('Chưa chọn đối tượng', 'error'); const n = S.sel.dataset.name; S.sel.remove(); select(null); push(); renderLayers(); TK.status('Đã xóa ' + n); },
        selectAll() { const o = objs(); if (o.length) { select(o[o.length - 1]); TK.toast('Đã chọn đối tượng trên cùng (' + o.length + ' đối tượng trong artboard)'); } },
        front() { if (S.sel) { art.appendChild(S.sel); push(); renderLayers(); drawSel(); } },
        back() { if (S.sel) { art.insertBefore(S.sel, art.firstChild); push(); renderLayers(); drawSel(); } },
        group() {
            const o = objs().filter(g => g.style.display !== 'none');
            if (o.length < 2) return TK.toast('Cần ít nhất 2 đối tượng để nhóm', 'error');
            const g = el('g', { class: 'obj' });
            g.dataset.type = 'group'; g.dataset.name = 'Group ' + S.uid++;
            g.dataset.tx = 0; g.dataset.ty = 0; g.dataset.r = 0; g.dataset.sx = 1; g.dataset.sy = 1;
            o.forEach(x => g.appendChild(x));
            art.appendChild(g); select(g); push(); renderLayers();
            TK.toast('Đã nhóm ' + o.length + ' đối tượng', 'ok');
        },
        ungroup() {
            if (!S.sel || S.sel.dataset.type !== 'group') return TK.toast('Chọn một Group để bỏ nhóm', 'error');
            const kids = Array.prototype.slice.call(S.sel.children);
            kids.forEach(k => art.appendChild(k));
            S.sel.remove(); select(null); push(); renderLayers();
            TK.toast('Đã bỏ nhóm (' + kids.length + ' đối tượng)', 'ok');
        },
        flipH() { if (!S.sel) return TK.toast('Chưa chọn', 'error'); S.sel.dataset.sx = -parseFloat(S.sel.dataset.sx); applyT(S.sel); push(); drawSel(); },
        flipV() { if (!S.sel) return TK.toast('Chưa chọn', 'error'); S.sel.dataset.sy = -parseFloat(S.sel.dataset.sy); applyT(S.sel); push(); drawSel(); },
        toPath() {
            if (!S.sel || S.sel.dataset.type !== 'text') return TK.toast('Chọn 1 đối tượng chữ', 'error');
            const t = S.sel.firstElementChild;
            const bb = S.sel.getBoundingClientRect();
            const w = bb.width / S.zoom || 100, h = bb.height / S.zoom || 40;
            const path = styleOf(el('path', { d: `M${-w / 2},${-h / 2} h${w} v${h} h${-w} Z` }));
            S.sel.firstElementChild.replaceWith(path);
            S.sel.dataset.type = 'path';
            push(); renderLayers();
            TK.toast('Đã chuyển chữ thành path (khối) — bản web không outline font thật, path là khung chữ');
        },
        expandStroke() {
            if (!S.sel) return TK.toast('Chưa chọn', 'error');
            const c = S.sel.firstElementChild;
            c.setAttribute('fill', c.getAttribute('stroke') || S.stroke);
            c.setAttribute('stroke', 'none');
            push(); TK.toast('Đã expand stroke thành fill', 'ok');
        },
        addText() { addTextAt({ x: S.vb.w / 2, y: S.vb.h / 2 }); },
        boldSel() { if (S.sel && S.sel.dataset.type === 'text') { S.sel.firstElementChild.setAttribute('font-weight', '800'); push(); } else TK.toast('Chọn đối tượng chữ', 'error'); },
        italicSel() { if (S.sel && S.sel.dataset.type === 'text') { S.sel.firstElementChild.setAttribute('font-style', 'italic'); push(); } else TK.toast('Chọn đối tượng chữ', 'error'); },
        async letterSpacing() {
            if (!S.sel || S.sel.dataset.type !== 'text') return TK.toast('Chọn đối tượng chữ', 'error');
            const v = await TK.askNumber('Giãn chữ', 'Nhập khoảng cách giữa các ký tự (px):', 4);
            if (v === null) return;
            S.sel.firstElementChild.setAttribute('letter-spacing', parseFloat(v) || 0);
            push(); drawSel();
        },
        zoomFit() { fitZoom(); }, zoom100() { setZoom(1); },
        toggleOutline() { setOutline(!S.outline); },
        toggleGrid() { S.grid = !S.grid; drawGrid(); TK.status(S.grid ? 'Đã bật lưới' : 'Đã tắt lưới'); },
        toggleSnap() { S.snap = !S.snap; TK.toast(S.snap ? '🧲 Bắt dính lưới 10px: BẬT' : 'Bắt dính: TẮT'); },
        rotateSel(e, elm) { if (!S.sel) return TK.toast('Chưa chọn', 'error'); S.sel.dataset.r = parseFloat(S.sel.dataset.r || 0) + parseFloat(elm.dataset.arg); applyT(S.sel); push(); drawSel(); syncTransformPanel(); },
        align(e, elm) {
            if (!S.sel) return TK.toast('Chưa chọn đối tượng', 'error');
            const b = objBox(S.sel), g = S.sel;
            const a = elm.dataset.arg;
            const dx = { left: -b.x, centerH: S.vb.w / 2 - b.cx, right: S.vb.w - (b.x + b.w) }[a] || 0;
            const dy = { top: -b.y, centerV: S.vb.h / 2 - b.cy, bottom: S.vb.h - (b.y + b.h) }[a] || 0;
            g.dataset.tx = parseFloat(g.dataset.tx) + dx; g.dataset.ty = parseFloat(g.dataset.ty) + dy;
            applyT(g); push(); drawSel(); syncTransformPanel();
            TK.status('Đã căn ' + a);
        },
        gradientFill() { applyGradient(false); },
        radialFill() { applyGradient(true); },
        aiVector
    };
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    /* ---------- panel màu / stroke ---------- */
    const SWATCHES = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ff9a00', '#78716c', '#0ea5e9', '#14b8a6', '#f43f5e', '#a855f7'];
    document.getElementById('swatches').innerHTML = SWATCHES.map(c => `<div class="color-swatch" style="background:${c}" data-c="${c}" title="${c}"></div>`).join('');
    document.querySelectorAll('.color-swatch').forEach(s => s.addEventListener('click', () => {
        S.fill = s.dataset.c;
        document.getElementById('fillColor').value = s.dataset.c;
        if (S.sel) { S.sel.firstElementChild.setAttribute('fill', s.dataset.c); push(); }
        TK.status('Fill: ' + s.dataset.c);
    }));
    document.getElementById('fillColor').addEventListener('input', e => { S.fill = e.target.value; if (S.sel) { S.sel.firstElementChild.setAttribute('fill', S.fill); drawSel(); } });
    document.getElementById('fillColor').addEventListener('change', () => push());
    document.getElementById('strokeColor').addEventListener('input', e => { S.stroke = e.target.value; if (S.sel) { S.sel.firstElementChild.setAttribute('stroke', S.stroke); } });
    document.getElementById('strokeColor').addEventListener('change', () => push());
    document.getElementById('noFillBtn').addEventListener('click', () => {
        S.fill = 'none';
        if (S.sel) S.sel.firstElementChild.setAttribute('fill', 'none');
        push(); TK.toast('Đã bỏ fill (chỉ còn nét)');
    });
    TK.slider('#strokeW', '#strokeWV', v => { S.strokeW = v; if (S.sel) S.sel.firstElementChild.setAttribute('stroke-width', v); });
    document.getElementById('strokeW').addEventListener('change', () => push());
    TK.slider('#opac', '#opacV', v => { S.opacity = v; if (S.sel) S.sel.firstElementChild.setAttribute('opacity', v / 100); });
    document.getElementById('opac').addEventListener('change', () => push());
    document.querySelectorAll('#dashRow button').forEach(b => b.addEventListener('click', () => {
        S.dash = b.dataset.dash;
        document.querySelectorAll('#dashRow button').forEach(x => x.classList.toggle('on', x === b));
        if (S.sel) { if (S.dash) S.sel.firstElementChild.setAttribute('stroke-dasharray', S.dash); else S.sel.firstElementChild.removeAttribute('stroke-dasharray'); push(); }
    }));
    [['capRow', 'stroke-linecap', 'cap'], ['joinRow', 'stroke-linejoin', 'join']].forEach(([row, attr, key]) => {
        document.querySelectorAll('#' + row + ' button').forEach(b => b.addEventListener('click', () => {
            S[key] = b.dataset[attr === 'stroke-linecap' ? 'cap' : 'join'];
            document.querySelectorAll('#' + row + ' button').forEach(x => x.classList.toggle('on', x === b));
            if (S.sel) { S.sel.firstElementChild.setAttribute(attr, S[key]); push(); }
        }));
    });
    bindTransform();

    /* ---------- phím tắt ---------- */
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT') return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); A.redo(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); exportSvg(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); A.duplicate(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'n') { e.preventDefault(); A.newDoc(); return; }
        if ((e.ctrlKey || e.metaKey) && k === '0') { e.preventDefault(); fitZoom(); return; }
        if ((e.ctrlKey || e.metaKey) && k === '1') { e.preventDefault(); setZoom(1); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'g') { e.preventDefault(); e.shiftKey ? A.ungroup() : A.group(); return; }
        if (k === 'escape') { if (S.pen) { S.pen = null; selLayer.querySelectorAll('path,circle').forEach(n => n.remove()); } select(null); }
        if (k === 'enter' && S.pen) { finishPen(true); return; }
        if (k === 'delete' || k === 'backspace') { if (S.sel) A.deleteSel(); return; }
        const map = { v: 'select', a: 'direct', p: 'pen', t: 'text', m: 'rect', l: 'ellipse', b: 'brush', n: 'pencil', i: 'eyedropper', e: 'eraser', r: 'rotate', s: 'scale', g: 'gradient' };
        if (map[k] && !e.ctrlKey && !e.metaKey) setTool(map[k]);
        if (S.sel && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
            e.preventDefault();
            const d = e.shiftKey ? 10 : 1;
            if (k === 'arrowup') S.sel.dataset.ty = parseFloat(S.sel.dataset.ty) - d;
            if (k === 'arrowdown') S.sel.dataset.ty = parseFloat(S.sel.dataset.ty) + d;
            if (k === 'arrowleft') S.sel.dataset.tx = parseFloat(S.sel.dataset.tx) - d;
            if (k === 'arrowright') S.sel.dataset.tx = parseFloat(S.sel.dataset.tx) + d;
            applyT(S.sel); drawSel(); syncTransformPanel();
        }
    });
    document.getElementById('artboardArea').addEventListener('wheel', e => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    }, { passive: false });

    /* ---------- lệnh AI điều khiển ---------- */
    TK.cmd('get_info', () => ({ app: 'xVector', artboard: S.vb, objects: objs().length, selected: S.sel && S.sel.dataset.name, tool: S.tool }));
    TK.cmd('add_shape', a => {
        S.fill = a.fill || S.fill; S.stroke = a.stroke || S.stroke; S.strokeW = a.strokeW == null ? S.strokeW : a.strokeW;
        const type = a.type === 'circle' ? 'ellipse' : (a.type || 'rect');
        const w = a.w || 120, h = a.h || 120;
        const inner = type === 'text' ? shapeEl('text', w, h, a.text || 'Text') : shapeEl(type, w, h);
        const g = makeObject(type, w, h, inner);
        g.dataset.tx = a.x == null ? S.vb.w / 2 : a.x; g.dataset.ty = a.y == null ? S.vb.h / 2 : a.y; g.dataset.r = a.rotate || 0;
        applyT(g); select(g); push(); renderLayers();
        return { name: g.dataset.name };
    });
    TK.cmd('build_shapes', a => { buildShapes(a.shapes || []); return { count: (a.shapes || []).length }; });
    TK.cmd('set_artboard', a => { S.vb.w = a.w || S.vb.w; S.vb.h = a.h || S.vb.h; svg.setAttribute('viewBox', `0 0 ${S.vb.w} ${S.vb.h}`); fitZoom(); document.getElementById('stArtboard').textContent = `Artboard ${S.vb.w} × ${S.vb.h}`; return S.vb; });
    TK.cmd('delete_selected', () => { A.deleteSel(); return { ok: true }; });
    TK.cmd('duplicate', () => { A.duplicate(); return { ok: true }; });
    TK.cmd('align', a => { A.align(null, { dataset: { arg: a.align || 'centerH' } }); return { ok: true }; });
    TK.cmd('export', a => { (a.format === 'png' ? exportPng(2) : exportSvg()); return { ok: true }; });
    TK.cmd('clear', () => { art.innerHTML = ''; select(null); push(); renderLayers(); return { ok: true }; });
    TK.cmd('set_tool', a => { setTool(a.tool || 'select'); return { tool: S.tool }; });
    TK.cmd('ai_draw', a => { aiPrompt(a.prompt); return { started: true }; });
    async function aiPrompt(p) {
        try {
            const j = await TK.ai(`Vẽ vector artboard ${S.vb.w}x${S.vb.h}: "${p}". Trả JSON {"shapes":[{"type":"rect|ellipse|polygon|star|line|text|path","x":0,"y":0,"w":100,"h":100,"fill":"#hex","stroke":"#hex","strokeW":2,"rotate":0,"text":"","points":""}]}. CHỈ JSON.`, { json: true, system: 'Chỉ trả JSON.' });
            if (j && j.shapes) buildShapes(j.shapes); else buildShapes(heuristicShapes(p));
        } catch (e) { buildShapes(heuristicShapes(p)); }
    }

    /* ---------- khởi động: dựng logo mẫu để dùng ngay ---------- */
    buildShapes([
        { type: 'rect', x: 400, y: 300, w: 760, h: 560, fill: '#111827', stroke: 'none', strokeW: 0 },
        { type: 'ellipse', x: 400, y: 205, w: 150, h: 150, fill: '#fbbf24', stroke: '#f59e0b', strokeW: 4 },
        { type: 'path', x: 285, y: 330, w: 260, h: 170, fill: '#7c3aed', stroke: '#4c1d95', strokeW: 4, points: 'M-130,85 L0,-85 L130,85 Z' },
        { type: 'path', x: 520, y: 355, w: 200, h: 130, fill: '#a78bfa', stroke: '#4c1d95', strokeW: 4, points: 'M-100,65 L0,-65 L100,65 Z' },
        { type: 'text', x: 400, y: 470, w: 420, h: 58, fill: '#ffffff', stroke: 'none', strokeW: 0, text: 'RUNE VECTOR' },
        { type: 'rect', x: 400, y: 512, w: 240, h: 8, fill: '#ff9a00', stroke: 'none', strokeW: 0 }
    ]);
    fitZoom();
    drawGrid();
    renderLayers();
    hist.reset(); push();
    TK.status('Sẵn sàng — logo mẫu đã có sẵn. Chọn công cụ trái để vẽ, panel phải để chỉnh màu/nét/transform.');
})();
