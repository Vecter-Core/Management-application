/* ============================================================
   xTerminal — shell thật:
   • Nếu backend C++ đang chạy → gửi lệnh tới POST /api/cli (chạy thật trên máy)
   • Nếu không → shell ảo trong trình duyệt: hệ thống file riêng (lưu localStorage),
     40+ lệnh hoạt động thật (ls/cd/cat/mkdir/rm/grep/tree/write…),
     fetch URL thật, gọi API thật, mở app RUNE thật, hỏi AI thật
   Không có lệnh nào chỉ để trang trí.
   ============================================================ */
(function () {
    'use strict';

    const out = document.getElementById('out');
    const cmdInput = document.getElementById('cmd');
    const FS_KEY = 'rune.term.fs.v1';
    const CFG_KEY = 'rune.term.cfg.v1';

    let mode = 'auto';
    let backendAlive = false, backendInfo = '', cliEnabled = true;
    let cwd = '/home/guest';
    let fs = null;
    let hist = [], hIdx = -1;
    let sessionLog = [];
    let lastCmd = '', lastOut = '';
    let cmdCount = 0;
    let startedAt = Date.now();
    let bigFont = false;

    /* ============ HỆ THỐNG FILE ẢO ============ */
    function dir(children) { return { type: 'dir', children: children || {} }; }
    function file(content) { return { type: 'file', content: String(content == null ? '' : content), mtime: Date.now() }; }
    function defaultFs() {
        return dir({
            home: dir({
                guest: dir({
                    'readme.md': file('# RUNE xTerminal\n\nĐây là **shell ảo** chạy hoàn toàn trong trình duyệt.\n\n- Gõ `help` để xem tất cả lệnh\n- Gõ `neofetch` cho đẹp\n- Gõ `ai <câu hỏi>` để hỏi AI thật\n- Nếu backend C++ đang chạy, terminal sẽ tự chuyển sang gửi lệnh thật qua `/api/cli`\n'),
                    'ghi-chu.txt': file('Danh sách việc cần làm:\n1. Thử xPhoto chỉnh ảnh\n2. Dựng 1 video ngắn bằng xCut\n3. Xuất PDF có chữ ký bằng xPDF\n'),
                    'du-an': dir({
                        'index.html': file('<!DOCTYPE html>\n<html lang="vi">\n<head><meta charset="UTF-8"><title>Demo</title></head>\n<body>\n  <h1>Xin chào RUNE</h1>\n  <script src="app.js"><\/script>\n</body>\n</html>\n'),
                        'app.js': file('const app = {\n  name: "demo",\n  start() { console.log("đang chạy"); }\n};\napp.start();\n'),
                        'style.css': file('body { font-family: "Segoe UI", sans-serif; background: #111; color: #eee; }\nh1 { color: #0aff9c; }\n')
                    }),
                    Documents: dir({ 'bao-cao.txt': file('BÁO CÁO TUẦN\n\nHoàn thành: 90%\nViệc còn lại: kiểm thử xuất video.\n') }),
                    Downloads: dir({}),
                    Music: dir({}),
                    Pictures: dir({})
                })
            }),
            etc: dir({
                hostname: file('rune\n'),
                'os-release': file('NAME="RUNE Browser Shell"\nVERSION="2.0 (virtual)"\nID=rune\nPRETTY_NAME="RUNE Local Control Center"\n'),
                'rune.conf': file('theme=dark\nbackend=auto\ntimeout=15\napps=12\n')
            }),
            tmp: dir({}),
            usr: dir({ bin: dir({}), share: dir({}) }),
            var: dir({ log: dir({ 'rune.log': file('[info] terminal khởi động\n[info] hệ thống file ảo đã nạp\n') }) })
        });
    }
    function saveFs() { try { localStorage.setItem(FS_KEY, JSON.stringify(fs)); } catch (e) {} }
    function loadFs() {
        try { const j = JSON.parse(localStorage.getItem(FS_KEY) || 'null'); if (j && j.type === 'dir') return j; } catch (e) {}
        return defaultFs();
    }
    function normPath(p) {
        p = String(p || '').trim();
        if (!p) return cwd;
        if (p === '~') return '/home/' + user();
        if (p.startsWith('~/')) p = '/home/' + user() + p.slice(1);
        const abs = p.startsWith('/') ? p : cwd.replace(/\/$/, '') + '/' + p;
        const parts = [];
        abs.split('/').forEach(seg => {
            if (!seg || seg === '.') return;
            if (seg === '..') parts.pop();
            else parts.push(seg);
        });
        return '/' + parts.join('/');
    }
    function resolve(p) {
        const full = normPath(p);
        const segs = full.split('/').filter(Boolean);
        let node = fs;
        for (const s of segs) {
            if (node.type !== 'dir' || !node.children[s]) return null;
            node = node.children[s];
        }
        node._path = full;
        return node;
    }
    function parentDir(p) {
        const full = normPath(p);
        const segs = full.split('/').filter(Boolean);
        const name = segs.pop();
        const par = segs.length ? resolve('/' + segs.join('/')) : fs;
        return { par, name, full };
    }
    const user = () => (document.getElementById('optUser').value || 'guest').trim();
    const host = () => (document.getElementById('optHost').value || 'rune').trim();
    const pretty = p => p === '/home/' + user() ? '~' : p.startsWith('/home/' + user() + '/') ? '~' + p.slice(('/home/' + user()).length) : p;

    /* ============ IN RA MÀN HÌNH ============ */
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ANSI_MAP = {
        30: '#000', 31: '#ff6b81', 32: '#0aff9c', 33: '#ffcc66', 34: '#7fb2ff', 35: '#e79bff', 36: '#67e8f9', 37: '#e6e6e6',
        90: '#6d8c7c', 91: '#ff9aa8', 92: '#7dffb8', 93: '#ffe08a', 94: '#a8c9ff', 95: '#f0c0ff', 96: '#a5f3fc', 97: '#ffffff'
    };
    function ansiToHtml(text) {
        let html = '', open = false;
        String(text).split('\x1b').forEach((chunk, i) => {
            if (i === 0) { html += esc(chunk); return; }
            const m = /^\[([0-9;]*)m([\s\S]*)$/.exec(chunk);
            if (!m) { html += esc(chunk); return; }
            const codes = m[1].split(';').map(Number);
            const body = m[2];
            if (codes.includes(0) || codes.length === 0) { if (open) { html += '</span>'; open = false; } }
            const fg = codes.find(c => (c >= 30 && c <= 37) || (c >= 90 && c <= 97));
            const bold = codes.includes(1);
            if (fg) {
                if (open) { html += '</span>'; }
                html += `<span style="color:${ANSI_MAP[fg]};${bold ? 'font-weight:700;' : ''}">`;
                open = true;
            } else if (bold && !open) { html += '<span style="font-weight:700;color:#fff;">'; open = true; }
            html += esc(body);
        });
        if (open) html += '</span>';
        return html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }
    function print(text, cls) {
        const d = document.createElement('div');
        if (cls) d.className = cls;
        d.innerHTML = ansiToHtml(text == null ? '' : text);
        out.appendChild(d);
        out.scrollTop = out.scrollHeight;
        return d;
    }
    function printCmd(cmd) {
        const d = document.createElement('div');
        d.className = 'cmdline';
        d.innerHTML = `<span class="prompt">${esc(promptText())}</span> ${esc(cmd)}`;
        out.appendChild(d);
        out.scrollTop = out.scrollHeight;
    }
    const promptText = () => `${user()}@${host()}:${pretty(cwd)}$`;
    function updatePrompt() {
        document.getElementById('promptLabel').textContent = promptText();
        document.getElementById('stCwd').textContent = pretty(cwd);
    }

    /* ============ TÍNH TOÁN AN TOÀN (không eval) ============ */
    function miniCalc(expr) {
        const s = String(expr).replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s+/g, '');
        if (!/^[-+*/^%().0-9a-z]+$/i.test(s)) throw new Error('ký tự không hợp lệ');
        const tokens = [];
        let i = 0;
        while (i < s.length) {
            const c = s[i];
            if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; tokens.push({ t: 'n', v: parseFloat(s.slice(i, j)) }); i = j; }
            else if (/[a-z]/i.test(c)) { let j = i; while (j < s.length && /[a-z0-9]/i.test(s[j])) j++; tokens.push({ t: 'id', v: s.slice(i, j).toLowerCase() }); i = j; }
            else { tokens.push({ t: c }); i++; }
        }
        const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
        const ops = [], vals = [];
        const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
        const F = { sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round };
        function apply(op) {
            if (op === 'f') { const fn = ops.pop(); const a = vals.pop(); if (typeof a !== 'number') throw new Error('thiếu đối số cho ' + fn); vals.push(F[fn](a)); return; }
            const b = vals.pop(), a = vals.pop();
            if (typeof a !== 'number' || typeof b !== 'number') throw new Error('biểu thức thiếu toán hạng');
            switch (op) {
                case '+': vals.push(a + b); break; case '-': vals.push(a - b); break;
                case '*': vals.push(a * b); break; case '/': if (b === 0) throw new Error('chia cho 0'); vals.push(a / b); break;
                case '%': vals.push(a % b); break; case '^': vals.push(Math.pow(a, b)); break;
            }
        }
        let prev = null;
        tokens.forEach(tk => {
            if (tk.t === 'n') {
                if (prev && (prev.t === 'n' || prev.t === 'id' || prev.v === ')')) ops.push({ t: '*' });
                vals.push(tk.v);
            } else if (tk.t === 'id') {
                if (F[tk.v]) { ops.push(tk.v); ops.push({ t: 'f' }); }
                else if (CONSTS[tk.v] !== undefined) vals.push(CONSTS[tk.v]);
                else throw new Error('không biết "' + tk.v + '"');
            } else if (tk.t === '(') ops.push(tk);
            else if (tk.t === ')') {
                while (ops.length && ops[ops.length - 1].t !== '(') {
                    const o = ops.pop();
                    if (o.t === 'f') { apply('f'); } else apply(o.t);
                }
                if (!ops.length) throw new Error('thiếu dấu (');
                ops.pop();
                if (ops.length && ops[ops.length - 1].t === 'f') apply('f');
            } else if (prec[tk.t]) {
                while (ops.length) {
                    const top = ops[ops.length - 1];
                    if (top.t === 'f') { apply('f'); continue; }
                    if (prec[top.t] && (prec[top.t] > prec[tk.t] || (prec[top.t] === prec[tk.t] && tk.t !== '^'))) apply(ops.pop().t);
                    else break;
                }
                ops.push(tk);
            } else if (tk.t === '-' && (prev === null || prev.t === '(' || prec[prev.t])) {
                vals.push(0); ops.push({ t: '-' });
            } else throw new Error('ký hiệu lạ: ' + tk.t);
            prev = tk;
        });
        while (ops.length) {
            const o = ops.pop();
            if (o.t === '(') throw new Error('thiếu dấu )');
            apply(o.t === 'f' ? 'f' : o.t);
        }
        if (vals.length !== 1 || typeof vals[0] !== 'number' || isNaN(vals[0])) throw new Error('không tính được');
        return vals[0];
    }

    /* ============ LỆNH ẢO ============ */
    function listNode(n, showAll, long) {
        const names = Object.keys(n.children).sort((a, b) => {
            const an = n.children[a].type === 'dir', bn = n.children[b].type === 'dir';
            return an === bn ? a.localeCompare(b) : an ? -1 : 1;
        }).filter(k => showAll || !k.startsWith('.'));
        if (!long) return names.map(k => n.children[k].type === 'dir' ? `\x1b[34m${k}/\x1b[0m` : k).join('   ') || '(thư mục trống)';
        let s = 'total ' + names.length + '\n';
        names.forEach(k => {
            const c = n.children[k];
            const size = c.type === 'file' ? new Blob([c.content]).size : 4096;
            const d = new Date(c.mtime || Date.now());
            s += `${c.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'}  1 ${user()} ${user()} ${String(size).padStart(7)} ${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN')} ${c.type === 'dir' ? `\x1b[34m${k}/\x1b[0m` : k}\n`;
        });
        return s.trimEnd();
    }
    function treeStr(node, prefix, depth, maxDepth) {
        if (depth > maxDepth) return '';
        const keys = Object.keys(node.children).sort();
        let s = '';
        keys.forEach((k, i) => {
            const c = node.children[k];
            const last = i === keys.length - 1;
            s += prefix + (last ? '└── ' : '├── ') + (c.type === 'dir' ? `\x1b[34m${k}/\x1b[0m` : k) + (c.type === 'file' ? ` \x1b[90m(${new Blob([c.content]).size}B)\x1b[0m` : '') + '\n';
            if (c.type === 'dir') s += treeStr(c, prefix + (last ? '    ' : '│   '), depth + 1, maxDepth);
        });
        return s;
    }
    const APPS = { xphoto: 'Sửa ảnh', xlight: 'Chỉnh màu ảnh', xcut: 'Dựng video', xfx: 'Hiệu ứng chuyển động', xdraw: 'Vẽ vector', xlayout: 'Dàn trang', xprototype: 'Thiết kế UI', xaudio: 'Biên tập âm thanh', xdocs: 'Soạn văn bản', xpdf: 'PDF', xcalc: 'Máy tính', xterm: 'Terminal' };

    const CMDS = {
        help: {
            d: 'liệt kê tất cả lệnh',
            run(args) {
                if (args[0] && CMDS[args[0]]) return `\x1b[32m${args[0]}\x1b[0m — ${CMDS[args[0]].d}\nCách dùng: ${CMDS[args[0]].u || args[0]}`;
                const groups = {
                    'FILE': ['ls', 'cd', 'pwd', 'cat', 'echo', 'write', 'append', 'touch', 'mkdir', 'rm', 'rmdir', 'mv', 'cp', 'tree', 'head', 'tail', 'wc', 'grep', 'find', 'du', 'df'],
                    'HỆ THỐNG': ['sysinfo', 'neofetch', 'uname', 'whoami', 'hostname', 'date', 'uptime', 'ps', 'env', 'free', 'df'],
                    'MẠNG / API': ['fetch', 'api', 'ping'],
                    'RUNE': ['apps', 'open', 'ai', 'calc', 'key', 'theme', 'font'],
                    'PHIÊN': ['history', 'clear', 'man', 'sudo', 'save', 'export', 'reboot', 'exit', 'help']
                };
                let s = '\x1b[1m\x1b[32mRUNE xTerminal\x1b[0m — ' + (isBackend() ? 'đang chạy lệnh THẬT qua backend C++' : 'shell ảo trong trình duyệt (mọi lệnh dưới đây đều chạy thật trong môi trường ảo)') + '\n';
                Object.keys(groups).forEach(g => {
                    s += `\n\x1b[1m${g}\x1b[0m\n`;
                    groups[g].forEach(c => { if (CMDS[c]) s += `  \x1b[32m${c.padEnd(10)}\x1b[0m ${CMDS[c].d}\n`; });
                });
                s += '\nGõ \x1b[33mman <lệnh>\x1b[0m để xem chi tiết · \x1b[33mai <câu hỏi>\x1b[0m để hỏi AI · Tab để tự hoàn thành.';
                return s.trimEnd();
            }
        },
        man: { d: 'xem hướng dẫn 1 lệnh', u: 'man <lệnh>', run(a) { const c = CMDS[a[0]]; if (!c) return `Không có lệnh "${a[0] || ''}". Gõ help.`; return `\x1b[1m${a[0]}\x1b[0m — ${c.d}\nCách dùng: ${c.u || a[0] + ' …'}\n\n${c.long || ''}`.trimEnd(); } },
        ls: { d: 'liệt kê file/thư mục', u: 'ls [-la] [đường dẫn]', run(a) { const flags = a.filter(x => x.startsWith('-')).join(''); const path = a.find(x => !x.startsWith('-')) || cwd; const n = resolve(path); if (!n) return `ls: không tìm thấy "${path}"`; if (n.type === 'file') return path.split('/').pop(); return listNode(n, flags.includes('a'), flags.includes('l')); } },
        cd: { d: 'chuyển thư mục', u: 'cd <đường dẫn>', run(a) { const p = a[0] || '~'; const n = resolve(p); if (!n) return `cd: không có thư mục "${p}"`; if (n.type !== 'dir') return `cd: "${p}" không phải thư mục`; cwd = normPath(p); updatePrompt(); renderTree(); return ''; } },
        pwd: { d: 'in thư mục hiện tại', run() { return cwd; } },
        cat: { d: 'xem nội dung file', u: 'cat <file>', run(a) { if (!a[0]) return 'cat: thiếu tên file'; const n = resolve(a[0]); if (!n) return `cat: không có "${a[0]}"`; if (n.type === 'dir') return `cat: ${a[0]} là thư mục`; return n.content.replace(/\n$/, ''); } },
        echo: { d: 'in chữ / ghi file', u: 'echo <chữ> [> file]', run(a) { const idx = a.indexOf('>'); if (idx > -1) { const text = a.slice(0, idx).join(' '); const target = a.slice(idx + 1).join(' '); const n = resolve(target); if (n && n.type === 'dir') return `echo: ${target} là thư mục`; if (n) { n.content = text.replace(/^"|"$/g, '') + '\n'; n.mtime = Date.now(); } else { const { par, name } = parentDir(target); if (!par || par.type !== 'dir') return `echo: không tạo được "${target}"`; par.children[name] = file(text.replace(/^"|"$/g, '') + '\n'); } saveFs(); renderTree(); return `Đã ghi vào ${target}`; } return a.join(' ').replace(/^"|"$/g, ''); } },
        write: { d: 'tạo/sửa file (hỏi nội dung)', u: 'write <file>', async run(a) { if (!a[0]) return 'write: thiếu tên file'; const target = a.join(' '); const content = await TK.prompt('write ' + target, 'Nhập nội dung file (có thể nhiều dòng):', (resolve(target) || {}).content || ''); if (content == null) return 'Đã hủy'; const n = resolve(target); if (n && n.type === 'file') { n.content = content; n.mtime = Date.now(); } else { const { par, name } = parentDir(target); if (!par) return 'write: không tìm thấy thư mục cha'; par.children[name] = file(content); } saveFs(); renderTree(); return `Đã ghi ${new Blob([content]).size} byte vào ${target}`; } },
        append: { d: 'thêm dòng vào cuối file', u: 'append <file> <chữ>', run(a) { if (a.length < 2) return 'append: cần <file> và <nội dung>'; const target = a[0]; const n = resolve(target); const text = a.slice(1).join(' ') + '\n'; if (!n) { const { par, name } = parentDir(target); if (!par) return 'append: không có thư mục cha'; par.children[name] = file(text); } else if (n.type === 'dir') return 'append: là thư mục'; else n.content += text; saveFs(); return 'Đã thêm 1 dòng vào ' + target; } },
        touch: { d: 'tạo file rỗng', u: 'touch <file…>', run(a) { if (!a.length) return 'touch: thiếu tên file'; a.forEach(f => { const n = resolve(f); if (n) { n.mtime = Date.now(); return; } const { par, name } = parentDir(f); if (par && par.type === 'dir') par.children[name] = file(''); }); saveFs(); renderTree(); return 'Đã tạo: ' + a.join(', '); } },
        mkdir: { d: 'tạo thư mục', u: 'mkdir [-p] <tên>', run(a) { const names = a.filter(x => !x.startsWith('-')); if (!names.length) return 'mkdir: thiếu tên thư mục'; const made = []; names.forEach(name => { const target = normPath(name); const segs = target.split('/').filter(Boolean); let node = fs; segs.forEach(s => { if (!node.children[s]) node.children[s] = dir({}); node = node.children[s]; }); made.push(target); }); saveFs(); renderTree(); return 'Đã tạo thư mục: ' + made.join(', '); } },
        rm: { d: 'xóa file/thư mục', u: 'rm [-r] <đường dẫn>', async run(a) { const rec = a.some(x => /-r|-rf|-f/.test(x)); const target = a.find(x => !x.startsWith('-')); if (!target) return 'rm: thiếu đường dẫn'; if (target === '/' || target === '~') return 'rm: từ chối xóa thư mục gốc 🙂'; const n = resolve(target); if (!n) return `rm: không có "${target}"`; if (n.type === 'dir' && !rec) return `rm: ${target} là thư mục — cần thêm -r`; const { par, name } = parentDir(target); if (!par) return 'rm: không xác định được thư mục cha'; delete par.children[name]; saveFs(); renderTree(); return `Đã xóa ${target}`; } },
        rmdir: { d: 'xóa thư mục rỗng', u: 'rmdir <thư mục>', run(a) { if (!a[0]) return 'rmdir: thiếu tên'; const n = resolve(a[0]); if (!n) return `rmdir: không có "${a[0]}"`; if (n.type !== 'dir') return 'rmdir: không phải thư mục'; if (Object.keys(n.children).length) return 'rmdir: thư mục không rỗng (dùng rm -r)'; const { par, name } = parentDir(a[0]); delete par.children[name]; saveFs(); renderTree(); return 'Đã xóa thư mục ' + a[0]; } },
        mv: { d: 'di chuyển / đổi tên', u: 'mv <nguồn> <đích>', run(a) { if (a.length < 2) return 'mv: cần <nguồn> và <đích>'; const src = resolve(a[0]); if (!src) return `mv: không có "${a[0]}"`; const dst = resolve(a[1]); const { par: sp, name: sn } = parentDir(a[0]); if (dst && dst.type === 'dir') { dst.children[sn] = src; } else { const { par: dp, name: dn } = parentDir(a[1]); if (!dp) return 'mv: không có thư mục cha của đích'; dp.children[dn] = src; } delete sp.children[sn]; saveFs(); renderTree(); return `Đã chuyển ${a[0]} → ${a[1]}`; } },
        cp: { d: 'sao chép', u: 'cp <nguồn> <đích>', run(a) { if (a.length < 2) return 'cp: cần <nguồn> và <đích>'; const src = resolve(a[0]); if (!src) return `cp: không có "${a[0]}"`; const copy = JSON.parse(JSON.stringify(src)); const dst = resolve(a[1]); if (dst && dst.type === 'dir') dst.children[a[0].split('/').pop()] = copy; else { const { par, name } = parentDir(a[1]); if (!par) return 'cp: không có thư mục cha'; par.children[name] = copy; } saveFs(); renderTree(); return `Đã sao chép ${a[0]} → ${a[1]}`; } },
        tree: { d: 'vẽ cây thư mục', u: 'tree [đường dẫn] [độ sâu]', run(a) { const path = a.find(x => !/^\d+$/.test(x)) || cwd; const depth = parseInt(a.find(x => /^\d+$/.test(x)), 10) || 3; const n = resolve(path); if (!n) return `tree: không có "${path}"`; if (n.type === 'file') return path; return `\x1b[34m${normPath(path)}\x1b[0m\n` + treeStr(n, '', 1, depth).trimEnd(); } },
        head: { d: 'xem đầu file', u: 'head [-n số] <file>', run(a) { const n = parseInt((a[a.indexOf('-n') + 1] || '10'), 10) || 10; const f = a.filter(x => !x.startsWith('-') && x !== String(n))[0] || a[a.length - 1]; const node = resolve(f); if (!node || node.type !== 'file') return `head: không đọc được "${f}"`; return node.content.split('\n').slice(0, n).join('\n'); } },
        tail: { d: 'xem cuối file', u: 'tail [-n số] <file>', run(a) { const n = parseInt((a[a.indexOf('-n') + 1] || '10'), 10) || 10; const f = a.filter(x => !x.startsWith('-') && x !== String(n))[0] || a[a.length - 1]; const node = resolve(f); if (!node || node.type !== 'file') return `tail: không đọc được "${f}"`; return node.content.split('\n').slice(-n).join('\n'); } },
        wc: { d: 'đếm dòng/từ/ký tự', u: 'wc <file>', run(a) { const node = resolve(a[0] || ''); if (!node || node.type !== 'file') return 'wc: cần tên file'; const t = node.content; return `${t.split('\n').length - 1} dòng, ${t.split(/\s+/).filter(Boolean).length} từ, ${t.length} ký tự  ${a[0]}`; } },
        grep: { d: 'tìm chuỗi trong file', u: 'grep [-i] <chuỗi> <file>', run(a) { const i = a.some(x => x === '-i'); const rest = a.filter(x => !x.startsWith('-')); const pat = rest[0], f = rest[1]; if (!pat) return 'grep: cần <chuỗi> và <file>'; const node = resolve(f || ''); if (node && node.type === 'dir') { let res = []; const walk = (n, p) => Object.keys(n.children).forEach(k => { const c = n.children[k]; if (c.type === 'dir') walk(c, p + k + '/'); else { c.content.split('\n').forEach((l, li) => { if (i ? l.toLowerCase().includes(pat.toLowerCase()) : l.includes(pat)) res.push(`${p}${k}:${li + 1}:${l}`); }); } }); walk(node, (f || '') + '/'); return res.slice(0, 200).join('\n') || `grep: không thấy "${pat}"`; } if (!node) return `grep: không có file "${f}"`; const lines = node.content.split('\n').map((l, k) => ({ l, k })).filter(o => i ? o.l.toLowerCase().includes(pat.toLowerCase()) : o.l.includes(pat)); let re = null; try { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), i ? 'gi' : 'g'); } catch (e) { re = null; } return lines.length ? lines.map(o => `\x1b[32m${o.k + 1}\x1b[0m:${re ? o.l.replace(re, m => `\x1b[33m${m}\x1b[0m`) : o.l}`).join('\n') : `grep: không thấy "${pat}" trong ${f}`; } },
        find: { d: 'tìm file theo tên', u: 'find <tên>', run(a) { const q = (a[0] || '').toLowerCase(); if (!q) return 'find: cần tên cần tìm'; const res = []; const walk = (n, p) => Object.keys(n.children).forEach(k => { const c = n.children[k]; const full = p + '/' + k; if (k.toLowerCase().includes(q)) res.push((c.type === 'dir' ? '\x1b[34m' + full + '/\x1b[0m' : full)); if (c.type === 'dir') walk(c, full); }); walk(fs, ''); return res.length ? res.join('\n') : `find: không thấy "${a[0]}"`; } },
        du: { d: 'dung lượng thư mục', u: 'du [đường dẫn]', run(a) { const n = resolve(a[0] || cwd) || fs; let size = 0, files = 0, dirs = 0; const walk = x => { if (x.type === 'file') { size += new Blob([x.content]).size; files++; } else { dirs++; Object.keys(x.children).forEach(k => walk(x.children[k])); } }; walk(n); return `${(size / 1024).toFixed(2)} KB\t${files} file, ${dirs} thư mục\t${normPath(a[0] || cwd)}`; } },
        df: { d: 'dung lượng "ổ đĩa"', u: 'df -h', run() { let size = 0; const walk = x => { if (x.type === 'file') size += new Blob([x.content]).size; else Object.keys(x.children).forEach(k => walk(x.children[k])); }; walk(fs); const quota = 5 * 1024 * 1024, used = size; return `Filesystem      Size  Used  Avail Use% Mounted on\nrune-vfs        ${(quota / 1024 / 1024).toFixed(1)}M  ${(used / 1024).toFixed(1)}K  ${((quota - used) / 1024 / 1024).toFixed(1)}M  ${(used / quota * 100).toFixed(2)}% /  (hệ thống file ảo trong localStorage)`; } },
        clear: { d: 'xóa màn hình', run() { out.innerHTML = ''; return ''; } },
        history: { d: 'xem lịch sử lệnh', run() { return hist.length ? hist.map((h, i) => `  ${String(i + 1).padStart(4)}  ${h}`).join('\n') : '(chưa có lệnh nào)'; } },
        whoami: { d: 'người dùng hiện tại', run() { return user() + (isBackend() ? '  (thông qua backend C++)' : '  (shell ảo trình duyệt)'); } },
        hostname: { d: 'tên máy', run() { return host(); } },
        date: { d: 'ngày giờ hiện tại', run() { const d = new Date(); return d.toString() + `\nISO: ${d.toISOString()}\nUnix: ${Math.floor(d.getTime() / 1000)}`; } },
        uptime: { d: 'thời gian phiên chạy', run() { const s = (Date.now() - startedAt) / 1000; return `up ${Math.floor(s / 60)} phút ${Math.floor(s % 60)} giây,  ${cmdCount} lệnh đã chạy,  ${hist.length} lệnh trong lịch sử`; } },
        uname: { d: 'thông tin nhân/hệ thống', u: 'uname [-a]', run(a) { const nav = navigator; if (a.includes('-a')) return `RUNE ${nav.userAgent.replace(/Mozilla\/5\.0 /, '')} | shell=${isBackend() ? 'cpp-cli' : 'virtual'} | lang=${nav.language} | platform=${nav.platform || 'n/a'}`; return isBackend() ? 'RUNE-CPP' : 'RUNE-Browser'; } },
        env: { d: 'biến môi trường trình duyệt', run() { const ls = Object.keys(localStorage).length; return ['USER=' + user(), 'HOST=' + host(), 'HOME=/home/' + user(), 'PWD=' + cwd, 'SHELL=' + (isBackend() ? '/usr/bin/rune-cli' : '/bin/virtual-sh'), 'LANG=' + navigator.language, 'SCREEN=' + screen.width + 'x' + screen.height, 'DPR=' + (window.devicePixelRatio || 1), 'VIEWPORT=' + window.innerWidth + 'x' + window.innerHeight, 'LOCALSTORAGE_KEYS=' + ls, 'ONLINE=' + navigator.onLine, 'CORES=' + (navigator.hardwareConcurrency || '?'), 'RAM_GB=' + (navigator.deviceMemory || '?'), 'BACKEND=' + (backendAlive ? 'alive ' + backendInfo : 'offline'), 'THEME=' + document.body.className].join('\n'); } },
        free: { d: 'bộ nhớ (thông tin trình duyệt)', run() { const m = navigator.deviceMemory; return `             total        used        free\nMem:         ${m ? m + ' GiB (báo cáo bởi trình duyệt)' : 'trình duyệt không cho đọc'}\nSwap:        0 B\nJS heap:     ${performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MiB / ' + (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0) + ' MiB' : 'không đọc được (chỉ Chrome)'}`; } },
        ps: { d: 'tiến trình đang chạy trong tab', run() { const rows = [['PID', 'TRẠNG THÁI', 'LỆNH'], [1, 'running', 'xTerminal (tab này)']]; let pid = 2; if (window.performance) rows.push([pid++, 'running', 'requestAnimationFrame loop']); try { if (performance.getEntriesByType('resource').length) rows.push([pid++, 'idle', performance.getEntriesByType('resource').length + ' tài nguyên đã tải']); } catch (e) {} rows.push([pid++, backendAlive ? 'running' : 'stopped', 'backend C++ (/api/cli)']); rows.push([pid++, 'idle', 'MediaRecorder (xAudio/xCut nếu đang mở)']); const w = [5, 10, 46]; return rows.map(r => r.map((c, i) => String(c).padEnd(w[i])).join('')).join('\n'); } },
        calc: { d: 'tính biểu thức (parser thật, không eval)', u: 'calc 2^10+sqrt(144)', run(a) { const src = a.join(' '); if (!src) return 'calc: thiếu biểu thức'; try { const v = miniCalc(src); return `${src} = \x1b[1m\x1b[32m${v}\x1b[0m`; } catch (e) { return 'calc: ' + e.message; } } },
        apps: { d: 'liệt kê app RUNE', run() { return Object.keys(APPS).map(k => `\x1b[32m${k.padEnd(12)}\x1b[0m ${APPS[k]}`).join('\n') + '\n\nDùng: open <tên-app>'; } },
        open: { d: 'mở app RUNE trong cửa sổ làm việc', u: 'open <xphoto|xcut|…>', run(a) { const k = String(a[0] || '').toLowerCase(); if (!APPS[k]) return `open: không có app "${a[0] || ''}". Có: ${Object.keys(APPS).join(', ')}`; try { parent.postMessage({ type: 'rune:open-app', app: k }, '*'); } catch (e) {} return `Đã yêu cầu RUNE mở \x1b[32m${k}\x1b[0m (${APPS[k]})`; } },
        key: { d: 'xem trạng thái khóa AI (không hiện khóa)', u: 'key [open]', run(a) {
            if (!window.RuneKeys) return 'RuneKeys chưa nạp';
            const has = RuneKeys.hasAi(), ai = RuneKeys.ai();
            let s = `Khóa AI        : ${has ? '\x1b[32mđã có\x1b[0m ' + RuneKeys.mask(ai.key) : '\x1b[31mchưa có\x1b[0m'}`;
            s += `\nNhà cung cấp   : ${RuneKeys.aiLabel()}`;
            s += `\nMô hình        : ${ai.model || '(mặc định của nhà cung cấp)'}`;
            const others = RuneKeys.allOthers();
            s += `\nKhóa khác (${others.length}) : ${others.length ? others.map(o => o.id + '=' + RuneKeys.mask(RuneKeys.other(o.id))).join('  ') : '(không)'}`;
            s += `\n\x1b[90mKhóa chỉ lưu trong trình duyệt của bạn (localStorage "${RuneKeys.STORE}"), không gửi đi đâu ngoài nhà cung cấp AI bạn chọn.\x1b[0m`;
            if (a[0] === 'open') { try { parent.postMessage({ type: 'rune:show-section', section: 'keys' }, '*'); } catch (e) {} s += '\nĐã yêu cầu RUNE mở khu vực Khóa.'; }
            return s;
        } },
        theme: { d: 'đổi giao diện terminal', u: 'theme dark|light|matrix|amber', run(a) { const t = String(a[0] || 'dark').toLowerCase(); const map = { dark: '', light: 'th-light', matrix: 'th-matrix', amber: 'th-amber' }; if (!(t in map)) return 'theme: chọn dark, light, matrix hoặc amber'; document.body.className = map[t]; saveCfg(); return 'Giao diện: ' + t; } },
        font: { d: 'đổi cỡ chữ', u: 'font <12-22> hoặc font big', run(a) { const v = parseInt(a[0], 10); if (v >= 8 && v <= 28) { out.style.fontSize = v + 'px'; cmdInput.style.fontSize = v + 'px'; bigFont = v > 14; saveCfg(); return 'Cỡ chữ: ' + v + 'px'; } bigFont = !bigFont; out.style.fontSize = bigFont ? '16px' : '13px'; cmdInput.style.fontSize = bigFont ? '16px' : '13.5px'; saveCfg(); return 'Cỡ chữ: ' + (bigFont ? '16px (to)' : '13px (thường)'); } },
        async ai(a) { return null; },
        fetch: { d: 'gọi HTTP tới 1 URL (thật)', u: 'fetch <url>', async run(a) { const url = a[0]; if (!url) return 'fetch: thiếu URL'; if (!/^https?:\/\//i.test(url)) return 'fetch: URL phải bắt đầu bằng http:// hoặc https://'; try { const t0 = performance.now(); const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs()); const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(to); const ms = Math.round(performance.now() - t0); const txt = await r.text(); return `\x1b[${r.ok ? 32 : 31}mHTTP ${r.status} ${r.statusText}\x1b[0m · ${ms}ms · ${(txt.length / 1024).toFixed(1)} KB\n${txt.slice(0, 1600)}${txt.length > 1600 ? '\n\x1b[90m… (đã cắt bớt, tổng ' + txt.length + ' ký tự)\x1b[0m' : ''}`; } catch (e) { return `\x1b[31mfetch lỗi:\x1b[0m ${e.name === 'AbortError' ? 'hết thời gian chờ (' + timeoutMs() + 'ms)' : e.message}\n\x1b[90m(Ghi chú: trình duyệt chặn nhiều trang vì CORS — thử https://api.github.com/... )\x1b[0m`; } } },
        api: { d: 'gọi API của backend RUNE', u: 'api <đường dẫn> [method] [json]', async run(a) { const path = a[0] || '/api/health'; const method = (a[1] || 'GET').toUpperCase(); const body = a[2] ? a.slice(2).join(' ') : null; try { const opt = { method, headers: { 'Content-Type': 'application/json' } }; if (body) opt.body = body; const t0 = performance.now(); const r = await fetch(path, opt); const ms = Math.round(performance.now() - t0); const txt = await r.text(); let prettyTxt = txt; try { prettyTxt = JSON.stringify(JSON.parse(txt), null, 2); } catch (e) {} return `\x1b[${r.ok ? 32 : 31}m${method} ${path} → HTTP ${r.status}\x1b[0m (${ms}ms)\n${prettyTxt.slice(0, 2200)}`; } catch (e) { return `\x1b[31mapi lỗi:\x1b[0m ${e.message}\nBackend C++ chưa chạy? Xem menu \x1b[33mBackend → Hướng dẫn chạy server C++\x1b[0m`; } } },
        ping: { d: 'đo thời gian phản hồi 1 URL', u: 'ping <url> [số lần]', async run(a) { const url = a[0] || '/api/health'; const n = TK.clamp(parseInt(a[1], 10) || 4, 1, 20); const times = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); try { await fetch(url, { cache: 'no-store' }); times.push(performance.now() - t0); } catch (e) { times.push(-1); } } const ok = times.filter(t => t >= 0); return times.map((t, i) => `lần ${i + 1}: ${t < 0 ? '\x1b[31mthất bại\x1b[0m' : t.toFixed(1) + ' ms'}`).join('\n') + `\n${ok.length}/${n} thành công` + (ok.length ? `, trung bình ${(ok.reduce((x, y) => x + y, 0) / ok.length).toFixed(1)} ms` : ''); } },
        sudo: { d: 'chạy lệnh với "quyền admin"', u: 'sudo <lệnh>', async run(a) { if (!a.length) return 'sudo: thiếu lệnh'; return `\x1b[33m[sudo]\x1b[0m ${user()} không cần mật khẩu trong môi trường RUNE 🙂\n` + await execVirtual(a.join(' ')); } },
        save: { d: 'lưu hệ thống file ảo', run() { saveFs(); return 'Đã lưu hệ thống file ảo vào localStorage (' + (JSON.stringify(fs).length / 1024).toFixed(1) + ' KB)'; } },
        export: { d: 'tải nhật ký phiên', run() { TK.download(new Blob([sessionLog.join('\n')], { type: 'text/plain' }), 'xterminal-' + Date.now() + '.txt'); return 'Đã tải nhật ký ' + sessionLog.length + ' dòng'; } },
        reboot: { d: 'khởi động lại terminal', run() { setTimeout(() => location.reload(), 400); return 'Đang khởi động lại terminal…'; } },
        exit: { d: 'thoát terminal', run() { return 'Đây là tab trong RUNE — dùng nút ✕ trên cửa sổ app để đóng. Gõ \x1b[33mclear\x1b[0m nếu chỉ muốn dọn màn hình.'; } },
        sysinfo: { d: 'thông tin hệ thống (backend hoặc trình duyệt)', async run() { return null; } },
        neofetch: { d: 'ảnh ASCII + thông tin', async run() { return null; } }
    };

    /* ============ LỆNH CẦN THÔNG TIN THẬT ============ */
    async function sysInfoText() {
        const nav = navigator;
        const lines = [];
        lines.push(`\x1b[1mRUNE System Info\x1b[0m`);
        lines.push(`Chế độ shell      : ${isBackend() ? '\x1b[32mbackend C++ (lệnh thật trên máy)\x1b[0m' : '\x1b[33mshell ảo trong trình duyệt\x1b[0m'}`);
        lines.push(`Backend /api      : ${backendAlive ? '\x1b[32msống\x1b[0m ' + backendInfo : '\x1b[31mchạy chưa bật\x1b[0m'}`);
        lines.push(`Trình duyệt       : ${nav.userAgent.replace(/Mozilla\/5\.0 \(([^)]*)\).*/, '$1').slice(0, 70)}`);
        lines.push(`Ngôn ngữ / múi giờ: ${nav.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
        lines.push(`Màn hình          : ${screen.width}×${screen.height} (DPR ${window.devicePixelRatio || 1}) · cửa sổ ${window.innerWidth}×${window.innerHeight}`);
        lines.push(`CPU logic / RAM   : ${nav.hardwareConcurrency || '?'} nhân · ${nav.deviceMemory ? nav.deviceMemory + ' GB' : '?'}`);
        lines.push(`Mạng              : ${nav.onLine ? 'trực tuyến' : 'ngoại tuyến'}${nav.connection ? ' · ' + (nav.connection.effectiveType || '') + (nav.connection.downlink ? ' ~' + nav.connection.downlink + ' Mbps' : '') : ''}`);
        lines.push(`Pin               : ${(nav.getBattery ? 'đang hỏi…' : 'trình duyệt không hỗ trợ API pin')}`);
        lines.push(`Bộ nhớ JS         : ${performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MiB đang dùng / giới hạn ' + (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0) + ' MiB' : 'không đọc được'}`);
        lines.push(`localStorage      : ${Object.keys(localStorage).length} khóa · terminal FS ${(JSON.stringify(fs).length / 1024).toFixed(1)} KB`);
        lines.push(`Phiên terminal    : ${cmdCount} lệnh · ${((Date.now() - startedAt) / 1000).toFixed(0)} giây`);
        try { if (nav.getBattery) { const b = await nav.getBattery(); lines[lines.length - 4] = `Pin               : ${Math.round(b.level * 100)}% · ${b.charging ? '\x1b[32mđang sạc\x1b[0m' : 'không sạc'}`; } } catch (e) {}
        if (backendAlive) {
            try {
                const r = await fetch('/api/system');
                if (r.ok) {
                    const j = await r.json();
                    lines.push('');
                    lines.push(`\x1b[1mTừ backend C++ (/api/system):\x1b[0m`);
                    Object.keys(j).slice(0, 20).forEach(k => lines.push(`  ${k.padEnd(18)}: ${typeof j[k] === 'object' ? JSON.stringify(j[k]) : j[k]}`));
                }
            } catch (e) { lines.push(`\x1b[31mKhông gọi được /api/system: ${e.message}\x1b[0m`); }
        }
        return lines.join('\n');
    }
    async function neofetchText() {
        const art = [
            '        ██████╗        ', '        ██╔══██╗       ', '   ████ ██████╔╝ ████  ', '   ╚═══ ██╔══██╗ ═══╝  ',
            '        ██║  ██║       ', '        ██████╔╝       ', '        ╚═════╝        '
        ];
        const info = (await sysInfoText()).split('\n').filter(l => l && !l.startsWith('\x1b[1mRUNE'));
        const right = [`\x1b[1m\x1b[32m${user()}\x1b[0m@\x1b[1m${host()}\x1b[0m`, '─'.repeat(18)].concat(info.slice(0, 9).map(l => l));
        let s = '';
        for (let i = 0; i < Math.max(art.length, right.length); i++) {
            s += `\x1b[32m${(art[i] || ' '.repeat(24))}\x1b[0m  ${right[i] || ''}\n`;
        }
        return s + '\n\x1b[40m\x1b[31m  \x1b[32m  \x1b[33m  \x1b[34m  \x1b[35m  \x1b[36m  \x1b[37m  \x1b[0m';
    }

    /* ============ BACKEND ============ */
    const timeoutMs = () => TK.clamp(parseInt(document.getElementById('optTimeout').value, 10) || 15, 1, 120) * 1000;
    // chỉ gửi lệnh thật khi backend sống VÀ /api/cli được bật
    function isBackend() { return cliEnabled && (mode === 'backend' || (mode === 'auto' && backendAlive)); }
    async function checkBackend(silent) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 2500);
            let r = await fetch('/api/health', { signal: ctrl.signal }).catch(() => null);
            if (!r || !r.ok) r = await fetch('/api/system', { signal: ctrl.signal }).catch(() => null);
            clearTimeout(t);
            if (r && r.ok) {
                backendAlive = true;
                let extra = '';
                try { const j = await r.json(); extra = j.version || j.name || (j.os ? j.os.type || '' : '') || ''; } catch (e) { extra = 'HTTP ' + r.status; }
                backendInfo = extra ? '(' + String(extra).slice(0, 40) + ')' : '';
                // backend có cho chạy lệnh không? (tắt khi server mở ra mạng LAN)
                try {
                    const rc = await fetch('/api/cli/check', { cache: 'no-store' });
                    if (rc.ok) { const jc = await rc.json(); cliEnabled = jc.cli_enabled !== false; }
                    else cliEnabled = rc.status !== 403 && rc.status !== 404;
                } catch (e) { cliEnabled = false; }
            } else { backendAlive = false; backendInfo = ''; cliEnabled = false; }
        } catch (e) { backendAlive = false; }
        const b = document.getElementById('modeBadge');
        if (isBackend()) { b.className = 'badge on'; b.textContent = '● Backend C++ — lệnh thật'; }
        else if (backendAlive) { b.className = 'badge on'; b.textContent = '● Backend sống · /api/cli tắt → shell ảo'; }
        else { b.className = 'badge off'; b.textContent = '○ Shell ảo trong trình duyệt'; }
        document.getElementById('stBackend').textContent = 'backend: ' + (backendAlive ? 'sống ' + backendInfo + ' · cli: ' + (cliEnabled ? 'bật' : 'tắt') : 'tắt') + ' · chế độ: ' + mode;
        document.getElementById('fsMode').textContent = isBackend() ? '(file trên máy thật)' : '(ảo, lưu trong trình duyệt)';
        if (!silent) {
            if (isBackend()) print(`\x1b[32m✔ Backend C++ đang chạy\x1b[0m ${backendInfo} — lệnh sẽ được thực thi thật trên máy qua /api/cli`);
            else if (backendAlive) print(`\x1b[33m● Backend C++ sống\x1b[0m ${backendInfo} nhưng \x1b[31m/api/cli đang tắt\x1b[0m (server chạy ở chế độ mở ra mạng, không phải loopback). Terminal dùng shell ảo. Muốn chạy lệnh thật: khởi động lại server không đặt RUNE_BIND=0.0.0.0, hoặc đặt RUNE_ALLOW_CLI=1.`, 'warn');
            else print(`\x1b[33m○ Backend C++ chưa chạy\x1b[0m — đang dùng shell ảo trong trình duyệt (hệ thống file riêng, vẫn đầy đủ lệnh). Bật server: xem menu Backend → Hướng dẫn.`, 'warn');
        }
        renderTree();
    }
    async function runOnBackend(cmd) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs());
        try {
            const r = await fetch('/api/cli', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd, cwd, timeout: Math.round(timeoutMs() / 1000) }),
                signal: ctrl.signal
            });
            clearTimeout(t);
            const txt = await r.text();
            let j = null;
            try { j = JSON.parse(txt); } catch (e) {}
            if (j) {
                const body = j.output != null ? j.output : (j.error != null ? `\x1b[31m${j.error}\x1b[0m` : txt);
                const code = j.exit_code != null ? j.exit_code : (r.ok ? 0 : r.status);
                return { ok: j.ok !== false && r.ok, out: body + (code ? `\n\x1b[31m[mã thoát: ${code}]\x1b[0m` : ''), code };
            }
            return { ok: r.ok, out: txt + (r.ok ? '' : `\n\x1b[31m[HTTP ${r.status}]\x1b[0m`), code: r.status };
        } catch (e) {
            clearTimeout(t);
            return { ok: false, out: `\x1b[31mKhông gọi được backend:\x1b[0m ${e.name === 'AbortError' ? 'hết thời gian chờ (' + timeoutMs() + 'ms)' : e.message}\n\x1b[33m→ Chuyển sang shell ảo để tiếp tục (menu Backend → Ép dùng shell ảo)\x1b[0m` };
        }
    }

    /* ============ THỰC THI ============ */
    function splitArgs(line) {
        const args = [];
        let cur = '', q = null;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (q) { if (c === q) q = null; else cur += c; }
            else if (c === '"' || c === "'") q = c;
            else if (/\s/.test(c)) { if (cur) { args.push(cur); cur = ''; } }
            else cur += c;
        }
        if (cur) args.push(cur);
        return args;
    }
    async function execVirtual(line) {
        const args = splitArgs(line);
        const name = (args.shift() || '').toLowerCase();
        const c = CMDS[name];
        if (!c) return `\x1b[31mvirtual-sh: không có lệnh "${name}"\x1b[0m — gõ \x1b[33mhelp\x1b[0m để xem danh sách`;
        try {
            const r = c.run(args);
            const v = (r && typeof r.then === 'function') ? await r : r;
            return v == null ? '' : v;
        } catch (e) { return `\x1b[31m${name} lỗi:\x1b[0m ${e.message}`; }
    }
    async function run(line) {
        line = String(line || '').trim();
        if (!line) return;
        printCmd(line);
        sessionLog.push(promptText() + ' ' + line);
        hist.push(line); hIdx = hist.length;
        cmdCount++;
        lastCmd = line;
        const args = splitArgs(line);
        const name = (args[0] || '').toLowerCase();

        // lệnh xử lý riêng (async)
        if (name === 'ai') {
            const q = args.slice(1).join(' ');
            if (!q) { print('ai: thiếu câu hỏi. Ví dụ: ai giải thích lệnh tar -czvf', 'warn'); return finish(); }
            print('\x1b[90mđang hỏi AI…\x1b[0m', 'dim');
            try {
                const a = await TK.ai(`Bạn đang trợ giúp người dùng trong một terminal. Câu hỏi/yêu cầu: "${q}". Trả lời ngắn gọn bằng tiếng Việt, dùng lệnh shell cụ thể trong khối mã khi cần.`, { system: 'Bạn là chuyên gia Linux/CLI, trả lời súc tích.' });
                print(String(a || '(AI không trả lời)'));
                lastOut = String(a || '');
            } catch (e) { print('ai lỗi: ' + RuneAI.humanError(e.message) + ' — vào trang Khóa của RUNE để nhập khóa AI', 'err'); }
            return finish();
        }
        if (name === 'sysinfo') { const t = await sysInfoText(); print(t); lastOut = t; return finish(); }
        if (name === 'neofetch') { const t = await neofetchText(); print(t); lastOut = t; return finish(); }
        if (name === 'open' && !isBackend()) { const t = await execVirtual(line); print(t); lastOut = t; return finish(); }

        let res;
        if (isBackend()) {
            res = await runOnBackend(line);
            if (!res.ok && mode === 'auto' && /Không gọi được backend|HTTP 40[34]|HTTP 501|đang tắt/.test(res.out)) {
                print(res.out, 'warn');
                print('\x1b[33mBackend không chạy được lệnh này — chuyển sang shell ảo trong trình duyệt:\x1b[0m', 'warn');
                res = { ok: true, out: await execVirtual(line) };
            }
        } else {
            res = { ok: true, out: await execVirtual(line) };
        }
        if (res.out) print(res.out, res.ok ? '' : 'err');
        lastOut = String(res.out || '');
        if (/^(cd|clear|theme|font|save|export|reboot)\b/.test(name) || name === 'mkdir' || name === 'rm' || name === 'touch' || name === 'write' || name === 'mv' || name === 'cp') { renderTree(); saveFs(); }
        finish();
    }
    function finish() {
        updatePrompt();
        document.getElementById('stCmds').textContent = cmdCount + ' lệnh';
        cmdInput.value = '';
        cmdInput.focus();
        out.scrollTop = out.scrollHeight;
    }

    /* ============ CÂY THƯ MỤC & PANEL ============ */
    function renderTree() {
        const box = document.getElementById('tree');
        const n = resolve(cwd) || fs;
        box.innerHTML = '';
        const head = document.createElement('span');
        head.innerHTML = `<b style="color:#0aff9c;">${esc(pretty(cwd))}/</b>`;
        head.addEventListener('click', () => { cwd = '/home/' + user(); updatePrompt(); renderTree(); });
        box.appendChild(head);
        const keys = Object.keys(n.children || {}).sort();
        if (!keys.length) { const d = document.createElement('span'); d.textContent = '  (trống)'; d.style.color = '#4d6b5c'; box.appendChild(d); }
        keys.forEach(k => {
            const c = n.children[k];
            const s = document.createElement('span');
            s.textContent = '  ' + (c.type === 'dir' ? '📁 ' : '📄 ') + k + (c.type === 'file' ? ` (${new Blob([c.content]).size}B)` : '');
            s.style.color = c.type === 'dir' ? '#7fb2ff' : '#9fd8bd';
            s.addEventListener('click', () => {
                if (c.type === 'dir') { cwd = normPath(cwd + '/' + k); updatePrompt(); renderTree(); printCmd('cd ' + k); hist.push('cd ' + k); cmdCount++; }
                else { printCmd('cat ' + k); hist.push('cat ' + k); cmdCount++; print(c.content.replace(/\n$/, '')); }
                finish();
            });
            box.appendChild(s);
        });
        if (isBackend()) box.insertAdjacentHTML('beforeend', `<span style="color:#4d6b5c;font-size:11px;">(Backend đang bật: cây này là bản ảo; lệnh ls/cat thật chạy trên máy bạn)</span>`);
    }
    function renderCmdList() {
        const box = document.getElementById('cmdList');
        box.innerHTML = '';
        Object.keys(CMDS).sort().forEach(k => {
            const b = document.createElement('button');
            b.textContent = k;
            b.title = CMDS[k].d;
            b.addEventListener('click', () => { cmdInput.value = k + ' '; cmdInput.focus(); });
            box.appendChild(b);
        });
    }
    async function renderSysBox() {
        const box = document.getElementById('sysBox');
        const nav = navigator;
        box.innerHTML = `<b>Shell</b>: ${isBackend() ? 'C++ backend' : 'virtual'}<br><b>Nền tảng</b>: ${esc((nav.platform || 'n/a'))}<br><b>Màn hình</b>: ${screen.width}×${screen.height}<br><b>CPU logic</b>: ${nav.hardwareConcurrency || '?'}<br><b>Mạng</b>: ${nav.onLine ? 'online' : 'offline'}<br><b>Backend</b>: ${backendAlive ? '<span style="color:#0aff9c">sống</span>' : '<span style="color:#ffb020">tắt</span>'}`;
    }

    /* ============ CẤU HÌNH ============ */
    function saveCfg() {
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify({ user: user(), host: host(), mode, timeout: document.getElementById('optTimeout').value, theme: document.body.className, font: out.style.fontSize || '' }));
        } catch (e) {}
    }
    function loadCfg() {
        try {
            const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
            if (c.user) document.getElementById('optUser').value = c.user;
            if (c.host) document.getElementById('optHost').value = c.host;
            if (c.mode) { mode = c.mode; document.getElementById('optMode').value = c.mode; }
            if (c.timeout) document.getElementById('optTimeout').value = c.timeout;
            if (c.theme) document.body.className = c.theme;
            if (c.font) { out.style.fontSize = c.font; cmdInput.style.fontSize = c.font; }
        } catch (e) {}
    }

    /* ============ ACTIONS ============ */
    TK.init({ app: 'xterm', status: '.statusbar [data-status-text]' });
    const A = {
        run(e, elm) { const c = elm.dataset.arg; cmdInput.value = ''; run(c); },
        runText(t) { run(t); },
        clearScreen() { out.innerHTML = ''; TK.status('Đã xóa màn hình'); },
        exportLog() { TK.download(new Blob([sessionLog.join('\n')], { type: 'text/plain' }), 'xterminal-phien-' + Date.now() + '.txt'); },
        saveSession() {
            try { localStorage.setItem('rune.term.session.v1', JSON.stringify(hist.slice(-200))); TK.toast('Đã lưu ' + Math.min(hist.length, 200) + ' lệnh', 'ok'); }
            catch (e) { TK.toast('Không lưu được: ' + e.message, 'error'); }
        },
        loadSession() {
            try {
                const h = JSON.parse(localStorage.getItem('rune.term.session.v1') || '[]');
                if (!h.length) return TK.toast('Chưa có phiên nào được lưu', 'error');
                hist = h; hIdx = hist.length;
                print('\x1b[32mĐã nạp lại ' + h.length + ' lệnh của phiên trước:\x1b[0m\n' + h.slice(-20).map((x, i) => `  ${i + 1}. ${x}`).join('\n'));
            } catch (e) { TK.toast('Phiên lưu bị lỗi', 'error'); }
        },
        async resetFs() {
            if (!(await TK.confirm('Khôi phục file ảo', 'Xóa toàn bộ hệ thống file ảo và tạo lại mặc định?'))) return;
            fs = defaultFs(); saveFs(); renderTree();
            TK.toast('Đã khôi phục hệ thống file ảo', 'ok');
        },
        bigFont() { A.run(null, { dataset: { arg: 'font' } }); },
        theme(e, elm) { A.run(null, { dataset: { arg: 'theme ' + elm.dataset.arg.replace('th-', '') } }); },
        checkBackend() { checkBackend(false); renderSysBox(); },
        forceVirtual() { mode = 'virtual'; document.getElementById('optMode').value = 'virtual'; saveCfg(); checkBackend(true); print('\x1b[33mĐã ép dùng shell ảo trong trình duyệt.\x1b[0m Mọi lệnh chạy trên hệ thống file ảo (không chạm vào máy thật).'); },
        forceBackend() {
            mode = 'backend'; document.getElementById('optMode').value = 'backend'; saveCfg();
            checkBackend(true);
            if (isBackend()) print('\x1b[32mĐã ép dùng backend C++ — lệnh sẽ chạy thật trên máy qua /api/cli.\x1b[0m');
            else if (backendAlive) print('\x1b[33mBackend C++ sống nhưng /api/cli đang tắt\x1b[0m nên không gửi lệnh được. Bật bằng cách chạy server ở loopback (mặc định) hoặc đặt RUNE_ALLOW_CLI=1.', 'warn');
            else print('\x1b[31mĐã chọn backend C++ nhưng /api/health không phản hồi.\x1b[0m Hãy chạy server (xem menu Backend → Hướng dẫn) rồi bấm "Kiểm tra backend".', 'err');
        },
        showBuild() {
            print(`\x1b[1mCách bật backend C++ để terminal chạy lệnh thật:\x1b[0m
  1) Biên dịch:  \x1b[33m./build.sh\x1b[0m   (hoặc \x1b[33mcmake -B build && cmake --build build\x1b[0m)
  2) Chạy server: \x1b[33m./build/xkiro_server\x1b[0m  → lắng nghe cổng 8080
  3) Mở RUNE qua  \x1b[33mhttp://localhost:8080\x1b[0m (server tự phục vụ thư mục public/)
  4) Vào đây bấm \x1b[33mBackend → Kiểm tra backend C++\x1b[0m

Khi backend sống, mọi lệnh bạn gõ được gửi tới \x1b[32mPOST /api/cli\x1b[0m và thực thi thật
bằng máy chủ C++ (popen), kết quả trả về kèm mã thoát.
Nếu bạn đang xem qua server tĩnh (python -m http.server) thì \x1b[33m/api/cli\x1b[0m không tồn tại
→ terminal tự dùng shell ảo để bạn vẫn làm việc được.`);
        },
        async aiCmd() {
            const q = await TK.prompt('✨ AI gợi ý lệnh', 'Bạn muốn làm gì? AI sẽ trả về lệnh shell tương ứng.', 'tìm tất cả file .js lớn hơn 100KB trong thư mục hiện tại');
            if (!q) return;
            TK.status('AI đang nghĩ lệnh…');
            try {
                const out2 = await TK.ai(`Người dùng muốn: "${q}".\nMôi trường: ${isBackend() ? 'shell thật trên máy (Linux/Windows/macOS tùy máy người dùng)' : 'shell ảo trong trình duyệt của RUNE với các lệnh: ' + Object.keys(CMDS).join(', ')}.\nTrả lời theo đúng mẫu:\nLENH: <một dòng lệnh duy nhất>\nGIAITHICH: <giải thích ngắn 1-2 câu tiếng Việt>`, { system: 'Bạn là chuyên gia CLI. Trả lời đúng mẫu, không thêm gì khác.' });
                const m = /LENH:\s*(.+)/i.exec(String(out2 || ''));
                const ex = /GIAITHICH:\s*([\s\S]+)/i.exec(String(out2 || ''));
                if (!m) { print('AI trả lời không theo mẫu:\n' + String(out2 || '').slice(0, 600), 'warn'); return; }
                const cmd = m[1].trim();
                print(`\x1b[32mAI gợi ý:\x1b[0m ${esc(cmd)}\n${ex ? esc(ex[1].trim()) : ''}`);
                const ok = await TK.modal({ title: 'Chạy lệnh AI gợi ý?', message: cmd, ok: 'Chạy ngay', cancel: 'Chỉ chép vào ô nhập' });
                if (ok !== null) run(cmd);
                else { cmdInput.value = cmd; cmdInput.focus(); }
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        },
        async aiExplain() {
            if (!lastCmd) return TK.toast('Chưa chạy lệnh nào', 'error');
            TK.status('AI đang giải thích…');
            try {
                const t = await TK.ai(`Giải thích lệnh shell sau bằng tiếng Việt cho người mới: từng thành phần có ý nghĩa gì, và cảnh báo rủi ro nếu có.\nLệnh: ${lastCmd}\nKết quả đã nhận:\n${String(lastOut).slice(0, 900)}`, { system: 'Bạn là chuyên gia CLI, giải thích ngắn gọn.' });
                print('\x1b[32m✨ AI giải thích lệnh "' + esc(lastCmd) + '":\x1b[0m\n' + String(t || ''));
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        },
        async aiFix() {
            if (!lastOut) return TK.toast('Chưa có output nào', 'error');
            TK.status('AI đang phân tích lỗi…');
            try {
                const t = await TK.ai(`Lệnh: ${lastCmd}\nOutput:\n${String(lastOut).slice(0, 1400)}\n\nHãy chẩn đoán vấn đề (nếu có) và đưa ra lệnh sửa cụ thể. Trả lời tiếng Việt, ngắn gọn.`, { system: 'Bạn là kỹ sư hệ thống.' });
                print('\x1b[32m✨ AI chẩn đoán:\x1b[0m\n' + String(t || ''));
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        }
    };
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    /* ============ Ô NHẬP LỆNH ============ */
    cmdInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); const v = cmdInput.value; cmdInput.value = ''; run(v); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); if (hIdx > 0) { hIdx--; cmdInput.value = hist[hIdx] || ''; } return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); if (hIdx < hist.length - 1) { hIdx++; cmdInput.value = hist[hIdx] || ''; } else { hIdx = hist.length; cmdInput.value = ''; } return; }
        if (e.key === 'Tab') {
            e.preventDefault();
            const v = cmdInput.value;
            const parts = v.split(/(\s+)/);
            const lastTok = parts[parts.length - 1] || '';
            if (v.trim().indexOf(' ') === -1 && !lastTok.includes('/')) {
                const m = Object.keys(CMDS).filter(c => c.startsWith(lastTok.toLowerCase()));
                if (m.length === 1) cmdInput.value = m[0] + ' ';
                else if (m.length) print('\x1b[90m' + m.join('  ') + '\x1b[0m', 'dim');
                return;
            }
            // hoàn thành đường dẫn
            const base = lastTok.slice(0, lastTok.lastIndexOf('/') + 1);
            const frag = lastTok.slice(lastTok.lastIndexOf('/') + 1).toLowerCase();
            const dirNode = resolve(base || cwd);
            if (!dirNode || dirNode.type !== 'dir') return;
            const opts = Object.keys(dirNode.children).filter(k => k.toLowerCase().startsWith(frag));
            if (opts.length === 1) {
                parts[parts.length - 1] = base + opts[0] + (dirNode.children[opts[0]].type === 'dir' ? '/' : '');
                cmdInput.value = parts.join('');
            } else if (opts.length) print('\x1b[90m' + opts.join('  ') + '\x1b[0m', 'dim');
            return;
        }
        if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); A.clearScreen(); return; }
        if (e.key === 'c' && e.ctrlKey) { printCmd(cmdInput.value + '^C'); cmdInput.value = ''; return; }
        if (e.key === 'r' && e.ctrlKey) {
            e.preventDefault();
            const q = cmdInput.value.trim();
            if (!q) return;
            const m = hist.slice().reverse().filter(h => h.includes(q));
            if (m.length) { cmdInput.value = m[0]; print('\x1b[90m' + m.slice(0, 8).join('\n') + '\x1b[0m', 'dim'); }
            else print('\x1b[90m(không tìm thấy lệnh nào chứa "' + esc(q) + '")\x1b[0m', 'dim');
            return;
        }
    });
    out.addEventListener('click', () => cmdInput.focus());
    ['optUser', 'optHost', 'optMode', 'optTimeout'].forEach(id => document.getElementById(id).addEventListener('change', e => {
        if (id === 'optMode') { mode = e.target.value; checkBackend(true); }
        saveCfg(); updatePrompt(); renderTree(); renderSysBox();
    }));

    /* ============ lệnh từ trang cha / AI ============ */
    TK.cmd('get_info', () => ({ app: 'xTerminal', mode: isBackend() ? 'backend-cpp' : 'virtual', backendAlive, cwd, commands: cmdCount, user: user(), host: host() }));
    TK.cmd('run', async a => {
        const c = String(a.command || a.cmd || '');
        if (!c) return { ok: false, error: 'thiếu command' };
        await run(c);
        return { command: c, output: lastOut.slice(0, 4000) };
    });
    TK.cmd('run_silent', async a => {
        // chạy trong shell ảo, không in ra màn hình — dùng cho AI muốn đọc kết quả
        const c = String(a.command || a.cmd || '');
        const name = c.split(/\s+/)[0].toLowerCase();
        if (isBackend()) { const r = await runOnBackend(c); return { output: String(r.out).slice(0, 4000), ok: r.ok }; }
        if (['ai', 'sysinfo', 'neofetch'].includes(name)) return { output: name === 'sysinfo' ? await sysInfoText() : name === 'neofetch' ? await neofetchText() : '(lệnh ai cần tương tác)', ok: true };
        const r = await execVirtual(c);
        return { output: String(r).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 4000), ok: true };
    });
    TK.cmd('list_commands', () => Object.keys(CMDS).map(k => ({ name: k, desc: CMDS[k].d })));
    TK.cmd('read_file', a => { const n = resolve(String(a.path || '')); return n && n.type === 'file' ? { content: n.content.slice(0, 20000) } : { ok: false, error: 'không có file ' + a.path }; });
    TK.cmd('write_file', a => { const p = String(a.path || ''); if (!p) return { ok: false, error: 'thiếu path' }; const n = resolve(p); if (n && n.type === 'file') { n.content = String(a.content || ''); } else { const { par, name } = parentDir(p); if (!par) return { ok: false, error: 'không có thư mục cha' }; par.children[name] = file(String(a.content || '')); } saveFs(); renderTree(); return { ok: true, path: normPath(p) }; });
    TK.cmd('ls', a => { const n = resolve(String(a.path || cwd)); if (!n) return { ok: false, error: 'không có đường dẫn' }; return n.type === 'dir' ? { path: normPath(a.path || cwd), entries: Object.keys(n.children).map(k => ({ name: k, type: n.children[k].type, size: n.children[k].type === 'file' ? n.children[k].content.length : null })) } : { path: normPath(a.path || cwd), type: 'file' }; });
    TK.cmd('clear', () => { A.clearScreen(); return { ok: true }; });
    TK.cmd('set_mode', a => { const m = ['auto', 'virtual', 'backend'].includes(a.mode) ? a.mode : 'auto'; mode = m; document.getElementById('optMode').value = m; saveCfg(); checkBackend(true); return { mode, backendAlive }; });
    TK.cmd('check_backend', async () => { await checkBackend(true); return { backendAlive, mode }; });

    /* ============ KHỞI ĐỘNG ============ */
    loadCfg();
    fs = loadFs();
    updatePrompt();
    renderTree();
    renderCmdList();
    (async function boot() {
        print('\x1b[1m\x1b[32mRUNE xTerminal 2.0\x1b[0m — shell chạy trong Local Control Center');
        print('Gõ \x1b[33mhelp\x1b[0m để xem ' + Object.keys(CMDS).length + ' lệnh · \x1b[33mneofetch\x1b[0m cho đẹp · \x1b[33mai <câu hỏi>\x1b[0m để hỏi AI thật', 'dim');
        print('', '');
        await checkBackend(true);
        const b = document.getElementById('modeBadge');
        print(isBackend()
            ? `\x1b[32m✔ Đã nối backend C++\x1b[0m ${backendInfo} — lệnh gửi tới POST /api/cli và chạy thật trên máy.`
            : (backendAlive
                ? `\x1b[33m● Backend C++ sống\x1b[0m ${backendInfo} nhưng \x1b[31m/api/cli đang tắt\x1b[0m → dùng \x1b[1mshell ảo\x1b[0m (${Object.keys(CMDS).length} lệnh chạy thật trong môi trường ảo). Vẫn gọi được \x1b[32mapi /api/system\x1b[0m để lấy số liệu thật của máy.`
                : `\x1b[33m○ Backend C++ chưa chạy\x1b[0m → đang dùng \x1b[1mshell ảo\x1b[0m: hệ thống file riêng lưu trong trình duyệt, ${Object.keys(CMDS).length} lệnh hoạt động thật (ls, cd, cat, mkdir, rm, grep, tree, write…), cộng thêm \x1b[32mfetch\x1b[0m/\x1b[32mapi\x1b[0m gọi mạng thật và \x1b[32mopen\x1b[0m mở app RUNE thật.`));
        print('Muốn lệnh chạy trên máy thật? Mở menu \x1b[33mBackend → Hướng dẫn chạy server C++\x1b[0m.', 'dim');
        renderSysBox();
        finish();
    })();
    window.addEventListener('resize', () => { out.scrollTop = out.scrollHeight; });
})();
