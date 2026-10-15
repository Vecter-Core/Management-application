/* ============================================================
   xCalc — máy tính khoa học THẬT (parser riêng, không dùng eval),
   vẽ đồ thị hàm số, tích phân/đạo hàm/nghiệm, đổi đơn vị,
   hệ đếm & bit, công cụ số học, ngày tháng, bấm giờ, AI giải toán
   ============================================================ */
(function () {
    'use strict';

    /* ================== PARSER BIỂU THỨC ================== */
    let ANGLE = 'DEG';   // DEG | RAD
    const CONST = { pi: Math.PI, π: Math.PI, e: Math.E, phi: 1.6180339887498949, tau: Math.PI * 2 };

    function fact(n) {
        if (n < 0 || n !== Math.floor(n)) { // gamma gần đúng cho số không nguyên
            return gamma(n + 1);
        }
        if (n > 170) return Infinity;
        let r = 1; for (let i = 2; i <= n; i++) r *= i;
        return r;
    }
    function gamma(z) {
        const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
            -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
        z -= 1; let x = c[0];
        for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
        const t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }
    const toRad = x => ANGLE === 'DEG' ? x * Math.PI / 180 : x;
    const fromRad = x => ANGLE === 'DEG' ? x * 180 / Math.PI : x;

    const FUNCS = {
        sin: x => Math.sin(toRad(x)), cos: x => Math.cos(toRad(x)), tan: x => Math.tan(toRad(x)),
        asin: x => fromRad(Math.asin(x)), acos: x => fromRad(Math.acos(x)), atan: x => fromRad(Math.atan(x)),
        sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
        ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp, sqrt: Math.sqrt, cbrt: Math.cbrt,
        abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
        fact, gamma, deg: x => x * 180 / Math.PI, rad: x => x * Math.PI / 180,
        sec: x => 1 / Math.cos(toRad(x)), csc: x => 1 / Math.sin(toRad(x)), cot: x => 1 / Math.tan(toRad(x)),
        pow: (a, b) => Math.pow(a, b), min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
        atan2: (a, b) => fromRad(Math.atan2(a, b)), nrt: (n, x) => Math.pow(x, 1 / n), mod: (a, b) => a % b
    };

    function tokenize(s) {
        const t = [];
        let i = 0;
        s = String(s).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').replace(/\s+/g, '');
        while (i < s.length) {
            const c = s[i];
            if (/[0-9.]/.test(c)) {
                let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
                if (s[j] === 'e' || s[j] === 'E') { let k = j + 1; if (/[+-]/.test(s[k])) k++; if (/[0-9]/.test(s[k])) { while (k < s.length && /[0-9]/.test(s[k])) k++; j = k; } }
                const num = parseFloat(s.slice(i, j));
                if (isNaN(num)) throw new Error('Số không hợp lệ: "' + s.slice(i, j) + '"');
                t.push({ k: 'num', v: num }); i = j; continue;
            }
            if (/[a-zA-Zπφ_]/.test(c)) {
                let j = i; while (j < s.length && /[a-zA-Z0-9πφ_]/.test(s[j])) j++;
                t.push({ k: 'id', v: s.slice(i, j) }); i = j; continue;
            }
            if ('+-*/^%!()|'.includes(c)) { t.push({ k: c }); i++; continue; }
            throw new Error('Ký tự lạ: "' + c + '"');
        }
        return t;
    }
    function compile(src) {
        const tokens = tokenize(src);
        let p = 0;
        const peek = () => tokens[p];
        const next = () => tokens[p++];
        function parseExpr() {
            let node = parseTerm();
            while (peek() && (peek().k === '+' || peek().k === '-')) {
                const op = next().k, r = parseTerm();
                const l = node; node = { op, l, r };
            }
            return node;
        }
        function parseTerm() {
            let node = parseUnary();
            for (;;) {
                const t = peek();
                if (!t) break;
                if (t.k === '*' || t.k === '/' || t.k === '%') { next(); const l = node, r = parseUnary(), op = t.k; node = { op, l, r }; continue; }
                if (t.k === 'num' || t.k === 'id' || t.k === '(') { const l = node, r = parseUnary(); node = { op: '*', l, r }; continue; }
                break;
            }
            return node;
        }
        function parseUnary() {
            const t = peek();
            if (t && (t.k === '-' || t.k === '+')) { next(); const n = parseUnary(); return t.k === '-' ? { neg: n } : n; }
            return parsePower();
        }
        function parsePower() {
            const base = parsePostfix();
            if (peek() && peek().k === '^') { next(); const r = parseUnary(); return { op: '^', l: base, r }; }
            return base;
        }
        function parsePostfix() {
            let n = parsePrimary();
            while (peek() && peek().k === '!') { next(); n = { fact: n }; }
            return n;
        }
        function parsePrimary() {
            const t = next();
            if (!t) throw new Error('Biểu thức bị cắt ngang (thiếu toán hạng)');
            if (t.k === 'num') return { num: t.v };
            if (t.k === '(') { const n = parseExpr(); expect(')'); return n; }
            if (t.k === '|') { const n = parseExpr(); expect('|'); return { fn: 'abs', args: [n] }; }
            if (t.k === 'id') {
                const name = t.v;
                if (peek() && peek().k === '(') {
                    next();
                    const args = [];
                    if (peek() && peek().k === ')') next();
                    else {
                        args.push(parseExpr());
                        while (peek() && peek().k === ',') { next(); args.push(parseExpr()); }
                        expect(')');
                    }
                    const low = name.toLowerCase();
                    if (!FUNCS[low]) throw new Error('Không biết hàm "' + name + '()"');
                    return { fn: low, args };
                }
                return { varName: name };
            }
            throw new Error('Ký hiệu không hợp lệ: "' + t.k + '"');
        }
        function expect(k) {
            const t = next();
            if (!t || t.k !== k) throw new Error(k === ')' ? 'Thiếu dấu đóng ngoặc ")"' : 'Thiếu ký hiệu "' + k + '"');
        }
        const ast = parseExpr();
        if (p < tokens.length) throw new Error('Thừa ký hiệu ở cuối: "' + (tokens[p].v || tokens[p].k) + '"');
        return vars => evalNode(ast, vars || {});
    }
    function evalNode(n, vars) {
        if (n.num !== undefined) return n.num;
        if (n.varName !== undefined) {
            const k = n.varName;
            if (vars[k] !== undefined) return vars[k];
            const low = k.toLowerCase();
            if (CONST[low] !== undefined) return CONST[low];
            if (vars[low] !== undefined) return vars[low];
            if (k === 'x') throw new Error('Chưa có giá trị cho biến x');
            throw new Error('Không biết biến "' + k + '"');
        }
        if (n.neg) return -evalNode(n.neg, vars);
        if (n.fact) return fact(evalNode(n.fact, vars));
        if (n.fn) {
            const a = n.args.map(x => evalNode(x, vars));
            const r = FUNCS[n.fn].apply(null, a);
            return r;
        }
        const l = evalNode(n.l, vars), r = evalNode(n.r, vars);
        switch (n.op) {
            case '+': return l + r;
            case '-': return l - r;
            case '*': return l * r;
            case '/': if (r === 0) throw new Error('Chia cho 0'); return l / r;
            case '%': if (r === 0) throw new Error('Chia lấy dư cho 0'); return l % r;
            case '^': {
                const v = Math.pow(l, r);
                if (isNaN(v) && l < 0 && Math.abs(r) < 1) throw new Error('Căn bậc chẵn của số âm (kết quả phức)');
                return v;
            }
        }
        throw new Error('Toán tử lạ');
    }
    function calc(src, vars) {
        const f = compile(src);
        const v = f(vars);
        if (typeof v !== 'number' || isNaN(v)) throw new Error('Kết quả không xác định (NaN)');
        return v;
    }
    function fmtNum(v) {
        if (!isFinite(v)) return v > 0 ? '∞' : (isNaN(v) ? 'NaN' : '-∞');
        if (v === 0) return '0';
        const a = Math.abs(v);
        if (a >= 1e15 || a < 1e-9) return v.toExponential(9).replace(/e([+-])(\d)$/, 'e$10$2');
        let s = parseFloat(v.toPrecision(13)).toString();
        if (s.indexOf('.') > -1 && s.length > 18) s = parseFloat(v.toPrecision(12)).toString();
        return s;
    }
    function fmtGroup(v) {
        const s = fmtNum(v);
        const [i, d] = s.split('.');
        return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? '.' + d : '');
    }

    /* ================== TRẠNG THÁI ================== */
    const S = { expr: '', result: '0', ans: 0, mem: 0, second: false, history: [], bigFont: false };

    const KEYS = [
        [{ l: '2nd', a: 'second', c: 'fn' }, { l: 'DEG', a: 'toggleAngle', c: 'fn' }, { l: '(', i: '(' }, { l: ')', i: ')' }, { l: '⌫', a: 'back', c: 'danger' }, { l: 'C', a: 'clearAll', c: 'danger' }],
        [{ l: 'sin', i: 'sin(', a2: 'sinh', i2: 'sinh(', c: 'fn' }, { l: 'cos', i: 'cos(', a2: 'cosh', i2: 'cosh(', c: 'fn' }, { l: 'tan', i: 'tan(', a2: 'tanh', i2: 'tanh(', c: 'fn' }, { l: 'x²', p: '^2' }, { l: '√', i: 'sqrt(', a2: 'nrt(', l2: 'n√', c: 'fn' }, { l: '÷', i: '/', c: 'op' }],
        [{ l: 'asin', i: 'asin(', c: 'fn' }, { l: 'acos', i: 'acos(', c: 'fn' }, { l: 'atan', i: 'atan(', c: 'fn' }, { l: 'x³', p: '^3' }, { l: '∛', i: 'cbrt(', c: 'fn' }, { l: '×', i: '*', c: 'op' }],
        [{ l: 'ln', i: 'ln(', c: 'fn' }, { l: 'log', i: 'log(', c: 'fn' }, { l: 'eˣ', i: 'exp(', c: 'fn' }, { l: '10ˣ', pre: '10^' }, { l: '1/x', wrap: v => '1/(' + v + ')' }, { l: '−', i: '-', c: 'op' }],
        [{ l: '7', i: '7' }, { l: '8', i: '8' }, { l: '9', i: '9' }, { l: '%', p: '/100' }, { l: 'n!', p: '!' }, { l: '+', i: '+', c: 'op' }],
        [{ l: '4', i: '4' }, { l: '5', i: '5' }, { l: '6', i: '6' }, { l: 'xʸ', i: '^', c: 'op' }, { l: 'π', i: 'pi' }, { l: '=', a: 'equals', c: 'eq', span: 2 }],
        [{ l: '1', i: '1' }, { l: '2', i: '2' }, { l: '3', i: '3' }, { l: 'ANS', a: 'ansInsert', c: 'fn' }, { l: 'e', i: 'e' }],
        [{ l: '±', a: 'negate' }, { l: '0', i: '0' }, { l: '.', i: '.' }, { l: ',', i: ',' }, { l: 'M+', a: 'mplus' }, { l: 'MR', a: 'mr' }]
    ];

    function renderKeys() {
        const box = document.getElementById('keys');
        box.innerHTML = '';
        KEYS.forEach(row => row.forEach(k => {
            const b = document.createElement('button');
            const use2 = S.second && k.i2;
            b.textContent = use2 ? k.l2 || k.a2 : k.l;
            b.className = k.c || '';
            if (k.span) b.style.gridRow = 'span ' + k.span;
            b.addEventListener('click', () => {
                if (k.a) return A[k.a]();
                if (use2) return ins(k.i2);
                if (k.i) return ins(k.i);
                if (k.p) return ins(k.p, true);
                if (k.pre) { S.expr = k.pre + '(' + S.expr + ')'; refresh(); return equals(); }
                if (k.wrap) { S.expr = k.wrap(S.expr); refresh(); return equals(); }
            });
            box.appendChild(b);
        }));
    }
    function ins(t, suffix) {
        if (S.expr === 'Lỗi' || document.getElementById('result').classList.contains('err')) S.expr = '';
        S.expr += t;
        if (!suffix) preview();
        refresh();
    }
    function refresh() {
        document.getElementById('expr').innerHTML = esc(S.expr) || '&nbsp;';
        document.getElementById('result').textContent = S.result;
        document.getElementById('stLast').textContent = S.history.length ? S.history[0].e + ' = ' + S.history[0].r : '—';
    }
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function preview() {
        if (!S.expr) { S.result = '0'; return; }
        try {
            const v = calc(S.expr, { ans: S.ans, m: S.mem, x: 0 });
            S.result = fmtGroup(v);
            document.getElementById('result').classList.remove('err');
        } catch (e) { /* giữ kết quả cũ khi đang gõ dở */ }
    }
    function equals() {
        if (!S.expr.trim()) return;
        try {
            const v = calc(S.expr, { ans: S.ans, m: S.mem, x: 0 });
            S.ans = v;
            S.result = fmtGroup(v);
            document.getElementById('result').classList.remove('err');
            S.history.unshift({ e: S.expr, r: fmtNum(v), v });
            if (S.history.length > 60) S.history.pop();
            renderHist();
            TK.status(S.expr + ' = ' + fmtNum(v));
            S.expr = fmtNum(v);
            refresh();
        } catch (e) {
            S.result = e.message;
            document.getElementById('result').classList.add('err');
            refresh();
            TK.toast('Không tính được: ' + e.message, 'error');
        }
    }
    function renderHist() {
        const box = document.getElementById('hist');
        if (!S.history.length) { box.innerHTML = '<div style="color:#666;">Chưa có phép tính nào</div>'; return; }
        box.innerHTML = '';
        S.history.forEach(h => {
            const d = document.createElement('div');
            d.innerHTML = esc(h.e) + ' = <b>' + esc(h.r) + '</b>';
            d.addEventListener('click', () => { S.expr = h.r; preview(); refresh(); TK.status('Đã lấy lại kết quả ' + h.r); });
            box.appendChild(d);
        });
    }

    /* ================== ĐỒ THỊ ================== */
    const plot = document.getElementById('plot');
    const pctx = plot.getContext('2d');
    const view = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
    const COLORS = ['#f472b6', '#38bdf8', '#34d399'];
    let plotFns = [];
    let hover = null;

    function sizePlot() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        plot.width = Math.round(plot.clientWidth * dpr);
        plot.height = Math.round(430 * dpr);
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function compilePlot() {
        plotFns = ['f1', 'f2', 'f3'].map((id, i) => {
            const src = document.getElementById(id).value.trim();
            if (!src) return null;
            try { const f = compile(src); f({ x: 0.5 }); return { src, f, color: COLORS[i] }; }
            catch (e) { TK.toast('Hàm ' + id + ' lỗi: ' + e.message, 'error'); return null; }
        }).filter(Boolean);
    }
    function tryF(fn, x) { try { const v = fn.f({ x }); return isFinite(v) ? v : NaN; } catch (e) { return NaN; } }
    function sx(x) { return (x - view.xmin) / (view.xmax - view.xmin) * plot.clientWidth; }
    function sy(y) { return plot.clientHeight - (y - view.ymin) / (view.ymax - view.ymin) * plot.clientHeight; }
    function ix(px) { return view.xmin + px / plot.clientWidth * (view.xmax - view.xmin); }
    function iy(py) { return view.ymin + (plot.clientHeight - py) / plot.clientHeight * (view.ymax - view.ymin); }
    function drawPlot() {
        sizePlot();
        const W = plot.clientWidth, H = plot.clientHeight;
        pctx.clearRect(0, 0, W, H);
        pctx.fillStyle = '#0f0f15'; pctx.fillRect(0, 0, W, H);
        // lưới
        const stepX = niceStep((view.xmax - view.xmin) / 10), stepY = niceStep((view.ymax - view.ymin) / 8);
        pctx.strokeStyle = 'rgba(255,255,255,.07)'; pctx.lineWidth = 1;
        pctx.font = '10px Consolas, monospace'; pctx.fillStyle = '#7a7a90';
        for (let x = Math.ceil(view.xmin / stepX) * stepX; x <= view.xmax; x += stepX) {
            const px = sx(x);
            pctx.beginPath(); pctx.moveTo(px, 0); pctx.lineTo(px, H); pctx.stroke();
            if (Math.abs(x) > stepX / 2) pctx.fillText(shortNum(x), px + 2, H - 4);
        }
        for (let y = Math.ceil(view.ymin / stepY) * stepY; y <= view.ymax; y += stepY) {
            const py = sy(y);
            pctx.beginPath(); pctx.moveTo(0, py); pctx.lineTo(W, py); pctx.stroke();
            if (Math.abs(y) > stepY / 2) pctx.fillText(shortNum(y), 3, py - 3);
        }
        // trục
        pctx.strokeStyle = 'rgba(255,255,255,.45)'; pctx.lineWidth = 1.4;
        if (view.ymin < 0 && view.ymax > 0) { pctx.beginPath(); pctx.moveTo(0, sy(0)); pctx.lineTo(W, sy(0)); pctx.stroke(); }
        if (view.xmin < 0 && view.xmax > 0) { pctx.beginPath(); pctx.moveTo(sx(0), 0); pctx.lineTo(sx(0), H); pctx.stroke(); }
        // hàm
        plotFns.forEach((fn, k) => {
            pctx.strokeStyle = fn.color; pctx.lineWidth = 2;
            pctx.beginPath();
            let started = false, prevY = null;
            const N = Math.max(200, W * 2);
            for (let i = 0; i <= N; i++) {
                const x = view.xmin + (view.xmax - view.xmin) * i / N;
                let y;
                try { y = fn.f({ x }); } catch (e) { y = NaN; }
                if (!isFinite(y)) { started = false; prevY = null; continue; }
                const py = sy(y), px = sx(x);
                if (prevY !== null && Math.abs(py - prevY) > H * 1.4) { started = false; }
                if (!started) { pctx.moveTo(px, py); started = true; } else pctx.lineTo(px, py);
                prevY = py;
            }
            pctx.stroke();
            pctx.fillStyle = fn.color; pctx.font = '11px Segoe UI';
            pctx.fillText('f' + (k + 1) + ' = ' + fn.src.slice(0, 30), 8, 16 + k * 15);
        });
        if (!plotFns.length) {
            pctx.fillStyle = '#7a7a90'; pctx.font = '13px Segoe UI';
            pctx.fillText('Nhập hàm số (ví dụ sin(x)*x, x^2-4, exp(-x^2)) rồi bấm 📈 Vẽ', 20, H / 2);
        }
        // con trỏ
        if (hover) {
            const x = ix(hover.px), y = iy(hover.py);
            pctx.strokeStyle = 'rgba(255,255,255,.25)'; pctx.setLineDash([4, 4]); pctx.lineWidth = 1;
            pctx.beginPath(); pctx.moveTo(hover.px, 0); pctx.lineTo(hover.px, H); pctx.moveTo(0, hover.py); pctx.lineTo(W, hover.py); pctx.stroke();
            pctx.setLineDash([]);
            let txt = `x=${shortNum(x, 4)}  y=${shortNum(y, 4)}`;
            plotFns.forEach((fn, k) => {
                let v; try { v = fn.f({ x }); } catch (e) { v = NaN; }
                txt += `\nf${k + 1}(${shortNum(x, 3)}) = ${isFinite(v) ? shortNum(v, 5) : 'KXĐ'}`;
                if (isFinite(v)) {
                    const py = sy(v);
                    pctx.fillStyle = fn.color;
                    pctx.beginPath(); pctx.arc(hover.px, py, 3.5, 0, Math.PI * 2); pctx.fill();
                }
            });
            pctx.fillStyle = 'rgba(16,16,24,.92)';
            const bw = 150, bh = 16 + txt.split('\n').length * 14;
            const bx = Math.min(W - bw - 6, hover.px + 12), by = Math.max(6, hover.py - bh - 8);
            pctx.fillRect(bx, by, bw, bh);
            pctx.strokeStyle = '#43434f'; pctx.strokeRect(bx, by, bw, bh);
            pctx.fillStyle = '#e8e8f0'; pctx.font = '11px Consolas, monospace';
            txt.split('\n').forEach((l, i) => pctx.fillText(l, bx + 6, by + 14 + i * 14));
        }
    }
    function niceStep(raw) {
        const p = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
        const n = raw / p;
        return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
    }
    function shortNum(v, d) {
        if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
        const a = Math.abs(v);
        if (a && (a >= 1e6 || a < 1e-4)) return v.toExponential(2);
        return String(parseFloat(v.toFixed(d == null ? 6 : d)));
    }
    let dragPlot = null;
    plot.addEventListener('pointerdown', e => {
        const r = plot.getBoundingClientRect();
        dragPlot = { px: e.clientX - r.left, py: e.clientY - r.top, v: Object.assign({}, view) };
        plot.setPointerCapture(e.pointerId);
    });
    plot.addEventListener('pointermove', e => {
        const r = plot.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        hover = { px, py };
        if (dragPlot) {
            const dx = (px - dragPlot.px) / plot.clientWidth * (dragPlot.v.xmax - dragPlot.v.xmin);
            const dy = (py - dragPlot.py) / plot.clientHeight * (dragPlot.v.ymax - dragPlot.v.ymin);
            view.xmin = dragPlot.v.xmin - dx; view.xmax = dragPlot.v.xmax - dx;
            view.ymin = dragPlot.v.ymin + dy; view.ymax = dragPlot.v.ymax + dy;
            syncRangeInputs();
        }
        drawPlot();
    });
    plot.addEventListener('pointerup', () => { dragPlot = null; });
    plot.addEventListener('pointerleave', () => { hover = null; dragPlot = null; drawPlot(); });
    plot.addEventListener('wheel', e => {
        e.preventDefault();
        const k = e.deltaY < 0 ? 0.85 : 1.18;
        const r = plot.getBoundingClientRect();
        const cx = ix(e.clientX - r.left), cy = iy(e.clientY - r.top);
        view.xmin = cx + (view.xmin - cx) * k; view.xmax = cx + (view.xmax - cx) * k;
        view.ymin = cy + (view.ymin - cy) * k; view.ymax = cy + (view.ymax - cy) * k;
        syncRangeInputs(); drawPlot();
    }, { passive: false });
    function syncRangeInputs() {
        document.getElementById('xmin').value = +view.xmin.toFixed(4);
        document.getElementById('xmax').value = +view.xmax.toFixed(4);
        document.getElementById('ymin').value = +view.ymin.toFixed(4);
        document.getElementById('ymax').value = +view.ymax.toFixed(4);
    }
    function readRange() {
        view.xmin = +document.getElementById('xmin').value; view.xmax = +document.getElementById('xmax').value;
        view.ymin = +document.getElementById('ymin').value; view.ymax = +document.getElementById('ymax').value;
        if (view.xmin >= view.xmax || view.ymin >= view.ymax) throw new Error('Khoảng hiển thị không hợp lệ (min phải nhỏ hơn max)');
    }
    const plotOut = t => document.getElementById('plotOut').innerHTML = t;

    /* ================== ĐỔI ĐƠN VỊ ================== */
    const UNITS = {
        'Chiều dài': { m: 1, mm: 0.001, cm: 0.01, km: 1000, 'inch (in)': 0.0254, 'foot (ft)': 0.3048, 'yard (yd)': 0.9144, 'dặm (mile)': 1609.344, 'hải lý (nmi)': 1852, 'ångström (Å)': 1e-10, 'point (pt)': 0.000352778, 'sải (fathom)': 1.8288, 'năm ánh sáng (ly)': 9.4607e15 },
        'Khối lượng': { g: 1, mg: 0.001, kg: 1000, 'tấn (t)': 1e6, 'ounce (oz)': 28.349523125, 'pound (lb)': 453.59237, 'stone (st)': 6350.29318, 'grain (gr)': 0.06479891, 'lượng (tael VN)': 37.5, 'cân (0.5 kg)': 500 },
        'Nhiệt độ': { '°C': 'C', '°F': 'F', 'K': 'K', '°Ra': 'R' },
        'Diện tích': { 'm²': 1, 'mm²': 1e-6, 'cm²': 1e-4, 'km²': 1e6, 'hecta (ha)': 1e4, 'are (a)': 100, 'acre': 4046.8564224, 'ft²': 0.09290304, 'in²': 0.00064516, 'sào Bắc Bộ': 360, 'mẫu Bắc Bộ': 3600, 'yard²': 0.83612736 },
        'Thể tích': { 'lít (L)': 1, 'mL': 0.001, 'm³': 1000, 'cm³': 0.001, 'gallon US': 3.785411784, 'gallon UK': 4.54609, 'quart US': 0.946352946, 'pint US': 0.473176473, 'cup US': 0.2365882365, 'fl oz US': 0.0295735296, 'ft³': 28.316846592, 'in³': 0.016387064, 'thùng dầu (bbl)': 158.987294928 },
        'Tốc độ': { 'm/s': 1, 'km/h': 0.2777777778, 'dặm/h (mph)': 0.44704, 'hải lý/h (knot)': 0.5144444444, 'ft/s': 0.3048, 'Mach (≈340.29 m/s)': 340.29, 'cm/s': 0.01 },
        'Thời gian': { 'giây (s)': 1, 'mili giây (ms)': 0.001, 'micro giây (µs)': 1e-6, 'phút': 60, 'giờ': 3600, 'ngày': 86400, 'tuần': 604800, 'tháng (30.44 ngày)': 2629746, 'năm (365.2425 ngày)': 31556952, 'thập kỷ': 315569520 },
        'Dữ liệu': { 'byte (B)': 1, bit: 0.125, 'KB (1000)': 1000, 'MB (1000²)': 1e6, 'GB (1000³)': 1e9, 'TB (1000⁴)': 1e12, 'PB': 1e15, 'KiB (1024)': 1024, 'MiB': 1048576, 'GiB': 1073741824, 'TiB': 1099511627776 },
        'Áp suất': { 'Pa': 1, 'kPa': 1000, 'MPa': 1e6, 'bar': 1e5, 'atm': 101325, 'mmHg (torr)': 133.322368, 'psi': 6894.757293, 'kgf/cm²': 98066.5 },
        'Năng lượng': { 'J': 1, 'kJ': 1000, 'cal': 4.184, 'kcal': 4184, 'Wh': 3600, 'kWh': 3.6e6, 'eV': 1.602176634e-19, 'BTU': 1055.05585, 'ft·lbf': 1.355817948 },
        'Công suất': { 'W': 1, 'kW': 1000, 'MW': 1e6, 'HP (imperial)': 745.6998715, 'mã lực metric (PS)': 735.49875, 'BTU/h': 0.29307107, 'kcal/h': 1.163 },
        'Góc': { 'độ (°)': 1, 'radian (rad)': 57.29577951308232, 'grad (gon)': 0.9, 'vòng': 360, 'phút góc (′)': 1 / 60, 'giây góc (″)': 1 / 3600 }
    };
    function tempConv(v, from, to) {
        let c;
        if (from === '°C') c = v; else if (from === '°F') c = (v - 32) * 5 / 9; else if (from === 'K') c = v - 273.15; else c = (v - 491.67) * 5 / 9;
        if (to === '°C') return c; if (to === '°F') return c * 9 / 5 + 32; if (to === 'K') return c + 273.15; return (c + 273.15) * 9 / 5;
    }
    function buildUnits() {
        const cat = document.getElementById('uCat');
        cat.innerHTML = Object.keys(UNITS).map(k => `<option>${k}</option>`).join('');
        const fill = () => {
            const grp = UNITS[cat.value] || UNITS[Object.keys(UNITS)[0]];
            const units = Object.keys(grp);
            const f = document.getElementById('uFrom'), t = document.getElementById('uTo');
            const keepF = f.value, keepT = t.value;
            f.innerHTML = units.map(u => `<option>${u}</option>`).join('');
            t.innerHTML = units.map(u => `<option>${u}</option>`).join('');
            f.value = units.includes(keepF) ? keepF : units[0];
            t.value = units.includes(keepT) ? keepT : (units[1] || units[0]);
        };
        cat.addEventListener('change', () => { fill(); convertUnit(); });
        fill();
        ['uVal', 'uFrom', 'uTo'].forEach(id => document.getElementById(id).addEventListener('input', convertUnit));
        convertUnit();
    }
    function convertUnit() {
        const cat = document.getElementById('uCat').value;
        if (!UNITS[cat]) { document.getElementById('uCat').value = Object.keys(UNITS)[0]; }
        const v = parseFloat(document.getElementById('uVal').value);
        const from = document.getElementById('uFrom').value, to = document.getElementById('uTo').value;
        if (isNaN(v)) { document.getElementById('uOut').textContent = 'Nhập số cần đổi'; return NaN; }
        const map = UNITS[cat];
        let out;
        if (cat === 'Nhiệt độ') out = tempConv(v, from, to);
        else out = v * map[from] / map[to];
        document.getElementById('uOut').innerHTML = `<b>${fmtGroup(v)}</b> ${esc(from)} = <b>${fmtGroup(out)}</b> ${esc(to)}`;
        // bảng tất cả đơn vị
        const rows = Object.keys(map).map(u => {
            const val = cat === 'Nhiệt độ' ? tempConv(v, from, u) : v * map[from] / map[u];
            return `<tr><td>${esc(u)}</td><td>${esc(fmtGroup(val))}</td></tr>`;
        }).join('');
        document.getElementById('uTable').innerHTML = `<tr><th>${esc(cat)}</th><th>Giá trị</th></tr>${rows}`;
        TK.status(`Đổi đơn vị: ${fmtNum(v)} ${from} → ${fmtNum(out)} ${to}`);
        return out;
    }

    /* ================== NGÀY THÁNG ================== */
    const iso = d => d.toISOString().slice(0, 10);
    const VN_DAY = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    function parseDate(s) { const d = new Date(s + 'T00:00:00'); if (isNaN(d)) throw new Error('Ngày không hợp lệ'); return d; }
    function isoWeek(d) {
        const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = t.getUTCDay() || 7;
        t.setUTCDate(t.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
        return { week: Math.ceil((((t - yearStart) / 86400000) + 1) / 7), year: t.getUTCFullYear() };
    }
    function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }

    /* ================== BẤM GIỜ ================== */
    let sw = { t0: 0, acc: 0, running: false, raf: 0, laps: [] };
    function swTick() {
        const el = document.getElementById('stopwatch');
        const ms = sw.acc + (sw.running ? Date.now() - sw.t0 : 0);
        const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), c = Math.floor(ms % 1000 / 10);
        el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
        if (sw.running) sw.raf = requestAnimationFrame(swTick);
    }

    /* ================== ACTIONS ================== */
    TK.init({ app: 'xcalc', status: '.statusbar [data-status-text]' });
    const numOut = t => document.getElementById('numOut').innerHTML = t;
    const A = {
        tab(e, elm) {
            const id = elm.dataset.arg;
            document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.arg === id));
            document.querySelectorAll('.body').forEach(b => b.classList.toggle('on', b.id === 'tab-' + id));
            if (id === 'plot') { compilePlot(); drawPlot(); }
            TK.status('Đang ở tab: ' + id);
        },
        toggleAngle() {
            ANGLE = ANGLE === 'DEG' ? 'RAD' : 'DEG';
            document.getElementById('angleBtn').textContent = ANGLE;
            document.getElementById('stAngle').textContent = ANGLE;
            KEYS[0][1].l = ANGLE;
            renderKeys(); preview(); refresh();
            TK.toast('Chế độ góc: ' + (ANGLE === 'DEG' ? 'độ (DEG)' : 'radian (RAD)'));
        },
        second() {
            S.second = !S.second;
            renderKeys();
            const b = document.querySelector('#keys button');
            if (b) b.classList.toggle('eq', S.second);
            TK.toast('Hàm bậc 2 (2nd): ' + (S.second ? 'BẬT — hàng sin/cos/tan đổi thành sinh/cosh/tanh, √ thành n√' : 'TẮT'));
        },
        back() { S.expr = S.expr.slice(0, -1); preview(); refresh(); },
        clearAll() { S.expr = ''; S.result = '0'; document.getElementById('result').classList.remove('err'); refresh(); TK.status('Đã xóa hết'); },
        clearEntry() { S.expr = ''; preview(); refresh(); },
        clearHistory() { S.history = []; renderHist(); TK.toast('Đã xóa lịch sử'); },
        ansInsert() { S.expr += '(' + fmtNum(S.ans) + ')'; preview(); refresh(); },
        equals,
        negate() {
            try { const v = S.expr ? calc(S.expr, { ans: S.ans }) : 0; S.expr = fmtNum(-v); preview(); refresh(); }
            catch (e) { S.expr = '-(' + S.expr + ')'; refresh(); }
        },
        mc() { S.mem = 0; memUpd(); TK.toast('Đã xóa bộ nhớ'); },
        mr() { S.expr += '(' + fmtNum(S.mem) + ')'; preview(); refresh(); },
        mplus() { try { const v = S.expr ? calc(S.expr, { ans: S.ans }) : parseFloat(S.result.replace(/ /g, '')) || 0; S.mem += v; memUpd(); TK.toast('M+ : bộ nhớ = ' + fmtNum(S.mem), 'ok'); } catch (e) { TK.toast('Không cộng được vào bộ nhớ: ' + e.message, 'error'); } },
        mminus() { try { const v = S.expr ? calc(S.expr, { ans: S.ans }) : 0; S.mem -= v; memUpd(); TK.toast('M− : bộ nhớ = ' + fmtNum(S.mem), 'ok'); } catch (e) { TK.toast('Lỗi: ' + e.message, 'error'); } },
        copyResult() { copyText(S.result.replace(/ /g, '')); },
        copyExpr() { copyText(S.expr); },
        bigFont() { S.bigFont = !S.bigFont; document.getElementById('result').style.fontSize = S.bigFont ? '40px' : '30px'; TK.toast('Cỡ chữ kết quả: ' + (S.bigFont ? 'to' : 'thường')); },
        const(e, elm) {
            const map = { pi: 'pi', e: 'e', phi: '1.6180339887498949', sqrt2: 'sqrt(2)', c: '299792458', g: '9.80665', NA: '6.02214076e23', k: '1.380649e-23' };
            ins(map[elm.dataset.arg] || 'pi');
        },
        /* ---- đồ thị ---- */
        drawPlotNow() { readRangeSafe(); compilePlot(); drawPlot(); TK.toast('Đã vẽ ' + plotFns.length + ' hàm số', 'ok'); },
        resetPlot() { view.xmin = -10; view.xmax = 10; view.ymin = -10; view.ymax = 10; syncRangeInputs(); drawPlot(); },
        plotZoom(e, elm) {
            const k = elm.dataset.arg === 'in' ? 0.7 : 1.4;
            const cx = (view.xmin + view.xmax) / 2, cy = (view.ymin + view.ymax) / 2;
            view.xmin = cx + (view.xmin - cx) * k; view.xmax = cx + (view.xmax - cx) * k;
            view.ymin = cy + (view.ymin - cy) * k; view.ymax = cy + (view.ymax - cy) * k;
            syncRangeInputs(); drawPlot();
        },
        plotSquare() {
            const r = plot.clientWidth / plot.clientHeight;
            const cx = (view.xmin + view.xmax) / 2, cy = (view.ymin + view.ymax) / 2;
            const h = (view.ymax - view.ymin);
            view.ymin = cy - h / 2; view.ymax = cy + h / 2;
            view.xmin = cx - h * r / 2; view.xmax = cx + h * r / 2;
            syncRangeInputs(); drawPlot(); TK.toast('Đã chỉnh tỉ lệ 1:1 (đường tròn sẽ tròn)', 'ok');
        },
        evalAt() {
            readRangeSafe(); compilePlot();
            if (!plotFns.length) return TK.toast('Chưa có hàm nào', 'error');
            const x0 = +document.getElementById('x0').value;
            const rows = plotFns.map((fn, i) => { let v; try { v = fn.f({ x: x0 }); } catch (e) { v = NaN; } return `f${i + 1}(${x0}) = ${isFinite(v) ? fmtGroup(v) : 'không xác định'}   [${esc(fn.src)}]`; });
            plotOut(rows.join('\n'));
        },
        derivative() {
            readRangeSafe(); compilePlot();
            if (!plotFns.length) return TK.toast('Chưa có hàm nào', 'error');
            const x0 = +document.getElementById('x0').value, h = 1e-6;
            const rows = plotFns.map((fn, i) => {
                let d;
                try { d = (fn.f({ x: x0 + h }) - fn.f({ x: x0 - h })) / (2 * h); } catch (e) { d = NaN; }
                let d2;
                try { d2 = (fn.f({ x: x0 + h }) - 2 * fn.f({ x: x0 }) + fn.f({ x: x0 - h })) / (h * h); } catch (e) { d2 = NaN; }
                return `f${i + 1}'(${x0}) ≈ ${isFinite(d) ? fmtGroup(d) : 'KXĐ'}   ·  f''(${x0}) ≈ ${isFinite(d2) ? fmtGroup(d2) : 'KXĐ'}   (sai số số học ~1e-6)`;
            });
            plotOut(rows.join('\n'));
        },
        integrate() {
            readRangeSafe(); compilePlot();
            if (!plotFns.length) return TK.toast('Chưa có hàm nào', 'error');
            const a = +document.getElementById('ia').value, b = +document.getElementById('ib').value;
            if (a === b) return TK.toast('a phải khác b', 'error');
            const n = 4000, hgt = (b - a) / n;
            const rows = plotFns.map((fn, i) => {
                let s = 0, bad = false;
                try {
                    s = fn.f({ x: a }) + fn.f({ x: b });
                    for (let k = 1; k < n; k++) { const v = fn.f({ x: a + k * hgt }); if (!isFinite(v)) { bad = true; break; } s += (k % 2 ? 4 : 2) * v; }
                    s *= hgt / 3;
                } catch (e) { bad = true; }
                return `∫[${a} → ${b}] f${i + 1}(x) dx ≈ ${bad ? 'không tính được (hàm gián đoạn trong khoảng)' : fmtGroup(s)}   (Simpson 1/3, n=${n})`;
            });
            plotOut(rows.join('\n'));
        },
        findRoot() {
            readRangeSafe(); compilePlot();
            if (!plotFns.length) return TK.toast('Chưa có hàm nào', 'error');
            const out = plotFns.map((fn, i) => {
                const roots = [];
                const N = 2000;
                let prevX = view.xmin, prevY;
                try { prevY = fn.f({ x: prevX }); } catch (e) { prevY = NaN; }
                for (let k = 1; k <= N; k++) {
                    const x = view.xmin + (view.xmax - view.xmin) * k / N;
                    let y; try { y = fn.f({ x }); } catch (e) { y = NaN; }
                    if (isFinite(prevY) && isFinite(y) && prevY * y < 0) {
                        let lo = prevX, hi = x, flo = prevY;
                        for (let it = 0; it < 80; it++) {
                            const mid = (lo + hi) / 2, fm = tryF(fn, mid);
                            if (!isFinite(fm)) break;
                            if (flo * fm <= 0) { hi = mid; } else { lo = mid; flo = fm; }
                        }
                        const r = (lo + hi) / 2;
                        if (!roots.some(q => Math.abs(q - r) < (view.xmax - view.xmin) / 5000)) roots.push(r);
                    } else if (isFinite(y) && Math.abs(y) < 1e-12 && !roots.some(q => Math.abs(q - x) < 1e-9)) roots.push(x);
                    prevX = x; prevY = y;
                }
                return `f${i + 1}(x) = 0  →  ${roots.length ? roots.map(r => 'x ≈ ' + fmtGroup(r)).join('   ·   ') : 'không có nghiệm trong [' + view.xmin + ', ' + view.xmax + ']'}`;
            });
            plotOut(out.join('\n') + '\n\n(Tìm bằng quét đổi dấu + chia đôi, 2000 mẫu trong khoảng đang hiển thị)');
        },
        valueTable() {
            readRangeSafe(); compilePlot();
            if (!plotFns.length) return TK.toast('Chưa có hàm nào', 'error');
            const n = 12;
            let html = '<table class="tbl"><tr><th>x</th>' + plotFns.map((f, i) => `<th>f${i + 1}</th>`).join('') + '</tr>';
            for (let k = 0; k <= n; k++) {
                const x = view.xmin + (view.xmax - view.xmin) * k / n;
                html += '<tr><td>' + shortNum(x, 4) + '</td>' + plotFns.map(f => { let v; try { v = f.f({ x }); } catch (e) { v = NaN; } return '<td>' + (isFinite(v) ? shortNum(v, 5) : '—') + '</td>'; }).join('') + '</tr>';
            }
            plotOut(html + '</table>');
        },
        exportPlot() { drawPlot(); TK.download(plot.toDataURL('image/png'), 'do-thi-xcalc.png'); },
        /* ---- đơn vị ---- */
        swapUnits() {
            const f = document.getElementById('uFrom'), t = document.getElementById('uTo');
            const tmp = f.value; f.value = t.value; t.value = tmp;
            convertUnit();
        },
        copyUnit() { copyText(document.getElementById('uOut').textContent); },
        toCalc() {
            const v = parseFloat(document.getElementById('uVal').value);
            S.expr += '(' + fmtNum(v) + ')'; preview(); refresh();
            A.tab(null, { dataset: { arg: 'calc' } });
            TK.toast('Đã đưa giá trị ' + fmtNum(v) + ' vào máy tính', 'ok');
        },
        /* ---- hệ đếm ---- */
        convertBase() {
            const raw = document.getElementById('bIn').value.trim().replace(/^0[xXbBoO]/, '').replace(/[\s_]/g, '');
            const base = +document.getElementById('bBase').value;
            if (!raw) return TK.toast('Nhập số cần chuyển', 'error');
            const valid = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-fA-F]+$/ }[base];
            if (!valid.test(raw)) return TK.toast('Số "' + raw + '" không hợp lệ ở hệ ' + base, 'error');
            const n = parseInt(raw, base);
            const bin = (n >>> 0).toString(2);
            document.getElementById('bOut').innerHTML =
                `<b>Thập phân:</b> ${n.toLocaleString('vi-VN')}  (${n})\n<b>Hex:</b> 0x${n.toString(16).toUpperCase()}\n<b>Bát phân:</b> 0o${n.toString(8)}\n<b>Nhị phân:</b> ${bin.replace(/(.{4})(?=.)/g, '$1 ')}\n<b>Nhị phân 32-bit:</b> ${(n >>> 0).toString(2).padStart(32, '0').replace(/(.{8})(?=.)/g, '$1 ')}\n<b>Số âm (bù 2, 32-bit):</b> ${((~n + 1) >>> 0).toString(2).padStart(32, '0')}\n<b>ASCII:</b> ${n >= 32 && n < 127 ? JSON.stringify(String.fromCharCode(n)) : '—'}`;
            TK.status('Đã chuyển ' + raw + ' (hệ ' + base + ') → ' + n);
        },
        copyBase() { copyText(document.getElementById('bOut').textContent); },
        bitop(e, elm) {
            const a = parseInt(document.getElementById('bitA').value, 10), b = parseInt(document.getElementById('bitB').value, 10);
            if (isNaN(a)) return TK.toast('Số A không hợp lệ', 'error');
            const op = elm.dataset.arg;
            let r, label;
            if (op === 'and') { r = a & b; label = `${a} AND ${b}`; }
            else if (op === 'or') { r = a | b; label = `${a} OR ${b}`; }
            else if (op === 'xor') { r = a ^ b; label = `${a} XOR ${b}`; }
            else if (op === 'not') { r = ~a; label = `NOT ${a}`; }
            else if (op === 'shl') { if (isNaN(b)) return TK.toast('Số B không hợp lệ', 'error'); r = a << b; label = `${a} << ${b}`; }
            else { if (isNaN(b)) return TK.toast('Số B không hợp lệ', 'error'); r = a >> b; label = `${a} >> ${b}`; }
            document.getElementById('bitOut').innerHTML = `<b>${label}</b> = ${r}\nhex: 0x${(r >>> 0).toString(16).toUpperCase()}\nbin: ${(r >>> 0).toString(2).padStart(32, '0').replace(/(.{8})(?=.)/g, '$1 ')}`;
            TK.status(label + ' = ' + r);
        },
        /* ---- số học ---- */
        async percent() {
            const v = await TK.prompt('Tính phần trăm', 'Chọn dạng bằng cách gõ số:\n1) a% của b  →  gõ "1: 20% của 250000"\n2) a là bao nhiêu % của b  →  "2: 45 của 180"\n3) % thay đổi từ a sang b  →  "3: 100 sang 135"', '1: 20% của 250000');
            if (!v) return;
            const m = /^\s*(\d)\s*:\s*(.+)$/.exec(v);
            if (!m) return TK.toast('Cú pháp: "1: 20% của 250000"', 'error');
            const mode = m[1], rest = m[2];
            const nums = (rest.match(/-?\d+(\.\d+)?/g) || []).map(Number);
            if (nums.length < 2) return TK.toast('Cần 2 con số', 'error');
            const [a, b] = nums;
            if (mode === '1') numOut(`<b>${a}% của ${fmtGroup(b)}</b> = ${fmtGroup(a / 100 * b)}`);
            else if (mode === '2') numOut(`<b>${fmtGroup(a)} là ${fmtGroup(a / b * 100)}% của ${fmtGroup(b)}</b>`);
            else numOut(`<b>Thay đổi ${fmtGroup(a)} → ${fmtGroup(b)}</b> = ${fmtGroup((b - a) / a * 100)}%  (chênh lệch ${fmtGroup(b - a)})`);
        },
        async gcdlcm() {
            const v = await TK.prompt('ƯCLN & BCNN', 'Nhập các số cách nhau bởi dấu phẩy (từ 2 số):', '12, 18, 30');
            if (!v) return;
            const ns = v.split(/[,\s;]+/).map(x => Math.abs(parseInt(x, 10))).filter(x => !isNaN(x));
            if (ns.length < 2) return TK.toast('Cần ít nhất 2 số', 'error');
            const gcd = (a, b) => b ? gcd(b, a % b) : a;
            const g = ns.reduce((a, b) => gcd(a, b));
            const l = ns.reduce((a, b) => a / gcd(a, b) * b);
            numOut(`<b>Dãy:</b> ${ns.join(', ')}\n<b>ƯCLN (GCD):</b> ${g}\n<b>BCNN (LCM):</b> ${l}`);
        },
        async primeCheck() {
            const v = await TK.askNumber('Số nguyên tố', 'Nhập số cần kiểm tra:', 97);
            if (v == null) return;
            const n = parseInt(v, 10);
            if (isNaN(n) || n < 2) return numOut(`<b>${n}</b> không phải số nguyên tố (phải ≥ 2)`);
            if (n % 2 === 0) return numOut(`<b>${n}</b> KHÔNG nguyên tố (chia hết cho 2)`);
            for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return numOut(`<b>${n}</b> KHÔNG nguyên tố — có ước ${i} (${n} = ${i} × ${n / i})`);
            numOut(`<b>${n}</b> LÀ số nguyên tố ✔${n <= 100000 ? ' (là số nguyên tố thứ ' + countPrimes(n) + ')' : ''}`);
        },
        async factorize() {
            const v = await TK.askNumber('Phân tích thừa số', 'Nhập số cần phân tích (≤ 10^12):', 360);
            if (v == null) return;
            let n = parseInt(v, 10);
            if (isNaN(n) || n < 2) return TK.toast('Số phải ≥ 2', 'error');
            if (n > 1e12) return TK.toast('Số quá lớn (giới hạn 10^12)', 'error');
            const parts = [];
            const orig = n;
            for (let d = 2; d * d <= n; d += d === 2 ? 1 : 2) {
                let c = 0;
                while (n % d === 0) { n /= d; c++; }
                if (c) parts.push(c > 1 ? `${d}^${c}` : `${d}`);
            }
            if (n > 1) parts.push(`${n}`);
            const divs = divisors(orig);
            numOut(`<b>${orig.toLocaleString('vi-VN')}</b> = ${parts.join(' × ')}\n<b>Số ước:</b> ${divs.length}\n<b>Tổng các ước:</b> ${fmtGroup(divs.reduce((a, b) => a + b, 0))}\n<b>Các ước:</b> ${divs.length > 60 ? divs.slice(0, 60).join(', ') + ', …' : divs.join(', ')}`);
        },
        async solveQuad() {
            const v = await TK.prompt('Phương trình bậc 2', 'Nhập a, b, c của ax² + bx + c = 0 (cách nhau bởi dấu phẩy):', '1, -3, 2');
            if (!v) return;
            const [a, b, c] = v.split(/[,\s;]+/).map(Number);
            if (isNaN(a) || isNaN(b) || isNaN(c)) return TK.toast('Cần 3 số a, b, c', 'error');
            if (a === 0) {
                if (b === 0) return numOut(c === 0 ? 'Phương trình vô số nghiệm (0 = 0)' : 'Phương trình vô nghiệm');
                return numOut(`a = 0 → phương trình bậc nhất: <b>x = ${fmtGroup(-c / b)}</b>`);
            }
            const D = b * b - 4 * a * c;
            let out = `<b>${a}x² + ${b >= 0 ? '+ ' + b : '− ' + Math.abs(b)}x ${c >= 0 ? '+ ' + c : '− ' + Math.abs(c)} = 0</b>\nΔ = b² − 4ac = ${fmtGroup(D)}\n`;
            if (D > 0) out += `Δ > 0 → 2 nghiệm phân biệt:\n<b>x₁ = ${fmtGroup((-b + Math.sqrt(D)) / (2 * a))}</b>\n<b>x₂ = ${fmtGroup((-b - Math.sqrt(D)) / (2 * a))}</b>\nTổng = ${fmtGroup(-b / a)} · Tích = ${fmtGroup(c / a)} (Viète)`;
            else if (D === 0) out += `Δ = 0 → nghiệm kép: <b>x = ${fmtGroup(-b / (2 * a))}</b>`;
            else out += `Δ < 0 → 2 nghiệm phức:\n<b>x₁ = ${fmtGroup(-b / (2 * a))} + ${fmtGroup(Math.sqrt(-D) / (2 * a))}i</b>\n<b>x₂ = ${fmtGroup(-b / (2 * a))} − ${fmtGroup(Math.sqrt(-D) / (2 * a))}i</b>`;
            numOut(out);
        },
        async stats() {
            const v = await TK.prompt('Thống kê dãy số', 'Nhập các số cách nhau bởi dấu phẩy hoặc khoảng trắng:', '5, 7, 9, 12, 7, 3, 18, 7');
            if (!v) return;
            const ns = v.split(/[,\s;]+/).map(Number).filter(x => !isNaN(x));
            if (ns.length < 2) return TK.toast('Cần ít nhất 2 số', 'error');
            const sorted = ns.slice().sort((a, b) => a - b);
            const n = ns.length, sum = ns.reduce((a, b) => a + b, 0), mean = sum / n;
            const med = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
            const varP = ns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
            const varS = ns.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
            const freq = {};
            ns.forEach(x => freq[x] = (freq[x] || 0) + 1);
            const mode = Object.keys(freq).filter(k => freq[k] === Math.max(...Object.values(freq)));
            numOut(`<b>n = ${n}</b>\nTổng = ${fmtGroup(sum)}\nTrung bình = ${fmtGroup(mean)}\nTrung vị = ${fmtGroup(med)}\nYếu vị (mode) = ${mode.join(', ')}\nNhỏ nhất = ${fmtGroup(sorted[0])} · Lớn nhất = ${fmtGroup(sorted[n - 1])}\nKhoảng biến thiên = ${fmtGroup(sorted[n - 1] - sorted[0])}\nPhương sai (mẫu) = ${fmtGroup(varS)} · Độ lệch chuẩn = ${fmtGroup(Math.sqrt(varS))}\nPhương sai (tổng thể) = ${fmtGroup(varP)}\nSắp xếp: ${sorted.join(', ')}`);
        },
        async roundTool() {
            const v = await TK.prompt('Làm tròn số', 'Gõ "số:số chữ số" — ví dụ 3.14159:3  (số âm = làm tròn hàng chục/trăm)', '3.14159265:4');
            if (!v) return;
            const m = /(-?[\d.]+)\s*:\s*(-?\d+)/.exec(v);
            if (!m) return TK.toast('Cú pháp: 3.14159:4', 'error');
            const x = parseFloat(m[1]), d = parseInt(m[2], 10);
            const k = Math.pow(10, d);
            numOut(`<b>${x}</b> làm tròn ${d} chữ số:\nLàm tròn = ${fmtGroup(Math.round(x * k) / k)}\nLàm tròn lên = ${fmtGroup(Math.ceil(x * k) / k)}\nLàm tròn xuống = ${fmtGroup(Math.floor(x * k) / k)}\nCắt bỏ phần dư = ${fmtGroup(Math.trunc(x * k) / k)}`);
        },
        async randomNum() {
            const v = await TK.prompt('Số ngẫu nhiên', 'Gõ "min-max" hoặc "min-max:số lượng" — ví dụ 1-100 hoặc 1-49:6', '1-100');
            if (!v) return;
            const m = /(-?\d+)\s*-\s*(-?\d+)\s*(?::\s*(\d+))?/.exec(v);
            if (!m) return TK.toast('Cú pháp: 1-100 hoặc 1-49:6', 'error');
            const lo = +m[1], hi = +m[2], cnt = TK.clamp(+(m[3] || 1), 1, 200);
            if (lo > hi) return TK.toast('min phải nhỏ hơn max', 'error');
            const out = [];
            const used = new Set();
            for (let i = 0; i < cnt; i++) {
                let r;
                let guard = 0;
                do { r = lo + Math.floor(Math.random() * (hi - lo + 1)); guard++; } while (used.has(r) && used.size < (hi - lo + 1) && guard < 5000);
                used.add(r); out.push(r);
            }
            numOut(`<b>Ngẫu nhiên trong [${lo}, ${hi}]</b>:\n${out.join('  ·  ')}\n${cnt > 1 ? '(các số không lặp lại)' : ''}`);
        },
        /* ---- ngày ---- */
        dateToday() {
            const t = new Date();
            document.getElementById('d1').value = iso(t);
            document.getElementById('d2').value = iso(t);
            document.getElementById('d3').value = iso(t);
            A.dateDiff();
        },
        dateDiff() {
            try {
                const a = parseDate(document.getElementById('d1').value);
                const b = parseDate(document.getElementById('d2').value);
                const days = Math.round((b - a) / 86400000);
                const abs = Math.abs(days);
                let work = 0;
                for (let d = new Date(Math.min(a, b)); d <= (days >= 0 ? b : a); d.setDate(d.getDate() + 1)) {
                    const w = d.getDay(); if (w !== 0 && w !== 6) work++;
                }
                const years = Math.floor(abs / 365.2425), rem = abs - Math.round(years * 365.2425);
                const months = Math.floor(rem / 30.437), remd = rem - Math.round(months * 30.437);
                const wa = isoWeek(a), wb = isoWeek(b);
                document.getElementById('dOut').innerHTML =
                    `<b>${iso(a)}</b> (${VN_DAY[a.getDay()]}) → <b>${iso(b)}</b> (${VN_DAY[b.getDay()]})\n` +
                    `Chênh lệch: <b>${days} ngày</b> (${(abs / 7).toFixed(2)} tuần)\n` +
                    `≈ ${years} năm ${months} tháng ${remd} ngày\n` +
                    `Ngày làm việc (T2–T6): ${work}\n` +
                    `${fmtGroup(abs * 24)} giờ = ${fmtGroup(abs * 1440)} phút = ${fmtGroup(abs * 86400)} giây\n` +
                    `Tuần ISO: ${wa.week}/${wa.year} → ${wb.week}/${wb.year}\n` +
                    `Ngày thứ ${dayOfYear(a)} → ${dayOfYear(b)} trong năm`;
                TK.status('Khoảng cách: ' + days + ' ngày');
            } catch (e) { TK.toast(e.message, 'error'); }
        },
        dateAdd(e, elm) {
            try {
                const d = parseDate(document.getElementById('d3').value);
                const n = parseInt(document.getElementById('dN').value, 10) || 0;
                const sign = elm.dataset.action === 'dateSub' ? -1 : 1;
                const r = new Date(d.getTime());
                r.setDate(r.getDate() + sign * n);
                const diffDays = Math.round((r - d) / 86400000);
                document.getElementById('dOut2').innerHTML =
                    `<b>${iso(d)}</b> ${sign > 0 ? '+' : '−'} ${Math.abs(n)} ngày\n= <b>${iso(r)}</b> (${VN_DAY[r.getDay()]})\n` +
                    `Tuần ISO ${isoWeek(r).week}/${isoWeek(r).year} · ngày thứ ${dayOfYear(r)} của năm\n` +
                    `+ ${Math.abs(n) * 24} giờ · ${Math.abs(n)} × 86400 = ${fmtGroup(Math.abs(diffDays) * 86400)} giây`;
                TK.status('Kết quả: ' + iso(r));
            } catch (e2) { TK.toast(e2.message, 'error'); }
        },
        dateSub(e, elm) { A.dateAdd(e, { dataset: { action: 'dateSub' } }); },
        swStart() {
            if (sw.running) { sw.acc += Date.now() - sw.t0; sw.running = false; cancelAnimationFrame(sw.raf); document.getElementById('swBtn').textContent = '▶ Tiếp tục'; TK.status('⏸ Bấm giờ tạm dừng'); }
            else { sw.t0 = Date.now(); sw.running = true; swTick(); document.getElementById('swBtn').textContent = '⏸ Dừng'; TK.status('▶ Bấm giờ đang chạy'); }
        },
        swLap() {
            const ms = sw.acc + (sw.running ? Date.now() - sw.t0 : 0);
            sw.laps.push(ms);
            document.getElementById('swLaps').innerHTML = sw.laps.map((l, i) =>
                `Vòng ${i + 1}: <b>${fmtMs(l)}</b>${i ? ` (+${fmtMs(l - sw.laps[i - 1])})` : ''}`).join('\n') || 'Chưa có vòng nào';
            TK.toast('⚑ Vòng ' + sw.laps.length + ': ' + fmtMs(ms), 'ok');
        },
        swReset() {
            sw = { t0: 0, acc: 0, running: false, raf: 0, laps: [] };
            cancelAnimationFrame(sw.raf);
            document.getElementById('stopwatch').textContent = '00:00.00';
            document.getElementById('swLaps').textContent = 'Chưa có vòng nào';
            document.getElementById('swBtn').textContent = '▶ Bắt đầu';
        },
        /* ---- AI ---- */
        async aiSolve() {
            const q = await TK.prompt('✨ AI giải toán', 'Nhập bài toán (AI sẽ giải từng bước và kiểm tra lại bằng máy tính nếu có biểu thức):', 'Một cửa hàng giảm giá 15% rồi giảm thêm 10% trên giá đã giảm. Giá ban đầu 2.500.000đ thì giá cuối là bao nhiêu?');
            if (!q) return;
            TK.status('✨ AI đang giải…');
            try {
                const out = await TK.ai(`Giải bài toán sau bằng tiếng Việt, trình bày rõ từng bước, kèm công thức và kết quả cuối cùng in đậm. Nếu cần tính số, hãy viết biểu thức trên 1 dòng riêng theo cú pháp máy tính (chỉ dùng + - * / ^ % () và hàm sin cos tan sqrt ln log abs, ví dụ: 2500000*0.85*0.9).\n\nBài toán: ${q}`, { system: 'Bạn là gia sư toán chính xác, không làm tròn sai.' });
                if (!out) return;
                const exprs = String(out).match(/[-+*/^%()0-9a-z .]{6,}/gi) || [];
                let checked = '';
                for (const ex of exprs.slice(0, 40)) {
                    const cand = ex.replace(/[^\-+*/^%()0-9a-z. ]/gi, '').trim();
                    if (!/[0-9]/.test(cand) || !/[+\-*/^]/.test(cand)) continue;
                    try { const v = calc(cand, {}); if (isFinite(v)) { checked += `\n✔ Kiểm tra lại bằng máy tính: ${cand} = ${fmtGroup(v)}`; break; } } catch (e) {}
                }
                TK.modal({ title: '✨ AI giải toán', message: String(out).slice(0, 2400) + (checked ? '\n' + checked : ''), ok: 'Đóng', cancel: '' });
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        },
        async aiExplain() {
            const ex = S.expr || document.getElementById('f1').value;
            if (!ex) return TK.toast('Không có biểu thức nào để giải thích', 'error');
            TK.status('✨ AI đang giải thích biểu thức…');
            try {
                const out = await TK.ai(`Giải thích biểu thức sau bằng tiếng Việt cho người mới học: thứ tự thực hiện phép tính, ý nghĩa từng hàm, và kết quả (nếu tính được).\nBiểu thức: ${ex}`, { system: 'Bạn là giáo viên toán.' });
                TK.modal({ title: '✨ Giải thích: ' + ex.slice(0, 40), message: String(out || '').slice(0, 2200), ok: 'Đóng', cancel: '' });
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        },
        async aiPlot() {
            const q = await TK.prompt('✨ AI gợi ý hàm', 'Bạn muốn vẽ dạng đồ thị gì? (AI sẽ trả về biểu thức theo x)', 'đường cong hình chuông (phân phối chuẩn)');
            if (!q) return;
            TK.status('✨ AI đang tạo biểu thức…');
            try {
                const out = await TK.ai(`Cho yêu cầu vẽ đồ thị: "${q}". Trả về CHỈ MỘT dòng biểu thức toán theo biến x, dùng cú pháp: + - * / ^ % (), sin cos tan asin sinh ln log sqrt cbrt abs exp floor, ví dụ: exp(-x^2/2)/sqrt(2*pi). Không giải thích.`, { system: 'Chỉ trả 1 dòng biểu thức.' });
                const line = String(out || '').split('\n').map(s => s.replace(/[`f(x)=]/gi, '').trim()).filter(s => s && /[x0-9]/.test(s))[0];
                if (!line) return TK.toast('AI không trả về biểu thức', 'error');
                document.getElementById('f1').value = line;
                A.tab(null, { dataset: { arg: 'plot' } });
                A.drawPlotNow();
                TK.toast('✨ AI gợi ý hàm: ' + line, 'ok');
            } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        }
    };
    A.drawPlot = A.drawPlotNow;
    function readRangeSafe() { try { readRange(); } catch (e) { TK.toast(e.message, 'error'); } }
    function countPrimes(n) { let c = 0; for (let i = 2; i <= n; i++) { if (i % 2 === 0 && i !== 2) continue; let p = true; for (let d = 3; d * d <= i; d += 2) if (i % d === 0) { p = false; break; } if (p) c++; } return c; }
    function divisors(n) { const s = [], l = []; for (let i = 1; i * i <= n; i++) if (n % i === 0) { s.push(i); if (i !== n / i) l.push(n / i); } return s.concat(l.reverse()); }
    function fmtMs(ms) { const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), c = Math.floor(ms % 1000 / 10); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; }
    async function copyText(t) {
        try { await navigator.clipboard.writeText(String(t)); TK.toast('⧉ Đã chép: ' + String(t).slice(0, 60), 'ok'); }
        catch (e) { TK.toast('Trình duyệt chặn clipboard — kết quả vẫn hiển thị trên màn hình', 'error'); }
    }
    function memUpd() {
        document.getElementById('memVal').textContent = 'M = ' + fmtGroup(S.mem);
        document.getElementById('stMem').textContent = 'M = ' + fmtNum(S.mem);
    }
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    /* ---------- bàn phím ---------- */
    document.addEventListener('keydown', e => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        if (!document.getElementById('tab-calc').classList.contains('on')) return;
        const k = e.key;
        if (/^[0-9.]$/.test(k)) return ins(k);
        if (['+', '-', '*', '/', '^', '%', '(', ')', '!'].includes(k)) { e.preventDefault(); return ins(k); }
        if (k === 'Enter' || k === '=') { e.preventDefault(); return equals(); }
        if (k === 'Backspace') { e.preventDefault(); return A.back(); }
        if (k === 'Escape') return A.clearAll();
        if (k.toLowerCase() === 'a') return A.ansInsert();
        if (k.toLowerCase() === 'p') return ins('pi');
        if (k.toLowerCase() === 's') return ins('sqrt(');
    });

    /* ---------- lệnh AI / trang cha ---------- */
    TK.cmd('get_info', () => ({ app: 'xCalc', angle: ANGLE, expression: S.expr, result: S.result, memory: S.mem, answer: S.ans }));
    TK.cmd('calculate', a => {
        const src = String(a.expression || a.expr || a.q || '');
        if (!src) return { ok: false, error: 'thiếu expression' };
        try {
            const v = calc(src, { ans: S.ans, m: S.mem, x: a.x == null ? 0 : +a.x });
            S.expr = src; S.ans = v; S.result = fmtGroup(v);
            S.history.unshift({ e: src, r: fmtNum(v), v }); renderHist(); refresh();
            return { expression: src, result: v, display: fmtNum(v) };
        } catch (e) { return { ok: false, error: e.message }; }
    });
    TK.cmd('convert_unit', a => {
        const cat = Object.keys(UNITS).find(c => c.toLowerCase().includes(String(a.category || '').toLowerCase())) || Object.keys(UNITS)[0];
        document.getElementById('uCat').value = cat;
        document.getElementById('uCat').dispatchEvent(new Event('change'));
        const units = Object.keys(UNITS[cat] || UNITS[Object.keys(UNITS)[0]]);
        const pick = q => units.find(u => u.toLowerCase() === String(q || '').toLowerCase()) || units.find(u => u.toLowerCase().includes(String(q || '').toLowerCase())) || units[0];
        document.getElementById('uFrom').value = pick(a.from);
        document.getElementById('uTo').value = pick(a.to);
        document.getElementById('uVal').value = a.value == null ? 1 : a.value;
        const out = convertUnit();
        A.tab(null, { dataset: { arg: 'unit' } });
        return { category: cat, from: document.getElementById('uFrom').value, to: document.getElementById('uTo').value, value: +a.value || 1, result: out };
    });
    TK.cmd('plot', a => {
        if (a.f1 !== undefined) document.getElementById('f1').value = a.f1 || '';
        if (a.f2 !== undefined) document.getElementById('f2').value = a.f2 || '';
        if (a.f3 !== undefined) document.getElementById('f3').value = a.f3 || '';
        if (a.xmin != null) document.getElementById('xmin').value = a.xmin;
        if (a.xmax != null) document.getElementById('xmax').value = a.xmax;
        if (a.ymin != null) document.getElementById('ymin').value = a.ymin;
        if (a.ymax != null) document.getElementById('ymax').value = a.ymax;
        A.tab(null, { dataset: { arg: 'plot' } });
        A.drawPlotNow();
        return { plotted: plotFns.map(f => f.src) };
    });
    TK.cmd('analyze', a => {
        const what = String(a.what || 'root').toLowerCase();
        A.tab(null, { dataset: { arg: 'plot' } });
        compilePlot();
        if (what === 'root' || what === 'roots' || what === 'nghiem') A.findRoot();
        else if (what === 'integral' || what === 'tichphan') A.integrate();
        else if (what === 'derivative' || what === 'daoham') A.derivative();
        else if (what === 'table' || what === 'bang') A.valueTable();
        else A.evalAt();
        return { ok: true, what, output: document.getElementById('plotOut').textContent.slice(0, 800) };
    });
    TK.cmd('base_convert', a => {
        document.getElementById('bIn').value = a.value != null ? a.value : 255;
        if (a.base) document.getElementById('bBase').value = [2, 8, 10, 16].includes(+a.base) ? +a.base : 10;
        A.convertBase();
        A.tab(null, { dataset: { arg: 'base' } });
        return { text: document.getElementById('bOut').textContent };
    });
    TK.cmd('set_angle', a => { const want = String(a.mode || a.angle || 'DEG').toUpperCase(); if ((want === 'RAD') !== (ANGLE === 'RAD')) A.toggleAngle(); return { angle: ANGLE }; });
    TK.cmd('date_diff', a => {
        if (a.from) document.getElementById('d1').value = a.from;
        if (a.to) document.getElementById('d2').value = a.to;
        A.dateDiff(); A.tab(null, { dataset: { arg: 'date' } });
        return { text: document.getElementById('dOut').textContent };
    });

    /* ---------- khởi động ---------- */
    renderKeys();
    buildUnits();
    memUpd();
    refresh();
    const t = new Date();
    document.getElementById('d1').value = iso(t);
    document.getElementById('d2').value = iso(new Date(t.getTime() + 30 * 86400000));
    document.getElementById('d3').value = iso(t);
    sizePlot();
    drawPlot();
    TK.status('Sẵn sàng — gõ số hoặc bấm nút. Tab: Đồ thị / Đổi đơn vị / Hệ đếm / Ngày tháng. AI giải toán ở góc phải trên.');
})();
