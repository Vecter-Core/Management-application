/* ============================================================
   xPhoto — trình chỉnh sửa ảnh thật: layers, brush, flood fill,
   crop, transform, adjustment, filter, undo/redo, xuất file, AI
   ============================================================ */
(function () {
    'use strict';

    const main = document.getElementById('mainCanvas');
    const overlay = document.getElementById('overlayCanvas');
    const mctx = main.getContext('2d');
    const octx = overlay.getContext('2d');
    const comp = document.createElement('canvas');
    const cctx = comp.getContext('2d');

    const doc = { w: 1200, h: 800 };
    let layers = [];
    let active = 0;
    let tool = 'brush';
    let zoom = 1;
    let gridOn = false;
    let uid = 1;

    const adjust = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, blur: 0, hue: 0 };
    let filterName = 'none';

    const brush = { size: 14, opacity: 1, color: '#ff4d4d', font: 'Arial', tolerance: 32 };
    const hist = TK.history(14);

    const FILTERS = {
        none: '', grayscale: 'grayscale(1)', sepia: 'sepia(.8) contrast(1.08)', invert: 'invert(1)',
        vintage: 'sepia(.5) contrast(.92) brightness(.94) saturate(1.2)', vivid: 'saturate(1.85) contrast(1.18)',
        cold: 'hue-rotate(180deg) saturate(1.25) brightness(1.02)', warm: 'sepia(.35) saturate(1.4) brightness(1.04)',
        blur: 'blur(3px)', sharpen: 'contrast(1.25) saturate(1.15)'
    };
    const TOOL_NAMES = { brush: '🖌️ Bút vẽ', eraser: '🧹 Tẩy', fill: '🪣 Đổ màu', text: 'T Chữ', rect: '▭ Chữ nhật', circle: '○ Hình tròn', line: '╱ Đường thẳng', eyedropper: '💧 Hút màu', crop: '✂️ Cắt ảnh', move: '🖱️ Di chuyển lớp', zoom: '🔍 Phóng to', aiEdit: '✨ AI chỉnh sửa' };

    /* ---------------- layers ---------------- */
    function newLayerCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w || doc.w; c.height = h || doc.h;
        return c;
    }
    function addLayerObj(name, canvas) {
        const l = { id: uid++, name: name || ('Lớp ' + uid), canvas: canvas || newLayerCanvas(), visible: true, opacity: 1, x: 0, y: 0 };
        layers.push(l);
        return l;
    }
    const L = () => layers[active];

    function resizeDoc(w, h, keepContent) {
        const old = keepContent ? layers.map(l => ({ l, img: l.canvas })) : null;
        doc.w = Math.max(16, Math.min(6000, w | 0));
        doc.h = Math.max(16, Math.min(6000, h | 0));
        main.width = overlay.width = comp.width = doc.w;
        main.height = overlay.height = comp.height = doc.h;
        layers.forEach((l, i) => {
            const nc = newLayerCanvas();
            if (old && old[i]) nc.getContext('2d').drawImage(old[i].img, 0, 0);
            l.canvas = nc;
        });
        applyZoom();
        document.getElementById('statusSize').textContent = doc.w + ' × ' + doc.h + ' px';
    }

    function buildFilter() {
        let f = `brightness(${100 + adjust.brightness}%) contrast(${100 + adjust.contrast}%) saturate(${100 + adjust.saturation}%) hue-rotate(${adjust.hue + (adjust.temperature < 0 ? adjust.temperature * 0.4 : 0)}deg)`;
        if (adjust.temperature > 0) f += ` sepia(${(adjust.temperature / 100 * 0.5).toFixed(2)})`;
        if (adjust.blur > 0) f += ` blur(${adjust.blur}px)`;
        if (FILTERS[filterName]) f += ' ' + FILTERS[filterName];
        return f;
    }

    function render() {
        cctx.clearRect(0, 0, doc.w, doc.h);
        layers.forEach(l => {
            if (!l.visible) return;
            cctx.globalAlpha = l.opacity;
            cctx.drawImage(l.canvas, l.x, l.y);
        });
        cctx.globalAlpha = 1;
        mctx.clearRect(0, 0, doc.w, doc.h);
        mctx.filter = buildFilter();
        mctx.drawImage(comp, 0, 0);
        mctx.filter = 'none';
        if (gridOn) drawGrid();
        renderLayers();
    }

    function drawGrid() {
        mctx.save();
        mctx.strokeStyle = 'rgba(255,255,255,.25)'; mctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
            mctx.beginPath(); mctx.moveTo(doc.w * i / 3, 0); mctx.lineTo(doc.w * i / 3, doc.h); mctx.stroke();
            mctx.beginPath(); mctx.moveTo(0, doc.h * i / 3); mctx.lineTo(doc.w, doc.h * i / 3); mctx.stroke();
        }
        mctx.restore();
    }

    function applyZoom() {
        main.style.width = overlay.style.width = (doc.w * zoom) + 'px';
        main.style.height = overlay.style.height = (doc.h * zoom) + 'px';
        document.getElementById('statusZoom').textContent = Math.round(zoom * 100) + '%';
    }

    function renderLayers() {
        const box = document.getElementById('layersList');
        box.innerHTML = '';
        layers.slice().reverse().forEach(l => {
            const i = layers.indexOf(l);
            const row = document.createElement('div');
            row.className = 'layer-item' + (i === active ? ' active' : '');
            const th = document.createElement('canvas');
            th.width = th.height = 32; th.className = 'layer-thumb';
            try { th.getContext('2d').drawImage(l.canvas, 0, 0, 32, 32); } catch (e) {}
            row.innerHTML = `<span class="layer-vis" title="Ẩn/hiện">${l.visible ? '👁️' : '🚫'}</span>`;
            row.appendChild(th);
            const nm = document.createElement('span'); nm.className = 'layer-name'; nm.textContent = l.name; nm.title = 'Nhấp đúp để đổi tên';
            row.appendChild(nm);
            const del = document.createElement('button'); del.className = 'layer-del'; del.textContent = '🗑'; del.title = 'Xóa lớp';
            row.appendChild(del);
            row.addEventListener('click', e => {
                if (e.target.classList.contains('layer-vis')) { l.visible = !l.visible; render(); return; }
                if (e.target === del) { deleteLayer(i); return; }
                active = i; syncLayerUI(); render();
            });
            nm.addEventListener('dblclick', async () => {
                const n = await TK.prompt('Đổi tên lớp', 'Tên mới cho lớp này:', l.name);
                if (n) { l.name = n; render(); TK.status('Đã đổi tên lớp: ' + n); }
            });
            box.appendChild(row);
        });
        const op = document.getElementById('layerOpacity');
        if (L()) { op.value = Math.round(L().opacity * 100); document.getElementById('loVal').textContent = op.value; }
    }

    function syncLayerUI() {
        document.getElementById('statusTool').textContent = TOOL_NAMES[tool] || tool;
    }

    /* ---------------- history ---------------- */
    function snapshot() {
        return {
            w: doc.w, h: doc.h, active, filterName, adjust: Object.assign({}, adjust),
            layers: layers.map(l => ({ name: l.name, visible: l.visible, opacity: l.opacity, x: l.x, y: l.y, url: l.canvas.toDataURL('image/png') }))
        };
    }
    async function restore(s) {
        doc.w = s.w; doc.h = s.h;
        main.width = overlay.width = comp.width = doc.w;
        main.height = overlay.height = comp.height = doc.h;
        layers = [];
        for (const L2 of s.layers) {
            const c = newLayerCanvas();
            try { const img = await TK.loadImage(L2.url); c.getContext('2d').drawImage(img, 0, 0); } catch (e) {}
            layers.push({ id: uid++, name: L2.name, canvas: c, visible: L2.visible, opacity: L2.opacity, x: L2.x, y: L2.y });
        }
        active = Math.min(s.active, layers.length - 1);
        Object.assign(adjust, s.adjust);
        filterName = s.filterName;
        syncAdjustUI(); applyZoom(); render();
        document.getElementById('statusSize').textContent = doc.w + ' × ' + doc.h + ' px';
    }
    function push() { hist.push(snapshot()); }

    /* ---------------- vẽ ---------------- */
    let drawing = false, start = null, last = null, cropRect = null, moveStart = null;

    function pos(e) { return TK.canvasPos(main, e); }

    function stroke(a, b, erase) {
        const ctx = L().canvas.getContext('2d');
        ctx.save();
        ctx.globalAlpha = brush.opacity;
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.lineWidth = brush.size;
        if (erase) ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = brush.color;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
    }

    function floodFill(x, y, hex) {
        const c = L().canvas, ctx = c.getContext('2d');
        const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
        const idx = (Math.floor(y) * c.width + Math.floor(x)) * 4;
        if (idx < 0 || idx >= d.length) return;
        const tr = d[idx], tg = d[idx + 1], tb = d[idx + 2], ta = d[idx + 3];
        const [fr, fg, fb] = TK.hexToRgb(hex);
        const tol = brush.tolerance * 4;
        const stack = [[Math.floor(x), Math.floor(y)]];
        const seen = new Uint8Array(c.width * c.height);
        while (stack.length) {
            const [cx, cy] = stack.pop();
            if (cx < 0 || cy < 0 || cx >= c.width || cy >= c.height) continue;
            const p = cy * c.width + cx;
            if (seen[p]) continue;
            const i = p * 4;
            if (Math.abs(d[i] - tr) > tol || Math.abs(d[i + 1] - tg) > tol || Math.abs(d[i + 2] - tb) > tol || Math.abs(d[i + 3] - ta) > tol) continue;
            seen[p] = 1;
            d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
        ctx.putImageData(img, 0, 0);
    }

    main.addEventListener('pointerdown', e => {
        if (!L()) return;
        main.setPointerCapture(e.pointerId);
        const p = pos(e);
        start = last = p;
        drawing = true;

        if (tool === 'brush' || tool === 'eraser') { stroke(p, { x: p.x + 0.01, y: p.y }, tool === 'eraser'); render(); }
        else if (tool === 'fill') { floodFill(p.x, p.y, brush.color); render(); push(); TK.status('Đã đổ màu tại ' + Math.round(p.x) + ',' + Math.round(p.y)); drawing = false; }
        else if (tool === 'eyedropper') {
            const d = cctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
            brush.color = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
            document.getElementById('brushColor').value = brush.color;
            TK.status('Đã hút màu ' + brush.color); drawing = false;
        }
        else if (tool === 'text') { drawing = false; addTextAt(p); }
        else if (tool === 'zoom') { setZoom(e.altKey || e.button === 2 ? zoom / 1.25 : zoom * 1.25); drawing = false; }
        else if (tool === 'move') { moveStart = { p, x: L().x, y: L().y }; }
        else if (tool === 'crop') { cropRect = null; }
    });

    main.addEventListener('pointermove', e => {
        const p = pos(e);
        document.getElementById('statusCoords').textContent = `X: ${Math.round(p.x)}, Y: ${Math.round(p.y)}`;
        if (!drawing) return;
        if (tool === 'brush' || tool === 'eraser') { stroke(last, p, tool === 'eraser'); last = p; render(); }
        else if (tool === 'move' && moveStart) {
            L().x = moveStart.x + (p.x - moveStart.p.x);
            L().y = moveStart.y + (p.y - moveStart.p.y);
            render();
        } else if (['rect', 'circle', 'line', 'crop'].includes(tool)) {
            octx.clearRect(0, 0, doc.w, doc.h);
            octx.save();
            octx.strokeStyle = tool === 'crop' ? '#fff' : brush.color;
            octx.lineWidth = tool === 'crop' ? 2 / zoom : brush.size;
            octx.globalAlpha = tool === 'crop' ? 1 : brush.opacity;
            octx.setLineDash(tool === 'crop' ? [6, 4] : []);
            octx.beginPath();
            if (tool === 'rect') octx.rect(start.x, start.y, p.x - start.x, p.y - start.y);
            else if (tool === 'circle') { const rx = Math.abs(p.x - start.x) / 2, ry = Math.abs(p.y - start.y) / 2; octx.ellipse(start.x + (p.x - start.x) / 2, start.y + (p.y - start.y) / 2, rx, ry, 0, 0, Math.PI * 2); }
            else { octx.moveTo(start.x, start.y); octx.lineTo(p.x, p.y); }
            octx.stroke();
            if (tool === 'crop') {
                octx.fillStyle = 'rgba(0,0,0,.45)';
                octx.fillRect(0, 0, doc.w, doc.h);
                const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y), w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
                octx.clearRect(x, y, w, h);
                octx.strokeRect(x, y, w, h);
                cropRect = { x, y, w, h };
                TK.status(`Vùng cắt: ${Math.round(w)} × ${Math.round(h)} px — bấm Enter hoặc menu Hình ảnh → Cắt`);
            }
            octx.restore();
        }
    });

    function endStroke(e) {
        if (!drawing) return;
        drawing = false;
        const p = e ? pos(e) : last;
        octx.clearRect(0, 0, doc.w, doc.h);
        if (!p) return;
        const ctx = L().canvas.getContext('2d');
        ctx.save();
        ctx.globalAlpha = brush.opacity;
        ctx.strokeStyle = ctx.fillStyle = brush.color;
        ctx.lineWidth = brush.size; ctx.lineCap = ctx.lineJoin = 'round';
        if (tool === 'rect') { ctx.beginPath(); ctx.rect(start.x, start.y, p.x - start.x, p.y - start.y); ctx.stroke(); }
        else if (tool === 'circle') {
            const rx = Math.abs(p.x - start.x) / 2, ry = Math.abs(p.y - start.y) / 2;
            ctx.beginPath(); ctx.ellipse(start.x + (p.x - start.x) / 2, start.y + (p.y - start.y) / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        } else if (tool === 'line') { ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
        else if (tool === 'move') { TK.status(`Lớp "${L().name}" → x=${Math.round(L().x)}, y=${Math.round(L().y)}`); }
        ctx.restore();
        if (tool !== 'crop') { render(); push(); }
        else if (cropRect) TK.status('Đã chọn vùng cắt — bấm Enter để cắt');
    }
    main.addEventListener('pointerup', endStroke);
    main.addEventListener('pointercancel', endStroke);
    main.addEventListener('contextmenu', e => e.preventDefault());

    async function addTextAt(p) {
        const text = await TK.prompt('Thêm chữ', 'Nhập nội dung chữ sẽ vẽ lên ảnh:', 'Xin chào Rune');
        if (!text) return;
        const size = await TK.askNumber('Cỡ chữ', 'Chiều cao chữ (px):', Math.max(18, brush.size * 3));
        const px = parseInt(size, 10) || Math.max(18, brush.size * 3);
        const ctx = L().canvas.getContext('2d');
        ctx.save();
        ctx.globalAlpha = brush.opacity;
        ctx.fillStyle = brush.color;
        ctx.font = `${px}px "${brush.font}", sans-serif`;
        ctx.textBaseline = 'top';
        text.split('\n').forEach((line, i) => ctx.fillText(line, p.x, p.y + i * px * 1.2));
        ctx.restore();
        render(); push();
        TK.status('Đã thêm chữ: ' + text.slice(0, 40));
    }

    /* ---------------- actions ---------------- */
    const A = {
        async openImage() {
            const f = await TK.pickFile('image/*');
            if (!f) return;
            const img = await TK.loadImage(await TK.readAsDataURL(f));
            const scale = Math.min(1, 4000 / Math.max(img.width, img.height));
            resizeDoc(img.width * scale, img.height * scale, false);
            layers = [];
            const base = addLayerObj(f.name.slice(0, 28));
            const c = base.canvas.getContext('2d');
            c.fillStyle = '#fff'; c.fillRect(0, 0, doc.w, doc.h);
            c.drawImage(img, 0, 0, doc.w, doc.h);
            active = 0; render(); push();
            TK.status('Đã mở ' + f.name + ' (' + doc.w + '×' + doc.h + ')');
        },
        async openUrl() {
            const u = await TK.prompt('Mở ảnh từ URL', 'Dán đường dẫn ảnh (https://…):', 'https://');
            if (!u) return;
            try {
                const img = await TK.loadImage(u);
                resizeDoc(img.width, img.height, false);
                layers = [];
                const b = addLayerObj('Ảnh từ URL');
                b.canvas.getContext('2d').drawImage(img, 0, 0);
                active = 0; render(); push();
                TK.status('Đã tải ảnh từ URL');
            } catch (e) { TK.toast('Không tải được ảnh (URL chặn CORS?): ' + e.message, 'error'); }
        },
        async newCanvas() {
            const v = await TK.prompt('Tạo ảnh mới', 'Nhập: RỘNGxCAO [mãu nền]\nVí dụ: 1280x720 #ffffff\nhoặc 1080x1920 transparent', '1280x720 #ffffff');
            if (!v) return;
            const m = /(\d+)\s*[x×,]\s*(\d+)/i.exec(v);
            const w = m ? +m[1] : 1200, h = m ? +m[2] : 800;
            const cm = /(#[0-9a-f]{3,8}|transparent|trắng|đen)/i.exec(v);
            let bg = '#ffffff';
            if (cm) bg = /transparent/i.test(cm[1]) ? 'transparent' : /đen/.test(cm[1]) ? '#000' : /trắng/.test(cm[1]) ? '#fff' : cm[1];
            resizeDoc(w, h, false);
            layers = [];
            const b = addLayerObj('Nền');
            if (bg !== 'transparent') { b.canvas.getContext('2d').fillStyle = bg; b.canvas.getContext('2d').fillRect(0, 0, w, h); }
            active = 0; render(); push();
            TK.status(`Tạo ảnh mới ${w}×${h}`);
        },
        demoImage() { makeDemo(); push(); TK.status('Đã tạo ảnh mẫu — cứ thế vẽ/thêm chữ/áp bộ lọc'); },
        exportPng() { exportImage('png'); },
        exportJpg() { exportImage('jpeg'); },
        undo() { doUndo(); },
        redo() { doRedo(); },
        clearLayer() {
            const c = L().canvas.getContext('2d');
            c.clearRect(0, 0, doc.w, doc.h); render(); push(); TK.status('Đã xóa nội dung lớp ' + L().name);
        },
        fillColor() {
            const c = L().canvas.getContext('2d');
            c.fillStyle = brush.color; c.globalAlpha = brush.opacity;
            c.fillRect(0, 0, doc.w, doc.h); c.globalAlpha = 1;
            render(); push(); TK.status('Đã đổ màu ' + brush.color + ' toàn ảnh');
        },
        async copyClipboard() {
            try {
                const blob = await new Promise(r => exportCanvas().toBlob(r, 'image/png'));
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                TK.toast('Đã copy ảnh vào clipboard', 'ok');
            } catch (e) { TK.toast('Trình duyệt không cho copy ảnh: ' + e.message, 'error'); }
        },
        async resizeImage() {
            const v = await TK.prompt('Đổi kích thước ảnh', `Hiện tại: ${doc.w} × ${doc.h}\nNhập kích thước mới (giữ nội dung):`, `${doc.w}x${doc.h}`);
            if (!v) return;
            const m = /(\d+)\s*[x×,]\s*(\d+)/i.exec(v);
            if (!m) return TK.toast('Sai cú pháp, ví dụ 1920x1080', 'error');
            const olds = layers.map(l => l.canvas);
            resizeDoc(+m[1], +m[2], false);
            layers.forEach((l, i) => { if (olds[i]) l.canvas.getContext('2d').drawImage(olds[i], 0, 0, doc.w, doc.h); });
            render(); push(); TK.status(`Đã đổi kích thước → ${doc.w}×${doc.h}`);
        },
        rotateCw() { rotate(1); }, rotateCcw() { rotate(-1); }, flipH() { flip('h'); }, flipV() { flip('v'); },
        cropApply() { applyCrop(); },
        addLayer() { addLayerObj(); active = layers.length - 1; render(); push(); TK.status('Đã thêm lớp mới'); },
        duplicateLayer() {
            const c = newLayerCanvas();
            c.getContext('2d').drawImage(L().canvas, 0, 0);
            const l = addLayerObj(L().name + ' copy', c);
            l.x = L().x + 20; l.y = L().y + 20;
            active = layers.length - 1; render(); push(); TK.status('Đã nhân đôi lớp');
        },
        mergeDown() {
            if (active === 0) return TK.toast('Đây là lớp dưới cùng', 'error');
            const up = layers[active], down = layers[active - 1];
            const c = down.canvas.getContext('2d');
            c.save(); c.globalAlpha = up.opacity; c.drawImage(up.canvas, up.x, up.y); c.restore();
            layers.splice(active, 1); active--; render(); push(); TK.status('Đã gộp lớp xuống dưới');
        },
        deleteLayer() { if (layers.length > 1) { layers.splice(active, 1); active = Math.max(0, active - 1); render(); push(); } else TK.toast('Phải còn ít nhất 1 lớp', 'error'); },
        layerUp() { if (active < layers.length - 1) { [layers[active], layers[active + 1]] = [layers[active + 1], layers[active]]; active++; render(); push(); } },
        layerDown() { if (active > 0) { [layers[active], layers[active - 1]] = [layers[active - 1], layers[active]]; active--; render(); push(); } },
        flatten() {
            const c = newLayerCanvas();
            const x = c.getContext('2d');
            x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h);
            layers.forEach(l => { if (l.visible) { x.globalAlpha = l.opacity; x.drawImage(l.canvas, l.x, l.y); } });
            layers = [addLayerObj('Ảnh đã gộp', c)]; active = 0; render(); push(); TK.status('Đã gộp tất cả lớp');
        },
        setFilter(e, el) { setFilter(el.dataset.arg); },
        bakeFilter() {
            const f = buildFilter();
            if (f === 'none' || !f) return TK.toast('Không có bộ lọc nào để nướng', 'error');
            TK.bakeFilter(comp, f);
            layers.forEach((l, i) => { l.canvas.getContext('2d').clearRect(0, 0, doc.w, doc.h); if (i === 0) l.canvas.getContext('2d').drawImage(comp, 0, 0); });
            Object.keys(adjust).forEach(k => adjust[k] = 0);
            filterName = 'none';
            syncAdjustUI(); render(); push();
            TK.toast('🔥 Đã nướng bộ lọc + điều chỉnh vào pixel ảnh', 'ok');
        },
        resetAdjust() { Object.keys(adjust).forEach(k => adjust[k] = 0); filterName = 'none'; syncAdjustUI(); render(); push(); TK.status('Đã đặt lại điều chỉnh'); },
        togglePanel(e, el) { document.getElementById('panel-' + el.dataset.arg).classList.toggle('collapsed'); },
        zoomIn() { setZoom(zoom * 1.25); }, zoomOut() { setZoom(zoom / 1.25); }, zoom100() { setZoom(1); },
        zoomFit() {
            const a = document.getElementById('canvasArea');
            setZoom(Math.min((a.clientWidth - 40) / doc.w, (a.clientHeight - 40) / doc.h));
        },
        toggleGrid() { gridOn = !gridOn; render(); TK.status(gridOn ? 'Bật lưới căn 1/3' : 'Tắt lưới'); },
        helpKeys() { TK.modal({ title: 'Phím tắt xPhoto', cancel: null, ok: 'Đã hiểu', message: 'B bút · E tẩy · G đổ màu · T chữ · U chữ nhật · O tròn · L thẳng · I hút màu · C cắt · V di chuyển · Z zoom\nCtrl+Z hoàn tác · Ctrl+Y làm lại · Ctrl+S xuất PNG · Ctrl+O mở ảnh · Ctrl+N ảnh mới\n+/- phóng to thu nhỏ · Ctrl+wheel zoom · Enter cắt theo vùng · Esc bỏ vùng cắt' }); },
        aiEdit() { aiEdit(); },
        async askAi() { await aiDescribe(); },
        openInRune() { try { parent.postMessage({ type: 'rune:open-app', app: 'xphoto' }, '*'); } catch (e) {} },
        async exportProject() {
            const data = JSON.stringify({ v: 1, w: doc.w, h: doc.h, adjust, filterName, layers: layers.map(l => ({ name: l.name, visible: l.visible, opacity: l.opacity, x: l.x, y: l.y, url: l.canvas.toDataURL() })) });
            TK.download(new Blob([data], { type: 'application/json' }), 'xphoto-project.json');
        },
        async importProject() {
            const f = await TK.pickFile('.json,application/json');
            if (!f) return;
            try {
                const j = JSON.parse(await TK.readAsText(f));
                resizeDoc(j.w, j.h, false);
                layers = [];
                for (const l of j.layers) {
                    const c = newLayerCanvas();
                    const img = await TK.loadImage(l.url);
                    c.getContext('2d').drawImage(img, 0, 0);
                    layers.push({ id: uid++, name: l.name, canvas: c, visible: l.visible !== false, opacity: l.opacity == null ? 1 : l.opacity, x: l.x || 0, y: l.y || 0 });
                }
                Object.assign(adjust, j.adjust || {}); filterName = j.filterName || 'none';
                active = 0; syncAdjustUI(); render(); push();
                TK.toast('Đã mở dự án xPhoto', 'ok');
            } catch (e) { TK.toast('File dự án không hợp lệ: ' + e.message, 'error'); }
        }
    };

    function deleteLayer(i) {
        if (layers.length <= 1) return TK.toast('Phải còn ít nhất 1 lớp', 'error');
        layers.splice(i, 1); active = Math.max(0, Math.min(active, layers.length - 1));
        render(); push();
    }

    function setFilter(f) {
        filterName = FILTERS[f] !== undefined ? f : 'none';
        document.querySelectorAll('[data-action="setFilter"]').forEach(b => b.classList.toggle('active', b.dataset.arg === filterName));
        render(); push();
        TK.status('Bộ lọc: ' + (filterName === 'none' ? 'Gốc' : filterName));
    }

    function setZoom(z) { zoom = TK.clamp(z, 0.05, 12); applyZoom(); }

    function rotate(dir) {
        const olds = layers.map(l => ({ l, c: l.canvas }));
        const w = doc.h, h = doc.w;
        resizeDoc(w, h, false);
        olds.forEach((o, i) => {
            const ctx = layers[i].canvas.getContext('2d');
            ctx.save();
            ctx.translate(doc.w / 2, doc.h / 2);
            ctx.rotate(dir * Math.PI / 2);
            ctx.drawImage(o.c, -o.c.width / 2, -o.c.height / 2);
            ctx.restore();
        });
        render(); push(); TK.status('Đã xoay ' + (dir > 0 ? 'phải' : 'trái') + ' 90°');
    }

    function flip(axis) {
        layers.forEach(l => {
            const t = newLayerCanvas();
            const c = t.getContext('2d');
            c.translate(axis === 'h' ? doc.w : 0, axis === 'v' ? doc.h : 0);
            c.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
            c.drawImage(l.canvas, 0, 0);
            l.canvas = t;
        });
        render(); push(); TK.status('Đã lật ' + (axis === 'h' ? 'ngang' : 'dọc'));
    }

    function applyCrop() {
        if (!cropRect || cropRect.w < 4 || cropRect.h < 4) return TK.toast('Chưa có vùng cắt — chọn công cụ ✂️ rồi kéo chuột trên ảnh', 'error');
        const olds = layers.map(l => ({ l, c: l.canvas }));
        const r = { x: Math.max(0, cropRect.x | 0), y: Math.max(0, cropRect.y | 0), w: Math.min(doc.w - cropRect.x, cropRect.w) | 0, h: Math.min(doc.h - cropRect.y, cropRect.h) | 0 };
        resizeDoc(r.w, r.h, false);
        olds.forEach((o, i) => layers[i].canvas.getContext('2d').drawImage(o.c, -r.x, -r.y));
        cropRect = null; octx.clearRect(0, 0, doc.w, doc.h);
        render(); push(); TK.status(`Đã cắt ảnh còn ${doc.w}×${doc.h}`);
    }

    function exportCanvas() {
        const c = document.createElement('canvas');
        c.width = doc.w; c.height = doc.h;
        const x = c.getContext('2d');
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, doc.w, doc.h);
        x.filter = buildFilter();
        x.drawImage(comp, 0, 0);
        x.filter = 'none';
        return c;
    }
    function exportImage(type) {
        const c = exportCanvas();
        TK.download(c.toDataURL('image/' + type, 0.92), `xphoto-${Date.now()}.${type === 'jpeg' ? 'jpg' : 'png'}`);
        TK.status('Đã xuất ảnh ' + type.toUpperCase());
    }

    async function doUndo() { if (!hist.canUndo()) return TK.toast('Không còn gì để hoàn tác'); await restore(hist.undo()); TK.status('↶ Hoàn tác'); }
    async function doRedo() { if (!hist.canRedo()) return TK.toast('Không còn gì để làm lại'); await restore(hist.redo()); TK.status('↷ Làm lại'); }

    /* ---------------- AI ---------------- */
    function smallJpeg(maxW) {
        const s = Math.min(1, (maxW || 768) / doc.w);
        const c = document.createElement('canvas');
        c.width = doc.w * s; c.height = doc.h * s;
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(exportCanvas(), 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.72);
    }

    async function aiEdit() {
        const req = await TK.prompt('✨ AI chỉnh sửa ảnh', 'Mô tả điều bạn muốn AI làm với bức ảnh (AI sẽ tự chỉnh thông số & bộ lọc thật):', 'Làm ảnh trông điện ảnh, tăng tương phản, hơi lạnh');
        if (!req) return;
        TK.status('AI đang phân tích ảnh…');
        try {
            const out = await TK.ai(
                `Đây là yêu cầu chỉnh ảnh: "${req}".\nTrả về JSON: {"filter":"none|grayscale|sepia|invert|vintage|vivid|cold|warm|blur|sharpen","brightness":-100..100,"contrast":-100..100,"saturation":-100..100,"temperature":-100..100,"hue":0..360,"blur":0..20,"note":"giải thích ngắn tiếng Việt"}`,
                { system: 'Bạn là chuyên gia chỉnh màu ảnh. Chỉ trả JSON, không giải thích ngoài JSON.', json: true }
            );
            if (!out) return;
            if (out.filter && FILTERS[out.filter] !== undefined) setFilter(out.filter);
            ['brightness', 'contrast', 'saturation', 'temperature', 'hue', 'blur'].forEach(k => { if (typeof out[k] === 'number') adjust[k] = TK.clamp(out[k], k === 'hue' ? 0 : (k === 'blur' ? 0 : -100), k === 'hue' ? 360 : (k === 'blur' ? 20 : 100)); });
            syncAdjustUI(); render(); push();
            TK.toast('✨ AI đã áp chỉnh sửa: ' + (out.note || req), 'ok');
            TK.status('AI: ' + (out.note || 'đã áp dụng'));
        } catch (e) {
            TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error');
            TK.status('AI lỗi — kiểm tra khóa ở trang Khóa của Rune');
        }
    }

    async function aiDescribe() {
        const q = await TK.prompt('✨ Hỏi AI về ảnh', 'Bạn muốn hỏi gì về bức ảnh đang mở?', 'Mô tả bức ảnh này và gợi ý 3 cách chỉnh đẹp hơn');
        if (!q) return;
        TK.status('AI đang xem ảnh…');
        try {
            const dataUrl = smallJpeg(768);
            const msgs = RuneAI.visionMessages(q, dataUrl, 'image/jpeg');
            let text = '';
            const box = document.createElement('div');
            await RuneAI.chat({
                messages: msgs, tools: null,
                onDelta: d => { text += d; }
            });
            TK.modal({ title: '✨ AI trả lời', message: text.slice(0, 1800), cancel: null, ok: 'Đóng' });
            TK.status('AI đã trả lời');
            box.remove();
        } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
    }

    /* ---------------- ảnh mẫu ---------------- */
    function makeDemo() {
        resizeDoc(1200, 800, false);
        layers = [];
        const base = addLayerObj('Nền mẫu');
        const c = base.canvas.getContext('2d');
        const sky = c.createLinearGradient(0, 0, 0, 520);
        sky.addColorStop(0, '#0b1e4a'); sky.addColorStop(.5, '#4b6cb7'); sky.addColorStop(1, '#f7b267');
        c.fillStyle = sky; c.fillRect(0, 0, 1200, 560);
        const sun = c.createRadialGradient(880, 250, 10, 880, 250, 170);
        sun.addColorStop(0, '#fff8dc'); sun.addColorStop(.35, '#ffd166'); sun.addColorStop(1, 'rgba(255,209,102,0)');
        c.fillStyle = sun; c.beginPath(); c.arc(880, 250, 170, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1b2a4a';
        c.beginPath(); c.moveTo(0, 560); c.lineTo(220, 330); c.lineTo(420, 560); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(300, 560); c.lineTo(560, 260); c.lineTo(820, 560); c.closePath(); c.fill();
        c.fillStyle = '#e8f1ff';
        c.beginPath(); c.moveTo(560, 260); c.lineTo(620, 330); c.lineTo(500, 330); c.closePath(); c.fill();
        const water = c.createLinearGradient(0, 560, 0, 800);
        water.addColorStop(0, '#2a4d7a'); water.addColorStop(1, '#0a1730');
        c.fillStyle = water; c.fillRect(0, 560, 1200, 240);
        c.globalAlpha = .35; c.fillStyle = '#ffd166';
        for (let i = 0; i < 40; i++) c.fillRect(820 + Math.random() * 120, 570 + i * 6, 60 + Math.random() * 80, 2);
        c.globalAlpha = 1;
        const l2 = addLayerObj('Chữ mẫu');
        const t = l2.canvas.getContext('2d');
        t.fillStyle = 'rgba(255,255,255,.92)';
        t.font = 'bold 64px Georgia'; t.textAlign = 'center';
        t.fillText('RUNE xPhoto', 600, 150);
        t.font = '26px Arial'; t.fillStyle = 'rgba(255,255,255,.7)';
        t.fillText('Ảnh mẫu — cứ vẽ, thêm chữ, áp bộ lọc thoải mái', 600, 195);
        active = 1; render();
    }

    function syncAdjustUI() {
        ['brightness', 'contrast', 'saturation', 'temperature', 'blur', 'hue'].forEach(k => {
            const el = document.getElementById(k);
            if (el) el.value = adjust[k];
        });
        document.getElementById('bVal').textContent = adjust.brightness;
        document.getElementById('cVal').textContent = adjust.contrast;
        document.getElementById('sVal').textContent = adjust.saturation;
        document.getElementById('tVal').textContent = adjust.temperature;
        document.getElementById('blurVal').textContent = adjust.blur;
        document.getElementById('hVal').textContent = adjust.hue;
        document.querySelectorAll('[data-action="setFilter"]').forEach(b => b.classList.toggle('active', b.dataset.arg === filterName));
    }

    /* ---------------- init ---------------- */
    TK.init({ app: 'xphoto', status: '.statusbar #statusMsg' });
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    // thanh công cụ trái
    TK.toolGroup('#leftToolbar', '.tool', name => {
        tool = name;
        syncLayerUI();
        main.style.cursor = name === 'move' ? 'move' : name === 'zoom' ? 'zoom-in' : name === 'eyedropper' ? 'crosshair' : name === 'text' ? 'text' : 'crosshair';
        if (name === 'aiEdit') { A.aiEdit(); document.querySelector('.tool[data-tool="brush"]').click(); }
    });

    // sliders
    TK.slider('#brushSize', '#brushSizeVal', v => brush.size = v, v => v + 'px');
    TK.slider('#brushOpacity', '#opacityVal', v => brush.opacity = v / 100, v => v + '%');
    TK.slider('#fillTolerance', '#tolVal', v => brush.tolerance = v);
    TK.slider('#layerOpacity', '#loVal', v => { if (L()) { L().opacity = v / 100; render(); } }, v => v);
    document.getElementById('layerOpacity').addEventListener('change', () => push());
    document.getElementById('brushColor').addEventListener('input', e => brush.color = e.target.value);
    document.getElementById('fontName').addEventListener('change', e => brush.font = e.target.value);

    ['brightness', 'contrast', 'saturation', 'temperature', 'blur', 'hue'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', () => {
            adjust[id] = parseInt(el.value, 10);
            syncAdjustUI(); render();
        });
        el.addEventListener('change', () => push());
    });

    // zoom bằng ctrl+wheel
    document.getElementById('canvasArea').addEventListener('wheel', e => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    }, { passive: false });

    // phím tắt
    document.addEventListener('keydown', async e => {
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? await doRedo() : await doUndo(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); await doRedo(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); exportImage('png'); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); A.openImage(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'n') { e.preventDefault(); A.newCanvas(); return; }
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        const map = { b: 'brush', e: 'eraser', g: 'fill', t: 'text', u: 'rect', o: 'circle', l: 'line', i: 'eyedropper', c: 'crop', v: 'move', z: 'zoom' };
        if (map[k]) { const el = document.querySelector(`.tool[data-tool="${map[k]}"]`); if (el) el.click(); }
        if (k === '+' || k === '=') setZoom(zoom * 1.25);
        if (k === '-') setZoom(zoom / 1.25);
        if (k === 'enter' && cropRect) applyCrop();
        if (k === 'escape') { cropRect = null; octx.clearRect(0, 0, doc.w, doc.h); }
        if (k === '[') { brush.size = Math.max(1, brush.size - 2); document.getElementById('brushSize').value = brush.size; document.getElementById('brushSizeVal').textContent = brush.size + 'px'; }
        if (k === ']') { brush.size = Math.min(200, brush.size + 2); document.getElementById('brushSize').value = brush.size; document.getElementById('brushSizeVal').textContent = brush.size + 'px'; }
    });

    // kéo thả ảnh vào cửa sổ
    ['dragover', 'drop'].forEach(ev => document.body.addEventListener(ev, e => {
        e.preventDefault();
        if (ev === 'drop' && e.dataTransfer.files && e.dataTransfer.files[0]) {
            const f = e.dataTransfer.files[0];
            if (!f.type.startsWith('image/')) return TK.toast('Chỉ nhận file ảnh', 'error');
            TK.readAsDataURL(f).then(async url => {
                const img = await TK.loadImage(url);
                const s = Math.min(1, 4000 / Math.max(img.width, img.height));
                resizeDoc(img.width * s, img.height * s, false);
                layers = [];
                const b = addLayerObj(f.name.slice(0, 28));
                const c = b.canvas.getContext('2d');
                c.fillStyle = '#fff'; c.fillRect(0, 0, doc.w, doc.h);
                c.drawImage(img, 0, 0, doc.w, doc.h);
                active = 0; render(); push(); TK.status('Đã mở ' + f.name);
            });
        }
    }));

    /* ---------------- lệnh AI/parent điều khiển được ---------------- */
    TK.cmd('get_info', () => ({ app: 'xPhoto', size: doc.w + 'x' + doc.h, layers: layers.length, active_layer: L() && L().name, filter: filterName, adjust, zoom }));
    TK.cmd('set_filter', a => { setFilter(a.filter || 'none'); return { filter: filterName }; });
    TK.cmd('set_adjust', a => { Object.keys(adjust).forEach(k => { if (typeof a[k] === 'number') adjust[k] = a[k]; }); syncAdjustUI(); render(); push(); return adjust; });
    TK.cmd('reset_adjust', () => { A.resetAdjust(); return { ok: true }; });
    TK.cmd('bake_filter', () => { A.bakeFilter(); return { ok: true }; });
    TK.cmd('new_canvas', a => { resizeDoc(a.w || 1200, a.h || 800, false); layers = []; const b = addLayerObj('Nền'); if (a.bg && a.bg !== 'transparent') { b.canvas.getContext('2d').fillStyle = a.bg; b.canvas.getContext('2d').fillRect(0, 0, doc.w, doc.h); } active = 0; render(); push(); return { w: doc.w, h: doc.h }; });
    TK.cmd('open_demo', () => { makeDemo(); push(); return { ok: true }; });
    TK.cmd('add_text', a => {
        const c = L().canvas.getContext('2d');
        c.save(); c.fillStyle = a.color || brush.color; c.font = `bold ${a.size || 48}px "${a.font || brush.font}", sans-serif`;
        c.textBaseline = 'top'; c.fillText(String(a.text || 'Text'), a.x == null ? 40 : a.x, a.y == null ? 40 : a.y); c.restore();
        render(); push(); return { text: a.text };
    });
    TK.cmd('fill', a => { brush.color = a.color || brush.color; A.fillColor(); return { color: brush.color }; });
    TK.cmd('rotate', a => { rotate(a.dir === 'ccw' ? -1 : 1); return { ok: true }; });
    TK.cmd('flip', a => { flip(a.axis === 'v' ? 'v' : 'h'); return { ok: true }; });
    TK.cmd('resize', a => { const olds = layers.map(l => l.canvas); resizeDoc(a.w, a.h, false); layers.forEach((l, i) => olds[i] && l.canvas.getContext('2d').drawImage(olds[i], 0, 0, doc.w, doc.h)); render(); push(); return { w: doc.w, h: doc.h }; });
    TK.cmd('export', a => { exportImage(a.format === 'jpg' ? 'jpeg' : 'png'); return { ok: true }; });
    TK.cmd('set_tool', a => { const el = document.querySelector(`.tool[data-tool="${a.tool}"]`); if (el) el.click(); return { tool }; });
    TK.cmd('add_layer', a => { addLayerObj(a.name); active = layers.length - 1; render(); push(); return { layers: layers.length }; });
    TK.cmd('flatten', () => { A.flatten(); return { layers: layers.length }; });
    TK.cmd('zoom', a => { setZoom(a.level === 'fit' ? Math.min(1, 800 / doc.w) : (a.value || 1)); return { zoom }; });
    TK.cmd('ai_edit', a => { aiEditPrompt(a.prompt); return { started: true }; });

    async function aiEditPrompt(p) {
        try {
            const out = await TK.ai(`Yêu cầu: "${p}". Trả JSON: {"filter":"none|grayscale|sepia|invert|vintage|vivid|cold|warm|blur|sharpen","brightness":-100..100,"contrast":-100..100,"saturation":-100..100,"temperature":-100..100,"note":"..."}`, { json: true, system: 'Chỉ trả JSON.' });
            if (!out) return;
            if (out.filter) setFilter(out.filter);
            ['brightness', 'contrast', 'saturation', 'temperature'].forEach(k => { if (typeof out[k] === 'number') adjust[k] = TK.clamp(out[k], -100, 100); });
            syncAdjustUI(); render(); push();
        } catch (e) { TK.toast('AI lỗi: ' + e.message, 'error'); }
    }

    /* chạy */
    resizeDoc(1200, 800, false);
    makeDemo();
    syncAdjustUI();
    hist.reset(); push();
    A.zoomFit();
    TK.status('Sẵn sàng — ảnh mẫu 1200×800, 2 lớp');
})();
