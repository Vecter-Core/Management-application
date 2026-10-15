/* ============================================================
   xDocs — soạn thảo văn bản thật: ribbon định dạng, bảng/ảnh/liên kết,
   tìm & thay thế, mẫu tài liệu, xuất HTML/MD/TXT/DOC/PDF,
   lưu tự động, mục lục, và 9 nút AI viết/sửa/dịch/tóm tắt
   ============================================================ */
(function () {
    'use strict';

    const page = document.getElementById('page');
    const STORE = 'rune.docs.v1';
    const hist = TK.history(60);
    let docName = 'Tài liệu chưa lưu';
    let zoom = 1, dark = false, savedRange = null;

    const escHtml = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ---------- lưu caret ---------- */
    document.addEventListener('selectionchange', () => {
        const s = window.getSelection();
        if (!s.rangeCount) return;
        const r = s.getRangeAt(0);
        if (page.contains(r.commonAncestorContainer)) savedRange = r.cloneRange();
    });
    function restoreCaret() {
        page.focus();
        if (savedRange) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
    }
    function insertHtml(html) {
        restoreCaret();
        document.execCommand('styleWithCSS', false, false);
        document.execCommand('insertHTML', false, html);
        push();
    }

    /* ---------- lịch sử ---------- */
    function push() { hist.push(page.innerHTML); updateStats(); saveLocal(true); }
    function restore(h) { page.innerHTML = h; updateStats(); renderToc(); }

    /* ---------- thống kê ---------- */
    function textOf() { return page.innerText || page.textContent || ''; }
    function updateStats() {
        const t = textOf().trim();
        const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
        const paras = Array.prototype.filter.call(page.children, n => (n.innerText || '').trim()).length;
        const read = Math.max(words ? 1 : 0, Math.round(words / 200));
        document.getElementById('stWords').textContent = words + ' từ';
        document.getElementById('stChars').textContent = t.length + ' ký tự';
        document.getElementById('stParas').textContent = paras + ' đoạn';
        document.getElementById('stRead').textContent = read + ' phút đọc';
        document.getElementById('stats').innerHTML =
            `<b>Từ:</b> ${words.toLocaleString('vi-VN')}<br><b>Ký tự:</b> ${t.length.toLocaleString('vi-VN')}<br><b>Ký tự (không cách):</b> ${t.replace(/\s/g, '').length.toLocaleString('vi-VN')}<br>` +
            `<b>Đoạn:</b> ${paras}<br><b>Dòng:</b> ${t ? t.split('\n').length : 0}<br><b>Đọc:</b> ~${read} phút<br>` +
            `<b>Trang ước tính:</b> ~${Math.max(1, Math.ceil(page.scrollHeight / 1123))}<br><b>Tiêu đề:</b> ${page.querySelectorAll('h1,h2,h3').length}<br><b>Bảng:</b> ${page.querySelectorAll('table').length} · <b>Ảnh:</b> ${page.querySelectorAll('img').length}`;
        document.getElementById('docTitle').textContent = docName;
        renderToc();
    }
    function renderToc() {
        const box = document.getElementById('tocList');
        const hs = page.querySelectorAll('h1,h2,h3');
        if (!hs.length) { box.innerHTML = 'Chưa có tiêu đề nào'; return; }
        box.innerHTML = '';
        hs.forEach((h, i) => {
            const d = document.createElement('div');
            d.className = 'toc-item';
            d.style.paddingLeft = (7 + (h.tagName === 'H1' ? 0 : h.tagName === 'H2' ? 10 : 20)) + 'px';
            d.textContent = (h.innerText || '').slice(0, 46);
            d.addEventListener('click', () => { h.scrollIntoView({ behavior: 'smooth', block: 'center' }); selectNode(h); });
            box.appendChild(d);
            void i;
        });
    }
    function selectNode(n) {
        const r = document.createRange(); r.selectNodeContents(n);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        savedRange = r.cloneRange();
    }

    /* ---------- định dạng ---------- */
    function exec(cmd, val) {
        page.focus();
        document.execCommand('styleWithCSS', false, cmd === 'foreColor' || cmd === 'hiliteColor');
        // Firefox cần '<p>', Chrome nhận cả hai → luôn bọc thẻ cho formatBlock
        const v = (cmd === 'formatBlock' && val && String(val)[0] !== '<') ? '<' + val + '>' : val;
        const ok = document.execCommand(cmd, false, v == null ? null : v);
        push();
        return ok;
    }
    function wrapSpan(css) {
        const sel = String(window.getSelection() || '');
        if (!sel) { TK.toast('Bôi đen đoạn chữ trước đã', 'error'); return false; }
        insertHtml(`<span style="${css}">${escHtml(sel)}</span>`);
        return true;
    }
    function blockOf() {
        const s = window.getSelection();
        if (!s.rangeCount) return page;
        let n = s.getRangeAt(0).startContainer;
        if (n.nodeType === 3) n = n.parentNode;
        while (n && n !== page && !/^(P|H1|H2|H3|H4|LI|BLOCKQUOTE|PRE|DIV|TD)$/.test(n.tagName)) n = n.parentNode;
        return n && n !== page ? n : null;
    }
    function transformSel(fn, label) {
        const sel = String(window.getSelection() || '');
        if (!sel) return TK.toast('Bôi đen chữ trước đã', 'error');
        insertHtml(escHtml(fn(sel)));
        TK.toast(label, 'ok');
    }

    /* ---------- tìm & thay thế ---------- */
    function openFind() {
        if (document.getElementById('findBar')) { document.getElementById('findBar').remove(); return; }
        const bar = document.createElement('div');
        bar.id = 'findBar';
        bar.style.cssText = 'position:fixed;top:78px;right:266px;z-index:5000;background:#2b2b31;border:1px solid #4a4a52;border-radius:10px;padding:9px;display:flex;gap:6px;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.5);';
        bar.innerHTML = `
            <input id="fq" placeholder="Tìm…" style="width:130px;background:#202026;border:1px solid #43434c;color:#fff;padding:5px 7px;border-radius:5px;font-size:12px;">
            <input id="fr" placeholder="Thay bằng…" style="width:130px;background:#202026;border:1px solid #43434c;color:#fff;padding:5px 7px;border-radius:5px;font-size:12px;">
            <button id="fNext" class="rb">Tìm ↓</button>
            <button id="fOne" class="rb">Thay 1</button>
            <button id="fAll" class="rb">Thay tất cả</button>
            <span id="fCount" style="color:#9a9aa5;font-size:11px;min-width:52px;"></span>
            <button id="fClose" class="rb">✕</button>`;
        document.body.appendChild(bar);
        const q = bar.querySelector('#fq'), r = bar.querySelector('#fr'), c = bar.querySelector('#fCount');
        const count = () => {
            const v = q.value;
            if (!v) { c.textContent = ''; return 0; }
            const n = textOf().split(v).length - 1;
            c.textContent = n + ' kết quả';
            return n;
        };
        q.addEventListener('input', count);
        bar.querySelector('#fNext').addEventListener('click', () => {
            const v = q.value; if (!v) return TK.toast('Nhập từ cần tìm', 'error');
            page.focus();
            const ok = window.find ? window.find(v, false, false, true, false, true, false) : false;
            if (!ok) { c.textContent = 'không thấy'; TK.toast('Không tìm thấy "' + v + '"', 'error'); }
            else { count(); TK.status('Đã nhảy tới: ' + v); }
        });
        bar.querySelector('#fOne').addEventListener('click', () => {
            const v = q.value; if (!v) return TK.toast('Nhập từ cần tìm', 'error');
            const sel = String(window.getSelection() || '');
            if (sel.toLowerCase() === v.toLowerCase()) { document.execCommand('insertText', false, r.value); push(); count(); TK.toast('Đã thay 1 chỗ', 'ok'); }
            else { const ok = window.find && window.find(v, false, false, true, false, true, false); if (ok) { document.execCommand('insertText', false, r.value); push(); count(); TK.toast('Đã thay 1 chỗ', 'ok'); } else TK.toast('Không còn kết quả nào', 'error'); }
        });
        bar.querySelector('#fAll').addEventListener('click', () => {
            const v = q.value; if (!v) return TK.toast('Nhập từ cần tìm', 'error');
            let n = 0;
            const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, null);
            const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
            nodes.forEach(nd => {
                if (nd.nodeValue.indexOf(v) === -1) return;
                n += nd.nodeValue.split(v).length - 1;
                nd.nodeValue = nd.nodeValue.split(v).join(r.value);
            });
            push(); count();
            TK.toast(n ? `Đã thay ${n} chỗ: "${v}" → "${r.value}"` : 'Không tìm thấy gì để thay', n ? 'ok' : 'error');
        });
        bar.querySelector('#fClose').addEventListener('click', () => bar.remove());
        q.focus();
    }

    /* ---------- chèn ---------- */
    async function insertTable() {
        const v = await TK.prompt('Chèn bảng', 'Số dòng x số cột (ví dụ 4x3):', '4x3');
        if (!v) return;
        const m = /(\d+)\s*[x×,]\s*(\d+)/i.exec(v);
        const rows = TK.clamp(m ? +m[1] : 3, 1, 40), cols = TK.clamp(m ? +m[2] : 3, 1, 12);
        let html = '<table><thead><tr>';
        for (let c = 0; c < cols; c++) html += `<th>Cột ${c + 1}</th>`;
        html += '</tr></thead><tbody>';
        for (let r = 1; r < rows; r++) { html += '<tr>'; for (let c = 0; c < cols; c++) html += '<td>&nbsp;</td>'; html += '</tr>'; }
        html += '</tbody></table><p><br></p>';
        insertHtml(html);
        TK.toast(`Đã chèn bảng ${rows}×${cols}`, 'ok');
    }
    async function insertImage() {
        const f = await TK.pickFile('image/*');
        if (!f) return;
        const url = await TK.readAsDataURL(f);
        const cap = await TK.prompt('Chèn ảnh', 'Chú thích ảnh (bỏ trống nếu không cần):', f.name.replace(/\.[^.]+$/, ''));
        insertHtml(`<p><img src="${url}" alt="${escHtml(f.name)}"></p>${cap ? `<p style="text-align:center;font-size:10pt;color:#666;"><i>${escHtml(cap)}</i></p>` : ''}`);
        TK.toast('Đã chèn ảnh ' + f.name, 'ok');
    }
    async function insertLink() {
        const sel = String(window.getSelection() || '');
        const url = await TK.prompt('Chèn liên kết', 'Dán địa chỉ URL:', 'https://');
        if (!url) return;
        if (sel) { restoreCaret(); document.execCommand('createLink', false, url); push(); }
        else {
            const txt = await TK.prompt('Chèn liên kết', 'Chữ hiển thị cho liên kết:', url);
            insertHtml(`<a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(txt || url)}</a>`);
        }
        TK.toast('Đã chèn liên kết ' + url, 'ok');
    }
    function insertToc() {
        const hs = page.querySelectorAll('h1,h2,h3');
        if (!hs.length) return TK.toast('Tài liệu chưa có tiêu đề (H1/H2/H3) để tạo mục lục', 'error');
        let html = '<div style="background:#f7f7fb;border:1px solid #e2e2ea;border-radius:8px;padding:12px 16px;margin-bottom:16px;"><div style="font-weight:800;font-size:14pt;margin-bottom:6px;">MỤC LỤC</div><ul style="margin:0 0 0 18px;">';
        hs.forEach((h, i) => {
            const id = 'rune-h-' + i;
            h.id = id;
            html += `<li style="margin-left:${h.tagName === 'H1' ? 0 : h.tagName === 'H2' ? 14 : 28}px;"><a href="#${id}">${escHtml((h.innerText || '').trim())}</a> <span style="color:#999;">— trang ~${Math.max(1, Math.ceil(h.offsetTop / 1050))}</span></li>`;
        });
        html += '</ul></div>';
        const s = window.getSelection();
        if (s.rangeCount && page.contains(s.anchorNode)) insertHtml(html);
        else { page.insertAdjacentHTML('afterbegin', html); push(); }
        TK.toast('Đã tạo mục lục ' + hs.length + ' mục', 'ok');
    }
    async function insertFootnote() {
        const txt = await TK.prompt('Chú thích', 'Nội dung chú thích cuối trang:', '');
        if (!txt) return;
        const n = page.querySelectorAll('[data-fn]').length + 1;
        let box = page.querySelector('#fnBox');
        if (!box) {
            page.insertAdjacentHTML('beforeend', '<hr><div id="fnBox" style="font-size:9.5pt;color:#555;"><b>Chú thích</b><ol style="margin-left:18px;"></ol></div>');
            box = page.querySelector('#fnBox');
        }
        box.querySelector('ol').insertAdjacentHTML('beforeend', `<li data-fn="${n}">${escHtml(txt)}</li>`);
        insertHtml(`<sup style="color:#c2185b;font-weight:700;">${n}</sup>`);
        TK.toast('Đã thêm chú thích số ' + n, 'ok');
    }

    /* ---------- xuất ---------- */
    function fullHtml() {
        const cs = getComputedStyle(page);
        return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${escHtml(docName)}</title>
<style>
body{margin:0;background:#e9e9ee;font-family:${cs.fontFamily};}
.doc{max-width:${page.offsetWidth}px;margin:24px auto;background:${dark ? '#1c1c22' : '#fff'};color:${cs.color};padding:${cs.padding};line-height:${cs.lineHeight};font-size:${cs.fontSize};box-shadow:0 4px 18px rgba(0,0,0,.15);}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #c9c9d2;padding:6px 8px}th{background:#f6f6fa}
blockquote{border-left:4px solid #ff4081;background:#fff5f8;padding:.5em .9em;margin:0 0 .8em;font-style:italic}
pre{background:#1e1e26;color:#dfe3ff;padding:10px;border-radius:6px;overflow:auto}code{background:#f2f2f6;padding:1px 5px;border-radius:4px}
img{max-width:100%}h1{font-size:22pt}h2{font-size:16pt;color:#c2185b}h3{font-size:13.5pt}
@media print{body{background:#fff}.doc{box-shadow:none;margin:0;max-width:none}}
</style></head><body><div class="doc">${page.innerHTML}</div></body></html>`;
    }
    function toMarkdown(root) {
        let out = '';
        const walk = (node, listPrefix) => {
            node.childNodes.forEach(ch => {
                if (ch.nodeType === 3) { out += ch.nodeValue.replace(/\s+/g, ' '); return; }
                if (ch.nodeType !== 1) return;
                const tag = ch.tagName.toLowerCase();
                if (/^h[1-6]$/.test(tag)) { out += '\n' + '#'.repeat(+tag[1]) + ' ' + (ch.innerText || '').trim() + '\n\n'; return; }
                if (tag === 'p') { const before = out; out += ''; walk(ch); out = before + out.slice(before.length).trim() + '\n\n'; return; }
                if (tag === 'br') { out += '  \n'; return; }
                if (tag === 'strong' || tag === 'b') { out += '**' + (ch.innerText || '').trim() + '**'; return; }
                if (tag === 'em' || tag === 'i') { out += '*' + (ch.innerText || '').trim() + '*'; return; }
                if (tag === 'u') { out += '<u>' + (ch.innerText || '').trim() + '</u>'; return; }
                if (tag === 's' || tag === 'strike') { out += '~~' + (ch.innerText || '').trim() + '~~'; return; }
                if (tag === 'code') { out += '`' + (ch.innerText || '').trim() + '`'; return; }
                if (tag === 'pre') { out += '\n```\n' + (ch.innerText || '') + '\n```\n\n'; return; }
                if (tag === 'blockquote') { out += '\n> ' + (ch.innerText || '').trim().split('\n').join('\n> ') + '\n\n'; return; }
                if (tag === 'a') { out += '[' + (ch.innerText || '').trim() + '](' + (ch.getAttribute('href') || '') + ')'; return; }
                if (tag === 'img') { out += `![${ch.getAttribute('alt') || 'ảnh'}](${ch.getAttribute('src') || ''})\n\n`; return; }
                if (tag === 'hr') { out += '\n---\n\n'; return; }
                if (tag === 'ul' || tag === 'ol') {
                    out += '\n';
                    Array.prototype.forEach.call(ch.children, (li, i) => {
                        const saved = out; out = '';
                        walk(li);
                        out = saved + (tag === 'ol' ? `${i + 1}. ` : '- ') + out.trim() + '\n';
                    });
                    out += '\n';
                    return;
                }
                if (tag === 'table') {
                    out += '\n';
                    Array.prototype.forEach.call(ch.querySelectorAll('tr'), (tr, ri) => {
                        const cells = Array.prototype.map.call(tr.children, c => (c.innerText || '').trim().replace(/\|/g, '\\|'));
                        out += '| ' + cells.join(' | ') + ' |\n';
                        if (ri === 0) out += '|' + cells.map(() => ' --- ').join('|') + '|\n';
                    });
                    out += '\n';
                    return;
                }
                if (tag === 'div' || tag === 'span' || tag === 'section') { walk(ch); if (tag === 'div') out += '\n'; return; }
                walk(ch);
                void listPrefix;
            });
        };
        walk(root || page);
        return out.replace(/\n{3,}/g, '\n\n').trim();
    }
    function mdToHtml(md) {
        const lines = String(md).replace(/\r/g, '').split('\n');
        let html = '', inList = null, inCode = false, inTable = false;
        const inline = s => escHtml(s)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
            .replace(/\*([^*]+)\*/g, '<i>$1</i>')
            .replace(/~~([^~]+)~~/g, '<s>$1</s>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
        lines.forEach(l => {
            if (/^```/.test(l)) { html += inCode ? '</pre>' : '<pre>'; inCode = !inCode; return; }
            if (inCode) { html += escHtml(l) + '\n'; return; }
            if (/^\s*\|.*\|\s*$/.test(l)) {
                if (/^\s*\|[\s:-]+\|\s*$/.test(l.replace(/[^|:\s-]/g, ''))) return;
                if (!inTable) { html += '<table>'; inTable = true; }
                const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
                if (/^[\s:-]+$/.test(cells.join(''))) return;
                html += '<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
                return;
            } else if (inTable) { html += '</table>'; inTable = false; }
            const h = /^(#{1,6})\s+(.*)$/.exec(l);
            if (h) { closeList(); html += `<h${Math.min(3, h[1].length)}>${inline(h[2])}</h${Math.min(3, h[1].length)}>`; return; }
            if (/^(\s*)([-*+]|\d+\.)\s+(.*)$/.test(l)) {
                const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(l);
                const type = /\d/.test(m[2]) ? 'ol' : 'ul';
                if (inList !== type) { closeList(); html += `<${type}>`; inList = type; }
                html += `<li>${inline(m[3])}</li>`;
                return;
            }
            closeList();
            if (/^>\s?/.test(l)) { html += `<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`; return; }
            if (/^\s*(---|\*\*\*)\s*$/.test(l)) { html += '<hr>'; return; }
            if (l.trim()) html += `<p>${inline(l)}</p>`;
        });
        closeList();
        if (inTable) html += '</table>';
        if (inCode) html += '</pre>';
        function closeList() { if (inList) { html += `</${inList}>`; inList = null; } }
        return html;
    }

    /* ---------- mẫu ---------- */
    const TPL = {
        report: `<h1 style="text-align:center;">BÁO CÁO KẾT QUẢ CÔNG VIỆC</h1>
<p style="text-align:center;color:#666;"><i>Tháng … / 2026 · Người thực hiện: …</i></p><hr>
<h2>1. Tóm tắt</h2><p>Báo cáo này trình bày kết quả thực hiện … trong kỳ … Nhìn chung, các mục tiêu chính đã hoàn thành ở mức …</p>
<h2>2. Kết quả đạt được</h2><ul><li>Hoàn thành … (đạt …% kế hoạch)</li><li>Triển khai … đúng tiến độ</li><li>Tối ưu … giúp giảm …% thời gian xử lý</li></ul>
<h2>3. Số liệu</h2><table><thead><tr><th>Chỉ tiêu</th><th>Kế hoạch</th><th>Thực hiện</th><th>Tỉ lệ</th></tr></thead><tbody>
<tr><td>…</td><td>100</td><td>92</td><td>92%</td></tr><tr><td>…</td><td>50</td><td>57</td><td>114%</td></tr></tbody></table>
<h2>4. Khó khăn</h2><blockquote>Thiếu nhân sự ở giai đoạn … khiến tiến độ bị chậm 1 tuần.</blockquote>
<h2>5. Kế hoạch kỳ tới</h2><ol><li>…</li><li>…</li><li>…</li></ol>
<p style="text-align:right;margin-top:32px;"><i>Người lập báo cáo</i><br><br><b>(Ký, ghi rõ họ tên)</b></p>`,
        letter: `<p style="text-align:right;">Hà Nội, ngày … tháng … năm 2026</p>
<h1 style="text-align:center;font-size:17pt;">THƯ MỜI HỢP TÁC</h1>
<p><b>Kính gửi:</b> Ông/Bà … — Chức vụ … — Công ty …</p>
<p>Lời đầu tiên, … xin gửi tới Quý công ty lời chào trân trọng và lời chúc phát triển bền vững.</p>
<p>Chúng tôi là … , hoạt động trong lĩnh vực … Với mong muốn mở rộng hợp tác, chúng tôi xin đề xuất …</p>
<p>Nội dung hợp tác dự kiến:</p><ul><li>…</li><li>…</li><li>…</li></ul>
<p>Rất mong nhận được phản hồi từ Quý công ty trước ngày … Mọi trao đổi xin liên hệ: … — điện thoại … — email …</p>
<p>Trân trọng cảm ơn.</p>
<p style="margin-top:36px;"><b>Đại diện …</b><br><br><br>(Ký, ghi rõ họ tên)</p>`,
        cv: `<h1 style="text-align:center;margin-bottom:2px;">NGUYỄN VĂN A</h1>
<p style="text-align:center;color:#666;margin-top:0;">Lập trình viên Front-end · Hà Nội · 09xx xxx xxx · email@domain.com</p><hr>
<h2>Mục tiêu nghề nghiệp</h2><p>Trở thành … trong 2 năm tới, đóng góp vào sản phẩm có hàng triệu người dùng.</p>
<h2>Kinh nghiệm làm việc</h2>
<h3>Công ty … — Lập trình viên (2023 – nay)</h3><ul><li>Xây dựng … giảm 30% thời gian tải trang</li><li>Phối hợp nhóm 6 người theo quy trình Agile</li></ul>
<h3>Công ty … — Thực tập sinh (2022 – 2023)</h3><ul><li>Tham gia phát triển …</li></ul>
<h2>Kỹ năng</h2><table><tbody><tr><td><b>Ngôn ngữ</b></td><td>JavaScript, TypeScript, HTML/CSS</td></tr>
<tr><td><b>Thư viện</b></td><td>React, Vue, Canvas/WebGL, Web Audio</td></tr>
<tr><td><b>Khác</b></td><td>Git, C++, Rust, làm việc nhóm</td></tr></tbody></table>
<h2>Học vấn</h2><p>Đại học … — Ngành … — Tốt nghiệp 2022 — GPA …</p>
<h2>Chứng chỉ &amp; dự án</h2><ul><li>…</li><li>…</li></ul>`,
        contract: `<h1 style="text-align:center;">HỢP ĐỒNG DỊCH VỤ</h1>
<p style="text-align:center;"><i>Số: …/2026/HĐDV</i></p>
<p><i>Căn cứ Bộ luật Dân sự số 91/2015/QH13;</i><br><i>Căn cứ Luật Thương mại số 36/2005/QH11;</i><br><i>Căn cứ nhu cầu và năng lực của hai bên.</i></p>
<p>Hôm nay, ngày … tháng … năm 2026, tại …, chúng tôi gồm:</p>
<h3>BÊN A (Bên sử dụng dịch vụ)</h3><p>Công ty: … · Địa chỉ: … · Mã số thuế: … · Đại diện: … · Chức vụ: …</p>
<h3>BÊN B (Bên cung cấp dịch vụ)</h3><p>Công ty: … · Địa chỉ: … · Mã số thuế: … · Đại diện: … · Chức vụ: …</p>
<h2>Điều 1. Nội dung dịch vụ</h2><p>Bên B cung cấp cho Bên A dịch vụ … theo đúng mô tả tại Phụ lục 01.</p>
<h2>Điều 2. Giá trị và thanh toán</h2><p>Tổng giá trị hợp đồng: <b>… VNĐ</b> (chưa bao gồm thuế GTGT). Thanh toán 50% khi ký, 50% khi nghiệm thu.</p>
<h2>Điều 3. Thời gian thực hiện</h2><p>Từ ngày … đến ngày …</p>
<h2>Điều 4. Quyền và nghĩa vụ của các bên</h2><ol><li>Bên A có quyền yêu cầu … và nghĩa vụ thanh toán …</li><li>Bên B có nghĩa vụ thực hiện đúng chất lượng, tiến độ …</li></ol>
<h2>Điều 5. Phạt vi phạm và bồi thường</h2><p>…</p>
<h2>Điều 6. Giải quyết tranh chấp</h2><p>Hai bên ưu tiên thương lượng; không thành thì đưa ra Tòa án nhân dân có thẩm quyền.</p>
<h2>Điều 7. Hiệu lực</h2><p>Hợp đồng có hiệu lực kể từ ngày ký, được lập thành 02 bản có giá trị như nhau, mỗi bên giữ 01 bản.</p>
<table style="margin-top:26px;"><tbody><tr><th style="text-align:center;">ĐẠI DIỆN BÊN A</th><th style="text-align:center;">ĐẠI DIỆN BÊN B</th></tr>
<tr><td style="height:70px;text-align:center;color:#999;">(Ký, ghi rõ họ tên)</td><td style="text-align:center;color:#999;">(Ký, ghi rõ họ tên)</td></tr></tbody></table>`,
        blog: `<h1>Tiêu đề bài viết hấp dẫn ở đây</h1>
<p style="color:#777;font-size:10.5pt;"><i>Đăng ngày … · 5 phút đọc · Tác giả …</i></p>
<p><b>Mở bài:</b> đặt vấn đề khiến người đọc muốn tiếp tục…</p>
<h2>Phần 1 — Bối cảnh</h2><p>Nội dung…</p>
<h2>Phần 2 — Giải pháp</h2><p>Nội dung…</p><blockquote>Một câu trích dẫn đáng nhớ.</blockquote>
<h2>Phần 3 — Kết quả</h2><ul><li>Ý 1</li><li>Ý 2</li></ul>
<h2>Kết luận</h2><p>Tóm lại… và lời kêu gọi hành động.</p>`,
        meeting: `<h1 style="text-align:center;">BIÊN BẢN CUỘC HỌP</h1>
<p style="text-align:center;"><i>V/v: …</i></p>
<table><tbody>
<tr><td style="width:130px;"><b>Thời gian</b></td><td>… giờ …, ngày … tháng … năm 2026</td></tr>
<tr><td><b>Địa điểm</b></td><td>…</td></tr>
<tr><td><b>Chủ trì</b></td><td>Ông/Bà … — chức vụ …</td></tr>
<tr><td><b>Thư ký</b></td><td>Ông/Bà …</td></tr>
<tr><td><b>Thành phần</b></td><td>… (có mặt …/… người)</td></tr>
</tbody></table>
<h2>I. Nội dung cuộc họp</h2><ol><li>…</li><li>…</li></ol>
<h2>II. Ý kiến phát biểu</h2><ul><li>Ông/Bà …: …</li><li>Ông/Bà …: …</li></ul>
<h2>III. Kết luận và phân công</h2><table><thead><tr><th>Công việc</th><th>Người phụ trách</th><th>Hạn hoàn thành</th></tr></thead>
<tbody><tr><td>…</td><td>…</td><td>…</td></tr><tr><td>…</td><td>…</td><td>…</td></tr></tbody></table>
<p>Cuộc họp kết thúc lúc … giờ … cùng ngày. Biên bản đã được thông qua trước toàn thể thành viên.</p>
<table style="margin-top:22px;"><tbody><tr><th style="text-align:center;">CHỦ TRÌ</th><th style="text-align:center;">THƯ KÝ</th></tr>
<tr><td style="height:60px;"></td><td></td></tr></tbody></table>`
    };

    /* ---------- AI ---------- */
    const AI_SYS = 'Bạn là trợ lý viết tài liệu tiếng Việt chuyên nghiệp. Khi được yêu cầu, trả về nội dung dạng HTML sạch (dùng <h1>/<h2>/<p>/<ul>/<ol>/<table>), không kèm lời giải thích, không có ```.';
    async function ai(kind) {
        const selText = String(window.getSelection() || '').trim();
        const all = textOf().trim();
        let prompt = '', title = '', replace = false;
        if (kind === 'write') {
            const topic = await TK.prompt('✨ AI viết bài', 'Chủ đề / yêu cầu bài viết (kèm độ dài, đối tượng đọc nếu muốn):', 'Bài 600 từ về lợi ích của công cụ sáng tạo chạy trong trình duyệt');
            if (!topic) return;
            prompt = `Viết một tài liệu hoàn chỉnh bằng tiếng Việt theo yêu cầu: "${topic}". Có tiêu đề <h1>, các mục <h2>, đoạn văn, và ít nhất một danh sách. Độ dài phù hợp yêu cầu.`;
            title = 'AI viết bài';
        } else if (kind === 'continue') {
            const tail = all.slice(-900);
            if (!tail) return TK.toast('Tài liệu đang trống — dùng "Viết bài theo chủ đề"', 'error');
            prompt = `Đây là phần cuối của tài liệu:\n"""\n${tail}\n"""\nHãy viết TIẾP phần kế tiếp một cách liền mạch (khoảng 150-250 từ), cùng giọng văn. Không lặp lại phần đã có.`;
            title = 'AI viết tiếp';
        } else if (kind === 'summarize') {
            if (!all) return TK.toast('Tài liệu trống', 'error');
            prompt = `Tóm tắt tài liệu sau bằng tiếng Việt thành: (1) 3-5 gạch đầu dòng ý chính, (2) một đoạn tóm tắt 60-80 từ. Dùng <h2>Tóm tắt</h2>, <ul>, <p>.\n"""\n${all.slice(0, 12000)}\n"""`;
            title = 'AI tóm tắt';
        } else if (kind === 'translate') {
            const src = selText || all;
            if (!src) return TK.toast('Không có nội dung để dịch', 'error');
            const to = await TK.prompt('✨ AI dịch', 'Dịch sang ngôn ngữ nào? (English, 日本語, 한국어…)', /^[\x00-\x7F\s]*$/.test(src) ? 'tiếng Việt' : 'English');
            if (!to) return;
            prompt = `Dịch nội dung sau sang ${to}, giữ nguyên cấu trúc HTML nếu có, chỉ trả bản dịch:\n"""\n${src.slice(0, 12000)}\n"""`;
            title = 'AI dịch sang ' + to;
            replace = !!selText;
        } else if (kind === 'fix') {
            const src = selText || all;
            if (!src) return TK.toast('Tài liệu trống', 'error');
            prompt = `Sửa lỗi chính tả, ngữ pháp, dấu câu và diễn đạt cho văn bản sau. Giữ nguyên ý và định dạng HTML. Sau đó liệt kê ngắn các lỗi đã sửa trong <h3>Đã sửa</h3><ul>. Văn bản:\n"""\n${src.slice(0, 12000)}\n"""`;
            title = 'AI sửa lỗi';
            replace = true;
        } else if (kind === 'expand') {
            if (!selText) return TK.toast('Bôi đen đoạn muốn mở rộng', 'error');
            prompt = `Mở rộng đoạn văn sau thành 2-3 đoạn chi tiết hơn, thêm ví dụ cụ thể, vẫn bằng tiếng Việt và giữ ý gốc:\n"""\n${selText}\n"""`;
            title = 'AI mở rộng đoạn'; replace = true;
        } else if (kind === 'shorten') {
            if (!selText) return TK.toast('Bôi đen đoạn muốn rút gọn', 'error');
            prompt = `Rút gọn đoạn sau còn khoảng 40% độ dài mà vẫn giữ đủ ý chính, văn phong tự nhiên:\n"""\n${selText}\n"""`;
            title = 'AI rút gọn đoạn'; replace = true;
        } else if (kind === 'outline') {
            const topic = selText || (await TK.prompt('✨ AI tạo dàn ý', 'Chủ đề cần lập dàn ý:', all.slice(0, 120) || ''));
            if (!topic) return;
            prompt = `Lập dàn ý chi tiết bằng tiếng Việt cho chủ đề: "${topic}". Dùng <h2> cho các phần chính, <ul> cho ý nhỏ, mỗi ý 1 dòng.`;
            title = 'AI tạo dàn ý';
        } else if (kind === 'title') {
            const src = selText || all;
            if (!src) return TK.toast('Tài liệu trống', 'error');
            prompt = `Gợi ý 8 tiêu đề hay (mỗi tiêu đề 1 dòng, có thể kèm <h2>) cho tài liệu sau. Không giải thích thêm:\n"""\n${src.slice(0, 6000)}\n"""`;
            title = 'AI gợi ý tiêu đề';
        }
        TK.status('✨ ' + title + '…');
        try {
            const out = await TK.ai(prompt, { system: AI_SYS });
            const html = String(out || '').trim();
            if (!html) return TK.toast('AI không trả về nội dung', 'error');
            const clean = /```html/i.test(html) ? html.replace(/```html/i, '').replace(/```/g, '') : html;
            if (kind === 'summarize' || kind === 'title') {
                const go = await TK.modal({ title: '✨ ' + title, message: clean.replace(/<[^>]+>/g, '').slice(0, 900), ok: 'Chèn vào tài liệu', cancel: 'Chỉ xem' });
                if (go !== null) insertHtml('<hr>' + clean);
                else TK.toast('Đã hiển thị kết quả — không chèn vào tài liệu');
            } else if (replace && selText) {
                insertHtml(clean);
                TK.toast('✨ ' + title + ' — đã thay thế đoạn bôi đen', 'ok');
            } else {
                insertHtml(clean);
                TK.toast('✨ ' + title + ' — đã chèn vào tài liệu', 'ok');
            }
            docName = docName === 'Tài liệu chưa lưu' ? (kind + ' · ' + new Date().toLocaleTimeString('vi-VN')) : docName;
            updateStats();
        } catch (e) {
            TK.toast('AI lỗi: ' + RuneAI.humanError(e.message) + '. Nhập khóa AI ở trang Khóa của RUNE rồi thử lại.', 'error');
        }
    }

    /* ---------- lưu cục bộ ---------- */
    function saveLocal(silent) {
        try {
            localStorage.setItem(STORE, JSON.stringify({ name: docName, html: page.innerHTML, ts: Date.now() }));
            document.getElementById('stSaved').textContent = 'Đã lưu ' + new Date().toLocaleTimeString('vi-VN');
            if (!silent) TK.toast('💾 Đã lưu tài liệu vào trình duyệt', 'ok');
        } catch (e) { document.getElementById('stSaved').textContent = 'Lưu lỗi: dung lượng đầy'; }
    }
    function loadLocal() {
        try {
            const j = JSON.parse(localStorage.getItem(STORE) || 'null');
            if (!j || !j.html) return TK.toast('Chưa có bản lưu nào trong trình duyệt', 'error');
            docName = j.name || docName;
            page.innerHTML = j.html;
            push();
            TK.toast('Đã mở bản lưu lúc ' + new Date(j.ts).toLocaleString('vi-VN'), 'ok');
        } catch (e) { TK.toast('Bản lưu bị lỗi: ' + e.message, 'error'); }
    }

    /* ---------- actions ---------- */
    TK.init({ app: 'xdocs', status: '.statusbar [data-status-text]' });
    const A = {
        undo() { if (hist.canUndo()) { restore(hist.undo()); TK.status('↶ Hoàn tác'); } else TK.toast('Không còn gì để hoàn tác'); },
        redo() { if (hist.canRedo()) { restore(hist.redo()); TK.status('↷ Làm lại'); } else TK.toast('Không còn gì để làm lại'); },
        async newDoc() {
            if (!(await TK.confirm('Tài liệu mới', 'Xóa nội dung hiện tại để tạo tài liệu trắng?'))) return;
            docName = 'Tài liệu mới';
            page.innerHTML = '<h1>Tiêu đề tài liệu</h1><p>Bắt đầu gõ nội dung ở đây…</p>';
            push(); TK.toast('Đã tạo tài liệu mới', 'ok');
        },
        async openFile() {
            const f = await TK.pickFile('.html,.htm,.txt,.md,.markdown,text/*');
            if (!f) return;
            try {
                const txt = await TK.readAsText(f);
                docName = f.name;
                if (/\.md|\.markdown/i.test(f.name)) page.innerHTML = mdToHtml(txt);
                else if (/\.html?/i.test(f.name)) {
                    const d = new DOMParser().parseFromString(txt, 'text/html');
                    page.innerHTML = (d.body && d.body.innerHTML) || txt;
                    const t = d.querySelector('title'); if (t) docName = t.textContent;
                } else page.innerHTML = '<p>' + escHtml(txt).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
                push(); TK.toast('Đã mở ' + f.name, 'ok');
            } catch (e) { TK.toast('Không mở được file: ' + e.message, 'error'); }
        },
        saveLocal: () => saveLocal(false),
        loadLocal,
        exportHtml() { TK.download(new Blob([fullHtml()], { type: 'text/html' }), (docName || 'tai-lieu').replace(/\.[^.]+$/, '') + '.html'); },
        exportMd() { TK.download(new Blob([toMarkdown()], { type: 'text/markdown' }), (docName || 'tai-lieu').replace(/\.[^.]+$/, '') + '.md'); },
        exportTxt() { TK.download(new Blob([textOf()], { type: 'text/plain' }), (docName || 'tai-lieu').replace(/\.[^.]+$/, '') + '.txt'); },
        exportDoc() {
            const head = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + escHtml(docName) + '</title></head><body>';
            TK.download(new Blob(['\ufeff', head + page.innerHTML + '</body></html>'], { type: 'application/msword' }), (docName || 'tai-lieu').replace(/\.[^.]+$/, '') + '.doc');
        },
        printDoc() { TK.toast('Mở hộp thoại in — chọn "Lưu dưới dạng PDF" để xuất PDF', 'ok'); setTimeout(() => window.print(), 250); },
        find: openFind,
        selectAll() { page.focus(); const r = document.createRange(); r.selectNodeContents(page); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); savedRange = r.cloneRange(); TK.status('Đã chọn toàn bộ tài liệu'); },
        clearFmt() { exec('removeFormat'); exec('formatBlock', 'p'); TK.toast('Đã xóa định dạng vùng chọn', 'ok'); },
        async clearDoc() {
            if (!(await TK.confirm('Xóa trắng', 'Xóa toàn bộ nội dung tài liệu? (vẫn có thể Hoàn tác)'))) return;
            page.innerHTML = '<p><br></p>'; push();
        },
        pastePlain() { TK.toast('Bật chế độ dán không định dạng — bây giờ bấm Ctrl+V để dán', 'ok'); page.dataset.plainPaste = '1'; page.focus(); },
        sortLines() {
            const sel = String(window.getSelection() || '');
            const src = sel || textOf();
            const sorted = src.split('\n').map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')).join('<br>');
            insertHtml(sel ? sorted : `<p>${sorted}</p>`);
            TK.toast('Đã sắp xếp ' + sorted.split('<br>').length + ' dòng A→Z', 'ok');
        },
        removeDupLines() {
            const sel = String(window.getSelection() || '');
            const src = (sel || textOf()).split('\n').map(s => s.trim()).filter(Boolean);
            const uniq = Array.from(new Set(src));
            insertHtml((sel ? '' : '<p>') + uniq.join('<br>') + (sel ? '' : '</p>'));
            TK.toast(`Đã xóa ${src.length - uniq.length} dòng trùng, còn ${uniq.length} dòng`, 'ok');
        },
        insertTable, insertImage, insertLink,
        insertHr() { insertHtml('<hr><p><br></p>'); },
        insertQuote() { exec('formatBlock', 'blockquote'); TK.toast('Đã chuyển thành trích dẫn', 'ok'); },
        insertCode() { exec('formatBlock', 'pre'); TK.toast('Đã chuyển thành khối mã', 'ok'); },
        insertDate() {
            const d = new Date();
            insertHtml(`<p>Hà Nội, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}</p>`);
        },
        insertPageBreak() { insertHtml('<div style="page-break-after:always;border-bottom:1px dashed #bbb;margin:18px 0;color:#aaa;text-align:center;font-size:9pt;">— ngắt trang —</div><p><br></p>'); TK.toast('Đã chèn ngắt trang (có hiệu lực khi in/PDF)', 'ok'); },
        insertToc, insertFootnote,
        fmt(e, elm) { exec(elm.dataset.arg); },
        align(e, elm) { exec(elm.dataset.arg); },
        applyBlock() { const v = document.getElementById('blockSel').value; exec('formatBlock', v); TK.toast('Đã áp kiểu: ' + v, 'ok'); },
        block(e, elm) { exec('formatBlock', elm.dataset.arg); },
        applyFore() { exec('foreColor', document.getElementById('foreColor').value); },
        applyHilite() {
            const c = document.getElementById('hiliteColor').value;
            page.focus(); document.execCommand('styleWithCSS', false, true);
            const ok = document.execCommand('hiliteColor', false, c) || document.execCommand('backColor', false, c);
            push();
            TK.toast(ok ? '🖍 Đã tô sáng ' + c : 'Trình duyệt không hỗ trợ tô sáng', ok ? 'ok' : 'error');
        },
        lineSpacing(e, elm) {
            const b = blockOf();
            if (!b) return TK.toast('Đặt con trỏ vào một đoạn trước', 'error');
            b.style.lineHeight = elm.dataset.arg;
            push(); TK.toast('Giãn dòng ' + elm.dataset.arg + ' cho đoạn hiện tại', 'ok');
        },
        upperSel() { transformSel(s => s.toUpperCase(), 'Đã chuyển thành CHỮ HOA'); },
        lowerSel() { transformSel(s => s.toLowerCase(), 'Đã chuyển thành chữ thường'); },
        titleSel() { transformSel(s => s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()), 'Đã chuyển thành Chữ Hoa Đầu Từ'); },
        justifyAll() {
            Array.prototype.forEach.call(page.children, n => { if (/^(P|H1|H2|H3|LI|BLOCKQUOTE|DIV)$/.test(n.tagName)) n.style.textAlign = 'justify'; });
            push(); TK.toast('Đã căn đều toàn tài liệu', 'ok');
        },
        spellcheck() {
            page.spellcheck = !page.spellcheck;
            document.getElementById('spellBtn').classList.toggle('on', page.spellcheck);
            TK.toast('Kiểm tra chính tả: ' + (page.spellcheck ? 'BẬT (gạch chân đỏ)' : 'TẮT'));
        },
        darkPage() {
            dark = !dark;
            page.classList.toggle('dark', dark);
            document.getElementById('darkBtn').classList.toggle('on', dark);
            TK.toast('Nền trang: ' + (dark ? 'tối' : 'trắng'));
        },
        zoomDoc() {
            const steps = [0.75, 0.9, 1, 1.15, 1.35, 1.6];
            zoom = steps[(steps.indexOf(zoom) + 1) % steps.length];
            page.style.transform = `scale(${zoom})`;
            document.getElementById('zoomBtn').textContent = '🔎' + Math.round(zoom * 100) + '%';
            TK.status('Phóng trang: ' + Math.round(zoom * 100) + '%');
        },
        template(e, elm) {
            const k = elm.dataset.arg;
            if (!TPL[k]) return TK.toast('Không có mẫu: ' + k, 'error');
            page.innerHTML = TPL[k];
            docName = ({ report: 'Báo cáo', letter: 'Thư mời hợp tác', cv: 'Sơ yếu lý lịch', contract: 'Hợp đồng dịch vụ', blog: 'Bài blog', meeting: 'Biên bản họp' })[k];
            push();
            document.getElementById('stage').scrollTop = 0;
            TK.toast('Đã áp mẫu "' + docName + '" — sửa trực tiếp trên trang', 'ok');
        },
        aiWrite() { ai('write'); }, aiContinue() { ai('continue'); }, aiSummarize() { ai('summarize'); },
        aiTranslate() { ai('translate'); }, aiFix() { ai('fix'); }, aiExpand() { ai('expand'); },
        aiShorten() { ai('shorten'); }, aiOutline() { ai('outline'); }, aiTitle() { ai('title'); }
    };
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    /* ---------- ribbon: font / size ---------- */
    document.getElementById('fontName').addEventListener('change', e => { exec('fontName', e.target.value); TK.status('Font: ' + e.target.value); });
    document.getElementById('fontSize').addEventListener('change', e => {
        if (!wrapSpan('font-size:' + e.target.value + 'pt')) return;
        TK.status('Cỡ chữ: ' + e.target.value + 'pt');
    });
    document.getElementById('foreColor').addEventListener('input', e => { exec('foreColor', e.target.value); });
    document.getElementById('hiliteColor').addEventListener('input', e => { page.focus(); document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, e.target.value); });

    /* ---------- trang & lề ---------- */
    document.getElementById('paper').addEventListener('change', e => {
        const [w, h] = e.target.value.split('x').map(Number);
        page.style.width = w + 'px'; page.style.minHeight = h + 'px';
        TK.toast('Khổ giấy: ' + w + '×' + h + 'px', 'ok');
    });
    document.getElementById('margin').addEventListener('change', e => {
        const m = TK.clamp(+e.target.value || 0, 0, 200);
        page.style.padding = `${Math.round(m * 0.92)}px ${m}px`;
        TK.status('Lề trang: ' + m + 'px');
    });
    document.getElementById('lineH').addEventListener('change', e => { page.style.lineHeight = TK.clamp(+e.target.value || 1.6, 0.8, 4); TK.status('Giãn dòng: ' + page.style.lineHeight); });
    document.getElementById('baseSize').addEventListener('change', e => { page.style.fontSize = TK.clamp(+e.target.value || 12, 6, 40) + 'pt'; TK.status('Cỡ chữ gốc: ' + page.style.fontSize); });
    document.getElementById('baseFont').addEventListener('change', e => { page.style.fontFamily = `'${e.target.value}', Georgia, serif`; TK.status('Font gốc: ' + e.target.value); });

    /* ---------- gõ phím ---------- */
    page.addEventListener('input', () => { clearTimeout(page._t); page._t = setTimeout(() => push(), 900); });
    page.addEventListener('paste', e => {
        if (page.dataset.plainPaste !== '1' && !e.shiftKey) return;
        e.preventDefault();
        const t = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, t);
        delete page.dataset.plainPaste;
        TK.toast('Đã dán dạng văn bản thuần', 'ok');
    });
    document.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        const inPage = page.contains(e.target) || e.target === page;
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); A.saveLocal(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'p') { e.preventDefault(); A.printDoc(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'f') { e.preventDefault(); A.find(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); A.insertLink(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'n') { e.preventDefault(); A.newDoc(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'z' && !inPage) { e.preventDefault(); A.undo(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'y' && !inPage) { e.preventDefault(); A.redo(); return; }
        if (e.key === 'Escape' && document.getElementById('findBar')) document.getElementById('findBar').remove();
        // markdown nhanh khi gõ
        if (inPage && e.key === ' ') {
            const s = window.getSelection();
            if (!s.rangeCount) return;
            const n = s.anchorNode;
            if (!n || n.nodeType !== 3) return;
            const before = n.nodeValue.slice(0, s.anchorOffset);
            const b = blockOf();
            if (!b) return;
            if (/^#$/.test(before)) { e.preventDefault(); n.nodeValue = n.nodeValue.slice(0, s.anchorOffset - 1) + n.nodeValue.slice(s.anchorOffset); exec('formatBlock', 'h1'); }
            else if (/^##$/.test(before)) { e.preventDefault(); n.nodeValue = n.nodeValue.slice(0, s.anchorOffset - 2) + n.nodeValue.slice(s.anchorOffset); exec('formatBlock', 'h2'); }
            else if (/^###$/.test(before)) { e.preventDefault(); n.nodeValue = n.nodeValue.slice(0, s.anchorOffset - 3) + n.nodeValue.slice(s.anchorOffset); exec('formatBlock', 'h3'); }
            else if (/^-$/.test(before)) { e.preventDefault(); n.nodeValue = n.nodeValue.slice(0, s.anchorOffset - 1) + n.nodeValue.slice(s.anchorOffset); exec('insertUnorderedList'); }
            else if (/^1\.$/.test(before)) { e.preventDefault(); n.nodeValue = n.nodeValue.slice(0, s.anchorOffset - 2) + n.nodeValue.slice(s.anchorOffset); exec('insertOrderedList'); }
            else if (/^>$/.test(before)) { e.preventDefault(); n.nodeValue = n.nodeValue.slice(0, s.anchorOffset - 1) + n.nodeValue.slice(s.anchorOffset); exec('formatBlock', 'blockquote'); }
        }
        if (inPage && (e.ctrlKey || e.metaKey) && e.shiftKey && k === 'x') { e.preventDefault(); A.pastePlain(); }
    });
    // nút ribbon: trạng thái bật/tắt theo định dạng hiện hành
    document.addEventListener('selectionchange', () => {
        if (!page.contains(window.getSelection().anchorNode)) return;
        ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].forEach(c => {
            const b = document.querySelector(`[data-action="fmt"][data-arg="${c}"]`);
            if (!b) return;
            try { b.classList.toggle('on', document.queryCommandState(c)); } catch (e) {}
        });
        const blk = blockOf();
        if (blk) {
            const tag = blk.tagName.toLowerCase();
            const s = document.getElementById('blockSel');
            if (['p', 'h1', 'h2', 'h3', 'blockquote', 'pre'].includes(tag)) s.value = tag;
        }
    });

    /* ---------- lệnh AI / trang cha ---------- */
    TK.cmd('get_info', () => ({ app: 'xDocs', name: docName, words: textOf().trim().split(/\s+/).filter(Boolean).length, chars: textOf().length, headings: page.querySelectorAll('h1,h2,h3').length, preview: textOf().slice(0, 200) }));
    TK.cmd('get_text', () => textOf());
    TK.cmd('set_content', a => {
        if (a.title) docName = String(a.title);
        const html = a.html != null ? String(a.html) : (a.markdown ? mdToHtml(String(a.markdown)) : (a.text != null ? '<p>' + escHtml(String(a.text)).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>' : ''));
        if (a.append) page.insertAdjacentHTML('beforeend', html);
        else page.innerHTML = html || '<p><br></p>';
        push();
        return { words: textOf().trim().split(/\s+/).filter(Boolean).length, name: docName };
    });
    TK.cmd('append', a => { page.insertAdjacentHTML('beforeend', a.html ? String(a.html) : '<p>' + escHtml(a.text || '') + '</p>'); push(); return { ok: true }; });
    TK.cmd('insert', a => { insertHtml(a.html ? String(a.html) : '<p>' + escHtml(a.text || '') + '</p>'); return { ok: true }; });
    TK.cmd('new_doc', () => { docName = 'Tài liệu mới'; page.innerHTML = '<h1>Tiêu đề</h1><p><br></p>'; push(); return { ok: true }; });
    TK.cmd('clear', () => { page.innerHTML = '<p><br></p>'; push(); return { ok: true }; });
    TK.cmd('template', a => { const k = String(a.template || a.name || 'report'); if (TPL[k]) { page.innerHTML = TPL[k]; docName = k; push(); return { ok: true, template: k }; } return { ok: false, error: 'Mẫu không tồn tại. Có: ' + Object.keys(TPL).join(', ') }; });
    TK.cmd('format', a => { const c = String(a.command || a.cmd || ''); if (!c) return { ok: false, error: 'thiếu command' }; exec(c, a.value); return { ok: true, command: c }; });
    TK.cmd('find_replace', a => {
        const f = String(a.find || ''), r = String(a.replace || '');
        if (!f) return { ok: false, error: 'thiếu từ cần tìm' };
        let n = 0;
        const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, null);
        const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
        nodes.forEach(nd => { if (nd.nodeValue.indexOf(f) > -1) { n += nd.nodeValue.split(f).length - 1; nd.nodeValue = nd.nodeValue.split(f).join(r); } });
        push();
        return { replaced: n };
    });
    TK.cmd('export', a => {
        const fmt = String(a.format || 'html').toLowerCase();
        ({ html: A.exportHtml, md: A.exportMd, markdown: A.exportMd, txt: A.exportTxt, doc: A.exportDoc, word: A.exportDoc, pdf: A.printDoc }[fmt] || A.exportHtml)();
        return { format: fmt };
    });
    TK.cmd('save', () => { saveLocal(false); return { ok: true }; });
    TK.cmd('word_count', () => ({ words: textOf().trim().split(/\s+/).filter(Boolean).length, chars: textOf().length }));
    TK.cmd('ai_action', a => {
        const k = String(a.action || a.kind || 'write');
        if (!['write', 'continue', 'summarize', 'translate', 'fix', 'expand', 'shorten', 'outline', 'title'].includes(k)) return { ok: false, error: 'action không hợp lệ' };
        ai(k); return { started: k };
    });
    TK.cmd('toc', () => { insertToc(); return { ok: true }; });

    /* ---------- khởi động ---------- */
    (function boot() {
        let loaded = false;
        try {
            const j = JSON.parse(localStorage.getItem(STORE) || 'null');
            if (j && j.html && j.html.trim()) {
                page.innerHTML = j.html;
                docName = j.name || 'Tài liệu đã lưu';
                document.getElementById('stSaved').textContent = 'Bản lưu ' + new Date(j.ts).toLocaleTimeString('vi-VN');
                loaded = true;
            }
        } catch (e) {}
        if (!loaded) page.innerHTML = TPL.report;
        hist.reset();
        hist.push(page.innerHTML);
        updateStats();
        document.getElementById('spellBtn').classList.add('on');
        TK.status(loaded ? 'Đã khôi phục tài liệu đã lưu — gõ để tiếp tục' : 'Sẵn sàng — đã nạp mẫu Báo cáo. Gõ trực tiếp, hoặc dùng ribbon/menu để định dạng.');
    })();
})();
