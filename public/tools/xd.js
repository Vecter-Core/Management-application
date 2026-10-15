/* ============================================================
   xPrototype — thiết kế UI + prototype chạy thật:
   artboard, phần tử kéo/thả, liên kết màn hình, preview có hiệu ứng,
   mẫu dựng sẵn, xuất PNG/HTML, AI sinh giao diện
   ============================================================ */
(function () {
    'use strict';

    const TOOLS = [
        ['select', '🖱️', 'Chọn / kéo (V)'], ['rect', '▭', 'Khối chữ nhật (M)'], ['ellipse', '◯', 'Hình tròn (L)'],
        ['text', 'T', 'Chữ (T)'], ['button', '🔘', 'Nút bấm (B)'], ['input', '📝', 'Ô nhập liệu (N)'],
        ['image', '🖼️', 'Ảnh (I)'], ['line', '╱', 'Đường kẻ'], ['hotspot', '👆', 'Vùng bấm trong suốt (H)'], ['hand', '✋', 'Vừa màn hình']
    ];

    const proj = { name: 'App RUNE', boards: [] };
    const S = { board: 0, sel: null, tool: 'select', zoom: 1, uid: 1, device: true };
    const hist = TK.history(40);

    const boardWrap = document.getElementById('boardWrap');
    const board = document.getElementById('board');
    const handles = document.getElementById('handles');
    const stage = document.getElementById('stage');

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const B = () => proj.boards[S.board];
    const elem = id => B().elements.find(e => e.id === id);
    const selEl = () => (S.sel ? elem(S.sel) : null);

    function mkBoard(name, w, h) {
        return { id: 'b' + S.uid++, name: name || ('Artboard ' + proj.boards.length + 1), w: w || 393, h: h || 852, bg: '#ffffff', elements: [] };
    }
    function mkEl(type, o) {
        const base = {
            id: 'e' + S.uid++, type, x: 20, y: 20, w: 200, h: 60, rot: 0, op: 100, z: B().elements.length,
            fill: '#7b2ff7', stroke: '#000000', strokeW: 0, radius: type === 'ellipse' ? 999 : 8, shadow: '',
            text: '', src: '', link: { to: '', tr: 'none' }, name: type + ' ' + S.uid,
            font: { size: 14, family: 'Segoe UI', color: '#ffffff', weight: '600', align: 'center' }
        };
        if (type === 'text') { base.fill = 'transparent'; base.font.color = '#111111'; base.font.weight = '400'; base.font.align = 'flex-start'; base.text = 'Chữ mẫu'; base.h = 28; }
        if (type === 'image') { base.fill = '#e8e8f0'; base.radius = 6; }
        if (type === 'input') { base.fill = '#ffffff'; base.stroke = '#ccccdd'; base.strokeW = 1; base.radius = 8; base.font.color = '#999'; base.font.weight = '400'; base.font.align = 'flex-start'; base.text = 'Nhập nội dung…'; }
        if (type === 'line') { base.fill = '#dddddd'; base.h = 2; base.radius = 0; }
        if (type === 'hotspot') { base.fill = 'rgba(123,47,247,0.001)'; base.radius = 0; }
        Object.keys(o || {}).forEach(k => { if (o[k] !== undefined) base[k] = o[k]; });
        return base;
    }

    /* ---------- toolbar ---------- */
    const toolBar = document.getElementById('toolBar');
    toolBar.innerHTML = TOOLS.map(t => `<button class="tb ${t[0] === S.tool ? 'active' : ''}" data-tool="${t[0]}" title="${t[2]}">${t[1]}</button>`).join('');
    toolBar.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    function setTool(n) {
        if (n === 'hand') { zoomFit(); return; }
        S.tool = n;
        toolBar.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === n));
        board.style.cursor = n === 'select' ? 'default' : 'crosshair';
        TK.status('Công cụ: ' + (TOOLS.find(t => t[0] === n) || [])[2]);
    }

    /* ---------- render ---------- */
    function render(structural) {
        renderBoards();
        renderBoard();
        renderLayers();
        renderLinkSelect();
        updateStatus();
        if (structural !== false) push();
    }
    function renderBoard() {
        const b = B();
        board.style.width = b.w + 'px';
        board.style.height = b.h + 'px';
        board.style.background = b.bg;
        boardWrap.style.transform = `scale(${S.zoom})`;
        boardWrap.classList.toggle('phone', !!S.device && b.h > b.w * 1.4 && b.w < 500);
        board.innerHTML = '';
        b.elements.slice().sort((p, q) => (p.z || 0) - (q.z || 0)).forEach(e => { if (!e.hidden) board.appendChild(nodeOf(e)); });
        drawHandles();
        document.getElementById('bName').value = b.name;
        document.getElementById('bBg').value = toHex(b.bg);
    }
    function nodeOf(e, plain) {
        const d = document.createElement('div');
        d.className = 'elem' + (e.id === S.sel && !plain ? ' sel' : '');
        d.dataset.id = e.id;
        if (e.link && e.link.to && !plain) d.classList.add('pv-link');
        const b = e.type === 'ellipse' ? '50%' : (e.radius || 0) + 'px';
        d.style.cssText = `left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;border-radius:${b};background:${e.fill || 'transparent'};border:${e.strokeW || 0}px solid ${e.stroke || 'transparent'};opacity:${(e.op == null ? 100 : e.op) / 100};transform:rotate(${e.rot || 0}deg);box-shadow:${e.shadow || 'none'};`;
        if (e.type === 'image') {
            d.innerHTML = e.src ? `<img src="${e.src}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;">` :
                `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#99a;font-size:11px;background:repeating-linear-gradient(45deg,#eef,#eef 8px,#f7f7ff 8px,#f7f7ff 16px);">Ảnh — nhấp đúp để chọn</div>`;
        } else if (e.type !== 'line' && e.type !== 'hotspot') {
            const f = e.font || {};
            const t = document.createElement('div');
            t.className = 'lbl';
            t.style.cssText = `align-items:center;justify-content:${f.align === 'center' ? 'center' : f.align === 'flex-end' ? 'flex-end' : 'flex-start'};font-family:'${f.family}',sans-serif;font-size:${f.size}px;color:${f.color};font-weight:${f.weight};text-align:${f.align === 'center' ? 'center' : f.align === 'flex-end' ? 'right' : 'left'};padding:${e.type === 'input' ? '0 10px' : '2px 6px'};white-space:pre-wrap;word-break:break-word;`;
            t.textContent = e.text || '';
            t.contentEditable = 'false';
            if (!plain) {
                t.addEventListener('input', () => { e.text = t.textContent; clearTimeout(e._t); e._t = setTimeout(() => { push(); renderLayers(); }, 600); });
                t.addEventListener('blur', () => { t.contentEditable = 'false'; e.text = t.textContent; push(); });
            }
            d.appendChild(t);
        }
        if (e.link && e.link.to && !plain) {
            const badge = document.createElement('span');
            badge.className = 'link-badge';
            badge.textContent = e.link.to === 'back' ? '⬅' : '→' + (e.link.to + 1);
            d.appendChild(badge);
        }
        return d;
    }
    function drawHandles() {
        handles.innerHTML = '';
        handles.style.pointerEvents = 'none';
        const e = selEl();
        if (!e) return;
        [[0, 0, 'nw'], [1, 0, 'ne'], [0, 1, 'sw'], [1, 1, 'se']].forEach(([hx, hy, k]) => {
            const h = document.createElement('div');
            h.className = 'hd'; h.dataset.h = k;
            const hs = 9 / S.zoom;
            h.style.cssText += `left:${e.x + e.w * hx - hs / 2}px;top:${e.y + e.h * hy - hs / 2}px;width:${hs}px;height:${hs}px;border-width:${1.6 / S.zoom}px;pointer-events:auto;cursor:${k === 'nw' || k === 'se' ? 'nwse-resize' : 'nesw-resize'};`;
            handles.appendChild(h);
        });
    }
    function renderBoards() {
        const box = document.getElementById('abList');
        document.getElementById('abCount').textContent = '(' + proj.boards.length + ')';
        box.innerHTML = '';
        proj.boards.forEach((b, i) => {
            const d = document.createElement('div');
            d.className = 'ab' + (i === S.board ? ' on' : '');
            const links = b.elements.filter(e => e.link && e.link.to).length;
            d.innerHTML = `<span>▯</span><span class="nm">${esc(b.name)}</span>${links ? `<span style="color:#c9f;font-size:10px;">⇄${links}</span>` : ''}<span class="x" title="Xóa artboard">✕</span>`;
            d.addEventListener('click', ev => {
                if (ev.target.classList.contains('x')) { delBoardAt(i); return; }
                goBoard(i);
            });
            d.querySelector('.nm').addEventListener('dblclick', async () => {
                const n = await TK.prompt('Đổi tên artboard', '', b.name);
                if (n) { b.name = n; render(false); }
            });
            box.appendChild(d);
        });
    }
    function renderLayers() {
        const box = document.getElementById('lyrList');
        box.innerHTML = '';
        const list = B().elements.slice().sort((a, b) => (b.z || 0) - (a.z || 0));
        if (!list.length) box.innerHTML = '<div style="color:#777;font-size:11px;">Artboard trống — chọn công cụ và kéo trên artboard</div>';
        list.forEach(e => {
            const d = document.createElement('div');
            d.className = 'lyr' + (e.id === S.sel ? ' on' : '');
            d.innerHTML = `<span>${({ rect: '▭', ellipse: '◯', text: 'T', button: '🔘', input: '📝', image: '🖼️', line: '─', hotspot: '👆' })[e.type] || '▪'}</span><span class="nm">${esc(e.name)}</span><span data-vis>${e.hidden ? '🚫' : ''}</span><span class="x" style="color:#d99;">✕</span>`;
            d.addEventListener('click', ev => {
                if (ev.target.classList.contains('x')) { B().elements = B().elements.filter(x => x.id !== e.id); if (S.sel === e.id) S.sel = null; render(); return; }
                if (ev.target.dataset.vis != null) { e.hidden = !e.hidden; render(); return; }
                S.sel = e.id; render(false);
            });
            d.querySelector('.nm').addEventListener('dblclick', async () => {
                const n = await TK.prompt('Đổi tên layer', '', e.name);
                if (n) { e.name = n; render(false); }
            });
            box.appendChild(d);
        });
    }
    function renderLinkSelect() {
        const s = document.getElementById('lTo');
        const cur = s.value;
        s.innerHTML = '<option value="">— không làm gì —</option><option value="back">⬅ Quay lại</option>' +
            proj.boards.map((b, i) => `<option value="${i}">→ ${esc(b.name)}</option>`).join('');
        const e = selEl();
        s.value = e && e.link ? String(e.link.to) : '';
        if (s.value === '' && cur) s.value = '';
        const t = document.getElementById('lTr');
        t.value = e && e.link ? e.link.tr : 'none';
    }
    function updateStatus() {
        const b = B();
        document.getElementById('stBoard').textContent = 'Artboard ' + (S.board + 1) + ': ' + b.name;
        document.getElementById('stSize').textContent = b.w + ' × ' + b.h;
        document.getElementById('stElems').textContent = b.elements.length + ' phần tử';
        document.getElementById('stLinks').textContent = proj.boards.reduce((n, x) => n + x.elements.filter(e => e.link && e.link.to).length, 0) + ' liên kết';
        document.getElementById('stZoom').textContent = Math.round(S.zoom * 100) + '%';
        const e = selEl();
        document.getElementById('selInfo').textContent = e ? '— ' + e.type : '— chưa chọn';
        syncPanel();
    }
    function goBoard(i) {
        if (i < 0 || i >= proj.boards.length) return;
        S.board = i; S.sel = null; render(false); zoomFit();
        TK.status('Đang thiết kế: ' + B().name);
    }
    function toHex(c) {
        if (!c || c === 'transparent') return '#ffffff';
        if (c[0] === '#') return c.length === 4 ? '#' + c.slice(1).split('').map(x => x + x).join('') : c;
        const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c);
        return m ? '#' + m.slice(1).map(v => (+v).toString(16).padStart(2, '0')).join('') : '#000000';
    }

    /* ---------- panel ---------- */
    function syncPanel() {
        const e = selEl();
        ['pX', 'pY', 'pW', 'pH', 'pFill', 'pStroke', 'pStrokeW', 'pRadius', 'pOp', 'pShadow', 'tText', 'tSize', 'tFamily', 'tColor', 'tWeight'].forEach(id => { if (!e) document.getElementById(id).value = ''; });
        if (!e) return;
        document.getElementById('pX').value = Math.round(e.x);
        document.getElementById('pY').value = Math.round(e.y);
        document.getElementById('pW').value = Math.round(e.w);
        document.getElementById('pH').value = Math.round(e.h);
        document.getElementById('pFill').value = toHex(e.fill);
        document.getElementById('pStroke').value = toHex(e.stroke);
        document.getElementById('pStrokeW').value = e.strokeW || 0;
        document.getElementById('pRadius').value = e.radius || 0;
        document.getElementById('pOp').value = e.op == null ? 100 : e.op;
        document.getElementById('pOpV').textContent = e.op == null ? 100 : e.op;
        document.getElementById('pShadow').value = e.shadow || '';
        document.getElementById('tText').value = e.text || '';
        document.getElementById('tSize').value = e.font.size;
        document.getElementById('tFamily').value = e.font.family;
        document.getElementById('tColor').value = toHex(e.font.color);
        document.getElementById('tWeight').value = e.font.weight;
        document.querySelectorAll('[data-action="alignText"]').forEach(b => b.classList.toggle('on', b.dataset.arg === e.font.align));
    }
    function bindPanel() {
        const set = (id, fn, live) => {
            const e = document.getElementById(id);
            const run = () => { const el = selEl(); if (el) { fn(el, e.value); renderBoard(); updateStatus(); } };
            e.addEventListener(live ? 'input' : 'change', run);
            e.addEventListener('change', () => push());
        };
        set('pX', (el, v) => el.x = +v || 0); set('pY', (el, v) => el.y = +v || 0);
        set('pW', (el, v) => el.w = Math.max(4, +v || 4)); set('pH', (el, v) => el.h = Math.max(4, +v || 4));
        set('pFill', (el, v) => el.fill = v); set('pStroke', (el, v) => el.stroke = v);
        set('pStrokeW', (el, v) => el.strokeW = +v || 0); set('pRadius', (el, v) => el.radius = +v || 0);
        set('pShadow', (el, v) => el.shadow = v);
        set('pOp', (el, v) => { el.op = +v; document.getElementById('pOpV').textContent = el.op; }, true);
        set('tText', (el, v) => el.text = v, true);
        set('tSize', (el, v) => el.font.size = Math.max(4, +v || 14));
        set('tFamily', (el, v) => el.font.family = v);
        set('tColor', (el, v) => el.font.color = v);
        set('tWeight', (el, v) => el.font.weight = v);
        document.getElementById('bName').addEventListener('change', e => { B().name = e.target.value || B().name; render(false); });
        document.getElementById('bBg').addEventListener('input', e => { B().bg = e.target.value; renderBoard(); });
        document.getElementById('bBg').addEventListener('change', () => push());
        document.getElementById('deviceSel').addEventListener('change', e => {
            const [w, h] = e.target.value.split('x').map(Number);
            B().w = w; B().h = h; render(); zoomFit();
            TK.toast('Artboard đổi thành ' + w + '×' + h, 'ok');
        });
        document.getElementById('lTo').addEventListener('change', e => {
            const el = selEl();
            if (!el) { TK.toast('Chọn phần tử trước khi gắn liên kết', 'error'); e.target.value = ''; return; }
            el.link.to = e.target.value === '' ? '' : (e.target.value === 'back' ? 'back' : +e.target.value);
            render(false); renderLayers();
            TK.status(el.link.to === '' ? 'Đã bỏ liên kết' : 'Khi bấm → ' + (el.link.to === 'back' ? 'quay lại' : proj.boards[el.link.to].name));
            push();
        });
        document.getElementById('lTr').addEventListener('change', e => {
            const el = selEl(); if (!el) return;
            el.link.tr = e.target.value; push(); TK.status('Hiệu ứng chuyển: ' + e.target.value);
        });
        const SW = ['#7b2ff7', '#ff61f6', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#ffffff', '#111111', '#f1f5f9'];
        document.getElementById('swatches').innerHTML = SW.map(c => `<div style="background:${c}" data-c="${c}" title="${c}"></div>`).join('');
        document.querySelectorAll('#swatches div').forEach(d => d.addEventListener('click', () => {
            const el = selEl();
            if (!el) return TK.toast('Chọn phần tử để tô màu', 'error');
            el.fill = d.dataset.c; render(); TK.status('Nền: ' + d.dataset.c);
        }));
    }

    /* ---------- tương tác ---------- */
    let drag = null;
    boardWrap.addEventListener('pointerdown', e => {
        const h = e.target.dataset && e.target.dataset.h;
        const el = e.target.closest('.elem');
        boardWrap.setPointerCapture(e.pointerId);
        const p = local(e);
        if (h && S.sel) {
            const s = selEl();
            drag = { mode: 'resize', h, s, p0: p, x0: s.x, y0: s.y, w0: s.w, h0: s.h };
            return;
        }
        if (S.tool === 'select') {
            if (el) { S.sel = el.dataset.id; renderBoard(); renderLayers(); updateStatus(); const s = selEl(); drag = { mode: 'move', s, p0: p, x0: s.x, y0: s.y }; }
            else { S.sel = null; renderBoard(); renderLayers(); updateStatus(); }
            return;
        }
        drag = { mode: 'create', p0: p };
    });
    boardWrap.addEventListener('pointermove', e => {
        if (!drag) return;
        const p = local(e);
        if (drag.mode === 'move') {
            drag.s.x = Math.round(drag.x0 + p.x - drag.p0.x);
            drag.s.y = Math.round(drag.y0 + p.y - drag.p0.y);
            if (e.shiftKey) drag.s.y = drag.y0;
            renderBoard(); syncPanel();
        } else if (drag.mode === 'resize') {
            const s = drag.s, dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
            if (drag.h === 'se') { s.w = Math.max(6, Math.round(drag.w0 + dx)); s.h = Math.max(6, Math.round(drag.h0 + dy)); }
            if (drag.h === 'nw') { s.x = Math.round(drag.x0 + dx); s.y = Math.round(drag.y0 + dy); s.w = Math.max(6, Math.round(drag.w0 - dx)); s.h = Math.max(6, Math.round(drag.h0 - dy)); }
            if (drag.h === 'ne') { s.y = Math.round(drag.y0 + dy); s.w = Math.max(6, Math.round(drag.w0 + dx)); s.h = Math.max(6, Math.round(drag.h0 - dy)); }
            if (drag.h === 'sw') { s.x = Math.round(drag.x0 + dx); s.w = Math.max(6, Math.round(drag.w0 - dx)); s.h = Math.max(6, Math.round(drag.h0 + dy)); }
            if (e.shiftKey) s.h = s.w;
            renderBoard(); syncPanel();
        } else if (drag.mode === 'create') {
            if (!drag.box) {
                drag.box = document.createElement('div');
                drag.box.style.cssText = 'position:absolute;border:1.5px dashed #ff61f6;background:rgba(255,97,246,.12);pointer-events:none;z-index:99;';
                boardWrap.appendChild(drag.box);
            }
            const x = Math.min(p.x, drag.p0.x), y = Math.min(p.y, drag.p0.y);
            const w = Math.abs(p.x - drag.p0.x), h = Math.abs(p.y - drag.p0.y);
            drag.box.style.left = x * S.zoom + 'px'; drag.box.style.top = y * S.zoom + 'px';
            drag.box.style.width = w * S.zoom + 'px'; drag.box.style.height = h * S.zoom + 'px';
            drag.rect = { x, y, w, h };
        }
    });
    boardWrap.addEventListener('pointerup', async e => {
        if (!drag) return;
        if (drag.mode === 'create') {
            if (drag.box) drag.box.remove();
            const t = S.tool;
            let r = drag.rect;
            if (!r || r.w < 6 || r.h < 6) {
                const p = local(e);
                const def = { rect: [180, 120], ellipse: [120, 120], text: [200, 30], button: [180, 48], input: [240, 44], image: [220, 150], line: [240, 2], hotspot: [120, 120] }[t] || [160, 100];
                r = { x: p.x - def[0] / 2, y: p.y - def[1] / 2, w: def[0], h: def[1] };
            }
            if (t === 'image') {
                const el = mkEl('image', { x: r.x, y: r.y, w: r.w, h: r.h });
                B().elements.push(el); S.sel = el.id; render();
                await pickImageFor(el);
            } else {
                const preset = {
                    rect: { fill: '#ede9fe', radius: 10 },
                    ellipse: { fill: '#7b2ff7' },
                    text: { text: 'Chữ mẫu' },
                    button: { text: 'Nút bấm', fill: '#7b2ff7', radius: 10, shadow: '0 2px 8px rgba(0,0,0,.18)' },
                    input: { text: 'Nhập nội dung…' },
                    line: {}, hotspot: {}
                }[t] || {};
                const el = mkEl(t, Object.assign({ x: r.x, y: r.y, w: r.w, h: r.h }, preset));
                B().elements.push(el); S.sel = el.id; render();
                TK.status('Đã thêm ' + t + ' ' + Math.round(r.w) + '×' + Math.round(r.h) + (t === 'hotspot' ? ' — gắn liên kết ở panel phải' : ''));
            }
            setTool('select');
        } else push();
        drag = null;
        renderBoard(); renderLayers(); updateStatus();
    });
    function local(e) {
        const r = board.getBoundingClientRect();
        return { x: (e.clientX - r.left) / S.zoom, y: (e.clientY - r.top) / S.zoom };
    }
    boardWrap.addEventListener('dblclick', async e => {
        const el = e.target.closest('.elem');
        if (!el) return;
        const s = elem(el.dataset.id);
        S.sel = s.id;
        if (s.type === 'image') return pickImageFor(s);
        const t = el.querySelector('.lbl');
        if (t) {
            t.contentEditable = 'true'; t.focus();
            const rng = document.createRange(); rng.selectNodeContents(t); rng.collapse(false);
            const g = window.getSelection(); g.removeAllRanges(); g.addRange(rng);
            TK.status('Đang sửa chữ — click ra ngoài để lưu');
        }
    });
    async function pickImageFor(s) {
        const f = await TK.pickFile('image/*');
        if (!f) { TK.toast('Chưa chọn ảnh — khung ảnh vẫn ở đó, nhấp đúp để chọn lại'); return; }
        s.src = await TK.readAsDataURL(f);
        render(); TK.toast('Đã chèn ảnh ' + f.name, 'ok');
    }

    /* ---------- lịch sử ---------- */
    function push() { hist.push(JSON.stringify(proj) + '|' + S.board + '|' + (S.sel || '')); }
    function restore(v) {
        const [json, bi, sel] = v.split('|');
        const p = JSON.parse(json);
        proj.name = p.name; proj.boards = p.boards;
        S.board = TK.clamp(+bi || 0, 0, proj.boards.length - 1);
        S.sel = sel || null;
        S.uid = 1 + Math.max(0, ...proj.boards.flatMap(b => b.elements.map(e => parseInt(String(e.id).replace(/\D/g, '')) || 0)));
        render(false);
    }

    /* ---------- thao tác ---------- */
    const A = {
        undo() { if (hist.canUndo()) { restore(hist.undo()); TK.status('↶ Hoàn tác'); } else TK.toast('Không còn gì để hoàn tác'); },
        redo() { if (hist.canRedo()) { restore(hist.redo()); TK.status('↷ Làm lại'); } else TK.toast('Không còn gì để làm lại'); },
        addBoard() {
            const [w, h] = document.getElementById('deviceSel').value.split('x').map(Number);
            proj.boards.push(mkBoard('Màn hình ' + (proj.boards.length + 1), w, h));
            S.board = proj.boards.length - 1; S.sel = null; render(); zoomFit();
        },
        dupBoard() {
            const c = JSON.parse(JSON.stringify(B()));
            c.id = 'b' + S.uid++; c.name = B().name + ' copy';
            c.elements.forEach(e => e.id = 'e' + S.uid++);
            proj.boards.splice(S.board + 1, 0, c); S.board++; S.sel = null; render(); zoomFit();
            TK.toast('Đã nhân đôi artboard', 'ok');
        },
        async delBoard() { await delBoardAt(S.board); },
        clearBoard() {
            if (!B().elements.length) return TK.toast('Artboard đã trống');
            B().elements = []; S.sel = null; render(); TK.toast('Đã xóa hết phần tử', 'ok');
        },
        duplicate() {
            const e = selEl(); if (!e) return TK.toast('Chưa chọn phần tử', 'error');
            const c = JSON.parse(JSON.stringify(e));
            c.id = 'e' + S.uid++; c.x += 12; c.y += 12; c.z = B().elements.length; c.name = e.name + ' copy';
            B().elements.push(c); S.sel = c.id; render();
        },
        deleteElem() {
            const e = selEl(); if (!e) return TK.toast('Chưa chọn phần tử', 'error');
            B().elements = B().elements.filter(x => x.id !== e.id); S.sel = null; render();
        },
        front() { const e = selEl(); if (!e) return TK.toast('Chưa chọn', 'error'); e.z = Math.max(...B().elements.map(x => x.z || 0)) + 1; render(); },
        back() { const e = selEl(); if (!e) return TK.toast('Chưa chọn', 'error'); e.z = Math.min(...B().elements.map(x => x.z || 0)) - 1; render(); },
        align(ev, elm) {
            const e = selEl(); if (!e) return TK.toast('Chưa chọn phần tử', 'error');
            const b = B(), a = elm.dataset.arg;
            if (a === 'left') e.x = 0; if (a === 'right') e.x = b.w - e.w; if (a === 'centerH') e.x = (b.w - e.w) / 2;
            if (a === 'top') e.y = 0; if (a === 'bottom') e.y = b.h - e.h; if (a === 'centerV') e.y = (b.h - e.h) / 2;
            e.x = Math.round(e.x); e.y = Math.round(e.y);
            render(); TK.status('Đã căn ' + a);
        },
        alignText(ev, elm) { const e = selEl(); if (!e) return TK.toast('Chưa chọn', 'error'); e.font.align = elm.dataset.arg; render(); },
        noFill() { const e = selEl(); if (!e) return TK.toast('Chưa chọn', 'error'); e.fill = 'transparent'; render(); },
        rotateElem(ev, elm) { const e = selEl(); if (!e) return TK.toast('Chưa chọn', 'error'); e.rot = ((e.rot || 0) + (+elm.dataset.arg)) % 360; render(); },
        transparentBg() { B().bg = 'transparent'; renderBoard(); TK.toast('Nền artboard: trong suốt (khi xuất PNG sẽ giữ alpha)', 'ok'); },
        makeComponent() {
            const e = selEl(); if (!e) return TK.toast('Chọn khối muốn biến thành nút', 'error');
            e.type = 'button';
            if (!e.text) e.text = 'Nút bấm';
            e.font.color = '#ffffff'; e.font.weight = '700'; e.font.align = 'center';
            if (e.fill === 'transparent') e.fill = '#7b2ff7';
            e.shadow = e.shadow || '0 2px 8px rgba(0,0,0,.18)';
            render(); TK.toast('Đã chuyển thành nút bấm — gắn liên kết ở panel Prototype', 'ok');
        },
        deviceFrame() { S.device = !S.device; renderBoard(); TK.toast(S.device ? 'Khung thiết bị: BẬT' : 'Khung thiết bị: TẮT'); },
        zoomIn() { S.zoom = TK.clamp(S.zoom * 1.15, 0.05, 4); renderBoard(); updateStatus(); },
        zoomOut() { S.zoom = TK.clamp(S.zoom / 1.15, 0.05, 4); renderBoard(); updateStatus(); },
        zoom100() { S.zoom = 1; renderBoard(); updateStatus(); },
        async setLink() {
            const e = selEl(); if (!e) return TK.toast('Chọn phần tử cần gắn liên kết', 'error');
            const opts = proj.boards.map((b, i) => `${i + 1}. ${b.name}`).join('\n');
            const v = await TK.prompt('Gắn liên kết', 'Bấm vào phần tử này sẽ chuyển tới artboard số mấy?\n\n' + opts + '\n\nGõ "back" để quay lại, gõ số 0 để bỏ liên kết.', e.link.to === 'back' ? 'back' : (e.link.to === '' ? '0' : String(+e.link.to + 1)));
            if (v == null) return;
            const k = String(v).trim().toLowerCase();
            if (k === 'back') e.link.to = 'back';
            else { const n = parseInt(k, 10); e.link.to = (!n || n < 1 || n > proj.boards.length) ? '' : n - 1; }
            render(false); renderLayers(); push();
            TK.toast(e.link.to === '' ? 'Đã bỏ liên kết' : 'Đã gắn → ' + (e.link.to === 'back' ? 'quay lại' : proj.boards[e.link.to].name), 'ok');
        },
        clearLink() { const e = selEl(); if (!e) return TK.toast('Chưa chọn', 'error'); e.link.to = ''; render(); TK.toast('Đã bỏ liên kết của phần tử'); },
        async newProject() {
            const v = await TK.prompt('Dự án mới', 'Gõ tên dự án (sẽ tạo 3 artboard mobile kèm mẫu đăng nhập):', 'App của tôi');
            if (!v) return;
            proj.name = v; proj.boards = []; S.uid = 1; S.sel = null;
            addTemplateBoards();
            render(); zoomFit();
            TK.toast('Đã tạo dự án "' + v + '" với ' + proj.boards.length + ' artboard', 'ok');
        },
        saveProject() { TK.download(new Blob([JSON.stringify(proj, null, 1)], { type: 'application/json' }), (proj.name || 'xprototype').replace(/\s+/g, '-') + '.json'); },
        async openProject() {
            const f = await TK.pickFile('.json,application/json');
            if (!f) return;
            try {
                const j = JSON.parse(await TK.readAsText(f));
                if (!j.boards || !j.boards.length) throw new Error('không có boards');
                proj.name = j.name || 'Dự án'; proj.boards = j.boards;
                S.board = 0; S.sel = null;
                S.uid = 1 + Math.max(0, ...proj.boards.flatMap(b => b.elements.map(e => parseInt(String(e.id).replace(/\D/g, '')) || 0)));
                render(); zoomFit(); TK.toast('Đã mở ' + f.name + ' (' + proj.boards.length + ' artboard)', 'ok');
            } catch (e) { TK.toast('File lỗi: ' + e.message, 'error'); }
        },
        async importImage() {
            const f = await TK.pickFile('image/*');
            if (!f) return;
            const src = await TK.readAsDataURL(f);
            const img = await TK.loadImage(src).catch(() => null);
            const el = mkEl('image', { x: 20, y: 20, w: img ? Math.min(img.width, B().w - 40) : 240, h: img ? Math.round((img ? Math.min(img.width, B().w - 40) : 240) * (img.height / img.width)) : 160, src });
            B().elements.push(el); S.sel = el.id; render();
            TK.toast('Đã chèn ảnh ' + f.name, 'ok');
        },
        exportPng() { exportPng(); },
        exportHtml() {
            const html = buildDemoHtml();
            TK.download(new Blob([html], { type: 'text/html' }), (proj.name || 'prototype').replace(/\s+/g, '-') + '-demo.html');
        },
        addTemplate(ev, elm) { addTemplate(elm.dataset.arg); },
        preview() { openPreview(); },
        pvClose() { closePreview(); },
        pvBack() { pvGo('back'); },
        pvRestart() { openPreview(0); },
        linkMap() { showFlowMap(); },
        async aiUi() {
            const p = await TK.prompt('✨ AI tạo giao diện', 'Mô tả màn hình/app (AI sinh artboard + phần tử + liên kết thật):', 'App đặt lịch hẹn: màn hình đăng nhập, trang chủ có 3 thẻ dịch vụ và nút "Đặt ngay" chuyển sang màn hình xác nhận');
            if (!p) return;
            TK.status('AI đang sinh giao diện…');
            try {
                const j = await TK.ai(`Thiết kế UI theo mô tả: "${p}". Kích thước tham chiếu mobile 393x852 (hoặc desktop 1440x900 nếu mô tả web).
Trả JSON: {"name":"tên dự án","boards":[{"name":"Màn hình 1","w":393,"h":852,"bg":"#ffffff","elements":[{"type":"rect|ellipse|text|button|input|image|line|hotspot","x":20,"y":40,"w":300,"h":60,"fill":"#7b2ff7","stroke":"#000000","strokeW":0,"radius":12,"shadow":"","text":"chữ","size":16,"color":"#ffffff","weight":"700","align":"center","linkTo":1,"linkTr":"slide","name":"ten layer"}]}]}
linkTo = số thứ tự artboard đích (bắt đầu từ 1), hoặc "back", hoặc bỏ trống. Dùng 8-20 phần tử/màn hình, bố cục hợp lý như designer thật. CHỈ trả JSON.`, { json: true, system: 'Bạn là UI/UX designer. Chỉ trả JSON hợp lệ.' });
                if (!j || !j.boards || !j.boards.length) throw new Error('AI không trả về boards');
                applyAi(j);
                TK.toast('✨ AI đã tạo ' + j.boards.length + ' artboard', 'ok');
            } catch (e) {
                TK.toast('AI lỗi (' + RuneAI.humanError(e.message) + ') → dùng mẫu dựng sẵn theo từ khóa', 'error');
                proj.boards = []; addTemplateBoards(p); render(); zoomFit();
            }
        }
    };
    async function delBoardAt(i) {
        if (proj.boards.length === 1) return TK.toast('Cần ít nhất 1 artboard', 'error');
        if (!(await TK.confirm('Xóa artboard', 'Xóa "' + proj.boards[i].name + '"? Các liên kết trỏ tới nó sẽ bị gỡ.'))) return;
        proj.boards.splice(i, 1);
        proj.boards.forEach(b => b.elements.forEach(e => { if (e.link && e.link.to !== 'back' && +e.link.to >= proj.boards.length) e.link.to = ''; }));
        S.board = TK.clamp(S.board, 0, proj.boards.length - 1); S.sel = null;
        render(); zoomFit();
    }

    function applyAi(j) {
        proj.name = j.name || proj.name;
        proj.boards = [];
        j.boards.forEach((b, bi) => {
            const nb = mkBoard(b.name || ('Màn hình ' + (bi + 1)), +b.w || 393, +b.h || 852);
            if (b.bg) nb.bg = b.bg;
            (b.elements || []).forEach((e, ei) => {
                const type = ['rect', 'ellipse', 'text', 'button', 'input', 'image', 'line', 'hotspot'].includes(e.type) ? e.type : 'rect';
                const ne = mkEl(type, {
                    x: +e.x || 0, y: +e.y || 0, w: Math.max(4, +e.w || 100), h: Math.max(4, +e.h || 40),
                    fill: e.fill || (type === 'text' ? 'transparent' : '#7b2ff7'), stroke: e.stroke || '#000', strokeW: +e.strokeW || 0,
                    radius: e.radius == null ? (type === 'ellipse' ? 999 : 8) : +e.radius, shadow: e.shadow || '',
                    text: e.text != null ? String(e.text) : '', src: e.src || '', rot: +e.rot || 0, op: e.op == null ? 100 : +e.op, z: ei,
                    name: e.name || (type + ' ' + (ei + 1))
                });
                if (e.size) ne.font.size = +e.size;
                if (e.color) ne.font.color = e.color;
                if (e.weight) ne.font.weight = String(e.weight);
                if (e.align) ne.font.align = ['center', 'flex-end', 'flex-start'].includes(e.align) ? e.align : 'center';
                if (e.family) ne.font.family = e.family;
                if (e.linkTo != null && e.linkTo !== '') ne.link.to = e.linkTo === 'back' ? 'back' : (isNaN(+e.linkTo) ? '' : +e.linkTo - 1);
                if (e.linkTr) ne.link.tr = e.linkTr;
                nb.elements.push(ne);
            });
            proj.boards.push(nb);
        });
        // chuẩn hóa linkTo vượt quá số artboard
        proj.boards.forEach(b => b.elements.forEach(e => {
            if (e.link && typeof e.link.to === 'number' && (e.link.to < 0 || e.link.to >= proj.boards.length)) e.link.to = '';
        }));
        S.board = 0; S.sel = null;
        render(); zoomFit();
    }

    /* ---------- mẫu dựng sẵn ---------- */
    function addTemplate(which) {
        const b = B();
        const W = b.w;
        const add = (type, o) => { const e = mkEl(type, Object.assign({ z: b.elements.length }, o)); b.elements.push(e); return e; };
        if (which === 'login') {
            add('rect', { x: 0, y: 0, w: W, h: b.h, fill: '#0f172a', radius: 0, name: 'nền' });
            add('ellipse', { x: W / 2 - 44, y: 110, w: 88, h: 88, fill: '#7b2ff7', name: 'logo' });
            add('text', { x: 20, y: 214, w: W - 40, h: 34, text: 'Chào mừng trở lại', size: 24, color: '#ffffff', weight: '700', align: 'center', fill: 'transparent', name: 'tiêu đề' });
            add('text', { x: 20, y: 250, w: W - 40, h: 20, text: 'Đăng nhập để tiếp tục', size: 13, color: '#94a3b8', weight: '400', align: 'center', fill: 'transparent' });
            add('input', { x: 28, y: 300, w: W - 56, h: 48, text: 'Email', name: 'ô email' });
            add('input', { x: 28, y: 362, w: W - 56, h: 48, text: 'Mật khẩu', name: 'ô mật khẩu' });
            const btn = add('button', { x: 28, y: 436, w: W - 56, h: 50, text: 'Đăng nhập', fill: '#7b2ff7', radius: 12, shadow: '0 8px 24px rgba(123,47,247,.4)', name: 'nút đăng nhập' });
            add('text', { x: 20, y: 500, w: W - 40, h: 20, text: 'Quên mật khẩu?', size: 12, color: '#94a3b8', weight: '400', align: 'center', fill: 'transparent' });
            if (proj.boards.length > 1) { btn.link.to = TK.clamp(S.board + 1, 0, proj.boards.length - 1); btn.link.tr = 'slide'; }
            S.sel = btn.id;
        } else if (which === 'home') {
            add('rect', { x: 0, y: 0, w: W, h: b.h, fill: '#f8fafc', radius: 0, name: 'nền' });
            add('rect', { x: 0, y: 0, w: W, h: 88, fill: '#ffffff', radius: 0, shadow: '0 2px 8px rgba(0,0,0,.06)', name: 'header' });
            add('text', { x: 20, y: 30, w: W - 100, h: 30, text: 'Xin chào 👋', size: 20, color: '#0f172a', weight: '700', align: 'flex-start', fill: 'transparent' });
            add('ellipse', { x: W - 56, y: 26, w: 38, h: 38, fill: '#fbbf24', name: 'avatar' });
            add('rect', { x: 20, y: 104, w: W - 40, h: 130, fill: 'linear-gradient(135deg,#7b2ff7,#ff61f6)', radius: 18, shadow: '0 12px 30px rgba(123,47,247,.3)', name: 'banner' });
            add('text', { x: 38, y: 140, w: W - 120, h: 26, text: 'Ưu đãi hôm nay', size: 18, color: '#ffffff', weight: '700', align: 'flex-start', fill: 'transparent' });
            add('text', { x: 38, y: 170, w: W - 120, h: 40, text: 'Giảm 30% cho gói Pro', size: 13, color: '#f1e9ff', weight: '400', align: 'flex-start', fill: 'transparent' });
            ['Chỉnh ảnh', 'Dựng video', 'Viết bài'].forEach((t, i) => {
                const y = 258 + i * 96;
                add('rect', { x: 20, y, w: W - 40, h: 82, fill: '#ffffff', radius: 14, shadow: '0 2px 10px rgba(0,0,0,.07)', name: 'thẻ ' + (i + 1) });
                add('rect', { x: 34, y: y + 17, w: 48, h: 48, fill: ['#22d3ee', '#34d399', '#fb7185'][i], radius: 12, name: 'icon ' + (i + 1) });
                add('text', { x: 96, y: y + 18, w: W - 140, h: 22, text: t, size: 15, color: '#0f172a', weight: '600', align: 'flex-start', fill: 'transparent' });
                add('text', { x: 96, y: y + 44, w: W - 140, h: 20, text: 'Mở công cụ trong RUNE', size: 12, color: '#94a3b8', weight: '400', align: 'flex-start', fill: 'transparent' });
            });
            add('rect', { x: 0, y: b.h - 74, w: W, h: 74, fill: '#ffffff', radius: 0, shadow: '0 -2px 10px rgba(0,0,0,.06)', name: 'tabbar' });
            ['🏠', '🔍', '➕', '❤', '👤'].forEach((t, i) => add('text', { x: 12 + i * (W - 24) / 5, y: b.h - 56, w: (W - 24) / 5, h: 34, text: t, size: 20, color: '#334155', weight: '400', align: 'center', fill: 'transparent', name: 'tab ' + (i + 1) }));
        } else if (which === 'list') {
            add('rect', { x: 0, y: 0, w: W, h: b.h, fill: '#ffffff', radius: 0 });
            add('text', { x: 20, y: 24, w: W - 40, h: 32, text: 'Danh sách', size: 22, color: '#111827', weight: '800', align: 'flex-start', fill: 'transparent' });
            add('input', { x: 20, y: 66, w: W - 40, h: 40, text: '🔍  Tìm kiếm…', radius: 20, name: 'tìm kiếm' });
            for (let i = 0; i < 5; i++) {
                const y = 124 + i * 104;
                add('rect', { x: 16, y, w: W - 32, h: 92, fill: '#f8fafc', radius: 12, stroke: '#e2e8f0', strokeW: 1, name: 'thẻ ' + (i + 1) });
                add('image', { x: 28, y: y + 12, w: 68, h: 68, radius: 10, name: 'ảnh ' + (i + 1) });
                add('text', { x: 108, y: y + 16, w: W - 140, h: 22, text: 'Mục số ' + (i + 1), size: 15, color: '#0f172a', weight: '700', align: 'flex-start', fill: 'transparent' });
                add('text', { x: 108, y: y + 40, w: W - 140, h: 36, text: 'Mô tả ngắn gọn cho mục này, hai dòng vừa đủ để xem trước.', size: 12, color: '#94a3b8', weight: '400', align: 'flex-start', fill: 'transparent' });
            }
            add('button', { x: W - 84, y: b.h - 100, w: 60, h: 60, text: '＋', fill: '#ff61f6', radius: 999, shadow: '0 8px 22px rgba(255,97,246,.45)', name: 'FAB' });
        } else {
            // landing desktop
            const b2 = B();
            add('rect', { x: 0, y: 0, w: b2.w, h: b2.h, fill: '#0b1020', radius: 0 });
            add('text', { x: 40, y: 28, w: 200, h: 28, text: '⬡ RUNE', size: 20, color: '#ffffff', weight: '800', align: 'flex-start', fill: 'transparent' });
            ['Sản phẩm', 'Bảng giá', 'Tài liệu', 'Liên hệ'].forEach((t, i) => add('text', { x: b2.w - 480 + i * 110, y: 32, w: 100, h: 22, text: t, size: 13, color: '#cbd5e1', weight: '500', align: 'center', fill: 'transparent' }));
            add('button', { x: b2.w - 130, y: 22, w: 100, h: 38, text: 'Dùng thử', fill: '#7b2ff7', radius: 10 });
            add('text', { x: 60, y: 170, w: b2.w - 120, h: 120, text: 'Mọi công cụ sáng tạo\ntrong một trình duyệt', size: 52, color: '#ffffff', weight: '800', align: 'center', fill: 'transparent', name: 'headline' });
            add('text', { x: 120, y: 310, w: b2.w - 240, h: 60, text: 'Chỉnh ảnh, dựng phim, dàn trang, soạn thảo — không cần cài đặt, dữ liệu ở lại máy bạn.', size: 17, color: '#94a3b8', weight: '400', align: 'center', fill: 'transparent' });
            add('button', { x: b2.w / 2 - 190, y: 400, w: 170, h: 52, text: 'Bắt đầu miễn phí', fill: '#ff61f6', radius: 12, shadow: '0 10px 30px rgba(255,97,246,.4)' });
            add('button', { x: b2.w / 2 + 20, y: 400, w: 170, h: 52, text: 'Xem demo', fill: 'transparent', stroke: '#334155', strokeW: 1.5, radius: 12, name: 'nút phụ' });
            for (let i = 0; i < 3; i++) {
                const x = 60 + i * ((b2.w - 120) / 3 + 10);
                add('rect', { x, y: 500, w: (b2.w - 160) / 3, h: 240, fill: '#131a30', radius: 16, stroke: '#1f2a44', strokeW: 1, name: 'tính năng ' + (i + 1) });
                add('ellipse', { x: x + 24, y: 524, w: 44, h: 44, fill: ['#22d3ee', '#34d399', '#fbbf24'][i] });
                add('text', { x: x + 20, y: 584, w: (b2.w - 200) / 3, h: 26, text: ['Nhanh', 'Riêng tư', 'Miễn phí'][i], size: 18, color: '#fff', weight: '700', align: 'flex-start', fill: 'transparent' });
                add('text', { x: x + 20, y: 614, w: (b2.w - 200) / 3, h: 100, text: 'Mô tả ngắn về lợi ích của tính năng này với người dùng mới.', size: 13, color: '#94a3b8', weight: '400', align: 'flex-start', fill: 'transparent' });
            }
        }
        render(); TK.toast('Đã thêm mẫu "' + which + '" vào artboard hiện tại', 'ok');
    }
    function addTemplateBoards(seed) {
        const [w, h] = document.getElementById('deviceSel').value.split('x').map(Number);
        proj.boards.push(mkBoard('Đăng nhập', w, h));
        proj.boards.push(mkBoard('Trang chủ', w, h));
        proj.boards.push(mkBoard('Danh sách', w, h));
        const keep = S.board;
        S.board = 0; addTemplate('login');
        S.board = 1; addTemplate('home');
        S.board = 2; addTemplate('list');
        // nối liên kết: login -> home, home -> list
        const loginBtn = proj.boards[0].elements.filter(e => e.type === 'button')[0];
        if (loginBtn) { loginBtn.link = { to: 1, tr: 'slide' }; }
        const homeCard = proj.boards[1].elements.filter(e => e.name && e.name.indexOf('thẻ 1') === 0)[0];
        if (homeCard) homeCard.link = { to: 2, tr: 'fade' };
        proj.boards[2].elements.forEach(e => { if (e.name === 'FAB') e.link = { to: 'back', tr: 'pop' }; });
        S.board = keep < proj.boards.length ? keep : 0;
        if (seed) TK.status('Đã dựng 3 màn hình mẫu theo yêu cầu: ' + seed);
    }

    /* ---------- preview (prototype chạy thật) ---------- */
    let pvState = { stack: [], idx: 0 };
    function openPreview(startIdx) {
        const idx = startIdx == null ? S.board : startIdx;
        pvState = { stack: [idx], idx };
        document.getElementById('preview').classList.add('show');
        pvRender(idx, 'none');
        TK.status('▶ Đang chạy prototype — bấm vào phần tử có mũi tên để chuyển màn hình, Esc để thoát');
    }
    function closePreview() {
        document.getElementById('preview').classList.remove('show');
        document.getElementById('pvStage').innerHTML = '';
    }
    function pvRender(idx, tr) {
        const b = proj.boards[idx];
        if (!b) return closePreview();
        const st = document.getElementById('pvStage');
        const scale = Math.min((window.innerHeight - 130) / b.h, (window.innerWidth - 80) / b.w, 1.4);
        st.style.width = (b.w * scale) + 'px';
        st.style.height = (b.h * scale) + 'px';
        document.getElementById('pvName').textContent = b.name + ' (' + (idx + 1) + '/' + proj.boards.length + ')';
        const inner = document.createElement('div');
        inner.style.cssText = `position:absolute;inset:0;width:${b.w}px;height:${b.h}px;background:${b.bg};transform:scale(${scale});transform-origin:top left;overflow:hidden;border-radius:${b.h > b.w * 1.4 ? 24 / scale : 0}px;`;
        b.elements.slice().sort((p, q) => (p.z || 0) - (q.z || 0)).forEach(e => {
            if (e.hidden) return;
            const n = nodeOf(e, true);
            n.classList.remove('sel');
            n.style.cursor = (e.link && e.link.to !== '') ? 'pointer' : 'default';
            if (e.link && e.link.to !== '') n.addEventListener('click', () => pvGo(e.link.to, e.link.tr));
            inner.appendChild(n);
        });
        st.innerHTML = '';
        st.appendChild(inner);
        // hiệu ứng chuyển cảnh
        st.style.transition = 'none';
        st.style.opacity = '1'; st.style.transform = 'none';
        if (tr === 'fade') { st.style.opacity = '0'; requestAnimationFrame(() => { st.style.transition = 'opacity .3s'; st.style.opacity = '1'; }); }
        else if (tr === 'slide') { st.style.transform = 'translateX(40px)'; st.style.opacity = '0'; requestAnimationFrame(() => { st.style.transition = 'transform .3s, opacity .3s'; st.style.transform = 'none'; st.style.opacity = '1'; }); }
        else if (tr === 'dissolve') { st.style.filter = 'blur(6px)'; st.style.opacity = '0'; requestAnimationFrame(() => { st.style.transition = 'filter .35s, opacity .35s'; st.style.filter = 'none'; st.style.opacity = '1'; }); }
        else if (tr === 'pop') { st.style.transform = 'scale(.9)'; st.style.opacity = '0'; requestAnimationFrame(() => { st.style.transition = 'transform .28s cubic-bezier(.2,1.4,.4,1), opacity .28s'; st.style.transform = 'none'; st.style.opacity = '1'; }); }
    }
    function pvGo(to, tr) {
        const cur = pvState.idx;
        let next;
        if (to === 'back') { if (pvState.stack.length > 1) { pvState.stack.pop(); next = pvState.stack[pvState.stack.length - 1]; } else { TK.toast('Đây là màn hình đầu tiên — không có gì để quay lại'); return; } }
        else next = TK.clamp(+to, 0, proj.boards.length - 1);
        if (next === cur) return;
        if (to !== 'back') pvState.stack.push(next);
        pvState.idx = next;
        pvRender(next, tr || 'fade');
    }

    /* ---------- sơ đồ flow ---------- */
    function showFlowMap() {
        const old = document.getElementById('flowMap'); if (old) old.remove();
        const wrap = document.createElement('div');
        wrap.id = 'flowMap';
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,16,.94);z-index:9500;display:flex;flex-direction:column;padding:18px;gap:12px;';
        const cols = Math.min(5, Math.max(1, proj.boards.length));
        const bw = Math.min(170, (window.innerWidth - 80) / cols), bh = bw * 0.6;
        const pos = proj.boards.map((b, i) => ({ x: 40 + (i % cols) * (bw + 40), y: 70 + Math.floor(i / cols) * (bh + 90) }));
        let lines = '';
        proj.boards.forEach((b, i) => b.elements.forEach(e => {
            if (!e.link || e.link.to === '') return;
            const t = e.link.to === 'back' ? Math.max(0, i - 1) : +e.link.to;
            if (t >= pos.length) return;
            const a = pos[i], c = pos[t];
            lines += `<path d="M${a.x + bw / 2},${a.y + bh} C ${a.x + bw / 2},${a.y + bh + 46} ${c.x + bw / 2},${c.y - 46} ${c.x + bw / 2},${c.y - 6}" fill="none" stroke="${e.link.to === 'back' ? '#f87171' : '#ff61f6'}" stroke-width="2" stroke-dasharray="${e.link.to === 'back' ? '5 4' : ''}" marker-end="url(#ar)"/>`;
        }));
        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;">Sơ đồ liên kết prototype
              <span style="font-weight:400;color:#aaa;font-size:12px;">${proj.boards.length} artboard · ${proj.boards.reduce((n, b) => n + b.elements.filter(e => e.link && e.link.to !== '').length, 0)} liên kết — bấm 1 artboard để mở nó</span>
              <button id="fmClose" style="margin-left:auto;padding:6px 12px;border-radius:6px;border:1px solid #555;background:#26262e;color:#fff;cursor:pointer;">✕ Đóng</button>
            </div>
            <div style="flex:1;overflow:auto;position:relative;">
              <svg width="${Math.max(600, cols * (bw + 60))}" height="${Math.max(400, pos.length ? pos[pos.length - 1].y + bh + 80 : 400)}" style="position:absolute;inset:0;pointer-events:none;">
                <defs><marker id="ar" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#ff61f6"/></marker></defs>
                ${lines}
              </svg>
              ${proj.boards.map((b, i) => `<div data-b="${i}" style="position:absolute;left:${pos[i].x}px;top:${pos[i].y}px;width:${bw}px;height:${bh}px;background:#1b1b24;border:1.5px solid ${i === S.board ? '#ff61f6' : '#3a3a45'};border-radius:8px;padding:6px;cursor:pointer;overflow:hidden;">
                  <div style="font-size:11px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i + 1}. ${esc(b.name)}</div>
                  <div style="font-size:10px;color:#888;">${b.elements.length} phần tử · ${b.w}×${b.h}</div>
                </div>`).join('')}
            </div>`;
        document.body.appendChild(wrap);
        wrap.querySelector('#fmClose').addEventListener('click', () => wrap.remove());
        wrap.addEventListener('click', e => {
            if (e.target === wrap) wrap.remove();
            const c = e.target.closest('[data-b]');
            if (c) { goBoard(+c.dataset.b); wrap.remove(); }
        });
    }

    /* ---------- xuất ---------- */
    function exportPng() {
        const b = B();
        const clone = board.cloneNode(true);
        clone.querySelectorAll('.elem.sel').forEach(n => n.classList.remove('sel'));
        clone.querySelectorAll('.link-badge').forEach(n => n.remove());
        clone.style.cssText = `width:${b.w}px;height:${b.h}px;background:${b.bg === 'transparent' ? 'rgba(0,0,0,0)' : b.bg};position:relative;overflow:hidden;`;
        const html = clone.outerHTML;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}"><foreignObject width="100%" height="100%">${html.replace(/&nbsp;/g, ' ')}</foreignObject></svg>`;
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = b.w * 2; c.height = b.h * 2;
            const x = c.getContext('2d');
            x.scale(2, 2);
            x.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            TK.download(c.toDataURL('image/png'), `${b.name.replace(/\s+/g, '-')}.png`);
            TK.status('Đã xuất PNG artboard "' + b.name + '" (2×)');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            TK.toast('Trình duyệt chặn xuất PNG từ HTML (font/ảnh ngoài). Đã xuất file JSON dự án thay thế.', 'error');
            A.saveProject();
        };
        img.src = url;
    }
    function buildDemoHtml() {
        const boards = proj.boards.map((b, i) => {
            const els = b.elements.slice().sort((p, q) => (p.z || 0) - (q.z || 0)).map(e => {
                if (e.hidden) return '';
                const f = e.font || {};
                const style = `position:absolute;left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;border-radius:${e.type === 'ellipse' ? '50%' : (e.radius || 0) + 'px'};background:${e.fill || 'transparent'};border:${e.strokeW || 0}px solid ${e.stroke || 'transparent'};opacity:${(e.op == null ? 100 : e.op) / 100};transform:rotate(${e.rot || 0}deg);box-shadow:${e.shadow || 'none'};overflow:hidden;display:flex;align-items:center;justify-content:${f.align === 'center' ? 'center' : f.align === 'flex-end' ? 'flex-end' : 'flex-start'};font-family:'${f.family}',sans-serif;font-size:${f.size}px;color:${f.color};font-weight:${f.weight};text-align:${f.align === 'center' ? 'center' : f.align === 'flex-end' ? 'right' : 'left'};padding:2px 6px;`;
                const link = e.link && e.link.to !== '' ? `onclick="go(${e.link.to === 'back' ? "'back'" : e.link.to},'${e.link.tr || 'fade'}')" style="${style}cursor:pointer;"` : `style="${style}"`;
                const inner = e.type === 'image' ? (e.src ? `<img src="${e.src}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : '') : (e.type === 'line' || e.type === 'hotspot' ? '' : esc(e.text || ''));
                return `<div ${link}>${inner}</div>`;
            }).join('\n');
            return `<div class="screen" id="s${i}" data-i="${i}" style="display:none;position:relative;width:${b.w}px;height:${b.h}px;background:${b.bg};margin:0 auto;box-shadow:0 10px 40px rgba(0,0,0,.35);overflow:hidden;border-radius:${b.h > b.w * 1.4 ? '22px' : '0'};">${els}</div>`;
        }).join('\n');
        return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${esc(proj.name)} — Prototype</title>
<style>body{margin:0;background:#12121a;font-family:'Segoe UI',sans-serif;color:#fff;padding:16px;text-align:center}
.bar{display:flex;gap:8px;justify-content:center;margin-bottom:14px;flex-wrap:wrap}
.bar button{padding:7px 13px;border-radius:7px;border:1px solid #444;background:#22222c;color:#fff;cursor:pointer;font-size:12.5px}
.bar button.on{background:#ff61f6;border-color:#ff61f6;color:#20002a;font-weight:700}
.screen{transition:opacity .3s,transform .3s}</style></head><body>
<h3 style="margin:0 0 4px;font-size:15px;">${esc(proj.name)} — prototype chạy thật</h3>
<div style="color:#999;font-size:12px;margin-bottom:12px;">Bấm vào nút/thẻ có liên kết để chuyển màn hình. Mở file này ở bất kỳ trình duyệt nào.</div>
<div class="bar" id="bar"></div>
${boards}
<script>
var names = ${JSON.stringify(proj.boards.map(b => b.name))};
var stack = [0];
var bar = document.getElementById('bar');
names.forEach(function(n,i){ var b=document.createElement('button'); b.textContent=(i+1)+'. '+n; b.onclick=function(){ show(i,'none'); }; bar.appendChild(b); });
function show(i,tr){
  document.querySelectorAll('.screen').forEach(function(s){ s.style.display='none'; });
  var el=document.getElementById('s'+i); if(!el) return;
  el.style.display='block';
  el.style.transition='none'; el.style.opacity='0'; el.style.transform= tr==='slide'?'translateX(30px)': tr==='pop'?'scale(.94)':'none';
  requestAnimationFrame(function(){ el.style.transition='opacity .3s, transform .3s'; el.style.opacity='1'; el.style.transform='none'; });
  Array.prototype.forEach.call(bar.children,function(b,k){ b.classList.toggle('on',k===i); });
  stack.push(i);
}
function go(to,tr){ if(to==='back'){ if(stack.length>1){ stack.pop(); var p=stack[stack.length-1]; showDirect(p,tr);} } else show(+to,tr||'fade'); }
function showDirect(i,tr){ stack=[i]; show(i,tr); }
show(0,'none'); stack=[0];
<\/script></body></html>`;
    }

    /* ---------- AI ---------- */
    function zoomFit() {
        const b = B();
        S.zoom = TK.clamp(Math.min((stage.clientWidth - 90) / b.w, (stage.clientHeight - 90) / b.h), 0.05, 2);
        renderBoard(); updateStatus();
    }

    TK.init({ app: 'xprototype', status: '.statusbar [data-status-text]' });
    Object.keys(A).forEach(k => TK.on(k, A[k]));
    TK.on('zoomFit', () => zoomFit());
    bindPanel();
    proj.boards.push(mkBoard('Đăng nhập', 393, 852), mkBoard('Trang chủ', 393, 852), mkBoard('Danh sách', 393, 852));
    addTemplateBoards();
    S.board = 0;
    render(false);
    zoomFit();
    hist.reset(); push();

    document.addEventListener('keydown', e => {
        if (e.target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
            if (e.key === 'Escape' && document.getElementById('preview').classList.contains('show')) closePreview();
            return;
        }
        const k = e.key.toLowerCase();
        if (k === 'escape') {
            if (document.getElementById('flowMap')) document.getElementById('flowMap').remove();
            else if (document.getElementById('preview').classList.contains('show')) closePreview();
            else { S.sel = null; renderBoard(); renderLayers(); updateStatus(); }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); A.redo(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); A.saveProject(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); A.duplicate(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'n') { e.preventDefault(); A.newProject(); return; }
        if ((e.ctrlKey || e.metaKey) && k === '0') { e.preventDefault(); zoomFit(); return; }
        if ((e.ctrlKey || e.metaKey) && k === '1') { e.preventDefault(); A.zoom100(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'enter') { e.preventDefault(); A.preview(); return; }
        if (k === 'delete' || k === 'backspace') { if (S.sel) { e.preventDefault(); A.deleteElem(); } return; }
        const map = { v: 'select', m: 'rect', l: 'ellipse', t: 'text', b: 'button', n: 'input', i: 'image', h: 'hotspot' };
        if (map[k] && !e.ctrlKey && !e.metaKey) { setTool(map[k]); return; }
        if (k === '+' || k === '=') A.zoomIn();
        if (k === '-') A.zoomOut();
        if (S.sel && k.startsWith('arrow')) {
            e.preventDefault();
            const s = selEl(), d = e.shiftKey ? 10 : 1;
            if (k === 'arrowup') s.y -= d; if (k === 'arrowdown') s.y += d;
            if (k === 'arrowleft') s.x -= d; if (k === 'arrowright') s.x += d;
            renderBoard(); syncPanel();
        }
    });

    /* ---------- lệnh AI / trang cha ---------- */
    TK.cmd('get_info', () => ({ app: 'xPrototype', project: proj.name, boards: proj.boards.map((b, i) => ({ i: i + 1, name: b.name, w: b.w, h: b.h, elements: b.elements.length, links: b.elements.filter(e => e.link && e.link.to !== '').length })), current: S.board + 1, selected: selEl() && selEl().name }));
    TK.cmd('new_board', a => {
        const b = mkBoard(a.name || ('Màn hình ' + (proj.boards.length + 1)), +a.w || 393, +a.h || 852);
        if (a.bg) b.bg = a.bg;
        proj.boards.push(b); S.board = proj.boards.length - 1; S.sel = null; render(); zoomFit();
        return { name: b.name, index: S.board + 1 };
    });
    TK.cmd('go_board', a => { goBoard(TK.clamp((a.index || a.board || 1) - 1, 0, proj.boards.length - 1)); return { board: S.board + 1 }; });
    TK.cmd('delete_board', () => { A.delBoard(); return { boards: proj.boards.length }; });
    TK.cmd('add_element', a => {
        const type = ['rect', 'ellipse', 'text', 'button', 'input', 'image', 'line', 'hotspot'].includes(a.type) ? a.type : 'rect';
        const e = mkEl(type, {
            x: +a.x || 20, y: +a.y || 20, w: Math.max(4, +a.w || 160), h: Math.max(4, +a.h || 60),
            fill: a.fill || undefined, radius: a.radius == null ? undefined : +a.radius, text: a.text != null ? String(a.text) : '',
            stroke: a.stroke || undefined, strokeW: +a.strokeW || 0, shadow: a.shadow || '', src: a.src || '', name: a.name || undefined
        });
        if (a.size) e.font.size = +a.size;
        if (a.color) e.font.color = a.color;
        if (a.weight) e.font.weight = String(a.weight);
        if (a.align) e.font.align = a.align;
        if (a.linkTo != null && a.linkTo !== '') e.link.to = a.linkTo === 'back' ? 'back' : TK.clamp(+a.linkTo - 1, 0, proj.boards.length - 1);
        if (a.linkTr) e.link.tr = a.linkTr;
        B().elements.push(e); S.sel = e.id; render();
        return { id: e.id, name: e.name };
    });
    TK.cmd('delete_element', () => { A.deleteElem(); return { ok: true }; });
    TK.cmd('set_link', a => {
        const e = selEl(); if (!e) return { ok: false, error: 'chưa chọn phần tử' };
        e.link.to = a.to === 'back' ? 'back' : (a.to == null || a.to === '' ? '' : TK.clamp(+a.to - 1, 0, proj.boards.length - 1));
        e.link.tr = a.transition || e.link.tr || 'fade';
        render(); return e.link;
    });
    TK.cmd('apply_template', a => { addTemplate(String(a.template || a.name || 'home')); return { ok: true }; });
    TK.cmd('build_ui', a => {
        if (a.boards) { applyAi(a); return { boards: proj.boards.length }; }
        proj.boards = []; addTemplateBoards(a.prompt); render(); zoomFit();
        return { boards: proj.boards.length };
    });
    TK.cmd('preview', a => { openPreview(a.board ? TK.clamp(+a.board - 1, 0, proj.boards.length - 1) : S.board); return { ok: true }; });
    TK.cmd('export', a => { (String(a.format || 'png') === 'html' ? A.exportHtml() : exportPng()); return { ok: true }; });
    TK.cmd('set_device', a => {
        const d = String(a.device || a.size || '');
        const m = { iphone: [393, 852], android: [360, 800], ipad: [820, 1180], desktop: [1440, 900], laptop: [1280, 800], story: [1080, 1920], banner: [1200, 628] }[d.toLowerCase()];
        const size = m || (/\d+x\d+/.test(d) ? d.split('x').map(Number) : [+a.w || B().w, +a.h || B().h]);
        B().w = size[0]; B().h = size[1]; render(); zoomFit();
        return { w: B().w, h: B().h };
    });
    TK.cmd('ai_ui', a => { aiPrompt(a.prompt || a.description || 'ứng dụng di động hiện đại'); return { started: true }; });
    async function aiPrompt(p) {
        try {
            const j = await TK.ai(`Thiết kế UI: "${p}". Trả JSON {"name":"","boards":[{"name":"","w":393,"h":852,"bg":"#fff","elements":[{"type":"rect|text|button|input|image|ellipse|line","x":0,"y":0,"w":100,"h":40,"fill":"#hex","radius":8,"text":"","size":14,"color":"#hex","weight":"600","align":"center","linkTo":2,"linkTr":"slide"}]}]}. CHỈ JSON.`, { json: true, system: 'Chỉ trả JSON.' });
            if (j && j.boards && j.boards.length) applyAi(j);
            else { proj.boards = []; addTemplateBoards(p); render(); zoomFit(); }
        } catch (e) { proj.boards = []; addTemplateBoards(p); render(); zoomFit(); }
    }

    TK.status('Sẵn sàng — 3 màn hình mẫu đã nối liên kết. Bấm ▶ Preview để chạy thử prototype.');
})();
