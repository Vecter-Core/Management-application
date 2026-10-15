/* ============================================================
   xPDF — xem & xử lý PDF THẬT trong trình duyệt
   PDF.js (render, tìm kiếm, trích chữ) + pdf-lib & fontkit
   (ghi chú thích vào PDF, gộp/tách/xoay/xóa trang, tạo PDF mới
   có tiếng Việt nhờ font DejaVu nhúng sẵn trong /vendor)
   ============================================================ */
(function () {
    'use strict';

    const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/legacy/build/pdf'] || null;
    const PDFLib = window.PDFLib || null;
    const fontkit = window.fontkit || null;
    if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';
    if (PDFLib && fontkit && PDFLib.PDFDocument.registerFontkit) PDFLib.PDFDocument.registerFontkit(fontkit);

    const cv = document.getElementById('pageCanvas');
    const overlay = document.getElementById('overlay');
    const drawLayer = document.getElementById('drawLayer');
    const viewer = document.getElementById('viewer');
    const pageBox = document.getElementById('pageBox');

    let pdf = null, bytes = null, fileName = 'document.pdf';
    let pageCount = 0, cur = 1, scale = 1.25, viewRot = 0;
    let tool = 'view';
    let anns = {};            // { "3": [ann, ...] }
    let annUid = 1;
    let sigData = null;
    let pageDims = { w: 595, h: 842 };
    let searchResults = [];
    let tmpMarks = [];
    let busy = false;

    /* ================= tiện ích ================= */
    const rot = () => ((viewRot % 360) + 360) % 360;
    const list = n => (anns[n] = anns[n] || []);
    const allAnns = () => Object.keys(anns).reduce((n, k) => n + anns[k].length, 0);
    function toDisplay(a) {
        const r = rot();
        if (a.type === 'draw') {
            return a.points.map(p => ({
                0: { U: p.un, V: p.vn }, 90: { U: 1 - p.vn, V: p.un },
                180: { U: 1 - p.un, V: 1 - p.vn }, 270: { U: p.vn, V: 1 - p.un }
            }[r]));
        }
        const u = a.un, v = a.vn, w = a.wu, h = a.hv;
        return { 0: { U: u, V: v, UW: w, VH: h }, 90: { U: 1 - v - h, V: u, UW: h, VH: w }, 180: { U: 1 - u - w, V: 1 - v - h, UW: w, VH: h }, 270: { U: v, V: 1 - u - w, UW: h, VH: w } }[r];
    }
    function invPoint(U, V) {
        const r = rot();
        return { 0: { un: U, vn: V }, 90: { un: V, vn: 1 - U }, 180: { un: 1 - U, vn: 1 - V }, 270: { un: 1 - V, vn: U } }[r];
    }
    function invRect(Umin, Vmin, UW, VH) {
        const r = rot();
        return {
            0: { un: Umin, vn: Vmin, wu: UW, hv: VH },
            90: { un: Vmin, vn: 1 - Umin - UW, wu: VH, hv: UW },
            180: { un: 1 - Umin - UW, vn: 1 - Vmin - VH, wu: UW, hv: VH },
            270: { un: 1 - Vmin - VH, vn: Umin, wu: VH, hv: UW }
        }[r];
    }
    function dpos(e) {
        const r = overlay.getBoundingClientRect();
        return { U: TK.clamp((e.clientX - r.left) / r.width, 0, 1), V: TK.clamp((e.clientY - r.top) / r.height, 0, 1) };
    }
    function needPdf() { if (!pdf) { TK.toast('Chưa mở PDF nào — bấm 📂 Mở hoặc tạo PDF mới', 'error'); return false; } return true; }
    function needLib() {
        if (!PDFLib) { TK.toast('Thiếu thư viện pdf-lib trong /vendor — chức năng ghi PDF không chạy được', 'error'); return false; }
        return true;
    }

    /* ================= mở file ================= */
    async function openFile(file, data) {
        if (!pdfjsLib) return TK.toast('PDF.js chưa nạp được (kiểm tra /vendor/pdf.min.js)', 'error');
        try {
            busy = true;
            TK.status('Đang mở ' + (file ? file.name : 'PDF') + '…');
            let buf = data || (file ? await TK.readAsArrayBuffer(file) : null);
            if (!buf) return;
            bytes = new Uint8Array(buf.slice(0));
            fileName = (file && file.name) || fileName;
            let task;
            try { task = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise; }
            catch (err) {
                if (err && err.name === 'PasswordException') {
                    const pw = await TK.prompt('PDF được mã hóa', 'Nhập mật khẩu để mở ' + fileName + ':', '');
                    if (!pw) { busy = false; return TK.toast('Đã hủy mở file', 'error'); }
                    task = await pdfjsLib.getDocument({ data: bytes.slice(0), password: pw }).promise;
                } else throw err;
            }
            pdf = task;
            pageCount = pdf.numPages;
            cur = 1;
            anns = {};
            const p1 = await pdf.getPage(1);
            pageDims = { w: p1.view[2] - p1.view[0], h: p1.view[3] - p1.view[1] };
            document.getElementById('emptyBox').style.display = 'none';
            document.getElementById('pageCount').textContent = '/ ' + pageCount;
            fitWidth(true);
            await renderPage(1);
            buildThumbs();
            updateInfo();
            busy = false;
            TK.toast(`Đã mở ${fileName} — ${pageCount} trang, ${Math.round(pageDims.w)}×${Math.round(pageDims.h)}pt`, 'ok');
        } catch (e) {
            busy = false;
            TK.toast('Không mở được PDF: ' + e.message, 'error');
        }
    }
    async function loadBytes(u8, name, keepView) {
        const blob = new Blob([u8], { type: 'application/pdf' });
        const ab = await blob.arrayBuffer();
        await openFile({ name: name || fileName }, ab);
        if (!keepView) { anns = {}; renderOverlay(); renderAnnList(); }
    }

    /* ================= render trang ================= */
    async function renderPage(n) {
        if (!pdf) return;
        n = TK.clamp(n || cur, 1, pageCount);
        cur = n;
        const p = await pdf.getPage(n);
        const rotation = (p.rotate + rot()) % 360;
        const vp = p.getViewport({ scale, rotation });
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.max(1, Math.round(vp.width * dpr));
        cv.height = Math.max(1, Math.round(vp.height * dpr));
        cv.style.width = Math.round(vp.width) + 'px';
        cv.style.height = Math.round(vp.height) + 'px';
        pageBox.style.width = Math.round(vp.width) + 'px';
        pageBox.style.height = Math.round(vp.height) + 'px';
        pageDims = { w: p.view[2] - p.view[0], h: p.view[3] - p.view[1] };
        await p.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] }).promise;
        document.getElementById('pageInput').value = n;
        document.getElementById('stPage').textContent = `Trang ${n}/${pageCount}`;
        document.getElementById('zoomLabel').textContent = Math.round(scale * 100) + '%';
        document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('on', +t.dataset.p === n));
        renderOverlay();
    }

    /* ================= lớp chú thích ================= */
    function renderOverlay() {
        Array.prototype.slice.call(overlay.children).forEach(c => { if (c !== drawLayer) c.remove(); });
        (list(cur) || []).forEach(a => overlay.appendChild(nodeOf(a)));
        tmpMarks.filter(m => m.page === cur).forEach(m => overlay.appendChild(nodeOf(m, true)));
        overlay.style.cursor = tool === 'view' ? 'default' : tool === 'erase' ? 'not-allowed' : 'crosshair';
        document.getElementById('stAnn').textContent = allAnns() + ' chú thích';
    }
    function nodeOf(a, tmp) {
        const d = toDisplay(a);
        let n;
        if (a.type === 'draw') {
            n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            n.setAttribute('viewBox', '0 0 100 100');
            n.setAttribute('preserveAspectRatio', 'none');
            n.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
            const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            pl.setAttribute('points', d.map(p => `${(p.U * 100).toFixed(3)},${(p.V * 100).toFixed(3)}`).join(' '));
            pl.setAttribute('fill', 'none');
            pl.setAttribute('stroke', a.color || '#ff4040');
            pl.setAttribute('stroke-width', a.size || 3);
            pl.setAttribute('stroke-linecap', 'round');
            pl.setAttribute('stroke-linejoin', 'round');
            pl.setAttribute('vector-effect', 'non-scaling-stroke');
            pl.setAttribute('opacity', (a.opacity == null ? 90 : a.opacity) / 100);
            n.appendChild(pl);
        } else if (a.type === 'note') {
            n = document.createElement('div');
            n.className = 'note';
            n.style.cssText = `left:${d.U * 100}%;top:${d.V * 100}%;font-size:${14 + (a.size || 3)}px;`;
            n.textContent = '📝';
            n.title = a.text || 'Ghi chú';
            if (a.color) n.style.filter = `drop-shadow(0 0 3px ${a.color})`;
        } else if (a.type === 'sign') {
            n = document.createElement('div');
            n.className = 'sign';
            n.style.cssText = `left:${d.U * 100}%;top:${d.V * 100}%;width:${d.UW * 100}%;height:${d.VH * 100}%;`;
            n.innerHTML = `<img src="${a.dataUrl}" alt="chữ ký">`;
        } else {
            n = document.createElement('div');
            n.className = 'hl' + (tmp ? ' tmp' : '');
            n.style.cssText = `left:${d.U * 100}%;top:${d.V * 100}%;width:${Math.max(0.4, d.UW * 100)}%;height:${Math.max(0.6, d.VH * 100)}%;opacity:${(a.opacity == null ? 45 : a.opacity) / 100};`;
            if (a.color && a.color !== '#ffeb3b') n.style.background = hexA(a.color, 0.42);
            if (a.text) n.title = a.text;
        }
        n.dataset.id = a.id || '';
        n.dataset.page = a.page || cur;
        if (!tmp) n.style.pointerEvents = tool === 'erase' ? 'auto' : 'none';
        else n.style.pointerEvents = 'none';
        if (tmp) n.style.outline = '1.5px dashed rgba(255,64,64,.9)';
        return n;
    }
    function hexA(hex, alpha) {
        try {
            const [r, g, b] = TK.hexToRgb(hex);
            return `rgba(${r},${g},${b},${alpha})`;
        } catch (e) { return hex; }
    }

    /* ================= tương tác tạo chú thích ================= */
    let drag = null;
    overlay.addEventListener('pointerdown', e => {
        if (!pdf || tool === 'view') return;
        overlay.setPointerCapture(e.pointerId);
        const p = dpos(e);
        if (tool === 'erase') {
            const t = e.target.closest('[data-id]');
            if (t && t.dataset.id) {
                const arr = list(+t.dataset.page);
                const i = arr.findIndex(a => String(a.id) === t.dataset.id);
                if (i > -1) { arr.splice(i, 1); renderOverlay(); renderAnnList(); TK.status('🧽 Đã xóa 1 chú thích'); }
            } else TK.toast('Bấm trực tiếp lên chú thích cần xóa', 'error');
            return;
        }
        if (tool === 'note') { addNote(p); return; }
        if (tool === 'sign') {
            if (!sigData) return TK.toast('Chưa có chữ ký — vẽ ở ô "Chữ ký" panel phải rồi bấm "✔ Dùng chữ ký này"', 'error');
            drag = { mode: 'sign', p0: p };
            return;
        }
        drag = { mode: tool, p0: p, pts: [p] };
    });
    overlay.addEventListener('pointermove', e => {
        if (!drag) return;
        const p = dpos(e);
        if (drag.mode === 'draw') {
            drag.pts.push(p);
            drawLayer.innerHTML = `<polyline points="${drag.pts.map(q => `${q.U * 100},${q.V * 100}`).join(' ')}" fill="none" stroke="${curColor()}" stroke-width="${curSize()}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>`;
        } else {
            drag.p1 = p;
            const x = Math.min(drag.p0.U, p.U), y = Math.min(drag.p0.V, p.V);
            const w = Math.abs(p.U - drag.p0.U), h = Math.abs(p.V - drag.p0.V);
            drawLayer.innerHTML = drag.mode === 'sign'
                ? `<rect x="${x * 100}" y="${y * 100}" width="${w * 100}" height="${h * 100}" fill="none" stroke="#7b2ff7" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="4 3"/>`
                : `<rect x="${x * 100}" y="${y * 100}" width="${w * 100}" height="${h * 100}" fill="${hexA(curColor(), .3)}" stroke="${curColor()}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
        }
    });
    overlay.addEventListener('pointerup', e => {
        if (!drag) return;
        drawLayer.innerHTML = '';
        const p = dpos(e);
        if (drag.mode === 'draw') {
            if (drag.pts.length < 2) { drag = null; return; }
            const pts = drag.pts.map(q => invPoint(q.U, q.V));
            const a = { id: 'a' + annUid++, type: 'draw', page: cur, points: pts, color: curColor(), size: curSize(), opacity: 90, text: document.getElementById('noteText').value.trim() };
            list(cur).push(a);
            TK.status('✏️ Đã vẽ 1 nét (' + pts.length + ' điểm) trên trang ' + cur);
        } else {
            const Umin = Math.min(drag.p0.U, p.U), Vmin = Math.min(drag.p0.V, p.V);
            const UW = Math.abs(p.U - drag.p0.U), VH = Math.abs(p.V - drag.p0.V);
            if (drag.mode === 'sign') {
                if (UW < 0.02 || VH < 0.01) { drag = null; return TK.toast('Kéo thành khung chữ nhật để đặt chữ ký', 'error'); }
                const r = invRect(Umin, Vmin, UW, VH);
                list(cur).push({ id: 'a' + annUid++, type: 'sign', page: cur, dataUrl: sigData, un: r.un, vn: r.vn, wu: r.wu, hv: r.hv, text: 'Chữ ký' });
                TK.status('✒️ Đã đóng dấu chữ ký trang ' + cur);
            } else {
                if (UW < 0.005) { drag = null; return; }
                const r = invRect(Umin, Vmin, UW, Math.max(VH, 0.014));
                list(cur).push({ id: 'a' + annUid++, type: 'highlight', page: cur, un: r.un, vn: r.vn, wu: r.wu, hv: r.hv, color: curColor(), opacity: curOpacity(), text: document.getElementById('noteText').value.trim() });
                TK.status('🖍 Đã đánh dấu trang ' + cur);
            }
        }
        drag = null;
        renderOverlay(); renderAnnList();
    });
    async function addNote(p) {
        const pre = document.getElementById('noteText').value.trim();
        const txt = pre || await TK.prompt('Ghi chú', 'Nội dung ghi chú (sẽ được ghi thẳng vào PDF khi xuất):', '');
        if (!txt) return;
        const q = invPoint(p.U, p.V);
        list(cur).push({ id: 'a' + annUid++, type: 'note', page: cur, un: q.un, vn: q.vn, wu: 0.03, hv: 0.03, color: curColor(), size: curSize(), text: txt });
        document.getElementById('noteText').value = '';
        renderOverlay(); renderAnnList();
        TK.status('📝 Đã thêm ghi chú: ' + txt.slice(0, 40));
    }
    const curColor = () => document.getElementById('annColor').value;
    const curSize = () => +document.getElementById('annSize').value;
    const curOpacity = () => +document.getElementById('annOpacity').value;

    /* ================= danh sách chú thích ================= */
    function renderAnnList() {
        const box = document.getElementById('tab-anns');
        const all = [];
        Object.keys(anns).forEach(k => anns[k].forEach(a => all.push(a)));
        all.sort((a, b) => (a.page - b.page));
        document.getElementById('stAnn').textContent = all.length + ' chú thích';
        if (!all.length) { box.innerHTML = '<div style="color:#888;font-size:11.5px;">Chưa có chú thích. Chọn 🖍 / ✏️ / 📝 / ✒️ trên thanh công cụ rồi thao tác trên trang.</div>'; return; }
        box.innerHTML = '';
        all.forEach(a => {
            const d = document.createElement('div');
            d.className = 'ann';
            d.style.borderLeftColor = a.color || '#ff4040';
            const label = { highlight: '🖍 Đánh dấu', draw: '✏️ Nét vẽ', note: '📝 Ghi chú', sign: '✒️ Chữ ký' }[a.type] || a.type;
            d.innerHTML = `<span>${label}</span><span class="txt"><b>Trang ${a.page}</b>${a.text ? '<br>' + esc(a.text.slice(0, 60)) : ''}</span><span class="x" title="Xóa">✕</span>`;
            d.addEventListener('click', ev => {
                if (ev.target.classList.contains('x')) {
                    anns[a.page] = (anns[a.page] || []).filter(x => x.id !== a.id);
                    renderAnnList(); renderOverlay(); return;
                }
                goTo(a.page);
            });
            box.appendChild(d);
        });
    }
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ================= thumbnail ================= */
    async function buildThumbs() {
        const box = document.getElementById('tab-thumbs');
        box.innerHTML = '<div style="color:#888;font-size:11.5px;">Đang tạo ảnh thu nhỏ…</div>';
        box.innerHTML = '';
        const n = Math.min(pageCount, 300);
        for (let i = 1; i <= n; i++) {
            try {
                const p = await pdf.getPage(i);
                const vp = p.getViewport({ scale: 0.22 });
                const c = document.createElement('canvas');
                c.width = Math.round(vp.width); c.height = Math.round(vp.height);
                await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
                const d = document.createElement('div');
                d.className = 'thumb' + (i === cur ? ' on' : '');
                d.dataset.p = i;
                d.appendChild(c);
                d.insertAdjacentHTML('beforeend', `<span class="n">${i}</span>`);
                d.addEventListener('click', () => goTo(i));
                box.appendChild(d);
            } catch (e) { break; }
        }
        if (pageCount > n) box.insertAdjacentHTML('beforeend', `<div style="color:#888;font-size:11px;">… ${pageCount - n} trang nữa không hiển thị thumbnail</div>`);
    }
    function goTo(n) {
        n = TK.clamp(+n || 1, 1, pageCount);
        renderPage(n);
        viewer.scrollTop = 0;
    }

    /* ================= zoom ================= */
    function fitWidth(silent) {
        if (!pdf) return;
        const avail = viewer.clientWidth - 56;
        const r = rot() % 180 === 0 ? pageDims.w : pageDims.h;
        scale = TK.clamp(avail / r, 0.2, 6);
        renderPage(cur);
        if (!silent) TK.status('Vừa chiều rộng — ' + Math.round(scale * 100) + '%');
    }
    function fitPage() {
        if (!pdf) return;
        const availW = viewer.clientWidth - 56, availH = viewer.clientHeight - 56;
        const w = rot() % 180 === 0 ? pageDims.w : pageDims.h;
        const h = rot() % 180 === 0 ? pageDims.h : pageDims.w;
        scale = TK.clamp(Math.min(availW / w, availH / h), 0.1, 6);
        renderPage(cur);
        TK.status('Vừa trang — ' + Math.round(scale * 100) + '%');
    }

    /* ================= trích chữ & tìm kiếm ================= */
    async function pageText(n) {
        const p = await pdf.getPage(n);
        const tc = await p.getTextContent();
        let out = '', lastY = null;
        tc.items.forEach(it => {
            if (!it.str) return;
            const y = it.transform[5];
            if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n';
            out += it.str + (it.hasEOL ? '\n' : ' ');
            lastY = y;
        });
        return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    async function doSearch() {
        if (!needPdf()) return;
        const q = document.getElementById('searchInput').value.trim();
        if (!q) return TK.toast('Nhập từ cần tìm', 'error');
        const box = document.getElementById('tab-search');
        box.innerHTML = '<div style="color:#888;font-size:11.5px;">Đang tìm…</div>';
        switchTab('search');
        TK.status('🔍 Đang tìm "' + q + '" trong ' + pageCount + ' trang…');
        searchResults = [];
        tmpMarks = [];
        const ql = q.toLowerCase();
        for (let i = 1; i <= pageCount; i++) {
            let p, tc;
            try { p = await pdf.getPage(i); tc = await p.getTextContent(); } catch (e) { continue; }
            const W = p.view[2] - p.view[0], H = p.view[3] - p.view[1];
            const vp1 = p.getViewport({ scale: 1 });
            let pageHits = 0;
            tc.items.forEach(it => {
                const s = it.str || '';
                if (!s.toLowerCase().includes(ql)) return;
                pageHits++;
                const tr = pdfjsLib.Util.transform(vp1.transform, it.transform);
                const fh = Math.abs(tr[3] || tr[0] || 10);
                searchResults.push({
                    page: i, snippet: s.trim().slice(0, 90),
                    un: TK.clamp(tr[4] / W, 0, 1), vn: TK.clamp(1 - tr[5] / H - fh / H, 0, 1),
                    wu: TK.clamp((s.length * fh * 0.5) / W, 0.01, 1 - TK.clamp(tr[4] / W, 0, 1)), hv: (fh * 1.35) / H
                });
            });
            if (pageHits) {
                const d = document.createElement('div');
                d.className = 'searchres';
                d.innerHTML = `<b>Trang ${i}</b> · ${pageHits} kết quả<br>${esc(searchResults[searchResults.length - 1].snippet)}`;
                d.addEventListener('click', () => {
                    const r = searchResults.filter(x => x.page === i)[0];
                    goTo(i);
                    showTmp(r);
                });
                box.appendChild(d);
            }
        }
        if (!searchResults.length) box.innerHTML = `<div style="color:#c99;font-size:11.5px;">Không tìm thấy "<b>${esc(q)}</b>".<br>Lưu ý: PDF lưu chữ theo từng mảnh, nên cụm từ trải qua nhiều mảnh có thể không khớp. Thử tìm 1 từ ngắn hơn, hoặc PDF là bản scan (ảnh) thì không có lớp chữ để tìm.</div>`;
        else box.insertAdjacentHTML('afterbegin', `<div style="color:#9a9aa5;font-size:11.5px;margin-bottom:6px;">${searchResults.length} kết quả cho "<b style="color:#ff4040;">${esc(q)}</b>" — bấm để nhảy tới và đánh dấu tạm.</div>`);
        TK.status(`🔍 Tìm thấy ${searchResults.length} kết quả cho "${q}"`);
    }
    function showTmp(r) {
        tmpMarks = [{ id: 'tmp', type: 'highlight', page: r.page, un: r.un, vn: r.vn, wu: r.wu, hv: r.hv, color: '#ff4040', opacity: 55 }];
        renderOverlay();
    }
    async function highlightText(query, color) {
        if (!needPdf()) return 0;
        const ql = String(query).toLowerCase();
        let n = 0;
        for (let i = 1; i <= pageCount; i++) {
            const p = await pdf.getPage(i);
            const tc = await p.getTextContent();
            const W = p.view[2] - p.view[0], H = p.view[3] - p.view[1];
            const vp1 = p.getViewport({ scale: 1 });
            tc.items.forEach(it => {
                const s = it.str || '';
                if (!s.toLowerCase().includes(ql)) return;
                const tr = pdfjsLib.Util.transform(vp1.transform, it.transform);
                const fh = Math.abs(tr[3] || tr[0] || 10);
                const un = TK.clamp(tr[4] / W, 0, 1), vn = TK.clamp(1 - tr[5] / H - fh / H, 0, 1);
                list(i).push({
                    id: 'a' + annUid++, type: 'highlight', page: i, un, vn,
                    wu: TK.clamp((s.length * fh * 0.5) / W, 0.01, 1 - un), hv: (fh * 1.35) / H,
                    color: color || '#ffeb3b', opacity: 45, text: 'AI đánh dấu: ' + query
                });
                n++;
            });
        }
        renderOverlay(); renderAnnList();
        return n;
    }

    /* ================= pdf-lib: ghi chú thích ================= */
    async function getFonts(doc) {
        try {
            const [reg, bold] = await Promise.all([
                fetch('../vendor/DejaVuSans.ttf').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null),
                fetch('../vendor/DejaVuSans-Bold.ttf').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)
            ]);
            if (reg) return { f: await doc.embedFont(reg, { subset: true }), b: bold ? await doc.embedFont(bold, { subset: true }) : null, unicode: true };
        } catch (e) { /* rơi xuống Helvetica */ }
        return { f: await doc.embedFont(PDFLib.StandardFonts.Helvetica), b: await doc.embedFont(PDFLib.StandardFonts.HelveticaBold), unicode: false };
    }
    async function exportAnn() {
        if (!needPdf() || !needLib()) return;
        if (!allAnns()) return TK.toast('Chưa có chú thích nào để xuất — cứ dùng "Tải bản gốc" nếu chỉ muốn file gốc', 'error');
        TK.status('Đang ghi chú thích vào PDF…');
        try {
            const doc = await PDFLib.PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
            const fonts = await getFonts(doc);
            const { rgb } = PDFLib;
            let noteCount = 0, signCache = {};
            const pages = doc.getPages();
            const jobs = [];
            Object.keys(anns).forEach(k => {
                const pi = (+k) - 1;
                const page = pages[pi];
                if (!page) return;
                const { width: W, height: H } = page.getSize();
                anns[k].forEach(a => {
                    const c = hexToRgbObj(a.color || '#ffeb3b', rgb);
                    if (a.type === 'highlight') {
                        page.drawRectangle({ x: a.un * W, y: H - (a.vn + a.hv) * H, width: Math.max(2, a.wu * W), height: Math.max(2, a.hv * H), color: c, opacity: (a.opacity == null ? 45 : a.opacity) / 100 });
                    } else if (a.type === 'draw') {
                        const pts = (a.points || []).map(p => ({ x: p.un * W, y: H - p.vn * H }));
                        for (let i = 1; i < pts.length; i++) {
                            page.drawLine({ start: pts[i - 1], end: pts[i], thickness: a.size || 2, color: c, opacity: (a.opacity == null ? 90 : a.opacity) / 100 });
                        }
                    } else if (a.type === 'note') {
                        noteCount++;
                        const x = a.un * W, y = H - a.vn * H;
                        page.drawRectangle({ x, y: y - 12, width: 12, height: 12, color: rgb(1, 0.85, 0.2), borderColor: rgb(0.6, 0.45, 0), borderWidth: 0.8 });
                        const label = fonts.unicode ? `Ghi chú ${noteCount}: ${a.text || ''}` : `Note ${noteCount} (xem file .json kèm theo)`;
                        const size = 9;
                        const maxW = Math.max(60, W - x - 20);
                        wrapText(label, fonts.f, size, maxW).slice(0, 8).forEach((line, i) => {
                            page.drawText(line, { x: x + 16, y: y - 4 - i * (size + 2), size, font: fonts.f, color: rgb(0.1, 0.1, 0.1) });
                        });
                    } else if (a.type === 'sign' && a.dataUrl) {
                        const key = a.dataUrl.slice(-60);
                        jobs.push((async () => {
                            try {
                                const img = signCache[key] || (signCache[key] = await (/png/i.test(a.dataUrl.slice(0, 30)) ? doc.embedPng(a.dataUrl) : doc.embedJpg(a.dataUrl)));
                                page.drawImage(img, { x: a.un * W, y: H - (a.vn + a.hv) * H, width: Math.max(10, a.wu * W), height: Math.max(6, a.hv * H) });
                            } catch (e) { TK.toast('Không nhúng được chữ ký: ' + e.message, 'error'); }
                        })());
                    }
                });
            });
            await Promise.all(jobs);
            const out = await doc.save();
            TK.download(new Blob([out], { type: 'application/pdf' }), fileName.replace(/\.pdf$/i, '') + '-da-chu-thich.pdf');
            if (noteCount && !fonts.unicode) TK.download(new Blob([JSON.stringify(anns, null, 1)], { type: 'application/json' }), fileName.replace(/\.pdf$/i, '') + '-chu-thich.json');
            TK.toast(`💾 Đã xuất PDF với ${allAnns()} chú thích (${noteCount} ghi chú)${fonts.unicode ? '' : ' — font tiếng Việt không nhúng được, đã xuất kèm JSON'}`, 'ok');
            TK.status('Xuất PDF chú thích hoàn tất');
        } catch (e) {
            TK.toast('Ghi PDF thất bại: ' + e.message, 'error');
        }
    }
    function hexToRgbObj(hex, rgb) {
        try { const [r, g, b] = TK.hexToRgb(hex); return rgb(r / 255, g / 255, b / 255); } catch (e) { return rgb(1, 0.9, 0.2); }
    }
    function wrapText(text, font, size, maxW) {
        const words = String(text).split(/\s+/);
        const lines = [];
        let line = '';
        words.forEach(w => {
            const t = line ? line + ' ' + w : w;
            let width = t.length * size * 0.5;
            try { width = font.widthOfTextAtSize(t, size); } catch (e) {}
            if (width > maxW && line) { lines.push(line); line = w; } else line = t;
        });
        if (line) lines.push(line);
        return lines;
    }

    /* ================= pdf-lib: tổ chức trang ================= */
    async function withDoc(fn, outName, reload) {
        if (!needPdf() || !needLib()) return;
        try {
            const doc = await PDFLib.PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
            const r = await fn(doc);
            if (r === false) return;
            const out = await doc.save();
            TK.download(new Blob([out], { type: 'application/pdf' }), outName);
            TK.toast('💾 Đã xuất ' + outName, 'ok');
            if (reload) await loadBytes(out, outName);
            return out;
        } catch (e) { TK.toast('Thao tác PDF thất bại: ' + e.message, 'error'); }
    }
    function parseRanges(str, max) {
        const out = [];
        String(str).split(',').forEach(part => {
            const m = /^(\d+)\s*-\s*(\d+)$/.exec(part.trim());
            if (m) { for (let i = +m[1]; i <= +m[2]; i++) if (i >= 1 && i <= max) out.push(i - 1); }
            else { const n = parseInt(part, 10); if (n >= 1 && n <= max) out.push(n - 1); }
        });
        return Array.from(new Set(out));
    }

    /* ================= tạo PDF mới ================= */
    const PAPER = { a4: [595.28, 841.89], letter: [612, 792], a5: [419.53, 595.28] };
    async function createFromText(text, opts) {
        if (!needLib()) return null;
        const o = opts || {};
        const body = String(text == null ? document.getElementById('newText').value : text);
        if (!body.trim()) { TK.toast('Chưa có nội dung để tạo PDF', 'error'); return null; }
        const size = TK.clamp(+(o.fontSize || document.getElementById('newSize').value) || 12, 6, 40);
        const paper = PAPER[String(o.paper || document.getElementById('newPaper').value).toLowerCase()] || PAPER.a4;
        try {
            const doc = await PDFLib.PDFDocument.create();
            doc.setTitle(o.title || fileName || 'Tài liệu RUNE');
            doc.setProducer('RUNE xPDF');
            doc.setCreator('RUNE Local Control Center');
            doc.setCreationDate(new Date());
            const fonts = await getFonts(doc);
            const { rgb } = PDFLib;
            const M = 56, lineH = size * 1.5;
            const maxW = paper[0] - M * 2;
            let page = doc.addPage(paper);
            let y = paper[1] - M;
            if (o.title) {
                const ts = size + 8;
                wrapText(o.title, fonts.b || fonts.f, ts, maxW).forEach(l => {
                    if (y < M + ts) { page = doc.addPage(paper); y = paper[1] - M; }
                    page.drawText(l, { x: M, y, size: ts, font: fonts.b || fonts.f, color: rgb(0.08, 0.08, 0.1) });
                    y -= ts * 1.35;
                });
                y -= 6;
                page.drawLine({ start: { x: M, y }, end: { x: paper[0] - M, y }, thickness: 0.8, color: rgb(0.8, 0.2, 0.2) });
                y -= lineH;
            }
            body.split('\n').forEach(raw => {
                const line = raw.replace(/\t/g, '    ');
                const isHead = /^(#{1,3})\s+/.test(line);
                const txt = line.replace(/^#{1,6}\s+/, '');
                const f = isHead ? (fonts.b || fonts.f) : fonts.f;
                const s = isHead ? size + 4 : size;
                if (!txt.trim()) { y -= lineH * 0.6; return; }
                wrapText(txt, f, s, maxW).forEach(l => {
                    if (y < M + s) { page = doc.addPage(paper); y = paper[1] - M; }
                    page.drawText(l, { x: M, y, size: s, font: f, color: rgb(0.1, 0.1, 0.12) });
                    y -= s * 1.5;
                });
            });
            // số trang
            doc.getPages().forEach((p, i) => {
                const t = `${i + 1} / ${doc.getPageCount()}`;
                p.drawText(t, { x: paper[0] / 2 - 18, y: 28, size: 9, font: fonts.f, color: rgb(0.45, 0.45, 0.5) });
            });
            const out = await doc.save();
            const name = (o.name || 'tai-lieu-rune') + '.pdf';
            TK.download(new Blob([out], { type: 'application/pdf' }), name);
            await loadBytes(out, name);
            TK.toast(`📄 Đã tạo PDF ${doc.getPageCount()} trang từ ${body.trim().split(/\s+/).length} từ${fonts.unicode ? ' (font tiếng Việt đã nhúng)' : ''}`, 'ok');
            return out;
        } catch (e) { TK.toast('Tạo PDF lỗi: ' + e.message, 'error'); return null; }
    }
    async function createFromImages() {
        if (!needLib()) return;
        const files = await TK.pickFiles('image/*');
        if (!files || !files.length) return;
        try {
            TK.status('Đang tạo PDF từ ' + files.length + ' ảnh…');
            const doc = await PDFLib.PDFDocument.create();
            for (const f of files) {
                const data = await TK.readAsDataURL(f);
                const img = /png$/i.test(data.slice(0, 30)) || /\.png$/i.test(f.name) ? await doc.embedPng(data) : await doc.embedJpg(data);
                const maxW = 595.28 - 40, maxH = 841.89 - 40;
                const k = Math.min(maxW / img.width, maxH / img.height, 1.6);
                const page = doc.addPage([Math.max(img.width * k + 40, 300), Math.max(img.height * k + 40, 300)]);
                page.drawImage(img, { x: 20, y: 20, width: img.width * k, height: img.height * k });
            }
            const out = await doc.save();
            const name = 'anh-thanh-pdf-' + files.length + 'trang.pdf';
            TK.download(new Blob([out], { type: 'application/pdf' }), name);
            await loadBytes(out, name);
            TK.toast(`🖼 Đã tạo PDF ${files.length} trang từ ảnh`, 'ok');
        } catch (e) { TK.toast('Tạo PDF từ ảnh lỗi: ' + e.message, 'error'); }
    }
    async function createEmpty() {
        if (!needLib()) return;
        const doc = await PDFLib.PDFDocument.create();
        const fonts = await getFonts(doc);
        const page = doc.addPage(PAPER.a4);
        page.drawText('Tai lieu trong - RUNE xPDF', { x: 56, y: PAPER.a4[1] - 80, size: 16, font: fonts.f, color: PDFLib.rgb(0.6, 0.6, 0.65) });
        const out = await doc.save();
        await loadBytes(out, 'tai-lieu-trong.pdf');
        TK.toast('📄 Đã tạo PDF trắng A4 — dùng menu "Chú thích" để viết lên, rồi xuất ra', 'ok');
    }

    /* ================= in / PNG ================= */
    async function printDoc() {
        if (!needPdf()) return;
        const area = document.getElementById('printArea');
        area.innerHTML = '<div style="color:#fff;font-family:sans-serif;padding:20px;">Đang render ' + pageCount + ' trang để in…</div>';
        TK.status('Đang render tất cả trang để in…');
        area.innerHTML = '';
        for (let i = 1; i <= pageCount; i++) {
            const p = await pdf.getPage(i);
            const vp = p.getViewport({ scale: 1.6 });
            const c = document.createElement('canvas');
            c.width = vp.width; c.height = vp.height;
            c.style.cssText = 'width:100%;page-break-after:always;display:block;';
            await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            // vẽ chú thích lên canvas in
            const ctx = c.getContext('2d');
            (list(i) || []).forEach(a => {
                const d = toDisplay(a);
                if (a.type === 'highlight') {
                    ctx.globalAlpha = (a.opacity == null ? 45 : a.opacity) / 100;
                    ctx.fillStyle = a.color || '#ffeb3b';
                    ctx.fillRect(d.U * vp.width, d.V * vp.height, d.UW * vp.width, d.VH * vp.height);
                    ctx.globalAlpha = 1;
                } else if (a.type === 'draw') {
                    ctx.strokeStyle = a.color || '#f00'; ctx.lineWidth = a.size || 2; ctx.lineCap = 'round';
                    ctx.beginPath();
                    d.forEach((q, k) => k ? ctx.lineTo(q.U * vp.width, q.V * vp.height) : ctx.moveTo(q.U * vp.width, q.V * vp.height));
                    ctx.stroke();
                } else if (a.type === 'note') {
                    ctx.font = '16px Segoe UI'; ctx.fillText('📝 ' + (a.text || ''), d.U * vp.width, d.V * vp.height + 14);
                }
            });
            area.appendChild(c);
        }
        TK.toast('Mở hộp thoại in — chọn "Lưu dưới dạng PDF" nếu muốn xuất file', 'ok');
        setTimeout(() => { window.print(); setTimeout(() => { area.innerHTML = ''; }, 1500); }, 300);
    }
    async function exportPagePng() {
        if (!needPdf()) return;
        TK.download(cv.toDataURL('image/png'), `${fileName.replace(/\.pdf$/i, '')}-trang${cur}.png`);
        TK.status('Đã xuất PNG trang ' + cur + ' (' + cv.width + '×' + cv.height + ')');
    }

    /* ================= chữ ký ================= */
    const sigPad = document.getElementById('sigPad');
    const sctx = sigPad.getContext('2d');
    let sigDrawing = false, sigHas = false;
    function sigReset() {
        sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, sigPad.width, sigPad.height);
        sctx.strokeStyle = '#111'; sctx.lineWidth = 2.6; sctx.lineCap = 'round'; sctx.lineJoin = 'round';
        sigHas = false;
    }
    sigPad.addEventListener('pointerdown', e => {
        sigDrawing = true; sigPad.setPointerCapture(e.pointerId);
        const r = sigPad.getBoundingClientRect();
        sctx.beginPath();
        sctx.moveTo((e.clientX - r.left) * sigPad.width / r.width, (e.clientY - r.top) * sigPad.height / r.height);
    });
    sigPad.addEventListener('pointermove', e => {
        if (!sigDrawing) return;
        const r = sigPad.getBoundingClientRect();
        sctx.lineTo((e.clientX - r.left) * sigPad.width / r.width, (e.clientY - r.top) * sigPad.height / r.height);
        sctx.stroke(); sigHas = true;
    });
    sigPad.addEventListener('pointerup', () => { sigDrawing = false; });
    sigReset();

    /* ================= thông tin ================= */
    async function updateInfo() {
        const box = document.getElementById('infoBox');
        document.getElementById('stFile').textContent = fileName + (bytes ? ' · ' + (bytes.length / 1024).toFixed(0) + ' KB' : '');
        if (!pdf) { box.textContent = 'Chưa mở tài liệu.'; return; }
        let meta = {};
        try { meta = (await pdf.getMetadata()) || {}; } catch (e) {}
        const info = meta.info || {};
        const p = await pdf.getPage(cur);
        box.innerHTML = `<b>File:</b> ${esc(fileName)}<br><b>Kích thước:</b> ${bytes ? (bytes.length / 1024).toFixed(1) + ' KB' : '?'}<br>
        <b>Số trang:</b> ${pageCount}<br><b>Khổ trang:</b> ${Math.round(pageDims.w)} × ${Math.round(pageDims.h)} pt (${(pageDims.w / 72).toFixed(2)}×${(pageDims.h / 72).toFixed(2)} in)<br>
        <b>Trang hiện tại xoay:</b> ${(p.rotate + rot()) % 360}°<br>
        <b>PDF version:</b> ${esc(info.PDFFormatVersion || '?')}<br>
        <b>Tiêu đề:</b> ${esc(info.Title || '—')}<br><b>Tác giả:</b> ${esc(info.Author || '—')}<br>
        <b>Phần mềm tạo:</b> ${esc(info.Creator || info.Producer || '—')}<br>
        <b>Ngày tạo:</b> ${esc(info.CreationDate ? String(info.CreationDate).slice(0, 16) : '—')}<br>
        <b>Mã hóa:</b> ${esc((meta.isEncrypted || info.IsEncrypted) ? 'có' : 'không')}<br>
        <b>Chú thích:</b> ${allAnns()}`;
    }

    /* ================= AI ================= */
    async function aiAction(kind) {
        if (!needPdf()) return;
        let text = '';
        if (kind === 'page') text = await pageText(cur);
        else {
            TK.status('✨ Đang trích chữ toàn tài liệu cho AI…');
            const maxP = Math.min(pageCount, 40);
            for (let i = 1; i <= maxP; i++) { try { text += `\n[Trang ${i}]\n` + await pageText(i); } catch (e) {} }
            if (pageCount > maxP) text += `\n(… còn ${pageCount - maxP} trang chưa trích)`;
        }
        if (!text.trim()) return TK.toast('PDF này không có lớp chữ (bản scan/ảnh) nên AI không đọc được nội dung. Hãy thử chức năng "Xuất trang PNG" rồi dùng xPhoto/xPhoto AI để đọc ảnh.', 'error');
        const chunk = text.slice(0, 14000);
        let prompt = '';
        if (kind === 'summarize') prompt = `Tóm tắt tài liệu PDF sau bằng tiếng Việt: 5-8 gạch đầu dòng ý chính, rồi 1 đoạn kết luận ngắn. Nêu rõ số liệu quan trọng nếu có.\n\n${chunk}`;
        else if (kind === 'translate') prompt = `Dịch nội dung PDF sau sang ${/[\x00-\x7F\s]/.test(chunk.slice(0, 400)) ? 'tiếng Việt' : 'tiếng Anh'}, giữ cấu trúc mục/đoạn:\n\n${chunk}`;
        else if (kind === 'extract') prompt = `Trích dữ liệu từ PDF sau thành BẢNG (dùng cú pháp Markdown | cột |). Nếu có nhiều loại dữ liệu, tạo nhiều bảng kèm tiêu đề. Chỉ các giá trị có thật trong văn bản, không suy diễn.\n\n${chunk}`;
        else {
            const q = await TK.prompt('✨ Hỏi về trang ' + cur, 'Bạn muốn hỏi gì về trang này?', 'Trang này nói về điều gì và có số liệu nào quan trọng?');
            if (!q) return;
            prompt = `Dựa trên nội dung trang PDF sau, trả lời câu hỏi: "${q}". Trả lời bằng tiếng Việt, ngắn gọn, dẫn số liệu cụ thể nếu có. Nếu nội dung không đủ để trả lời, hãy nói rõ.\n\n${chunk}`;
        }
        TK.status('✨ AI đang đọc nội dung PDF…');
        try {
            const out = await TK.ai(prompt, { system: 'Bạn là trợ lý phân tích tài liệu. Trả lời bằng tiếng Việt, chính xác, không bịa số liệu.' });
            if (!out) return;
            TK.modal({ title: '✨ AI · ' + ({ summarize: 'Tóm tắt', translate: 'Dịch', extract: 'Trích dữ liệu', page: 'Trả lời' }[kind] || ''), message: String(out).slice(0, 2200), ok: 'Đóng', cancel: '' });
            TK.status('AI trả lời xong');
        } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message) + ' — vào trang Khóa của RUNE để nhập khóa AI', 'error'); }
    }

    /* ================= tabs ================= */
    function switchTab(name) {
        ['thumbs', 'anns', 'search'].forEach(t => {
            document.getElementById('tab-' + t).style.display = t === name ? 'block' : 'none';
        });
        document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
        if (name === 'anns') renderAnnList();
    }
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    /* ================= actions ================= */
    TK.init({ app: 'xpdf', status: '.statusbar [data-status-text]' });
    const A = {
        openFile() { TK.pickFile('.pdf,application/pdf').then(f => f && openFile(f)); },
        prevPage() { if (needPdf()) goTo(cur - 1); },
        nextPage() { if (needPdf()) goTo(cur + 1); },
        zoomIn() { if (!needPdf()) return; scale = TK.clamp(scale * 1.2, 0.15, 8); renderPage(cur); },
        zoomOut() { if (!needPdf()) return; scale = TK.clamp(scale / 1.2, 0.15, 8); renderPage(cur); },
        zoom100() { if (!needPdf()) return; scale = 1; renderPage(cur); TK.status('Zoom 100%'); },
        fitWidth() { fitWidth(); },
        fitPage() { fitPage(); },
        rotateView() { if (!needPdf()) return; viewRot = (viewRot + 90) % 360; renderPage(cur); TK.status('Xoay chế độ xem: ' + viewRot + '° (không đổi file gốc)'); },
        tool(e, elm) {
            tool = elm.dataset.arg;
            ['highlight', 'draw', 'note', 'sign', 'erase'].forEach(t => {
                const b = document.getElementById('tl' + t[0].toUpperCase() + t.slice(1));
                if (b) b.classList.toggle('on', t === tool);
            });
            document.getElementById('stTool').textContent = 'Công cụ: ' + ({ view: 'xem', highlight: 'đánh dấu', draw: 'vẽ', note: 'ghi chú', sign: 'chữ ký', erase: 'xóa chú thích' })[tool];
            renderOverlay();
            TK.status(document.getElementById('stTool').textContent + (tool === 'sign' && !sigData ? ' — cần tạo chữ ký ở panel phải trước' : tool === 'note' ? ' — bấm lên trang để đặt ghi chú' : tool === 'erase' ? ' — bấm lên chú thích để xóa' : ''));
        },
        clearSig() { sigReset(); sigData = null; TK.toast('Đã xóa nét ký'); },
        useSig() {
            if (!sigHas) return TK.toast('Hãy ký vào ô trắng bằng chuột/ngón tay trước', 'error');
            // cắt phần trắng thừa
            const d = sctx.getImageData(0, 0, sigPad.width, sigPad.height).data;
            let minX = sigPad.width, minY = sigPad.height, maxX = 0, maxY = 0;
            for (let y = 0; y < sigPad.height; y++) for (let x = 0; x < sigPad.width; x++) {
                const i = (y * sigPad.width + x) * 4;
                if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
            }
            if (maxX <= minX) return TK.toast('Chưa có nét nào', 'error');
            const pad = 6;
            const c2 = document.createElement('canvas');
            c2.width = Math.max(8, maxX - minX + pad * 2); c2.height = Math.max(8, maxY - minY + pad * 2);
            const x2 = c2.getContext('2d');
            x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height);
            x2.drawImage(sigPad, minX - pad, minY - pad, c2.width, c2.height, 0, 0, c2.width, c2.height);
            sigData = c2.toDataURL('image/png');
            A.tool(null, { dataset: { arg: 'sign' } });
            TK.toast('✒️ Chữ ký đã sẵn sàng (' + c2.width + '×' + c2.height + ') — kéo khung trên trang để đóng dấu', 'ok');
        },
        async typeSig() {
            const t = await TK.prompt('Gõ chữ ký', 'Gõ tên để tạo chữ ký dạng chữ (font nghiêng):', '');
            if (!t) return;
            const c2 = document.createElement('canvas');
            c2.width = 460; c2.height = 150;
            const x2 = c2.getContext('2d');
            x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height);
            x2.fillStyle = '#12207a';
            x2.font = 'italic 700 58px "Segoe Script", "Brush Script MT", Georgia, serif';
            x2.textAlign = 'center'; x2.textBaseline = 'middle';
            x2.fillText(t.slice(0, 26), c2.width / 2, c2.height / 2);
            x2.strokeStyle = '#12207a'; x2.lineWidth = 2;
            x2.beginPath(); x2.moveTo(50, 118); x2.bezierCurveTo(150, 132, 320, 104, 410, 122); x2.stroke();
            sigReset();
            sctx.drawImage(c2, 0, 0, sigPad.width, sigPad.height);
            sigHas = true;
            sigData = c2.toDataURL('image/png');
            A.tool(null, { dataset: { arg: 'sign' } });
            TK.toast('✒️ Đã tạo chữ ký từ chữ "' + t + '" — kéo khung trên trang để đóng dấu', 'ok');
        },
        clearPageAnn() { if (!list(cur).length) return TK.toast('Trang này chưa có chú thích'); list(cur).length = 0; renderOverlay(); renderAnnList(); TK.toast('Đã xóa chú thích trang ' + cur, 'ok'); },
        async clearAllAnn() {
            if (!allAnns()) return TK.toast('Chưa có chú thích nào');
            if (!(await TK.confirm('Xóa tất cả', 'Xóa toàn bộ ' + allAnns() + ' chú thích?'))) return;
            anns = {}; renderOverlay(); renderAnnList(); TK.toast('Đã xóa hết chú thích', 'ok');
        },
        async copyPageText() {
            if (!needPdf()) return;
            const t = await pageText(cur);
            if (!t) return TK.toast('Trang này không có lớp chữ (có thể là ảnh scan)', 'error');
            try { await navigator.clipboard.writeText(t); TK.toast('⧉ Đã chép ' + t.split(/\s+/).length + ' từ của trang ' + cur + ' vào clipboard', 'ok'); }
            catch (e) { TK.modal({ title: 'Chữ trang ' + cur, message: t.slice(0, 2500), ok: 'Đóng', cancel: '' }); }
        },
        async copyAllText() {
            if (!needPdf()) return;
            TK.status('Đang trích chữ toàn bộ tài liệu…');
            let out = '';
            const maxP = Math.min(pageCount, 200);
            for (let i = 1; i <= maxP; i++) { try { out += `\n===== TRANG ${i} =====\n` + await pageText(i) + '\n'; } catch (e) {} }
            if (pageCount > maxP) out += `\n(… còn ${pageCount - maxP} trang chưa trích — tài liệu quá dài)\n`;
            if (!out.trim()) return TK.toast('PDF không có lớp chữ để trích', 'error');
            try { await navigator.clipboard.writeText(out); TK.toast('⧉ Đã chép toàn bộ chữ (' + out.split(/\s+/).length + ' từ)', 'ok'); }
            catch (e) { TK.download(new Blob([out], { type: 'text/plain' }), fileName.replace(/\.pdf$/i, '') + '-text.txt'); }
        },
        async showInfo() { await updateInfo(); TK.toast('Đã cập nhật thông tin tài liệu ở panel phải'); },
        doSearch,
        downloadOriginal() {
            if (!bytes) return TK.toast('Chưa có file', 'error');
            TK.download(new Blob([bytes.slice(0)], { type: 'application/pdf' }), fileName);
        },
        exportAnn,
        exportAnnJson() {
            if (!allAnns()) return TK.toast('Chưa có chú thích', 'error');
            TK.download(new Blob([JSON.stringify({ file: fileName, pages: pageCount, annotations: anns }, null, 1)], { type: 'application/json' }), fileName.replace(/\.pdf$/i, '') + '-annotations.json');
        },
        async importAnnJson() {
            const f = await TK.pickFile('.json,application/json');
            if (!f) return;
            try {
                const j = JSON.parse(await TK.readAsText(f));
                const a = j.annotations || j;
                if (!a || typeof a !== 'object') throw new Error('không có trường "annotations"');
                anns = a;
                annUid = 1 + Object.keys(anns).reduce((m, k) => Math.max(m, ...anns[k].map(x => parseInt(String(x.id).replace(/\D/g, '')) || 0)), 0);
                renderOverlay(); renderAnnList(); switchTab('anns');
                TK.toast('Đã nhập ' + allAnns() + ' chú thích từ ' + f.name, 'ok');
            } catch (e) { TK.toast('File chú thích lỗi: ' + e.message, 'error'); }
        },
        exportPagePng,
        printDoc,
        async rotatePages() {
            if (!needPdf()) return;
            const v = await TK.prompt('Xoay trang vĩnh viễn', 'Nhập "trang:số độ" — ví dụ 1-3:90, 5:180, all:90', cur + ':90');
            if (!v) return;
            const parts = String(v).split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
            await withDoc(doc => {
                const pages = doc.getPages();
                let n = 0;
                parts.forEach(p => {
                    const m = /^(all|[\d\s,\-]+)\s*:\s*(-?\d+)$/.exec(p);
                    if (!m) return;
                    const deg = ((+m[2] % 360) + 360) % 360;
                    const idx = m[1] === 'all' ? pages.map((_, i) => i) : parseRanges(m[1], pages.length);
                    idx.forEach(i => {
                        const pg = pages[i];
                        if (!pg) return;
                        const curDeg = (pg.getRotation().angle + deg) % 360;
                        pg.setRotation(PDFLib.degrees(curDeg));
                        n++;
                    });
                });
                TK.status('Đã xoay ' + n + ' trang');
                return n > 0;
            }, fileName.replace(/\.pdf$/i, '') + '-xoay.pdf', true);
        },
        async extractPages() {
            if (!needPdf()) return;
            const v = await TK.prompt('Tách trang', 'Nhập trang cần tách (vd: 1-3, 7, 10-12):', '1-' + Math.min(3, pageCount));
            if (!v) return;
            const idx = parseRanges(v, pageCount);
            if (!idx.length) return TK.toast('Danh sách trang không hợp lệ', 'error');
            try {
                const src = await PDFLib.PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
                const out = await PDFLib.PDFDocument.create();
                const copied = await out.copyPages(src, idx);
                copied.forEach(p => out.addPage(p));
                const data = await out.save();
                TK.download(new Blob([data], { type: 'application/pdf' }), fileName.replace(/\.pdf$/i, '') + `-trang-${idx.length}.pdf`);
                TK.toast(`Đã tách ${idx.length} trang thành PDF mới`, 'ok');
            } catch (e) { TK.toast('Tách trang lỗi: ' + e.message, 'error'); }
        },
        async deletePages() {
            if (!needPdf()) return;
            const v = await TK.prompt('Xóa trang', 'Nhập trang muốn XÓA (vd: 2,5-7):', '2');
            if (!v) return;
            const idx = parseRanges(v, pageCount);
            if (!idx.length) return TK.toast('Danh sách không hợp lệ', 'error');
            if (idx.length >= pageCount) return TK.toast('Không thể xóa hết trang', 'error');
            if (!(await TK.confirm('Xóa trang', `Xóa ${idx.length} trang khỏi PDF? File mới sẽ được tải về và mở lại.`))) return;
            await withDoc(doc => {
                idx.slice().sort((a, b) => b - a).forEach(i => doc.removePage(i));
                return doc.getPageCount() > 0;
            }, fileName.replace(/\.pdf$/i, '') + `-da-xoa-${idx.length}trang.pdf`, true);
        },
        async mergePdf() {
            if (!needPdf() || !needLib()) return;
            const f = await TK.pickFile('.pdf,application/pdf');
            if (!f) return;
            const where = await TK.prompt('Gộp PDF', 'Gộp "' + f.name + '" vào đâu? Gõ "sau" (nối vào cuối) hoặc số trang muốn chèn trước (vd: 3):', 'sau');
            if (where == null) return;
            try {
                TK.status('Đang gộp PDF…');
                const a = await PDFLib.PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
                const b = await PDFLib.PDFDocument.load(await TK.readAsArrayBuffer(f), { ignoreEncryption: true });
                const copied = await a.copyPages(b, b.getPageIndices());
                const at = /sau|cuối|end|$/i.test(where) ? a.getPageCount() : TK.clamp(parseInt(where, 10) - 1, 0, a.getPageCount());
                copied.forEach((p, i) => a.insertPage(at + i, p));
                const out = await a.save();
                const name = fileName.replace(/\.pdf$/i, '') + '-gop-' + f.name.replace(/\.pdf$/i, '') + '.pdf';
                TK.download(new Blob([out], { type: 'application/pdf' }), name);
                await loadBytes(out, name);
                TK.toast(`Đã gộp ${copied.length} trang — tài liệu mới có ${pageCount} trang`, 'ok');
            } catch (e) { TK.toast('Gộp PDF lỗi: ' + e.message + ' (file có thể được mã hóa)', 'error'); }
        },
        async reorderPage() {
            if (!needPdf()) return;
            const v = await TK.askNumber('Di chuyển trang', `Di chuyển trang ${cur} tới vị trí nào (1-${pageCount})?`, cur);
            if (v == null) return;
            const to = TK.clamp(parseInt(v, 10), 1, pageCount);
            if (to === cur) return TK.toast('Vị trí không đổi');
            await withDoc(doc => {
                const pages = doc.getPages();
                const p = pages[cur - 1];
                doc.removePage(cur - 1);
                doc.insertPage(to - 1, p);
                return true;
            }, fileName.replace(/\.pdf$/i, '') + '-sapxep.pdf', true);
            TK.toast(`Đã chuyển trang ${cur} → vị trí ${to}`, 'ok');
        },
        createEmpty,
        async createFromText() {
            const t = await TK.prompt('Tạo PDF từ văn bản', 'Dán nội dung vào ô "Tạo PDF từ văn bản" ở panel phải rồi bấm "📄 Tạo PDF".\n\nHoặc gõ nhanh nội dung ngắn ở đây:', 'Báo cáo nhanh\nHôm nay nhóm đã hoàn thành ...');
            if (!t) return;
            await createFromText(t, { name: 'tai-lieu-moi' });
        },
        createFromTextNow() { createFromText(null); },
        createFromImages,
        createFromDocs() {
            parent.postMessage({ type: 'rune:open-app', app: 'xdocs', context: 'Soạn tài liệu rồi xuất PDF' }, '*');
            TK.toast('Đã yêu cầu mở xDocs — soạn xong dùng Tệp → In / Xuất PDF, hoặc dán chữ vào panel "Tạo PDF từ văn bản" ở đây');
        },
        aiSummarize() { aiAction('summarize'); },
        aiAskPage() { aiAction('page'); },
        aiTranslate() { aiAction('translate'); },
        aiExtract() { aiAction('extract'); }
    };
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    /* ---------- panel ---------- */
    TK.slider('#annSize', '#annSizeV');
    TK.slider('#annOpacity', '#annOpacityV');
    document.getElementById('annPreset').addEventListener('change', e => { document.getElementById('annColor').value = e.target.value; });
    document.getElementById('annColor').addEventListener('input', e => {
        const sel = Array.prototype.slice.call(document.getElementById('annPreset').options).findIndex(o => o.value === e.target.value);
        document.getElementById('annPreset').selectedIndex = sel > -1 ? sel : 0;
    });
    document.getElementById('pageInput').addEventListener('change', e => goTo(+e.target.value));
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    /* ---------- kéo thả ---------- */
    ['dragenter', 'dragover'].forEach(t => viewer.addEventListener(t, e => { e.preventDefault(); pageBox.style.outline = '2px dashed #ff4040'; }));
    ['dragleave', 'drop'].forEach(t => viewer.addEventListener(t, e => { e.preventDefault(); pageBox.style.outline = 'none'; }));
    viewer.addEventListener('drop', e => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) openFile(f);
    });

    /* ---------- phím tắt ---------- */
    document.addEventListener('keydown', e => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); A.openFile(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); A.exportAnn(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'p') { e.preventDefault(); A.printDoc(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'f') { e.preventDefault(); document.getElementById('searchInput').focus(); return; }
        if ((e.ctrlKey || e.metaKey) && (k === '=' || k === '+')) { e.preventDefault(); A.zoomIn(); return; }
        if ((e.ctrlKey || e.metaKey) && k === '-') { e.preventDefault(); A.zoomOut(); return; }
        if ((e.ctrlKey || e.metaKey) && k === '0') { e.preventDefault(); fitWidth(); return; }
        if (k === 'arrowright' || k === 'pagedown') { e.preventDefault(); A.nextPage(); }
        if (k === 'arrowleft' || k === 'pageup') { e.preventDefault(); A.prevPage(); }
        if (k === 'home') goTo(1);
        if (k === 'end') goTo(pageCount);
        if (k === 'r') A.rotateView();
        if (k === 'h') A.tool(null, { dataset: { arg: 'highlight' } });
        if (k === 'd') A.tool(null, { dataset: { arg: 'draw' } });
        if (k === 'n') A.tool(null, { dataset: { arg: 'note' } });
        if (k === 's' && !e.ctrlKey) A.tool(null, { dataset: { arg: 'sign' } });
        if (k === 'e') A.tool(null, { dataset: { arg: 'erase' } });
        if (k === 'v' || k === 'escape') A.tool(null, { dataset: { arg: 'view' } });
    });
    viewer.addEventListener('wheel', e => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.deltaY < 0 ? A.zoomIn() : A.zoomOut();
    }, { passive: false });
    window.addEventListener('resize', () => { if (pdf) renderOverlay(); });

    /* ---------- lệnh AI / trang cha ---------- */
    TK.cmd('get_info', () => ({ app: 'xPDF', file: pdf ? fileName : null, pages: pageCount, page: pdf ? cur : 0, annotations: allAnns(), tool, canWritePdf: !!PDFLib, hasFontkit: !!fontkit }));
    TK.cmd('get_text', async a => {
        if (!pdf) return { ok: false, error: 'chưa mở PDF' };
        if (a && a.page) return { page: +a.page, text: (await pageText(TK.clamp(+a.page, 1, pageCount))).slice(0, 20000) };
        let out = '';
        for (let i = 1; i <= Math.min(pageCount, 30); i++) out += `\n[Trang ${i}]\n` + await pageText(i);
        return { pages: Math.min(pageCount, 30), text: out.slice(0, 40000) };
    });
    TK.cmd('goto_page', a => { if (!pdf) return { ok: false }; goTo(+a.page || 1); return { page: cur }; });
    TK.cmd('zoom', a => {
        if (!pdf) return { ok: false };
        if (a.fit === 'width') fitWidth(); else if (a.fit === 'page') fitPage();
        else if (a.level) { scale = TK.clamp(+a.level / 100, 0.15, 8); renderPage(cur); }
        return { zoom: Math.round(scale * 100) };
    });
    TK.cmd('set_tool', a => { const t = ['view', 'highlight', 'draw', 'note', 'sign', 'erase'].includes(a.tool) ? a.tool : 'view'; A.tool(null, { dataset: { arg: t } }); return { tool: t }; });
    TK.cmd('search', async a => { document.getElementById('searchInput').value = a.query || ''; await doSearch(); return { count: searchResults.length }; });
    TK.cmd('highlight_text', async a => { const n = await highlightText(a.text || a.query, a.color); return { highlighted: n }; });
    TK.cmd('annotate', a => {
        if (!pdf) return { ok: false, error: 'chưa mở PDF' };
        const pg = TK.clamp(+a.page || cur, 1, pageCount);
        const type = ['highlight', 'note', 'draw', 'sign'].includes(a.type) ? a.type : 'note';
        if (type === 'note') list(pg).push({ id: 'a' + annUid++, type: 'note', page: pg, un: a.x == null ? 0.08 : +a.x, vn: a.y == null ? 0.08 : +a.y, wu: .03, hv: .03, color: a.color || '#ffeb3b', size: 3, text: String(a.text || 'Ghi chú') });
        else if (type === 'highlight') list(pg).push({ id: 'a' + annUid++, type: 'highlight', page: pg, un: a.x == null ? 0.08 : +a.x, vn: a.y == null ? 0.1 : +a.y, wu: a.w == null ? 0.6 : +a.w, hv: a.h == null ? 0.02 : +a.h, color: a.color || '#ffeb3b', opacity: 45, text: a.text || '' });
        if (pg === cur) renderOverlay();
        renderAnnList();
        return { ok: true, added: type, page: pg, total: allAnns() };
    });
    TK.cmd('clear_annotations', a => { if (a && a.page) { list(+a.page).length = 0; } else anns = {}; renderOverlay(); renderAnnList(); return { remaining: allAnns() }; });
    TK.cmd('export', a => {
        const f = String(a.format || 'pdf').toLowerCase();
        if (f === 'png') exportPagePng();
        else if (f === 'json') A.exportAnnJson();
        else if (a.annotated === false) A.downloadOriginal();
        else exportAnn();
        return { format: f };
    });
    TK.cmd('create_from_text', a => { createFromText(a.text || '', { title: a.title, fontSize: a.fontSize, paper: a.paper, name: a.name || 'tai-lieu-rune' }); return { started: true }; });
    TK.cmd('organize', async a => {
        if (!pdf) return { ok: false, error: 'chưa mở PDF' };
        const op = String(a.op || a.action || '').toLowerCase();
        if (op === 'extract') { const idx = parseRanges(a.pages || '', pageCount); if (!idx.length) return { ok: false, error: 'trang không hợp lệ' }; const src = await PDFLib.PDFDocument.load(bytes.slice(0), { ignoreEncryption: true }); const out = await PDFLib.PDFDocument.create(); (await out.copyPages(src, idx)).forEach(p => out.addPage(p)); const d = await out.save(); TK.download(new Blob([d], { type: 'application/pdf' }), 'tach-trang.pdf'); return { ok: true, pages: idx.length }; }
        if (op === 'delete') { const idx = parseRanges(a.pages || '', pageCount); await withDoc(doc => { idx.slice().sort((x, y) => y - x).forEach(i => doc.removePage(i)); return doc.getPageCount() > 0; }, 'da-xoa-trang.pdf', true); return { ok: true }; }
        if (op === 'rotate') { const idx = a.pages ? parseRanges(a.pages, pageCount) : [cur - 1]; await withDoc(doc => { const ps = doc.getPages(); idx.forEach(i => ps[i] && ps[i].setRotation(PDFLib.degrees(((ps[i].getRotation().angle + (+a.degrees || 90)) % 360 + 360) % 360))); return true; }, 'xoay-trang.pdf', true); return { ok: true }; }
        return { ok: false, error: 'op không hỗ trợ: ' + op + ' (extract/delete/rotate)' };
    });
    TK.cmd('print', () => { printDoc(); return { ok: true }; });
    TK.cmd('ai_ask', a => { aiAction(a.mode === 'page' ? 'page' : a.mode === 'translate' ? 'translate' : a.mode === 'extract' ? 'extract' : 'summarize'); return { started: true }; });

    /* ---------- khởi động ---------- */
    renderAnnList();
    document.getElementById('stTool').textContent = 'Công cụ: xem';
    if (!pdfjsLib) TK.status('⚠ Không nạp được PDF.js từ /vendor/pdf.min.js — chức năng xem PDF sẽ không chạy');
    else if (!PDFLib) TK.status('⚠ PDF.js sẵn sàng, nhưng thiếu pdf-lib — không ghi/xuất PDF được');
    else TK.status(`Sẵn sàng — PDF.js ${pdfjsLib.version || ''} + pdf-lib ${PDFLib.PDFDocument ? '✓' : ''} + fontkit ${fontkit ? '✓ (tiếng Việt)' : '✗'}. Mở file hoặc kéo-thả PDF vào đây.`);
})();
