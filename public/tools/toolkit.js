/* ============================================================
   RUNE TOOLKIT — bộ công cụ dùng chung cho 12 ứng dụng Creative
   Mọi nút bấm trong app đều đi qua đây → đảm bảo không có nút "chết"
   ============================================================ */
(function () {
    'use strict';

    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

    const TK = {
        app: 'app',
        _handlers: {},     // data-action -> fn
        _commands: {},     // lệnh AI/parent gửi sang
        _status: null,
        _announceT: null,

        /* ---------- khởi động app ---------- */
        init(cfg) {
            this.app = cfg.app || 'app';
            this._status = cfg.status ? $(cfg.status) : $('.statusbar');
            document.body.dataset.runeApp = this.app;

            // gắn MỌI phần tử có data-action
            document.addEventListener('click', e => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const fn = this._handlers[el.dataset.action];
                if (!fn) { RuneUI.toast('Chưa có hành động: ' + el.dataset.action, 'error'); return; }
                e.preventDefault();
                try { fn.call(el, e, el); } catch (err) { console.error(err); RuneUI.toast('Lỗi: ' + err.message, 'error'); }
            });

            // menu có dropdown (data-menu="ten")
            $$('[data-menu]').forEach(m => {
                m.addEventListener('click', ev => {
                    ev.stopPropagation();
                    const id = m.dataset.menu;
                    const pop = $('#menu-' + id);
                    if (!pop) return;
                    const open = pop.classList.contains('show');
                    $$('[data-menu-pop]').forEach(p => p.classList.remove('show'));
                    if (!open) {
                        pop.classList.add('show');
                        const r = m.getBoundingClientRect();
                        pop.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
                        pop.style.top = (r.bottom + 2) + 'px';
                    }
                });
            });
            document.addEventListener('click', () => $$('[data-menu-pop]').forEach(p => p.classList.remove('show')));

            // cầu nối với trang cha (AI Chat điều khiển app)
            window.addEventListener('message', async ev => {
                const d = ev.data;
                if (!d || d.type !== 'rune:cmd' || d.app !== this.app) return;
                const fn = this._commands[d.cmd];
                let out;
                try {
                    if (!fn) out = { ok: false, error: 'App không hỗ trợ lệnh: ' + d.cmd };
                    else out = { ok: true, result: await fn(d.args || {}) };
                } catch (err) { out = { ok: false, error: err.message }; }
                parent.postMessage({ type: 'rune:cmd-result', id: d.id, app: this.app, ...out }, '*');
            });
            // báo cho trang cha biết app đã sẵn sàng + danh sách lệnh điều khiển
            this._announceSoon();
            this.status(cfg.readyText || 'Sẵn sàng');
            return this;
        },

        /* gửi (debounce) danh sách lệnh hiện có cho trang cha */
        _announceSoon() {
            clearTimeout(this._announceT);
            this._announceT = setTimeout(() => {
                try { parent.postMessage({ type: 'rune:app-ready', app: this.app, commands: Object.keys(this._commands) }, '*'); } catch (e) {}
            }, 80);
        },

        /* ---------- đăng ký ---------- */
        on(action, fn) { this._handlers[action] = fn; return this; },
        cmd(name, fn) { this._commands[name] = fn; this._announceSoon(); return this; },

        /* ---------- trạng thái ---------- */
        status(text) {
            if (this._status) {
                const el = this._status.querySelector('[data-status-text]') || this._status;
                el.textContent = text;
            }
            try { parent.postMessage({ type: 'rune:status', app: this.app, text }, '*'); } catch (e) {}
        },

        toast(m, t) { RuneUI.toast(m, t); },
        modal(o) { return RuneUI.modal(o); },
        prompt(title, message, value) { return RuneUI.modal({ title, message, input: true, value: value || '', ok: 'OK' }); },
        askNumber(title, message, value) { return RuneUI.modal({ title, message, input: true, type: 'number', value: value || '', ok: 'OK' }); },
        confirm(title, message) { return RuneUI.confirm({ title, message, ok: 'Xác nhận' }); },

        /* ---------- file ---------- */
        pickFile(accept) {
            return new Promise(res => {
                const i = document.createElement('input');
                i.type = 'file'; if (accept) i.accept = accept;
                i.style.display = 'none'; document.body.appendChild(i);
                i.onchange = () => { const f = i.files && i.files[0]; i.remove(); res(f || null); };
                i.click();
            });
        },
        pickFiles(accept) {
            return new Promise(res => {
                const i = document.createElement('input');
                i.type = 'file'; i.multiple = true; if (accept) i.accept = accept;
                i.style.display = 'none'; document.body.appendChild(i);
                i.onchange = () => { const f = Array.prototype.slice.call(i.files || []); i.remove(); res(f); };
                i.click();
            });
        },
        readAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); },
        readAsText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); },
        readAsArrayBuffer(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); }); },
        loadImage(src) {
            return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.crossOrigin = 'anonymous'; im.src = src; });
        },

        download(dataOrBlob, filename, mime) {
            const url = dataOrBlob instanceof Blob ? URL.createObjectURL(dataOrBlob) : dataOrBlob;
            const a = document.createElement('a');
            a.href = url; a.download = filename || ('rune-' + Date.now());
            document.body.appendChild(a); a.click(); a.remove();
            if (dataOrBlob instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 4000);
            RuneUI.toast('💾 Đã tải xuống: ' + (filename || 'file'), 'ok');
        },

        /* ---------- slider + label ---------- */
        slider(sel, labelSel, cb, fmt) {
            const el = typeof sel === 'string' ? $(sel) : sel;
            if (!el) return null;
            const lab = labelSel ? (typeof labelSel === 'string' ? $(labelSel) : labelSel) : null;
            const f = fmt || (v => v);
            const run = () => { const v = parseFloat(el.value); if (lab) lab.textContent = f(v); cb && cb(v, el); };
            el.addEventListener('input', run);
            if (lab) lab.textContent = f(parseFloat(el.value));
            return el;
        },

        /* ---------- nhóm công cụ (toolbar) ---------- */
        toolGroup(containerSel, itemSel, onChange, activeClass) {
            const box = typeof containerSel === 'string' ? $(containerSel) : containerSel;
            if (!box) return { select() {} };
            const items = $$(itemSel || '[data-tool]', box);
            const cls = activeClass || 'active';
            const select = name => {
                const it = items.find(i => (i.dataset.tool || i.dataset.action) === name) || null;
                items.forEach(i => i.classList.remove(cls));
                if (it) it.classList.add(cls);
                onChange && onChange(name, it);
            };
            items.forEach(it => it.addEventListener('click', () => select(it.dataset.tool || it.dataset.action)));
            return { select, items };
        },

        /* ---------- lịch sử undo/redo ---------- */
        history(limit) {
            const stack = []; let idx = -1; const max = limit || 40;
            return {
                push(state) {
                    if (idx < stack.length - 1) stack.length = idx + 1;
                    stack.push(state);
                    if (stack.length > max) stack.shift();
                    idx = stack.length - 1;
                    return idx;
                },
                undo() { if (idx > 0) idx--; return stack[idx]; },
                redo() { if (idx < stack.length - 1) idx++; return stack[idx]; },
                canUndo() { return idx > 0; },
                canRedo() { return idx < stack.length - 1; },
                reset() { stack.length = 0; idx = -1; }
            };
        },

        /* ---------- AI thật bên trong app ---------- */
        async ai(userPrompt, opts) {
            const o = opts || {};
            if (!RuneKeys.hasAi()) {
                const go = await RuneUI.modal({
                    title: '🔑 Cần khóa AI',
                    message: 'Ứng dụng này dùng chung MỘT khóa AI với Rune. Mở trang Khóa để nhập rồi quay lại nhé.',
                    input: true, ok: 'Nhập ngay tại đây', cancel: 'Để sau',
                    value: ''
                });
                if (go === null) return null;
                if (String(go).trim().length > 8) { RuneKeys.setAi({ key: String(go).trim() }); RuneUI.toast('Đã lưu khóa AI', 'ok'); }
                else return null;
            }
            const messages = [];
            if (o.system) messages.push({ role: 'system', content: o.system });
            messages.push({ role: 'user', content: userPrompt });
            if (o.json) messages.push({ role: 'system', content: 'CHỈ trả về JSON hợp lệ, không kèm chữ khác.' });
            let text = '';
            await RuneAI.chat({ messages, tools: null, onDelta: d => { text += d; o.onDelta && o.onDelta(d, text); } });
            if (o.json) {
                const m = /```json\s*([\s\S]*?)```/.exec(text) || /\{[\s\S]*\}|\[[\s\S]*\]/.exec(text);
                try { return JSON.parse(m ? (m[1] || m[0]) : text); } catch (e) { return { _raw: text }; }
            }
            return text;
        },

        /* ---------- tiện ích canvas ---------- */
        fitCanvasToContainer(canvas, wrap, pad) {
            const p = pad == null ? 24 : pad;
            const scale = Math.min((wrap.clientWidth - p) / canvas.width, (wrap.clientHeight - p) / canvas.height, 4);
            canvas.style.width = (canvas.width * scale) + 'px';
            canvas.style.height = (canvas.height * scale) + 'px';
            return scale;
        },
        canvasPos(canvas, e) {
            const r = canvas.getBoundingClientRect();
            const t = e.touches ? e.touches[0] : e;
            return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
        },
        /* áp bộ lọc CSS lên canvas rồi "nướng" thành pixel thật */
        bakeFilter(canvas, filter) {
            const tmp = document.createElement('canvas');
            tmp.width = canvas.width; tmp.height = canvas.height;
            const c = tmp.getContext('2d');
            c.filter = filter || 'none';
            c.drawImage(canvas, 0, 0);
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            canvas.getContext('2d').drawImage(tmp, 0, 0);
        },
        hexToRgb(h) { const v = h.replace('#', ''); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]; },
        clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
        fmtTime(s) {
            s = Math.max(0, s || 0);
            const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), f = Math.floor((s % 1) * 100);
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
        }
    };

    window.TK = TK;
    window.$ = $;
    window.$$ = $$;
})();
