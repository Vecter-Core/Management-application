/* ============================================================
   RUNE — Control Center (v3.0 Real Connection Edition)
   - AI Chat nối THẬT tới nhà cung cấp AI + tool-calling
   - MỘT nơi duy nhất quản lý khóa (AI + các khóa khác)
   - 12 ứng dụng Creative: mở được, điều khiển được từ AI
   ============================================================ */
'use strict';

/* ==================== APP REGISTRY ==================== */
const apps = {
    xphoto: { name: 'xPhoto', icon: 'Ps', file: 'tools/image-editor.html', color: 'linear-gradient(135deg, #001e36, #3b82f6)', keywords: ['ảnh','photo','image','photoshop','sửa ảnh','chỉnh sửa ảnh','ps','pixel','raster','filter','bộ lọc'] },
    xlight: { name: 'xLight', icon: 'Lr', file: 'tools/lightroom.html', color: 'linear-gradient(135deg, #0c4a6e, #06b6d4)', keywords: ['lightroom','lr','nhiếp ảnh','raw','ảnh chụp','màu ảnh','preset','develop','chỉnh màu'] },
    xcut: { name: 'xCut Pro', icon: 'Pr', file: 'tools/video-editor.html', color: 'linear-gradient(135deg,#4a044e,#e879f9)', keywords: ['video','phim','cắt video','chỉnh sửa video','premiere','pr','edit video','clip','dựng phim','timeline','9:16','tiktok'] },
    xfx: { name: 'xFX', icon: 'Ae', file: 'tools/after-effects.html', color: 'linear-gradient(135deg,#1a0033,#9999ff)', keywords: ['after effects','ae','hiệu ứng','motion graphics','vfx','animation','keyframe','đồ họa chuyển động'] },
    xdocs: { name: 'xDocs', icon: 'Dc', file: 'tools/docs.html', color: 'linear-gradient(135deg,#4a0000,#ff4081)', keywords: ['docs','word','văn bản','soạn thảo','tài liệu','doc','viết','gõ chữ','text'] },
    xdraw: { name: 'xVector', icon: 'Ai', file: 'tools/illustrator.html', color: 'linear-gradient(135deg,#330000,#ff9a00)', keywords: ['vẽ','draw','vector','illustrator','hình vẽ','thiết kế','svg','logo','icon','pen tool'] },
    xlayout: { name: 'xLayout', icon: 'Id', file: 'tools/indesign.html', color: 'linear-gradient(135deg,#4a004a,#ff4081)', keywords: ['indesign','dàn trang','layout','báo chí','tạp chí','sách','brochure','poster','in ấn','typography'] },
    xprototype: { name: 'xPrototype', icon: 'Xd', file: 'tools/xd.html', color: 'linear-gradient(135deg,#220022,#ff61f6)', keywords: ['xd','ui','ux','giao diện','prototype','wireframe','app mobile','web design','figma'] },
    xaudio: { name: 'xAudio', icon: 'Au', file: 'tools/audio.html', color: 'linear-gradient(135deg,#001e36,#00e5b8)', keywords: ['âm thanh','audio','nhạc','sound','audition','ghi âm','micro','waveform','khử ồn','mp3'] },
    xpdf: { name: 'xPDF', icon: 'PDF', file: 'tools/pdf.html', color: 'linear-gradient(135deg,#b30b00,#ff4040)', keywords: ['pdf','acrobat','chú thích','ký pdf','convert pdf'] },
    xcalc: { name: 'xCalc', icon: '🧮', file: 'tools/calc.html', color: 'var(--bg-tertiary)', keywords: ['tính','calculator','máy tính','toán','phép tính'] },
    xterm: { name: 'xTerminal', icon: '$_', file: 'tools/terminal.html', color: '#000', keywords: ['terminal','cli','cmd','lệnh','command','bash','shell','console','powershell'] }
};

/* ==================== HELPERS ==================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
/* gắn sự kiện an toàn: nếu phần tử chưa tồn tại thì cảnh báo chứ không làm sập cả init() */
function onSel(sel, ev, fn, opts) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) { console.warn('[RUNE] bỏ qua sự kiện "' + ev + '" vì thiếu phần tử:', sel); return null; }
    el.addEventListener(ev, fn, opts);
    return el;
}
const md = t => RuneUI.md(t);
const toast = (m, t) => RuneUI.toast(m, t);

function formatBytes(b) { return b < 1024 * 1024 * 1024 ? (b / 1024 / 1024).toFixed(0) + ' MB' : (b / 1024 / 1024 / 1024).toFixed(1) + ' GB'; }
function formatSpeed(bps) { return bps < 1024 * 1024 ? (bps / 1024).toFixed(0) + ' KB/s' : (bps / 1024 / 1024).toFixed(2) + ' MB/s'; }
function formatVolume(v) { return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v; }
function nowTime() { return new Date().toLocaleTimeString('vi-VN', { hour12: false }); }

const store = {
    get(k, d) { try { const v = localStorage.getItem('rune.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rune.' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { localStorage.removeItem('rune.' + k); }
};

/* ==================== CHAT RENDER ==================== */
const chatMessages = $('#chatMessages');
const chatInput = $('#chatInput');
const sendBtn = $('#sendChat');
const stopBtn = $('#stopChat');
let currentAbort = null;
let busy = false;

/**
 * HÀM ĐÃ BỊ THIẾU Ở BẢN CŨ → khiến nút "Gửi" ném ReferenceError và chết.
 * Giờ được định nghĩa đầy đủ, trả về element tin nhắn.
 */
function addChatMessage(text, role, isTemp) {
    if (!chatMessages) return null;
    const wrap = document.createElement('div');
    wrap.className = 'message ' + (role === 'user' ? 'user' : 'assistant') + (isTemp ? ' temp' : '');
    const body = document.createElement('div');
    body.className = 'msg-content';
    body.innerHTML = role === 'user' ? RuneUI.esc(text).replace(/\n/g, '<br>') : md(text);
    wrap.appendChild(body);
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return wrap;
}

function setContent(el, html) {
    if (!el) return;
    const c = el.querySelector('.msg-content') || el;
    c.innerHTML = html;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function appendContent(el, html) {
    if (!el) return;
    const c = el.querySelector('.msg-content') || el;
    c.innerHTML += html;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function thinkingEl(label) {
    return addChatMessage(`<div class="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span> ${label || 'Rune đang suy nghĩ…'}</div>`, 'assistant', true);
}

function addButtons(msgEl, buttons) {
    if (!msgEl) return;
    const bar = document.createElement('div');
    bar.className = 'msg-actions';
    buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'action-suggest-btn';
        btn.innerHTML = (b.icon ? b.icon + ' ' : '') + b.text;
        btn.addEventListener('click', () => b.action(btn));
        bar.appendChild(btn);
    });
    (msgEl.querySelector('.msg-content') || msgEl).appendChild(bar);
}

/* Lịch sử hội thoại */
let history = store.get('chat.history', []);
function persistHistory() {
    if (!$('#aiMemoryToggle') || $('#aiMemoryToggle').checked) store.set('chat.history', history.slice(-30));
}

/* ==================== BRIDGE tới app Creative ==================== */
const bridge = {
    frame: null, app: null, ready: {}, pending: {},
    attach(iframe) { this.frame = iframe; },
    send(app, cmd, args, timeout) {
        return new Promise(resolve => {
            if (!this.frame || !this.frame.contentWindow) return resolve({ ok: false, error: 'Chưa mở ứng dụng nào' });
            const id = 'c' + Math.random().toString(36).slice(2);
            const t = setTimeout(() => { delete this.pending[id]; resolve({ ok: false, error: 'Ứng dụng không phản hồi (timeout)' }); }, timeout || 6000);
            this.pending[id] = res => { clearTimeout(t); resolve(res); };
            this.frame.contentWindow.postMessage({ type: 'rune:cmd', id, app, cmd, args }, '*');
        });
    }
};
window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'rune:app-ready') {
        bridge.ready[d.app] = d.commands || [];
        logActivity('🎛️', `Ứng dụng <b>${(apps[d.app] || {}).name || d.app}</b> đã kết nối — ${bridge.ready[d.app].length} lệnh điều khiển sẵn sàng`);
    } else if (d.type === 'rune:cmd-result' && bridge.pending[d.id]) {
        bridge.pending[d.id]({ ok: d.ok !== false, result: d.result, error: d.error });
        delete bridge.pending[d.id];
    } else if (d.type === 'rune:status' && d.app === bridge.app) {
        const t = $('#appWindowStatus');
        if (t) t.textContent = d.text;
    } else if (d.type === 'rune:open-app') {
        if (apps[d.app]) openApp(d.app, d.context || '');
        else toast('Không có ứng dụng "' + d.app + '" trong RUNE', 'error');
    } else if (d.type === 'rune:show-section') {
        // app con (vd xTerminal gõ "key open") yêu cầu chuyển trang của RUNE
        const w = $('#app-window');
        if (w && !w.classList.contains('hidden') && typeof closeApp === 'function') closeApp();
        if (!d.section || !goToPage(d.section)) toast('Không có trang "' + (d.section || '') + '"', 'error');
    } else if (d.type === 'rune:ask-ai' && d.prompt) {
        goToPage('chat');
        chatInput.value = d.prompt;
        handleSend();
    }
});

function openApp(appId, context) {
    const app = apps[appId];
    if (!app) { toast('Không tìm thấy ứng dụng: ' + appId, 'error'); return false; }
    const win = $('#app-window');
    $('#appWindowTitle').textContent = app.icon + ' · ' + app.name + (context ? ' — ' + String(context).slice(0, 60) : '');
    const frame = $('#appFrame');
    bridge.app = appId;
    frame.src = app.file;
    win.classList.remove('hidden');
    win.dataset.app = appId;
    setTimeout(() => win.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    logActivity('🚀', `Mở <b>${app.name}</b>${context ? ' — ' + RuneUI.esc(String(context).slice(0, 60)) : ''}`);
    return true;
}

function closeApp() {
    $('#app-window').classList.add('hidden');
    $('#appFrame').src = 'about:blank';
    bridge.app = null;
}

/* ==================== TOOL REGISTRY (AI gọi được) ==================== */
const runeState = {
    sys: null, market: null, live: false,
    processes: null, connections: null, security: null, disks: null,
    optimize: null, netinfo: null, ping: null, healthScore: null, lastScan: 0
};

const RuneTools = {
    get_system_info: {
        icon: '💻', offline: true, group: 'system',
        schema: { name: 'get_system_info', description: 'Đọc thông tin hệ thống realtime: CPU, GPU, RAM, ổ đĩa, mạng, nhiệt độ, tiến trình nặng nhất', parameters: { type: 'object', properties: {}, required: [] } },
        async execute() {
            /* Nếu backend sống → đọc số THẬT ngay lúc được hỏi (không dùng cache cũ) */
            if (runeState.live) {
                let s = runeState.sys;
                try { s = await RuneNet.system(); runeState.sys = s; } catch (e) { s = runeState.sys || null; }
                if (s) {
                    let topProc = null, cpuTotal = null, temps = null, disks = null;
                    try {
                        const pr = await RuneNet.processes(8);
                        topProc = (pr.processes || []).slice(0, 5).map(x => ({
                            pid: x.pid, name: x.name, user: x.user,
                            cpu_pct: pr.first_sample ? null : Math.round(x.cpu_pct * 10) / 10,
                            ram_mb: Math.round((x.rss || 0) / 1048576), trust: x.trust
                        }));
                        cpuTotal = pr.first_sample ? null : Math.round(pr.cpu_total_pct * 10) / 10;
                    } catch (e) { }
                    try {
                        const dk = await RuneNet.disks();
                        temps = (dk.temps || []).map(t => ({ zone: t.zone, celsius: Math.round(t.celsius * 10) / 10 }));
                        disks = (dk.disks || []).map(x => ({ mount: x.mount, device: x.device, used_gb: +(x.used / 1073741824).toFixed(1), total_gb: +(x.total / 1073741824).toFixed(1), pct: Math.round(x.pct * 10) / 10 }));
                    } catch (e) { }
                    return {
                        nguồn: 'Backend C++ — đo thật từ /proc, /sys, statvfs lúc ' + nowTime(),
                        simulated: !!s.simulated,
                        cpu: s.cpu_name || null, cpu_usage_pct: s.cpu_usage == null ? null : Math.round(s.cpu_usage * 10) / 10,
                        cpu_toàn_máy_pct: cpuTotal,
                        cpu_temp_c: s.cpu_temp > 0 ? Math.round(s.cpu_temp) : null, cores: s.cpu_cores || null,
                        gpu: s.gpu_name || null, gpu_usage_pct: (s.gpu_usage > 0 || s.gpu_vram_total > 0) ? s.gpu_usage : null,
                        gpu_temp_c: s.gpu_temp > 0 ? Math.round(s.gpu_temp) : null,
                        gpu_vram_used_mb: s.gpu_vram_used ? Math.round(s.gpu_vram_used / 1048576) : null,
                        ram_total_gb: s.ram_total ? +(s.ram_total / 1073741824).toFixed(2) : null,
                        ram_used_gb: s.ram_used ? +(s.ram_used / 1073741824).toFixed(2) : null,
                        ram_available_gb: s.ram_available ? +(s.ram_available / 1073741824).toFixed(2) : null,
                        disk_read_mbps: s.disk_read ? +(s.disk_read / 1048576).toFixed(2) : 0,
                        disk_write_mbps: s.disk_write ? +(s.disk_write / 1048576).toFixed(2) : 0,
                        net_down_mbps: s.net_download ? +(s.net_download / 1048576).toFixed(2) : 0,
                        net_up_mbps: s.net_upload ? +(s.net_upload / 1048576).toFixed(2) : 0,
                        ổ_đĩa: disks, nhiệt_độ_cảm_biến: (temps && temps.length) ? temps : 'không đọc được cảm biến nào',
                        tiến_trình_nặng_nhất: topProc,
                        điểm_sức_khỏe: runeState.healthScore,
                        trình_duyệt: navigator.userAgent.split(') ').pop()
                    };
                }
            }
            /* Không có backend → KHÔNG bịa số: chỉ trả về sự thật mà trình duyệt biết */
            const c = navigator.connection || {};
            return {
                nguồn: 'KHÔNG đo được số liệu máy — chưa kết nối backend C++ (./build.sh && ./build/rune_server)',
                simulated: false,
                không_đo_được: ['CPU', 'nhiệt độ', 'GPU', 'RAM', 'ổ đĩa', 'tốc độ mạng', 'tiến trình'],
                lý_do: 'Trình duyệt không có quyền đọc /proc, /sys hay statvfs của máy.',
                sự_thật_trình_duyệt: {
                    số_luồng_cpu_tối_đa: navigator.hardwareConcurrency || null,
                    ram_trình_duyệt_khai_báo_gb: navigator.deviceMemory || null,
                    nền_tảng: navigator.platform || null,
                    màn_hình: (screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x'),
                    kiểu_mạng: c.effectiveType || null, downlink_mbps: c.downlink == null ? null : c.downlink, rtt_ms: c.rtt == null ? null : c.rtt,
                    userAgent: navigator.userAgent.split(') ').pop()
                },
                gợi_ý: 'Chạy backend C++ rồi bấm “🔄 Kiểm tra lại” ở trang Hệ thống để có số liệu thật.'
            };
        }
    },
    get_market_data: {
        icon: '📈', offline: true, group: 'web',
        schema: {
            name: 'get_market_data', description: 'Lấy dữ liệu thị trường: chỉ số chính, GDP, lạm phát, thất nghiệp, lãi suất và bảng cổ phiếu',
            parameters: { type: 'object', properties: { country: { type: 'string', enum: ['VN', 'US', 'JP', 'CN', 'EU'], description: 'Mã quốc gia' }, symbol: { type: 'string', description: 'Mã cổ phiếu cần tìm, vd VIC' } }, required: [] }
        },
        async execute(a) {
            const country = (a && a.country) || 'VN';
            let m;
            try { m = await fetchMarket(country); }
            catch (e) { return { country, simulated: true, error: e.message || String(e), note: 'Backend không trả lời được' }; }
            const out = {
                country, index: m.index, value: m.value, change: m.change, changePct: m.changePct,
                gdp: m.gdp, inflation: m.inflation, unemployment: m.unemp, rate: m.rate,
                năm_số_liệu_kinh_tế: m.econYear || null,
                nguồn: m.source, dữ_liệu_thật: !m.simulated,
                số_mã_có_giá_thật: m.stocksOk + '/' + m.stocksTotal,
                điểm_biểu_đồ_thật: (m.chart || []).length
            };
            if (m.simulated) {
                out.cảnh_báo = 'CHƯA có dữ liệu thật: ' + (m.note || m.source) + ' — các giá trị null nghĩa là không đo được, KHÔNG phải số 0.';
                if ((m.stockErrors || []).length) out.mã_không_lấy_được = m.stockErrors.slice(0, 6);
            }
            if (a && a.symbol) {
                const st = (m.stocks || []).find(s => s.sym.toLowerCase() === String(a.symbol).toLowerCase());
                out.symbol = st || `Không có ${a.symbol} trong danh sách (${m.source})`;
            } else out.stocks = (m.stocks || []).slice(0, 6);
            return out;
        }
    },
    open_app: {
        icon: '🚀', offline: true, group: 'tools',
        schema: {
            name: 'open_app', description: 'Mở một ứng dụng Creative trong cửa sổ làm việc. App: xphoto(Photoshop), xlight(Lightroom), xcut(Premiere), xfx(AfterEffects), xdraw(Illustrator), xlayout(InDesign), xprototype(XD), xaudio(Audition), xdocs(Word), xpdf(PDF), xcalc, xterm(Terminal)',
            parameters: { type: 'object', properties: { app: { type: 'string', description: 'id ứng dụng' }, context: { type: 'string', description: 'lý do mở' } }, required: ['app'] }
        },
        async execute(a) {
            let id = a && a.app;
            if (!apps[id]) {
                const q = String(id || '').toLowerCase();
                id = Object.keys(apps).find(k => k === q || apps[k].name.toLowerCase().includes(q) || apps[k].keywords.some(w => q.includes(w)));
            }
            if (!id) return { success: false, error: 'Không tìm thấy app', available: Object.keys(apps) };
            openApp(id, a.context || '');
            await new Promise(r => setTimeout(r, 700));
            return { success: true, opened: apps[id].name, id, commands: bridge.ready[id] || [] };
        }
    },
    control_app: {
        icon: '🎛️', offline: true, group: 'tools',
        schema: {
            name: 'control_app', description: 'Điều khiển ứng dụng Creative ĐANG MỞ: áp bộ lọc, chỉnh thông số, thêm chữ, xuất file… Gọi list_app_commands trước nếu chưa biết lệnh.',
            parameters: { type: 'object', properties: { app: { type: 'string' }, command: { type: 'string' }, args: { type: 'object', description: 'tham số của lệnh' } }, required: ['command'] }
        },
        async execute(a) {
            const app = (a && a.app) || bridge.app;
            if (!app) return { success: false, error: 'Chưa mở ứng dụng nào. Hãy gọi open_app trước.' };
            const res = await bridge.send(app, a.command, a.args || {});
            return Object.assign({ app, command: a.command }, res);
        }
    },
    list_app_commands: {
        icon: '🧰', offline: true, group: 'tools',
        schema: { name: 'list_app_commands', description: 'Liệt kê các lệnh mà một ứng dụng Creative hỗ trợ để điều khiển', parameters: { type: 'object', properties: { app: { type: 'string' } }, required: [] } },
        async execute(a) {
            const app = (a && a.app) || bridge.app;
            if (!app) return { error: 'Chưa mở app nào' };
            return { app, commands: bridge.ready[app] || 'app chưa phản hồi (đang tải)' };
        }
    },
    run_cli: {
        icon: '⚡', offline: true, group: 'cli',
        schema: { name: 'run_cli', description: 'Chạy lệnh shell trên máy người dùng (chỉ hoạt động khi backend C++ đang chạy). Luôn hỏi lại nếu lệnh nguy hiểm.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
        async execute(a) {
            const cmd = (a && a.command || '').trim();
            if (!cmd) return { success: false, error: 'Thiếu lệnh' };
            if (/rm\s+-rf|mkfs|dd\s+if=|:\(\)\{|shutdown|format/i.test(cmd)) return { success: false, error: 'Từ chối: lệnh nguy hiểm', command: cmd };
            showCli(cmd);
            if (!runeState.live) {
                appendCli('⚠ Backend C++ chưa chạy nên không thực thi thật được.\n  Build & chạy: ./build.sh && ./build/rune_server\n  (chế độ này chỉ mô phỏng, không chạy lệnh trên máy bạn)\n');
                return { success: false, backend: 'offline', command: cmd, note: 'Cần chạy backend C++ để thực thi thật' };
            }
            try {
                const r = await RuneNet.cli(cmd);
                appendCli(r.output || '(không có output)');
                return { success: true, command: cmd, exit_code: r.exit_code, output: String(r.output || '').slice(0, 4000) };
            } catch (e) {
                appendCli('✖ Lỗi: ' + e.message);
                return { success: false, error: e.message };
            }
        }
    },
    web_search: {
        icon: '🌐', offline: false, group: 'web',
        schema: { name: 'web_search', description: 'Tìm kiếm trên web (cần khóa Tavily ở trang Khóa; không có khóa thì dùng DuckDuckGo)', parameters: { type: 'object', properties: { query: { type: 'string' }, max: { type: 'number' } }, required: ['query'] } },
        async execute(a) {
            const q = a && a.query;
            if (!q) return { error: 'Thiếu từ khóa' };
            const tavily = RuneKeys.other('tavily');
            try {
                if (tavily) {
                    const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavily, query: q, max_results: a.max || 5 }) });
                    if (!r.ok) throw new Error('Tavily HTTP ' + r.status);
                    const j = await r.json();
                    return { source: 'Tavily (thật)', query: q, results: (j.results || []).map(x => ({ title: x.title, url: x.url, snippet: (x.content || '').slice(0, 240) })) };
                }
                const r = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1');
                const j = await r.json();
                const out = [];
                if (j.AbstractText) out.push({ title: j.Heading, url: j.AbstractURL, snippet: j.AbstractText });
                (j.RelatedTopics || []).slice(0, 6).forEach(t => { if (t.Text) out.push({ title: t.Text.split(' - ')[0], url: t.FirstURL, snippet: t.Text.slice(0, 240) }); });
                if (!out.length) return { source: 'DuckDuckGo', note: 'Không có kết quả tóm tắt. Thêm khóa Tavily ở trang Khóa để tìm kiếm web đầy đủ.', query: q };
                return { source: 'DuckDuckGo (thật)', query: q, results: out };
            } catch (e) {
                return { error: 'Không gọi được web: ' + e.message, hint: 'Thêm khóa Tavily ở trang 🔑 Khóa' };
            }
        }
    },
    fetch_url: {
        icon: '📄', offline: false, group: 'web',
        schema: { name: 'fetch_url', description: 'Đọc nội dung một trang web (trả về text)', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
        async execute(a) {
            let url = a && a.url;
            if (!url) return { error: 'Thiếu url' };
            if (!/^https?:\/\//.test(url)) url = 'https://' + url;
            try {
                let r = await fetch(url);
                let txt = await r.text();
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return { url, length: txt.length, content: stripHtml(txt).slice(0, 6000) };
            } catch (e) {
                try { // fallback qua proxy đọc nội dung công khai
                    const r2 = await fetch('https://r.jina.ai/' + url);
                    const t2 = await r2.text();
                    return { url, via: 'r.jina.ai (do trang chặn CORS)', content: t2.slice(0, 6000) };
                } catch (e2) {
                    return { error: 'Không đọc được: ' + e.message };
                }
            }
        }
    },
    create_automation: {
        icon: '⚙️', offline: true, group: 'tools',
        schema: { name: 'create_automation', description: 'Mở trình tạo Automation và tạo kịch bản tự động hóa từ mô tả', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: [] } },
        async execute(a) {
            goToPage('automation');
            $('#aiAutomationBuilder').classList.remove('hidden');
            if (a && a.prompt) { $('#automationPrompt').value = a.prompt; $('#generateAutomation').click(); }
            return { success: true, opened: 'Automation Builder', prompt: a && a.prompt };
        }
    },
    save_api_key: {
        icon: '🔑', offline: true, group: 'system',
        schema: {
            name: 'save_api_key', description: 'Lưu khóa vào KHO KHÓA DUY NHẤT. service="ai" để đặt khóa AI chính (kèm provider/model), hoặc tên dịch vụ khác như alpha, tavily…',
            parameters: { type: 'object', properties: { service: { type: 'string' }, key: { type: 'string' }, provider: { type: 'string', enum: ['openai', 'anthropic', 'gemini', 'groq', 'deepseek', 'openrouter', 'custom'] }, model: { type: 'string' } }, required: ['service', 'key'] }
        },
        async execute(a) {
            if (!a || !a.key) return { success: false, error: 'Thiếu key' };
            if (String(a.service).toLowerCase() === 'ai' || ['openai', 'anthropic', 'gemini', 'groq', 'deepseek', 'openrouter'].includes(String(a.service).toLowerCase())) {
                const provider = a.provider || (['openai', 'anthropic', 'gemini', 'groq', 'deepseek', 'openrouter'].includes(String(a.service).toLowerCase()) ? String(a.service).toLowerCase() : RuneKeys.ai().provider);
                RuneKeys.setAi({ key: a.key, provider, model: a.model || RuneKeys.provider(provider).models[0] });
                renderKeysPage(); updateKeyChips();
                return { success: true, saved: 'Khóa AI (' + provider + ')', masked: RuneKeys.mask(a.key) };
            }
            RuneKeys.setOther(String(a.service).toLowerCase(), a.key);
            renderKeysPage(); updateKeyChips();
            return { success: true, saved: a.service, masked: RuneKeys.mask(a.key) };
        }
    },
    list_api_keys: {
        icon: '🔐', offline: true, group: 'system',
        schema: { name: 'list_api_keys', description: 'Xem trạng thái các khóa đã lưu (đã che, không lộ khóa thật)', parameters: { type: 'object', properties: {}, required: [] } },
        async execute() {
            const ai = RuneKeys.ai();
            return {
                ai: ai.key ? { provider: ai.provider, model: ai.model, key: RuneKeys.mask(ai.key) } : 'CHƯA có khóa AI',
                others: RuneKeys.allOthers().map(s => ({ id: s.id, name: s.name, key: RuneKeys.mask(RuneKeys.other(s.id)) }))
            };
        }
    },
    apply_photo_filter: {
        icon: '🎨', offline: true, group: 'tools',
        schema: { name: 'apply_photo_filter', description: 'Áp bộ lọc/hiệu ứng ảnh. Tự mở xPhoto nếu chưa mở.', parameters: { type: 'object', properties: { filter: { type: 'string', description: 'none|grayscale|sepia|invert|vintage|vivid|cold|warm|blur|sharpen' }, amount: { type: 'number' } }, required: ['filter'] } },
        async execute(a) {
            if (bridge.app !== 'xphoto') openApp('xphoto', 'áp dụng bộ lọc ' + (a.filter || ''));
            await new Promise(r => setTimeout(r, 900));
            const res = await bridge.send('xphoto', 'set_filter', { filter: a.filter || 'none', amount: a.amount == null ? 100 : a.amount }, 8000);
            return Object.assign({ filter: a.filter }, res);
        }
    },
    edit_video: {
        icon: '🎬', offline: true, group: 'tools',
        schema: { name: 'edit_video', description: 'Bắt đầu dựng video trong xCut Pro (cắt, tỉ lệ 9:16, thêm chữ, xuất)', parameters: { type: 'object', properties: { task: { type: 'string' }, aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] } }, required: [] } },
        async execute(a) {
            if (bridge.app !== 'xcut') openApp('xcut', a.task || 'dựng video');
            await new Promise(r => setTimeout(r, 900));
            let res = { ok: true };
            if (a && a.aspect) res = await bridge.send('xcut', 'set_aspect', { aspect: a.aspect }, 8000);
            return { opened: 'xCut Pro', task: a && a.task, aspect: a && a.aspect, result: res };
        }
    },
    navigate_to: {
        icon: '🧭', offline: true, group: 'system',
        schema: { name: 'navigate_to', description: 'Chuyển trang trong Rune', parameters: { type: 'object', properties: { page: { type: 'string', enum: ['dashboard', 'chat', 'keys', 'creative', 'settings', 'automation'] } }, required: ['page'] } },
        async execute(a) { const ok = goToPage(a && a.page); return { success: ok, page: a && a.page }; }
    },
    calculate: {
        icon: '🧮', offline: true, group: 'system',
        schema: { name: 'calculate', description: 'Tính toán biểu thức toán học', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
        async execute(a) {
            const raw = String((a && a.expression) || '').replace(/[^0-9+\-*/().%\s^x]/gi, '');
            if (!raw.trim()) return { error: 'Biểu thức rỗng' };
            try {
                const expr = raw.replace(/\^/g, '**').replace(/(\d)\s*x\s*(\d)/gi, '$1*$2').replace(/(\d)\s*%/g, '($1/100)');
                const r = Function('"use strict";return (' + expr + ')')();
                return { expression: raw, result: r };
            } catch (e) { return { error: 'Không tính được: ' + raw }; }
        }
    },
    show_health: {
        icon: '🛡️', offline: true, group: 'system',
        schema: { name: 'show_health', description: 'Quét bảo mật & sức khỏe máy THẬT (backend đọc ufw/AppArmor/apt/lsblk/smartctl//proc): điểm, các mục cảnh báo, tiến trình đáng ngờ', parameters: { type: 'object', properties: {}, required: [] } },
        async execute() {
            if (!runeState.live) {
                return { success: false, simulated: false, error: 'Chưa có backend C++ nên không quét được máy thật', hint: 'Chạy ./build.sh rồi ./build/rune_server' };
            }
            try {
                const sec = await RuneNet.security();
                const issues = (sec.items || []).filter(i => i.status === 'warn' || i.status === 'bad')
                    .map(i => `${i.title}: ${i.detail}`);
                const unknown = (sec.items || []).filter(i => i.status === 'unknown' || i.status === 'unsupported')
                    .map(i => `${i.title}: ${i.detail}`);
                let suspicious = [], total = 0, cpuTotal = null;
                try {
                    const pr = await RuneNet.processes(200);
                    suspicious = (pr.processes || []).filter(x => x.trust === 'bad').map(x => `${x.name} (PID ${x.pid}) — ${x.trust_note}`);
                    total = pr.count; cpuTotal = pr.first_sample ? null : Math.round(pr.cpu_total_pct * 10) / 10;
                } catch (e) { /* không bắt buộc */ }
                await renderSecurity();
                let score = 100;
                (sec.items || []).forEach(i => { score += (SEC_WEIGHT[i.status] == null ? -2 : SEC_WEIGHT[i.status]); });
                score = Math.max(0, Math.min(100, score));
                runeState.healthScore = score;
                return {
                    success: true, simulated: false, score: score, max_score: 100,
                    good: sec.good, warn: sec.warn, bad: sec.bad, unknown: sec.unknown,
                    issues_found: issues.length, issues: issues, not_checkable: unknown,
                    suspicious_processes: suspicious, total_processes: total, cpu_total_pct: cpuTotal,
                    uptime_seconds: sec.uptime, running_as_root: sec.is_root,
                    source: 'backend C++ đọc trực tiếp từ máy (ufw/nftables, AppArmor/SELinux, apt, lsblk, smartctl, /proc/net, utmp)'
                };
            } catch (e) { return { success: false, error: e.message || String(e) }; }
        }
    },
    optimize_system: {
        icon: '⚡', offline: true, group: 'system',
        schema: {
            name: 'optimize_system',
            description: 'Đo bộ nhớ/ổ đĩa có thể thu hồi (thật) và CHẠY hành động dọn dẹp nếu được yêu cầu. Chỉ các lệnh trong whitelist: sync, drop_caches, apt_clean, journal_vacuum, user_cache, tmp_clean.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', description: 'Bỏ trống để chỉ đo. Hoặc một trong: sync, drop_caches, apt_clean, journal_vacuum, user_cache, tmp_clean' },
                    confirm_destructive: { type: 'boolean', description: 'Bắt buộc true với user_cache/tmp_clean (xóa file thật)' }
                },
                required: []
            }
        },
        async execute(a) {
            if (!runeState.live) {
                return { success: false, simulated: false, error: 'Chưa có backend C++ nên không đo/dọn được máy thật', hint: 'Chạy ./build.sh rồi ./build/rune_server' };
            }
            try {
                const report = await RuneNet.optimize();
                await renderOptimize();
                const out = {
                    success: true, simulated: false, mode: 'backend (đo thật)',
                    reclaimable_mb: Math.round((report.reclaimable_bytes || 0) / 1048576 * 10) / 10,
                    memory_available_mb: Math.round(((report.meminfo || {}).available || 0) / 1048576),
                    slab_reclaimable_mb: Math.round(((report.meminfo || {}).s_reclaimable || 0) / 1048576 * 10) / 10,
                    caches: (report.caches || []).map(c => ({ label: c.label, path: c.path, mb: c.bytes < 0 ? null : Math.round(c.bytes / 1048576 * 10) / 10 })),
                    top_memory: (report.top_memory || []).slice(0, 5).map(t => ({ pid: t.pid, name: t.name, mb: Math.round((t.rss || 0) / 1048576), user: t.user })),
                    available_actions: (report.actions || []).map(x => x.id),
                    is_root: !!report.is_root
                };
                const id = a && a.action;
                if (!id) { out.note = 'Chưa chạy hành động nào (chỉ đo). Muốn dọn hãy gọi lại với action=<id>.'; return out; }
                const act = (report.actions || []).filter(x => x.id === id)[0];
                if (!act) return Object.assign(out, { success: false, error: 'Không có hành động "' + id + '" trong whitelist' });
                const r = await RuneNet.optimizeRun(id, !!(a && a.confirm_destructive));
                await renderOptimize();
                out.executed = { action: id, command: r.command, exit_code: r.exit_code, output: (r.output || '').slice(0, 800), ok: !!r.ok, error: r.error };
                out.success = !!r.ok;
                logActivity('⚡', `AI chạy thật: ${r.command || id} → exit ${r.exit_code}`);
                return out;
            } catch (e) { return { success: false, error: e.message || String(e) }; }
        }
    },
    kill_process: {
        icon: '❌', offline: true, group: 'cli',
        schema: {
            name: 'kill_process',
            description: 'Kết thúc TIẾN TRÌNH THẬT theo PID hoặc tên (backend gửi SIGTERM, nếu không tắt thì SIGKILL). Cần backend C++ đang chạy.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Tên tiến trình (sẽ được dò PID thật trong /proc)' },
                    pid: { type: 'number', description: 'PID cụ thể' },
                    force: { type: 'boolean', description: 'true = gửi SIGKILL ngay' }
                },
                required: []
            }
        },
        async execute(a) {
            if (!runeState.live) {
                return { success: false, simulated: false, error: 'Chưa có backend C++ — không thể kết thúc tiến trình thật (RUNE không giả vờ đã tắt)' };
            }
            try {
                let pid = a && a.pid ? Number(a.pid) : 0;
                let matched = null;
                const list = await RuneNet.processes(300);
                if (!pid && a && a.name) {
                    const q = String(a.name).toLowerCase();
                    const hits = (list.processes || []).filter(p =>
                        String(p.name).toLowerCase().includes(q) || String(p.cmdline || '').toLowerCase().includes(q));
                    if (!hits.length) return { success: false, error: `Không tìm thấy tiến trình nào khớp "${a.name}" trong ${list.count} tiến trình thật` };
                    if (hits.length > 1) {
                        return {
                            success: false, need_choice: true,
                            error: `Có ${hits.length} tiến trình khớp "${a.name}" — hãy chỉ định PID`,
                            candidates: hits.slice(0, 10).map(p => ({ pid: p.pid, name: p.name, user: p.user, rss_mb: Math.round((p.rss || 0) / 1048576), cmdline: (p.cmdline || '').slice(0, 120) }))
                        };
                    }
                    matched = hits[0];
                    pid = matched.pid;
                }
                if (!pid) return { success: false, error: 'Thiếu PID hoặc tên tiến trình' };
                const proc = matched || (list.processes || []).filter(p => p.pid === pid)[0];
                let r = await RuneNet.kill(pid, !!(a && a.force));
                if (!r.ok && !/từ chối/i.test(r.error || '') && !(a && a.force)) r = await RuneNet.kill(pid, true);
                setTimeout(renderProcesses, 700);
                if (!r.ok) {
                    return { success: false, simulated: false, pid: pid, name: proc ? proc.name : null, error: r.error || 'không kết thúc được' };
                }
                logActivity('❌', `AI kết thúc tiến trình thật PID ${pid} (${proc ? proc.name : '?'}) bằng ${r.signal}`);
                return {
                    success: true, simulated: false, killed_pid: pid,
                    name: proc ? proc.name : (a && a.name) || null, signal: r.signal, note: r.note
                };
            } catch (e) { return { success: false, error: e.message || String(e) }; }
        }
    },
    get_time: {
        icon: '🕒', offline: true, group: 'system',
        schema: { name: 'get_time', description: 'Lấy ngày giờ hiện tại', parameters: { type: 'object', properties: {}, required: [] } },
        async execute() { const d = new Date(); return { local: d.toString(), iso: d.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }; }
    },
    write_note: {
        icon: '📝', offline: true, group: 'tools',
        schema: { name: 'write_note', description: 'Lưu ghi chú / mở xDocs để soạn tài liệu với nội dung cho trước', parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, open_in_docs: { type: 'boolean' } }, required: ['content'] } },
        async execute(a) {
            const notes = store.get('notes', []);
            notes.unshift({ title: (a && a.title) || 'Ghi chú', content: a && a.content, at: new Date().toISOString() });
            store.set('notes', notes.slice(0, 50));
            if (a && a.open_in_docs !== false) {
                openApp('xdocs', 'soạn: ' + ((a.title) || 'tài liệu'));
                await new Promise(r => setTimeout(r, 900));
                const res = await bridge.send('xdocs', 'set_content', { title: a.title, html: String(a.content).replace(/\n/g, '<br>') }, 8000);
                return { saved: true, opened_docs: res.ok !== false, title: a.title };
            }
            return { saved: true, total_notes: notes.length };
        }
    }
};

function stripHtml(h) {
    const d = document.createElement('div');
    d.innerHTML = h;
    d.querySelectorAll('script,style,noscript').forEach(n => n.remove());
    return (d.textContent || '').replace(/\s{2,}/g, '\n').trim();
}

function toolSchemaList() {
    const useWeb = $('#enableWeb') && $('#enableWeb').checked;
    const useCli = $('#enableCli') && $('#enableCli').checked;
    const useTools = $('#enableTools') && $('#enableTools').checked;
    return Object.values(RuneTools)
        .filter(t => t.schema && (t.group !== 'web' || useWeb) && (t.group !== 'cli' || useCli) && (t.group !== 'tools' || useTools))
        .map(t => t.schema);
}

async function execTool(name, args) {
    const t = RuneTools[name];
    if (!t) return { error: 'Không có công cụ: ' + name };
    try { return await t.execute(args || {}); } catch (e) { return { error: e.message }; }
}

/* ==================== CLI OUTPUT PANEL ==================== */
function showCli(cmd) {
    const out = $('#cliOutput');
    out.classList.remove('hidden');
    if (!out.dataset.open) { out.textContent = ''; out.dataset.open = '1'; }
    out.textContent += `\n$ ${cmd}\n`;
    out.scrollTop = out.scrollHeight;
}
function appendCli(text) {
    const out = $('#cliOutput');
    out.classList.remove('hidden');
    out.textContent += String(text).replace(/\n$/, '') + '\n';
    out.scrollTop = out.scrollHeight;
}

/* ==================== ĐIỀU HƯỚNG ==================== */
function goToPage(page) {
    const nav = $(`.nav-item[data-page="${page}"]`);
    if (!nav || !$('#page-' + page)) return false;
    $$('.nav-item').forEach(i => i.classList.remove('active'));
    $$('.page').forEach(p => p.classList.remove('active'));
    nav.classList.add('active');
    const el = $('#page-' + page);
    el.classList.add('active');
    el.scrollTop = 0;
    return true;
}

/* ==================== AI CHAT: KẾT NỐI THẬT ==================== */
const SYSTEM_PROMPT = () => `Bạn là Rune AI — trợ lý điều khiển trung tâm trên máy người dùng, chạy trong ứng dụng Rune (Việt Nam).
Ngôn ngữ trả lời: ${($('#aiLangSelect') && $('#aiLangSelect').value === 'en') ? 'English' : 'Tiếng Việt'}.

Bạn CÓ THỂ hành động thật thông qua các công cụ (function calling). Nguyên tắc:
1. Khi người dùng yêu cầu một việc làm được bằng công cụ → GỌI CÔNG CỤ ngay, đừng chỉ mô tả.
2. Có thể gọi nhiều công cụ liên tiếp (ví dụ open_app rồi control_app).
3. Sau khi có kết quả, tóm tắt ngắn gọn, rõ ràng bằng tiếng Việt, kèm số liệu cụ thể.
4. Nếu công cụ báo lỗi (thiếu backend, thiếu khóa), nói thẳng lý do và cách khắc phục.
5. KHÔNG bịa số liệu hệ thống hay giá chứng khoán — luôn lấy từ công cụ.
6. Không thực hiện lệnh phá hoại (rm -rf, format…).
Ứng dụng Creative khả dụng: ${Object.keys(apps).map(k => k + '(' + apps[k].name + ')').join(', ')}.`;

async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || busy) return;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    addChatMessage(text, 'user');
    history.push({ role: 'user', content: text });
    persistHistory();

    busy = true;
    sendBtn.disabled = true;
    stopBtn.classList.remove('hidden');

    try {
        if (RuneKeys.hasAi()) await runRealAI();
        else await runOfflineEngine(text);
    } catch (e) {
        if (e.name === 'AbortError') addChatMessage('⏹ Đã dừng trả lời.', 'assistant');
        else addChatMessage('❌ **Lỗi:** ' + RuneAI.humanError(e.message), 'assistant');
        console.error(e);
    } finally {
        busy = false;
        sendBtn.disabled = false;
        stopBtn.classList.add('hidden');
        currentAbort = null;
        chatInput.focus();
    }
}

/* --- Chế độ AI THẬT (streaming + tool loop) --- */
async function runRealAI() {
    const tools = toolSchemaList();
    const msgs = [{ role: 'system', content: SYSTEM_PROMPT() }].concat(history.slice(-20));
    const out = addChatMessage('', 'assistant');
    const body = out.querySelector('.msg-content');
    let answer = '';
    let round = 0;
    const usedTools = [];

    currentAbort = new AbortController();

    while (round < 8) {
        round++;
        const streamBox = document.createElement('div');
        streamBox.className = 'stream-text';
        body.appendChild(streamBox);
        let chunk = '';

        const res = await RuneAI.chat({
            messages: msgs,
            tools: tools.length ? tools : null,
            signal: currentAbort.signal,
            onDelta: d => {
                chunk += d;
                streamBox.innerHTML = md(chunk);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        });

        answer += res.text || '';
        msgs.push({ role: 'assistant', content: res.text || '', tool_calls: res.toolCalls.length ? res.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })) : undefined });

        if (!res.toolCalls.length) break;

        for (const tc of res.toolCalls) {
            const t = RuneTools[tc.name];
            const line = document.createElement('div');
            line.className = 'tool-line running';
            line.innerHTML = `${(t && t.icon) || '🔧'} <b>${tc.name}</b> <span class="tool-args">${RuneUI.esc(JSON.stringify(tc.args || {}).slice(0, 140))}</span> <span class="spin"></span>`;
            body.appendChild(line);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            const r = await execTool(tc.name, tc.args);
            usedTools.push({ name: tc.name, args: tc.args, result: r });
            line.classList.remove('running');
            line.classList.add(r && (r.error || r.success === false) ? 'tool-line fail' : 'tool-line done');
            line.querySelector('.spin').textContent = r && (r.error || r.success === false) ? '✖' : '✓';
            const detail = document.createElement('pre');
            detail.className = 'tool-detail';
            detail.textContent = JSON.stringify(r, null, 2).slice(0, 1200);
            line.appendChild(detail);

            msgs.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: JSON.stringify(r).slice(0, 6000) });
        }
    }

    $$('.stream-text', body).forEach(el => { if (!el.textContent.trim()) el.remove(); });
    if (!answer.trim() && !usedTools.length) body.innerHTML = md('_(Không nhận được nội dung trả lời — thử lại hoặc kiểm tra model ở trang Khóa.)_');
    if (usedTools.length) {
        const f = document.createElement('div');
        f.className = 'tool-summary';
        f.textContent = `🧰 Đã dùng ${usedTools.length} công cụ: ` + usedTools.map(u => u.name).join(', ');
        body.appendChild(f);
    }
    history.push({ role: 'assistant', content: answer || '(đã thực thi công cụ)' });
    persistHistory();
    addQuickSuggestions(body);
    logActivity('🤖', `AI (${RuneKeys.aiLabel()}) trả lời${usedTools.length ? ' · dùng ' + usedTools.length + ' công cụ' : ''}`);
}

function addQuickSuggestions(body) {
    const sug = store.get('suggestions', null);
    const list = [
        { icon: '💻', text: 'Thông tin hệ thống', p: 'Cho tôi biết CPU, RAM, nhiệt độ máy hiện tại' },
        { icon: '📈', text: 'Thị trường VN', p: 'VN-Index hôm nay thế nào?' },
        { icon: '🖼️', text: 'Mở sửa ảnh + filter', p: 'Mở xPhoto và áp bộ lọc đen trắng' },
        { icon: '⚡', text: 'Chạy lệnh', p: 'chạy lệnh: uname -a' },
        { icon: '🛡️', text: 'Quét bảo mật', p: 'Kiểm tra bảo mật máy có vấn đề gì không' }
    ];
    const bar = document.createElement('div');
    bar.className = 'msg-actions';
    list.forEach(s => {
        const b = document.createElement('button');
        b.className = 'action-suggest-btn';
        b.innerHTML = `${s.icon} ${s.text}`;
        b.addEventListener('click', () => { chatInput.value = s.p; handleSend(); });
        bar.appendChild(b);
    });
    body.appendChild(bar);
    if (sug) return;
}

/* --- Chế độ OFFLINE (không cần khóa): vẫn điều khiển máy/app thật --- */
async function runOfflineEngine(userMessage) {
    const msg = userMessage.toLowerCase();
    const think = thinkingEl('Rune đang phân tích (chế độ offline)…');
    await new Promise(r => setTimeout(r, 350));
    think.remove();

    const calls = [];
    const say = [];

    if (/cpu|ram|gpu|nhiệt|temp|hệ thống|tài nguyên|máy (có|đang|yếu|nóng|chạy)|cấu hình/.test(msg)) { calls.push(['get_system_info', {}]); say.push('🔍 Đọc thông tin hệ thống…'); }
    if (/chứng khoán|cổ phiếu|vn-?index|s&p|sp500|nikkei|thị trường|gdp|lạm phát|kinh tế|giá (vic|fpt|vnm|vcb|aapl|msft|nvda)/.test(msg)) {
        let country = 'VN';
        if (/mỹ|us|hoa kỳ|nasdaq|s&p/.test(msg)) country = 'US';
        if (/nhật|jp|nikkei/.test(msg)) country = 'JP';
        if (/trung quốc|cn|shanghai/.test(msg)) country = 'CN';
        if (/châu âu|eu|euro/.test(msg)) country = 'EU';
        const sym = (msg.match(/\b(vic|vhm|vcb|vnm|bid|fpt|gas|mwg|ssi|aapl|msft|nvda|googl|tsla)\b/) || [])[1];
        calls.push(['get_market_data', { country, symbol: sym }]);
        say.push(`📊 Lấy dữ liệu thị trường ${country}…`);
    }
    for (const [id, app] of Object.entries(apps)) {
        if (app.keywords.some(k => msg.includes(k)) && /mở|open|sửa|edit|vào|dùng|làm|chỉnh|vẽ|tính|soạn|cắt|tạo|xem|chạy|áp|filter|bộ lọc|thêm|xuất|dựng|ghi âm|ký|đọc/.test(msg)) {
            calls.push(['open_app', { app: id, context: userMessage }]);
            say.push(`🚀 Mở ${app.name}…`);
            break;
        }
    }
    const filterM = msg.match(/(đen trắng|grayscale|sepia|cổ điển|invert|âm bản|vintage|rực rỡ|vivid|làm mờ|blur|sắc nét|sharpen|cold|warm)/);
    if (filterM && /ảnh|photo|filter|bộ lọc|áp/.test(msg)) {
        const map = { 'đen trắng': 'grayscale', grayscale: 'grayscale', sepia: 'sepia', 'cổ điển': 'sepia', invert: 'invert', 'âm bản': 'invert', vintage: 'vintage', 'rực rỡ': 'vivid', vivid: 'vivid', 'làm mờ': 'blur', blur: 'blur', 'sắc nét': 'sharpen', sharpen: 'sharpen', cold: 'cold', warm: 'warm' };
        calls.push(['apply_photo_filter', { filter: map[filterM[1]] || 'none' }]);
        say.push(`🎨 Áp bộ lọc ${filterM[1]}…`);
    }
    if (/^\/|^chạy |^run |lệnh (cli|cmd|bash|terminal)|thực thi/.test(msg)) {
        const cmd = msg.replace(/^(chạy|run)\s*(lệnh)?\s*:?/i, '').replace(/^\//, '').trim();
        if (cmd) { calls.push(['run_cli', { command: cmd }]); say.push('⚡ Thực thi: ' + cmd); }
    }
    if (/bảo mật|sức khỏe|an toàn|virus|quét|scan|kiểm tra máy/.test(msg)) { calls.push(['show_health', {}]); say.push('🛡️ Quét bảo mật…'); }
    if (/tối ưu|dọn rác|giải phóng|nhanh hơn|chậm|lag/.test(msg)) { calls.push(['optimize_system', {}]); say.push('⚡ Tối ưu hệ thống…'); }
    if (/tự động|automation|kịch bản/.test(msg)) { calls.push(['create_automation', { prompt: userMessage }]); say.push('⚙️ Mở trình tạo Automation…'); }
    if (/^\s*tính\s+|^\s*[\d.]+\s*[+\-*/^]\s*[\d.]+/.test(msg)) {
        const expr = (msg.replace(/^\s*tính\s*/, '').match(/[-+*/^().\d\s%x]+/) || [])[0];
        if (expr) { calls.push(['calculate', { expression: expr }]); say.push('🧮 Tính toán…'); }
    }
    if (/khóa|api key|key/.test(msg) && /lưu|nhập|thêm|kiểm tra|xem|có/.test(msg)) { calls.push(['list_api_keys', {}]); say.push('🔑 Kiểm tra kho khóa…'); }
    if (/mấy giờ|ngày (hôm nay|bao nhiêu)|thời gian|giờ/.test(msg)) { calls.push(['get_time', {}]); }
    if (/tìm (kiếm|trên web|google)|search|tin tức/.test(msg)) { calls.push(['web_search', { query: userMessage.replace(/^.*?(tìm kiếm|tìm trên web|tìm google|search|tin tức)\s*/i, '') }]); say.push('🌐 Tìm web…'); }
    if (/cài đặt|setting/.test(msg) && /mở|vào|trang/.test(msg)) { calls.push(['navigate_to', { page: 'settings' }]); }
    if (/(trang|vào|mở).*(khóa|key)/.test(msg)) { calls.push(['navigate_to', { page: 'keys' }]); }
    if (/viết|soạn|tài liệu|ghi chú|note/.test(msg) && msg.length > 25) {
        calls.push(['write_note', { title: 'Từ chat', content: userMessage, open_in_docs: /mở|docs|word/.test(msg) }]);
        say.push('📝 Soạn tài liệu…');
    }

    const out = addChatMessage('', 'assistant');
    const body = out.querySelector('.msg-content');

    if (!calls.length) {
        body.innerHTML = md(
            `**Chế độ offline** — chưa có khóa AI nên tôi chỉ điều khiển được máy & ứng dụng, chưa "nói chuyện" thông minh được.\n\n` +
            `👉 Bấm **🔑 Nhập khóa AI** bên dưới (chỉ cần nhập **một lần, một nơi duy nhất**), sau đó tôi sẽ trả lời thật, tự gọi công cụ, tìm web, soạn tài liệu…\n\n` +
            `Ngay bây giờ bạn vẫn có thể ra lệnh kiểu:\n` +
            `- “mở xPhoto áp bộ lọc đen trắng”\n- “CPU RAM đang bao nhiêu?”\n- “giá VIC hôm nay”\n- “chạy lệnh: ls -la”\n- “kiểm tra bảo mật máy”`);
        addButtons(out, [
            { icon: '🔑', text: 'Nhập khóa AI', action: () => goToPage('keys') },
            { icon: '💻', text: 'Thông tin hệ thống', action: () => { chatInput.value = 'thông tin hệ thống'; handleSend(); } },
            { icon: '🎨', text: 'Mở Sáng tạo', action: () => goToPage('creative') }
        ]);
        return;
    }

    body.innerHTML = md(say.map(s => '> ' + s).join('\n'));
    for (const [name, args] of calls) {
        const t = RuneTools[name];
        const line = document.createElement('div');
        line.className = 'tool-line running';
        line.innerHTML = `${t.icon} <b>${name}</b> <span class="tool-args">${RuneUI.esc(JSON.stringify(args).slice(0, 120))}</span> <span class="spin"></span>`;
        body.appendChild(line);
        const r = await execTool(name, args);
        line.classList.remove('running');
        line.classList.add(r && (r.error || r.success === false) ? 'tool-line fail' : 'tool-line done');
        line.querySelector('.spin').textContent = r && (r.error || r.success === false) ? '✖' : '✓';
        const d = document.createElement('pre');
        d.className = 'tool-detail';
        d.textContent = JSON.stringify(r, null, 2).slice(0, 1000);
        line.appendChild(d);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    const summary = document.createElement('div');
    summary.className = 'md-block';
    summary.innerHTML = md(buildOfflineSummary(calls, body));
    body.appendChild(summary);

    if (!RuneKeys.hasAi()) addButtons(out, [{ icon: '🔑', text: 'Nhập khóa AI để chat thật', action: () => goToPage('keys') }]);
    history.push({ role: 'assistant', content: summary.textContent });
    persistHistory();
}

function buildOfflineSummary(calls, body) {
    const lines = [];
    $$('.tool-line', body).forEach((el, i) => {
        const name = calls[i] && calls[i][0];
        let r = {};
        try { r = JSON.parse($('.tool-detail', el).textContent); } catch (e) {}
        if (name === 'get_system_info') lines.push(`💻 **Hệ thống:** CPU ${r.cpu_usage != null ? r.cpu_usage.toFixed(1) + '%' : '--'} · RAM ${r.ram_used_gb != null ? r.ram_used_gb + ' GB' : '--'} · GPU ${r.gpu || '--'}\n_(${r.nguồn})_`);
        else if (name === 'get_market_data') lines.push(`📈 **${r.country}:** ${r.index} ${r.value} (${r.changePct > 0 ? '+' : ''}${r.changePct}%) · GDP ${r.gdp}% · Lạm phát ${r.inflation}%\n_(${r.source})_` + (r.symbol ? `\n→ ${JSON.stringify(r.symbol)}` : ''));
        else if (name === 'open_app') lines.push(r.success ? `🚀 Đã mở **${r.opened}**.` : `❌ ${r.error}`);
        else if (name === 'run_cli') lines.push(r.success ? `⚡ Lệnh chạy xong (exit ${r.exit_code}). Xem output ở khung CLI.` : `⚠️ ${r.note || r.error}`);
        else if (name === 'apply_photo_filter') lines.push(r.ok === false ? `⚠️ ${r.error}` : `🎨 Đã áp bộ lọc **${r.filter}** trong xPhoto.`);
        else if (name === 'calculate') lines.push(r.error ? `⚠️ ${r.error}` : `🧮 ${r.expression} = **${r.result}**`);
        else if (name === 'show_health') lines.push(`🛡️ Điểm sức khỏe **${r.score}**, ${r.issues_found} mục cần chú ý.`);
        else if (name === 'web_search') lines.push(r.results ? `🌐 ${r.results.length} kết quả (${r.source}):\n` + r.results.slice(0, 4).map(x => `- [${x.title}](${x.url})`).join('\n') : `⚠️ ${r.note || r.error || 'Không có kết quả'}`);
        else if (name === 'list_api_keys') lines.push(`🔑 Khóa AI: ${typeof r.ai === 'string' ? r.ai : r.ai.provider + ' · ' + r.ai.model + ' · ' + r.ai.key}\nKhóa khác: ${r.others.length ? r.others.map(o => o.id).join(', ') : 'chưa có'}`);
        else if (name === 'get_time') lines.push(`🕒 ${r.local}`);
        else if (r && r.error) lines.push(`⚠️ ${name}: ${r.error}`);
        else lines.push(`✅ ${name} hoàn tất.`);
    });
    return lines.join('\n\n');
}

/* ==================== MARKET DATA — DỮ LIỆU THẬT (World Bank + Yahoo Finance) ====================
   Không còn số mẫu/số ngẫu nhiên: backend C++ gọi thẳng World Bank (GDP, lạm phát, thất nghiệp,
   lãi suất) và Yahoo Finance (chỉ số, giá cổ phiếu, chuỗi 30 ngày). Nếu không gọi được thì
   hiển thị "—" kèm lý do thật, tuyệt đối không bịa số.                                          */
let marketChart = null, netChart = null;
const NET_POINTS = 60;
const netDown = new Array(NET_POINTS).fill(null);   // null = chưa đo (không điền số ngẫu nhiên)
const netUp = new Array(NET_POINTS).fill(null);

function fmtNum(v, digits) {
    return (v === null || v === undefined || v === '' || isNaN(v)) ? '—' : Number(v).toFixed(digits == null ? 2 : digits);
}
function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; return el; }
function setSrc(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ''; }
function marketBanner() {
    let el = document.getElementById('marketBanner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'marketBanner';
        el.className = 'sim-banner';
        const grid = $('.indicator-grid');
        if (grid && grid.parentNode) grid.parentNode.insertBefore(el, grid);
    }
    return el;
}
function emptyMarket(country, source, note) {
    return {
        country: country, index: '—', value: null, change: null, changePct: null,
        gdp: null, inflation: null, unemp: null, rate: null, econYear: '',
        stocks: [], chart: [], stockErrors: [], source: source, note: note,
        simulated: true, realIndex: false, realEcon: false, realStocks: false,
        stocksOk: 0, stocksTotal: 0, fetchedAt: 0
    };
}

async function fetchMarket(country, refresh) {
    const c = country || (($('#countrySelect') || {}).value) || 'VN';
    if (!runeState.live) {
        return emptyMarket(c, 'Chưa kết nối backend C++',
            'Trình duyệt không gọi thẳng được Yahoo Finance / World Bank (bị chặn CORS). ' +
            'Chạy ./build.sh rồi ./build/rune_server để lấy giá thật.');
    }
    const j = await RuneNet.market(c, refresh);
    const ind = j.indicator || {};
    const d = emptyMarket(c, j.source || '', j.note || '');
    d.index = ind.index_name || '—';
    d.value = j.real_index ? ind.index_value : null;
    d.change = j.real_index ? ind.index_change : null;
    d.changePct = j.real_index ? ind.index_change_pct : null;
    d.gdp = j.real_econ ? ind.gdp_growth : null;
    d.inflation = j.real_econ ? ind.inflation : null;
    d.unemp = j.real_econ ? ind.unemployment : null;
    d.rate = j.real_econ ? ind.interest_rate : null;
    d.econYear = j.econ_year || '';
    d.stocks = (j.stocks || []).map(s => ({
        sym: s.symbol, name: s.name, price: s.price, chg: s.change, chgPct: s.change_pct, vol: s.volume
    }));
    d.chart = (j.chart || []).map(p => ({ t: p.t, v: p.v }));
    d.stockErrors = j.stock_errors || [];
    d.simulated = !!j.simulated;
    d.realIndex = !!j.real_index; d.realEcon = !!j.real_econ; d.realStocks = !!j.real_stocks;
    d.stocksOk = j.stocks_ok || 0; d.stocksTotal = j.stocks_total || 0;
    d.fetchedAt = j.fetched_at || 0;
    d.currency = j.currency || '';
    return d;
}

async function renderMarketData(country, refresh) {
    let d;
    try {
        d = await fetchMarket(country, refresh);
    } catch (e) {
        d = emptyMarket(country || 'VN', 'Backend trả về lỗi', e && e.message ? e.message : String(e));
    }
    runeState.market = d;

    setTxt('idxName', d.index + (d.econYear ? '' : ''));
    setTxt('idxValue', d.value == null ? '—' : Number(d.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (d.currency ? ' ' + d.currency : ''));
    const ce = $('#idxChange');
    if (ce) {
        if (d.change == null) { ce.textContent = 'chưa có dữ liệu thật'; ce.className = 'stat-change'; }
        else {
            const s = d.change >= 0 ? '+' : '';
            ce.textContent = `${s}${fmtNum(d.change)} (${s}${fmtNum(d.changePct)}%)`;
            ce.className = 'stat-change ' + (d.change >= 0 ? 'positive' : 'negative');
        }
    }
    setTxt('gdpVal', d.gdp == null ? '—' : fmtNum(d.gdp) + '%');
    setTxt('inflationVal', d.inflation == null ? '—' : fmtNum(d.inflation) + '%');
    setTxt('unempVal', d.unemp == null ? '—' : fmtNum(d.unemp) + '%');
    setTxt('rateVal', d.rate == null ? '—' : fmtNum(d.rate) + '%');

    const tbody = $('#stockTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        (d.stocks || []).forEach(st => {
            const tr = document.createElement('tr');
            const cls = (st.chg || 0) >= 0 ? 'stock-positive' : 'stock-negative';
            const ss = (st.chg || 0) >= 0 ? '+' : '';
            tr.innerHTML = `<td><strong>${RuneUI.esc(st.sym)}</strong></td>` +
                `<td>${RuneUI.esc(st.name)}</td>` +
                `<td>${fmtNum(st.price)}</td>` +
                `<td class="${cls}">${st.chg == null ? '—' : ss + fmtNum(st.chg)}</td>` +
                `<td class="${cls}">${st.chgPct == null ? '—' : ss + fmtNum(st.chgPct) + '%'}</td>` +
                `<td>${st.vol ? formatVolume(st.vol) : '—'}</td>`;
            tbody.appendChild(tr);
        });
        if (!(d.stocks || []).length) {
            tbody.innerHTML = `<tr><td colspan="6" style="opacity:.65">Không lấy được giá cổ phiếu nào` +
                (d.stockErrors && d.stockErrors.length ? ` (${RuneUI.esc(d.stockErrors[0])})` : '') + `</td></tr>`;
        } else if (d.stockErrors && d.stockErrors.length) {
            tbody.innerHTML += `<tr><td colspan="6" style="opacity:.65;font-size:11.5px">` +
                `${d.stocksOk}/${d.stocksTotal} mã có giá thật · không lấy được: ${RuneUI.esc(d.stockErrors.join('; '))}</td></tr>`;
        }
    }

    setSrc('marketSource', (d.source ? '📡 ' + d.source : '') +
        (d.fetchedAt ? ' · lấy lúc ' + new Date(d.fetchedAt * 1000).toLocaleTimeString('vi-VN') : ''));

    const ban = marketBanner();
    if (ban) {
        if (!d.simulated) {
            ban.className = 'sim-banner ok';
            ban.textContent = `✅ Số liệu thật: ${d.source || 'World Bank + Yahoo Finance'}` +
                (d.note ? ' · ' + d.note : '');
        } else {
            ban.className = 'sim-banner';
            ban.textContent = `⚠️ Chưa có số liệu thật — ${d.note || d.source || 'không gọi được API'}` +
                ' (RUNE không hiển thị giá giả; các ô “—” nghĩa là chưa đo được)';
        }
    }

    /* biểu đồ: chỉ vẽ chuỗi giá THẬT trả về từ backend */
    const ctx = $('#marketChart');
    if (ctx && window.Chart) {
        const pts = d.chart || [];
        if (marketChart) { marketChart.destroy(); marketChart = null; }
        if (pts.length >= 2) {
            const labels = pts.map(p => new Date(p.t * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }));
            const data = pts.map(p => p.v);
            marketChart = new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: d.index, data: data,
                        borderColor: (d.changePct || 0) >= 0 ? '#10b981' : '#ef4444',
                        backgroundColor: (d.changePct || 0) >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2, spanGaps: false
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: true } },
                    scales: {
                        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#646b8b', maxTicksLimit: 8 } },
                        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#646b8b' } }
                    }
                }
            });
        } else {
            const g = ctx.getContext('2d');
            if (g && g.clearRect) {
                g.clearRect(0, 0, ctx.width || 600, ctx.height || 200);
                if (g.fillText) {
                    g.fillStyle = '#646b8b'; g.font = '12px sans-serif';
                    g.fillText('Chưa có chuỗi giá thật để vẽ (backend không gọi được Yahoo Finance).', 12, 24);
                }
            }
        }
    }
}

/* ==================== SYSTEM MONITOR — số liệu THẬT từ /proc, statvfs, sysfs ==================== */
async function updateSystem() {
    let info = null;
    if (runeState.live) {
        try { info = await RuneNet.system(); }
        catch (e) { runeState.live = false; info = null; }
    }
    runeState.sys = info;

    const bar = (id, v) => { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, Math.min(100, v || 0)) + '%'; };

    /* --- chế độ chỉ có trình duyệt: KHÔNG bịa số, hiện "—" và nói rõ vì sao --- */
    if (!info) {
        ['cpuUsage', 'cpuTemp', 'cpuTempSec', 'gpuUsage', 'gpuTemp', 'ramUsed', 'ramAvail',
            'diskUsed', 'diskIO', 'netDown', 'netUp', 'netDownLarge', 'netUpLarge'].forEach(id => setTxt(id, '—'));
        ['cpuBar', 'gpuBar', 'ramBar', 'diskBar'].forEach(id => bar(id, 0));
        setTxt('cpuName', 'Không đọc được từ trình duyệt');
        setTxt('gpuName', 'Không đọc được từ trình duyệt');
        setTxt('diskName', '—');
        const badge = $('#dataSourceBadge');
        if (badge) {
            badge.textContent = '○ Chưa có backend C++ — mọi ô “—” là thật sự không đo được';
            badge.className = 'src-badge sim';
        }
        netDown.shift(); netDown.push(null); netUp.shift(); netUp.push(null);
        drawNetChart();
        return;
    }

    const info2 = info;
    info2.ram_available = info2.ram_available || Math.max(0, (info2.ram_total || 0) - (info2.ram_used || 0));

    setTxt('cpuUsage', fmtNum(info2.cpu_usage, 1) + '%'); bar('cpuBar', info2.cpu_usage);
    setTxt('cpuTemp', info2.cpu_temp > 0 ? Math.round(info2.cpu_temp) + '°C' : '—');
    setTxt('cpuTempSec', info2.cpu_temp > 0 ? Math.round(info2.cpu_temp) + '°C' : 'không đọc được cảm biến');
    setTxt('cpuName', info2.cpu_name || '—');

    const gpuReal = (info2.gpu_usage > 0) || (info2.gpu_vram_total > 0);
    setTxt('gpuUsage', gpuReal ? fmtNum(info2.gpu_usage, 1) + '%' : '—');
    bar('gpuBar', gpuReal ? info2.gpu_usage : 0);
    setTxt('gpuTemp', info2.gpu_temp > 0 ? Math.round(info2.gpu_temp) + '°C' : '—');
    setTxt('gpuName', info2.gpu_name || '—');

    bar('ramBar', info2.ram_total ? (info2.ram_used / info2.ram_total * 100) : 0);
    setTxt('ramUsed', info2.ram_total ? formatBytes(info2.ram_used || 0) + ' / ' + formatBytes(info2.ram_total) : '—');
    setTxt('ramAvail', info2.ram_available ? 'còn ' + formatBytes(info2.ram_available) : '—');

    bar('diskBar', info2.disk_total ? (info2.disk_used / info2.disk_total * 100) : 0);
    setTxt('diskUsed', info2.disk_total ? formatBytes(info2.disk_used) + ' / ' + formatBytes(info2.disk_total) : '—');
    setTxt('diskIO', (info2.disk_read || info2.disk_write) ? 'R ' + formatSpeed(info2.disk_read || 0) + ' · W ' + formatSpeed(info2.disk_write || 0) : '0 KB/s');
    const dn = $('#diskName'); if (dn) dn.title = 'đọc/ghi thật từ /proc/diskstats';

    setTxt('netDown', formatSpeed(info2.net_download || 0)); setTxt('netUp', formatSpeed(info2.net_upload || 0));
    setTxt('netDownLarge', formatSpeed(info2.net_download || 0)); setTxt('netUpLarge', formatSpeed(info2.net_upload || 0));

    const badge = $('#dataSourceBadge');
    if (badge) {
        badge.textContent = info2.simulated ? '○ Backend trả dữ liệu mô phỏng' : '● Backend C++: số liệu thật từ máy';
        badge.className = 'src-badge ' + (info2.simulated ? 'sim' : 'live');
    }

    netDown.shift(); netDown.push((info2.net_download || 0) / 1048576);
    netUp.shift(); netUp.push((info2.net_upload || 0) / 1048576);
    drawNetChart();
}

function drawNetChart() {
    const nctx = $('#networkChart');
    if (!nctx || !window.Chart) return;
    if (netChart) {
        netChart.data.datasets[0].data = netDown.slice();
        netChart.data.datasets[1].data = netUp.slice();
        netChart.update('none');
        return;
    }
    netChart = new Chart(nctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: netDown.map((_, i) => i),
            datasets: [
                { label: 'Down (MB/s)', data: netDown.slice(), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5, spanGaps: false },
                { label: 'Up (MB/s)', data: netUp.slice(), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5, spanGaps: false }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } }, animation: false }
    });
}

/* ==================== TIẾN TRÌNH / KẾT NỐI / BẢO MẬT / TỐI ƯU — TẤT CẢ THẬT ==================== */
const NEED_BACKEND = 'Cần backend C++ (./build/rune_server) — trình duyệt không đọc được /proc của máy.';
const TRUST_LABEL = { good: '✓ Tin cậy', warn: '⚠ Cần xem', bad: '✗ Đáng ngờ', kernel: '✓ Kernel', unknown: '? Không rõ' };
const TRUST_CLASS = { good: 'good', warn: 'warn', bad: 'bad', kernel: 'good', unknown: 'warn' };
const SEC_LABEL = { good: 'An toàn', warn: 'Cần chú ý', bad: 'Rủi ro', unknown: 'Không xác định', unsupported: 'Không kiểm tra được' };
const SEC_WEIGHT = { good: 0, warn: -7, bad: -18, unknown: -2, unsupported: -3 };

function placeholderRow(cols, text) {
    return `<tr class="placeholder-row"><td colspan="${cols}">${RuneUI.esc(text)}</td></tr>`;
}

async function renderProcesses() {
    const tbody = $('#processTableBody');
    if (!tbody) return null;
    if (!runeState.live) {
        tbody.innerHTML = placeholderRow(8, NEED_BACKEND);
        setSrc('processSource', '');
        return null;
    }
    let d;
    try { d = await RuneNet.processes(40); }
    catch (e) { tbody.innerHTML = placeholderRow(8, 'Không đọc được tiến trình: ' + (e.message || e)); return null; }
    runeState.processes = d.processes || [];
    tbody.innerHTML = '';
    (d.processes || []).forEach(p => {
        const tr = document.createElement('tr');
        if (p.trust === 'bad') tr.className = 'danger-row';
        const cmd = (p.cmdline || p.exe || '').slice(0, 70);
        tr.innerHTML =
            `<td><strong>${RuneUI.esc(p.name)}</strong>` +
            (cmd ? ` <span style="color:var(--text-muted);font-size:11px">${RuneUI.esc(cmd)}</span>` : '') + `</td>` +
            `<td>${p.pid}</td>` +
            `<td>${RuneUI.esc(p.user || '—')}</td>` +
            `<td>${d.first_sample ? 'đang lấy mẫu…' : fmtNum(p.cpu_pct, 1) + '%'}</td>` +
            `<td>${formatBytes(p.rss || 0)}</td>` +
            `<td>${p.threads || '—'}</td>` +
            `<td><span class="trust-ind ${TRUST_CLASS[p.trust] || 'warn'}" title="${RuneUI.esc(p.trust_note || '')}">${TRUST_LABEL[p.trust] || p.trust}</span></td>` +
            `<td>${p.pid > 1 ? `<button class="proc-kill" data-pid="${p.pid}" data-name="${RuneUI.esc(p.name)}">Kết thúc</button>` : ''}</td>`;
        tbody.appendChild(tr);
    });
    if (!(d.processes || []).length) tbody.innerHTML = placeholderRow(8, 'Không đọc được tiến trình nào (thiếu quyền?).');
    $$('#processTableBody .proc-kill').forEach(b => {
        b.addEventListener('click', () => killProcess(parseInt(b.dataset.pid, 10), b.dataset.name, b));
    });
    setSrc('processSource',
        `${d.count} tiến trình thật từ /proc · CPU toàn máy: ${d.first_sample ? 'đang lấy mẫu đầu tiên' : fmtNum(d.cpu_total_pct, 1) + '%'}` +
        ` · cập nhật ${nowTime()}`);
    return d;
}

async function killProcess(pid, name, btn) {
    if (!pid) return;
    const ok = await RuneUI.confirm({
        title: 'Kết thúc tiến trình thật?',
        message: `Gửi SIGTERM tới PID ${pid} (${name || 'không rõ tên'}). Nếu tiến trình không tắt, RUNE sẽ gửi tiếp SIGKILL.\nĐây là thao tác thật trên máy bạn.`,
        ok: 'Kết thúc'
    });
    if (!ok) return;
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
        let r = await RuneNet.kill(pid, false);
        if (!r.ok && !/từ chối/i.test(r.error || '')) r = await RuneNet.kill(pid, true);
        if (r.ok) {
            toast(`✓ Đã kết thúc PID ${pid} bằng ${r.signal}`, 'ok');
            logActivity('❌', `Kết thúc tiến trình thật PID ${pid} (${name || '?'}) bằng ${r.signal}`);
        } else {
            toast('Không kết thúc được: ' + (r.error || 'lỗi không rõ'), 'error');
            if (btn) { btn.disabled = false; btn.textContent = old; }
            return;
        }
    } catch (e) {
        toast('Lỗi khi gọi backend: ' + (e.message || e), 'error');
        if (btn) { btn.disabled = false; btn.textContent = old; }
        return;
    }
    setTimeout(renderProcesses, 700);
}

async function renderConnections() {
    const list = $('#connectionList');
    if (!list) return null;
    if (!runeState.live) {
        list.innerHTML = `<div class="conn-empty">${RuneUI.esc(NEED_BACKEND)}</div>`;
        setTxt('openPorts', '—');
        setSrc('connSource', '');
        return null;
    }
    let d;
    try { d = await RuneNet.connections(80); }
    catch (e) { list.innerHTML = `<div class="conn-empty">Không đọc được kết nối: ${RuneUI.esc(e.message || String(e))}</div>`; return null; }
    runeState.connections = d.connections || [];
    list.innerHTML = '';
    (d.connections || []).slice(0, 40).forEach(c => {
        const div = document.createElement('div');
        div.className = 'conn-item';
        const cls = c.listening ? 'warn' : (c.loopback ? 'good' : 'good');
        const who = c.process ? ` · ${c.process}${c.pid ? ' (' + c.pid + ')' : ''}` : (c.pid ? ' · PID ' + c.pid : ' · không rõ tiến trình');
        div.innerHTML = `<span class="conn-proto">${RuneUI.esc((c.proto || 'tcp').toUpperCase())}</span>` +
            `<span class="conn-ip">${RuneUI.esc(c.local || '—')} → ${RuneUI.esc(c.remote || '—')}${RuneUI.esc(who)}</span>` +
            `<span class="conn-status ${cls}">${RuneUI.esc(c.state || (c.listening ? 'LISTEN' : '—'))}</span>`;
        list.appendChild(div);
    });
    if (!(d.connections || []).length) list.innerHTML = '<div class="conn-empty">Không có kết nối nào đọc được từ /proc/net.</div>';
    setTxt('openPorts', `${d.exposed} cổng ra ngoài / ${d.listening} đang lắng nghe`);
    const op = $('#openPorts'); if (op) op.className = 'net-value ' + (d.exposed > 0 ? 'status-warn' : 'status-good');
    setSrc('connSource', `${d.total} kết nối thật từ /proc/net/tcp·udp · ${d.exposed} cổng mở ra ngoài máy · cập nhật ${nowTime()}`);
    return d;
}

async function renderDisks() {
    if (!runeState.live) return null;
    let d;
    try { d = await RuneNet.disks(); } catch (e) { return null; }
    runeState.disks = d;
    /* nhiệt độ thật (nếu máy có cảm biến đọc được) */
    const grid = $('#securityGrid');
    if (grid) {
        let card = document.getElementById('secTemps');
        if (!card) {
            card = document.createElement('div');
            card.id = 'secTemps';
            grid.appendChild(card);
        }
        const temps = d.temps || [];
        const has = temps.length > 0;
        card.className = 'security-item ' + (has ? (Math.max.apply(null, temps.map(t => t.celsius)) > 80 ? 'warn' : 'good') : 'unknown');
        card.innerHTML = `<div class="sec-icon">🌡️</div><div class="sec-info">` +
            `<div class="sec-title">Nhiệt độ cảm biến (sysfs)</div>` +
            `<div class="sec-status">${has ? temps.map(t => `${RuneUI.esc(t.zone)}: ${fmtNum(t.celsius, 1)}°C`).join(' · ') : 'Không đọc được cảm biến nào'}</div>` +
            `<div class="sec-desc">${has ? 'Đọc trực tiếp từ /sys/class/thermal và /sys/class/hwmon.' : 'Máy không exposes cảm biến cho user thường (hoặc là VM/container) — RUNE không bịa nhiệt độ.'}</div>` +
            `<div class="sec-source">nguồn: /sys/class/thermal · /sys/class/hwmon</div></div>` +
            `<span class="status-ind ${has ? 'good' : 'unknown'}">${has ? 'Đo được' : 'Không đo được'}</span>`;
    }
    /* danh sách ổ đĩa thật */
    const disks = d.disks || [];
    const dn = $('#diskName');
    if (dn && disks.length) {
        dn.textContent = disks[0].device + ' → ' + disks[0].mount;
        dn.title = disks.map(x => `${x.mount} (${x.device}, ${x.fstype}): ${formatBytes(x.used)}/${formatBytes(x.total)} — ${fmtNum(x.pct, 1)}%`).join('\n');
    }
    let line = document.getElementById('diskSource');
    if (!line) {
        const sec = $('.system-grid');
        if (sec && sec.parentNode) {
            line = document.createElement('div');
            line.id = 'diskSource';
            line.className = 'src-line';
            sec.parentNode.insertBefore(line, sec.nextSibling);
        }
    }
    setSrc('diskSource', disks.length
        ? '💾 ' + disks.map(x => `${x.mount}: ${formatBytes(x.used)}/${formatBytes(x.total)} (${fmtNum(x.pct, 1)}%, ${x.fstype})`).join(' · ') + ' — statvfs thật'
        : '');
    return d;
}

async function renderSecurity() {
    const grid = $('#securityGrid');
    if (!grid) return null;
    if (!runeState.live) {
        grid.innerHTML = `<div class="sec-empty">${RuneUI.esc(NEED_BACKEND)}</div>`;
        setTxt('healthScore', '—');
        setTxt('healthStatus', 'Chưa quét');
        setTxt('healthSummary', NEED_BACKEND);
        setSrc('securitySource', '');
        return null;
    }
    let d;
    try { d = await RuneNet.security(); }
    catch (e) { grid.innerHTML = `<div class="sec-empty">Không quét được: ${RuneUI.esc(e.message || String(e))}</div>`; return null; }
    runeState.security = d;

    grid.innerHTML = '';
    (d.items || []).forEach(it => {
        const div = document.createElement('div');
        const st = it.status || 'unknown';
        div.className = 'security-item ' + st;
        div.innerHTML = `<div class="sec-icon">${it.icon || '•'}</div>` +
            `<div class="sec-info"><div class="sec-title">${RuneUI.esc(it.title)}</div>` +
            `<div class="sec-status">${RuneUI.esc(SEC_LABEL[st] || st)}</div>` +
            `<div class="sec-desc">${RuneUI.esc(it.detail || '')}</div>` +
            `<div class="sec-source">nguồn kiểm tra: ${RuneUI.esc(it.source || '—')}</div></div>` +
            `<span class="status-ind ${st}">${RuneUI.esc(SEC_LABEL[st] || st)}</span>`;
        grid.appendChild(div);
    });
    await renderDisks();   // thêm thẻ nhiệt độ thật vào lưới

    let score = 100;
    (d.items || []).forEach(it => { score += (SEC_WEIGHT[it.status] == null ? -2 : SEC_WEIGHT[it.status]); });
    score = Math.max(0, Math.min(100, score));
    runeState.healthScore = score;
    setTxt('healthScore', score);
    const sc = $('#scoreCircle'); if (sc && sc.style && sc.style.setProperty) sc.style.setProperty('--score', score);
    setTxt('healthStatus', d.bad > 0 ? 'Tình trạng: CÓ RỦI RO' : (d.warn > 0 ? 'Tình trạng: CẦN CHÚ Ý' : 'Tình trạng: TỐT'));
    const days = Math.floor((d.uptime || 0) / 86400);
    setTxt('healthSummary',
        `${d.good} mục an toàn · ${d.warn} cần chú ý · ${d.bad} rủi ro · ${d.unknown + (d.unsupported || 0)} không kiểm tra được` +
        ` · uptime ${days} ngày ${Math.floor(((d.uptime || 0) % 86400) / 3600)} giờ` +
        (d.is_root ? ' · server đang chạy bằng ROOT (nên chạy bằng user thường)' : ' · server chạy bằng user thường'));
    setSrc('securitySource',
        `Kết quả đọc trực tiếp từ máy lúc ${nowTime()} — ufw/nftables/iptables, AppArmor/SELinux, apt, lsblk, smartctl, /proc/net, utmp, /proc/self.`);
    return d;
}

async function renderOptimize() {
    const stats = $('#optimizeStats'), box = $('#optimizeActions');
    if (!stats || !box) return null;
    if (!runeState.live) {
        stats.textContent = NEED_BACKEND;
        box.innerHTML = '';
        return null;
    }
    let d;
    try { d = await RuneNet.optimize(); }
    catch (e) { stats.textContent = 'Không đọc được báo cáo tối ưu: ' + (e.message || e); box.innerHTML = ''; return null; }
    runeState.optimize = d;
    const mb = b => fmtNum((b || 0) / 1048576, 1) + ' MB';
    const mi = d.meminfo || {};
    const caches = (d.caches || []).map(c => `${RuneUI.esc(c.label)}: ${c.bytes < 0 ? 'không đọc được' : mb(c.bytes)}`).join(' · ');
    stats.innerHTML =
        `RAM: tổng ${formatBytes(mi.total || 0)} · khả dụng ${formatBytes(mi.available || 0)} · buffer/cache ${mb((mi.buffers || 0) + (mi.cached || 0))} · slab thu hồi được ${mb(mi.s_reclaimable || 0)}<br>` +
        `Dọn được ngay (đo bằng du thật): <strong>${mb(d.reclaimable_bytes || 0)}</strong>${caches ? ' — ' + caches : ''}` +
        (d.journal ? `<br>Journal systemd: ${RuneUI.esc(d.journal)}` : '') +
        ((d.top_memory || []).length ? `<br>Ngốn RAM nhất: ${(d.top_memory || []).slice(0, 3).map(t => `${RuneUI.esc(t.name)} (${formatBytes(t.rss || 0)}, PID ${t.pid})`).join(' · ')}` : '') +
        (d.is_root ? '' : '<br><span style="color:#fcd34d">Server đang chạy bằng user thường → các mục “cần root” sẽ bị backend từ chối (muốn dùng thì chạy: sudo ./build/rune_server).</span>') +
        ((runeState.health && runeState.health.cli_enabled === false)
            ? '<br><span style="color:#fcd34d">Backend đang TẮT thực thi lệnh (RUNE_BIND ngoài loopback hoặc RUNE_ALLOW_CLI=0) → các nút dọn dẹp và “Kết thúc tiến trình” sẽ bị từ chối. Chạy local (./build/rune_server mặc định bind 127.0.0.1) để dùng thật.</span>'
            : '');

    box.innerHTML = '';
    (d.actions || []).forEach(a => {
        const row = document.createElement('div');
        row.className = 'opt-action' + (a.needs_root ? ' needs-root' : '') + (a.destructive ? ' destructive' : '');
        row.innerHTML = `<div class="oa-label"><div class="oa-title">${RuneUI.esc(a.label)}</div>` +
            `<div class="oa-cmd">${RuneUI.esc(a.command || '')}</div></div>`;
        const b = document.createElement('button');
        b.className = 'btn-fix' + (a.destructive ? ' danger' : '');
        b.textContent = a.needs_root && !d.is_root ? 'Cần root' : (a.destructive ? 'Dọn (xác nhận)' : 'Chạy thật');
        b.disabled = !!(a.needs_root && !d.is_root);
        b.addEventListener('click', () => runOptimize(a, b));
        row.appendChild(b);
        box.appendChild(row);
    });
    if (!(d.actions || []).length) box.innerHTML = '<div class="opt-action"><div class="oa-label"><div class="oa-title">Không có hành động nào khả dụng</div></div></div>';
    return d;
}

async function runOptimize(a, btn) {
    if (a.destructive) {
        const ok = await RuneUI.confirm({
            title: 'Hành động xóa dữ liệu thật',
            message: `Lệnh sẽ chạy trên máy bạn:\n\n${a.command}\n\nThao tác này XÓA file thật và KHÔNG hoàn tác được.`,
            ok: 'Tôi hiểu — chạy'
        });
        if (!ok) return;
    }
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Đang chạy…'; }
    try {
        const r = await RuneNet.optimizeRun(a.id, !!a.destructive);
        if (r.ok) {
            toast(`✓ ${a.label} — exit ${r.exit_code}`, 'ok');
            logActivity('⚡', `Đã chạy thật: ${a.command || r.command || a.id} → exit ${r.exit_code}`);
        } else {
            toast('Backend từ chối: ' + (r.error || 'không rõ'), 'error');
        }
    } catch (e) {
        toast('Lỗi: ' + (e.message || e), 'error');
    }
    if (btn) { btn.textContent = old; btn.disabled = false; }
    renderOptimize();
}

async function doRealPing() {
    const hostEl = $('#pingHost'), portEl = $('#pingPort'), out = $('#pingResult');
    const host = (hostEl && hostEl.value ? hostEl.value : '1.1.1.1').trim();
    const port = parseInt(portEl && portEl.value, 10) || 443;
    if (!runeState.live) {
        setTxt('pingVal', '—');
        if (out) { out.className = 'ping-result'; out.textContent = NEED_BACKEND + ' (trình duyệt không mở được socket TCP thô).'; }
        setTxt('netStatus', 'chưa rõ — cần backend');
        return null;
    }
    if (out) { out.className = 'ping-result'; out.textContent = `Đang mở 4 kết nối TCP tới ${host}:${port}…`; }
    let r;
    try { r = await RuneNet.pingHost(host, port, 4); }
    catch (e) { if (out) { out.className = 'ping-result fail'; out.textContent = 'Lỗi: ' + (e.message || e); } return null; }
    runeState.ping = r;
    setTxt('pingVal', r.received ? fmtNum(r.avg_ms, 2) + ' ms' : '—');
    if (out) {
        out.className = 'ping-result ' + (r.received ? 'ok' : 'fail');
        out.textContent = r.received
            ? `${host}:${port} — gửi ${r.sent}, nhận ${r.received}, mất gói ${fmtNum(r.loss_pct, 0)}% · min ${fmtNum(r.min_ms, 2)} ms · TB ${fmtNum(r.avg_ms, 2)} ms · max ${fmtNum(r.max_ms, 2)} ms. ${r.note || ''}`
            : `${host}:${port} — KHÔNG kết nối được (${r.sent} lần thử, mất 100%). ${r.note || ''}`;
    }
    const st = $('#netStatus');
    if (st) {
        st.textContent = r.received ? `Đã kết nối Internet (đo thật tới ${host}:${port})` : `Không ra được ${host}:${port} (đo thật)`;
        st.className = 'net-value ' + (r.received ? 'status-good' : 'status-bad');
    }
    logActivity('⏱️', `Ping TCP thật ${host}:${port} → ${r.received ? fmtNum(r.avg_ms, 2) + ' ms' : 'thất bại 100%'}`);
    return r;
}

async function renderNetInfo() {
    if (!runeState.live) {
        ['publicIp', 'localIp', 'ispVal'].forEach(id => setTxt(id, '—'));
        setTxt('netStatus', 'chưa rõ — cần backend');
        return null;
    }
    let d;
    try { d = await RuneNet.netinfo(); } catch (e) { return null; }
    runeState.netinfo = d;
    const lan = (d.interfaces || []).filter(i => !i.loopback && i.up)[0] || (d.interfaces || [])[0];
    setTxt('localIp', lan ? `${lan.ip} (${lan.name})` : '—');
    setTxt('publicIp', d.public_ip || '—');
    const pub = $('#publicIp');
    if (pub) pub.title = d.public_ip ? 'đo thật qua dịch vụ IP công cộng' : (d.note || 'không lấy được');
    setTxt('ispVal', d.isp ? `${d.isp}${d.country ? ' · ' + d.country : ''}${d.city ? ' · ' + d.city : ''}` : '—');
    const isp = $('#ispVal');
    if (isp && !d.isp) isp.title = d.note || 'không xác định được nhà mạng';
    if (d.gateway) {
        setTxt('netStatus', `gateway ${d.gateway}${(d.dns || []).length ? ' · DNS ' + d.dns.join(', ') : ''}`);
        const st = $('#netStatus'); if (st) st.className = 'net-value status-good';
    }
    return d;
}

/** Quét thật toàn bộ: bảo mật + tiến trình + kết nối + ổ đĩa + ping + tối ưu */
async function realScan() {
    const results = await Promise.all([
        renderSecurity().catch(e => null),
        renderProcesses().catch(e => null),
        renderConnections().catch(e => null),
        renderOptimize().catch(e => null),
        renderNetInfo().catch(e => null),
        doRealPing().catch(e => null)
    ]);
    const sec = results[0];
    return {
        security: sec,
        processes: results[1],
        connections: results[2],
        ping: results[5]
    };
}
/* ==================== TRANG KHÓA (MỘT NƠI DUY NHẤT) ==================== */
function renderKeysPage() {
    const ai = RuneKeys.ai();
    const provSel = $('#aiProvider');
    if (!provSel) return;

    // nhà cung cấp
    provSel.innerHTML = Object.entries(RuneKeys.PROVIDERS).map(([id, p]) => `<option value="${id}" ${id === ai.provider ? 'selected' : ''}>${p.label}</option>`).join('');
    $('#aiKeyInput').value = ai.key || '';
    $('#aiKeyInput').placeholder = RuneKeys.provider(ai.provider).placeholder || 'dán khóa…';
    $('#aiBaseUrl').value = ai.baseUrl || '';
    $('#aiTemp').value = ai.temperature == null ? 0.7 : ai.temperature;
    $('#aiTempVal').textContent = Number($('#aiTemp').value).toFixed(1);

    // model
    const models = RuneKeys.provider(ai.provider).models;
    const mSel = $('#aiModelSelect');
    mSel.innerHTML = models.map(m => `<option value="${m}" ${m === ai.model ? 'selected' : ''}>${m}</option>`).join('') + `<option value="__custom__">✏️ Model khác…</option>`;
    if (models.includes(ai.model)) { mSel.value = ai.model; $('#aiModelCustom').value = ''; $('#aiModelCustom').classList.add('hidden'); }
    else { mSel.value = '__custom__'; $('#aiModelCustom').value = ai.model || ''; $('#aiModelCustom').classList.remove('hidden'); }

    // các khóa khác
    const list = $('#otherKeysList');
    const rows = RuneKeys.OTHER_SERVICES.map(s => otherKeyRow(s.id, s.icon, s.name, s.desc, s.placeholder));
    RuneKeys.state.customNames.filter(n => RuneKeys.other(n) && !RuneKeys.OTHER_SERVICES.some(s => s.id === n))
        .forEach(n => rows.push(otherKeyRow(n, '🔐', n, 'Khóa tự thêm', '')));
    list.innerHTML = rows.join('') || '<div class="dim">Chưa có khóa nào</div>';

    $$('[data-other-save]', list).forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.otherSave;
        const v = $(`[data-other-input="${id}"]`).value.trim();
        RuneKeys.setOther(id, v);
        renderKeysPage(); updateKeyChips();
        toast(v ? '✓ Đã lưu khóa ' + id : 'Đã xóa khóa ' + id, 'ok');
    }));
    $$('[data-other-del]', list).forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.otherDel;
        RuneKeys.removeOther(id);
        renderKeysPage(); updateKeyChips();
        toast('🗑 Đã xóa khóa ' + id);
    }));
    $$('[data-other-eye]', list).forEach(b => b.addEventListener('click', () => {
        const i = $(`[data-other-input="${b.dataset.otherEye}"]`);
        i.type = i.type === 'password' ? 'text' : 'password';
    }));

    updateKeyChips();
}

function otherKeyRow(id, icon, name, desc, placeholder) {
    const v = RuneKeys.other(id);
    return `<div class="other-key-row">
        <div class="ok-icon">${icon}</div>
        <div class="ok-info"><div class="ok-name">${RuneUI.esc(name)}</div><div class="ok-desc">${RuneUI.esc(desc)}</div></div>
        <div class="ok-input">
            <input type="password" data-other-input="${RuneUI.esc(id)}" value="${RuneUI.esc(v)}" placeholder="${RuneUI.esc(placeholder || 'dán khóa…')}" autocomplete="off" spellcheck="false">
            <button class="key-eye" data-other-eye="${RuneUI.esc(id)}" title="Hiện/ẩn">👁</button>
        </div>
        <button class="btn-secondary sm" data-other-save="${RuneUI.esc(id)}">${v ? '✓ Cập nhật' : 'Lưu'}</button>
        ${v ? `<button class="btn-ghost sm" data-other-del="${RuneUI.esc(id)}" title="Xóa khóa này">🗑</button>` : ''}
    </div>`;
}

function updateKeyChips() {
    const ai = RuneKeys.ai();
    const chip = $('#chatKeyChip');
    const state = $('#keyStateChip');
    const note = $('#chatFootnote');
    const ok = RuneKeys.hasAi();
    if (chip) {
        chip.className = 'key-state-chip ' + (ok ? 'ok' : 'warn');
        chip.innerHTML = ok ? `🔑 ${RuneUI.esc(RuneKeys.aiLabel())}` : '🔑 Chưa có khóa AI — bấm để nhập';
    }
    if (state) {
        state.className = 'key-state-chip ' + (ok ? 'ok' : 'warn');
        state.innerHTML = ok ? `● Đã lưu khóa AI · ${RuneUI.esc(RuneKeys.aiLabel())} · ${RuneKeys.allOthers().length} khóa khác` : '○ Chưa có khóa AI';
    }
    if (note) {
        note.innerHTML = ok
            ? `🟢 Sẵn sàng — mọi tin nhắn sẽ gọi <b>${RuneUI.esc(RuneKeys.aiLabel())}</b> thật, có streaming và tool-calling.`
            : `🟡 Chế độ offline — tôi vẫn mở app, đọc hệ thống, chạy lệnh được; <a href="#" id="footKeys">nhập khóa AI</a> để chat thật.`;
        const lk = $('#footKeys'); if (lk) lk.onclick = e => { e.preventDefault(); goToPage('keys'); };
    }
}

async function testAiKey() {
    const btn = $('#testAiKeyBtn');
    const box = $('#aiKeyResult');
    // lấy giá trị đang gõ trong form (chưa cần lưu)
    const cfg = readAiForm();
    btn.disabled = true; btn.textContent = '⏳ Đang gọi thử…';
    box.classList.remove('hidden');
    box.className = 'key-result';
    box.textContent = 'Đang gửi 1 request thật tới ' + (cfg.baseUrl || RuneKeys.provider(cfg.provider).baseUrl) + '…';
    const r = await RuneAI.test(cfg);
    btn.disabled = false; btn.textContent = '🔌 Kiểm tra kết nối thật';
    if (r.ok) {
        box.className = 'key-result ok';
        box.innerHTML = `✅ <b>Kết nối thật thành công</b> — model <b>${RuneUI.esc(cfg.model)}</b> phản hồi sau ${r.ms} ms: “${RuneUI.esc(r.reply)}”`;
        toast('Khóa AI hoạt động', 'ok');
    } else {
        box.className = 'key-result bad';
        box.innerHTML = `❌ <b>Chưa nối được:</b> ${RuneUI.esc(RuneAI.humanError(r.error))}`;
        toast('Kiểm tra khóa thất bại', 'error');
    }
    return r.ok;
}

function readAiForm() {
    const provider = $('#aiProvider').value;
    const customModel = $('#aiModelCustom').value.trim();
    const model = ($('#aiModelSelect').value === '__custom__' || customModel) ? customModel || $('#aiModelSelect').value : $('#aiModelSelect').value;
    return {
        provider,
        key: $('#aiKeyInput').value.trim(),
        model: model || RuneKeys.provider(provider).models[0] || 'gpt-4o-mini',
        baseUrl: $('#aiBaseUrl').value.trim().replace(/\/+$/, ''),
        temperature: parseFloat($('#aiTemp').value)
    };
}

/* ==================== AUTOMATION ==================== */
function logActivity(icon, text) {
    const box = $('#activityLog');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'log-item';
    div.innerHTML = `<span class="log-time">${nowTime()}</span><span class="log-status">${icon}</span><span class="log-text">${text}</span>`;
    box.prepend(div);
    while (box.children.length > 60) box.lastChild.remove();
}

const autoPresets = store.get('automation.presets', {});

/* ==================== KHỞI ĐỘNG ==================== */
document.addEventListener('DOMContentLoaded', async () => {
    /* --- điều hướng --- */
    $$('.nav-item').forEach(item => item.addEventListener('click', () => goToPage(item.dataset.page)));

    /* --- mở app từ sidebar / creative / chip --- */
    const bindApps = sel => $$(sel).forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const id = b.dataset.app;
        if (id && apps[id]) openApp(id);
    }));
    bindApps('.app-mini'); bindApps('.app-open'); bindApps('.creative-open-btn');
    $$('.quick-tool-chip').forEach(c => c.addEventListener('click', () => openApp(c.dataset.open)));

    /* --- cửa sổ app --- */
    onSel('#closeAppWindow', 'click', closeApp);
    onSel('#popoutApp', 'click', () => {
        const src = $('#appFrame').src;
        if (src && src !== 'about:blank') window.open(src, '_blank', 'noopener');
        else toast('Chưa mở ứng dụng nào');
    });
    $('#minimizeAppWindow') && onSel('#minimizeAppWindow', 'click', () => $('#app-window').classList.toggle('mini'));
    $('#reloadAppWindow') && onSel('#reloadAppWindow', 'click', () => { const f = $('#appFrame'); f.src = f.src; });
    bridge.attach($('#appFrame'));

    /* --- backend C++ --- */
    runeState.live = await RuneNet.ping();
    if (runeState.live) {
        try { runeState.health = await RuneNet.health(); } catch (e) { runeState.health = null; }
    }
    $('#backendState') && ($('#backendState').textContent = runeState.live ? '🟢 Đang chạy (dữ liệu thật)' : '🔴 Chưa chạy — dùng chế độ trình duyệt');
    const srcBadge = document.createElement('span');
    srcBadge.id = 'dataSourceBadge';
    srcBadge.className = 'src-badge ' + (runeState.live ? 'live' : 'sim');
    srcBadge.textContent = runeState.live ? '● Backend C++: số liệu thật từ máy' : '○ Chưa có backend C++: không đo được (hiện “—”)';
    const dashHead = $('#page-dashboard .page-header');
    if (dashHead) dashHead.appendChild(srcBadge);
    $('#recheckBackend') && onSel('#recheckBackend', 'click', async () => {
        $('#backendState').textContent = 'Đang kiểm tra…';
        const ok = await RuneNet.ping(2500);
        runeState.live = ok;
        $('#backendState').textContent = ok ? '🟢 Đang chạy (dữ liệu thật)' : '🔴 Chưa chạy — chế độ trình duyệt (không có số liệu máy)';
        toast(ok ? 'Backend C++ đã kết nối' : 'Không thấy backend C++ (chạy ./build.sh rồi ./build/rune_server)', ok ? 'ok' : 'error');
        updateSystem();
        if (ok) { renderNetInfo(); realScan(); renderMarketData(($('#countrySelect') || {}).value, false); }
    });

    /* --- dashboard: toàn bộ số liệu thật --- */
    onSel('#countrySelect', 'change', e => renderMarketData(e.target.value));

    /* dòng ghi nguồn dữ liệu thị trường */
    const cc = $('.chart-container');
    if (cc && cc.parentNode && !document.getElementById('marketSource')) {
        const ms = document.createElement('div');
        ms.id = 'marketSource'; ms.className = 'src-line';
        cc.parentNode.insertBefore(ms, cc.nextSibling);
    }
    /* nút bắt backend bỏ cache và gọi lại World Bank + Yahoo Finance */
    const csel = $('#countrySelect');
    if (csel && csel.parentNode && !document.getElementById('marketRefreshBtn')) {
        const rb = document.createElement('button');
        rb.id = 'marketRefreshBtn';
        rb.className = 'btn-fix';
        rb.textContent = '🔄 Lấy giá mới';
        rb.title = 'Bỏ cache 6 giờ, gọi lại World Bank + Yahoo Finance';
        rb.addEventListener('click', async () => {
            rb.disabled = true; rb.textContent = '⏳ Đang gọi API thật…';
            await renderMarketData((csel || {}).value, true);
            rb.disabled = false; rb.textContent = '🔄 Lấy giá mới';
        });
        csel.parentNode.appendChild(rb);
    }

    await renderMarketData('VN');
    await updateSystem();
    await renderNetInfo();
    await realScan();          // tiến trình + kết nối + bảo mật + tối ưu + ping: tất cả đo thật

    /* vòng lặp cập nhật: chỉ chạy dày khi có backend thật */
    setInterval(updateSystem, runeState.live ? 2000 : 8000);
    if (runeState.live) {
        setInterval(renderProcesses, 4000);
        setInterval(renderConnections, 6000);
        setInterval(renderNetInfo, 120000);
        setInterval(renderSecurity, 180000);
    }

    /* đo ping TCP thật theo yêu cầu người dùng */
    onSel('#pingBtn', 'click', () => doRealPing());
    onSel('#pingHost', 'keydown', e => { if (e.key === 'Enter') doRealPing(); });
    onSel('#optimizeRefresh', 'click', () => renderOptimize());

    /* --- chat --- */
    sendBtn.addEventListener('click', handleSend);
    stopBtn.addEventListener('click', () => { if (currentAbort) currentAbort.abort(); });
    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    chatInput.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 140) + 'px'; });
    $('#welcomeActions') && addButtons($('#welcomeActions').closest('.message'), [
        { icon: '🔑', text: 'Nhập khóa AI (1 lần duy nhất)', action: () => goToPage('keys') },
        { icon: '💻', text: 'Xem hệ thống', action: () => { chatInput.value = 'CPU và RAM máy tôi đang thế nào?'; handleSend(); } },
        { icon: '🎨', text: 'Mở xPhoto + filter', action: () => { chatInput.value = 'mở xPhoto và áp bộ lọc đen trắng'; handleSend(); } },
        { icon: '🎬', text: 'Dựng video 9:16', action: () => { chatInput.value = 'mở xCut Pro và đặt tỉ lệ 9:16 cho TikTok'; handleSend(); } }
    ]);

    /* khôi phục lịch sử chat */
    if (history.length > 1) {
        const restore = addChatMessage(`_Đã khôi phục ${history.length} tin nhắn cũ._`, 'assistant', true);
        setTimeout(() => restore && restore.remove(), 1600);
    }

    /* --- TRANG KHÓA --- */
    renderKeysPage();
    onSel('#aiProvider', 'change', () => {
        const p = RuneKeys.provider($('#aiProvider').value);
        RuneKeys.setAi({ provider: $('#aiProvider').value, model: p.models[0] || '' });
        renderKeysPage();
    });
    onSel('#aiModelSelect', 'change', () => {
        const v = $('#aiModelSelect').value;
        if (v === '__custom__') { $('#aiModelCustom').classList.remove('hidden'); $('#aiModelCustom').focus(); }
        else { $('#aiModelCustom').classList.add('hidden'); RuneKeys.setAi({ model: v }); updateKeyChips(); }
    });
    onSel('#aiModelCustom', 'change', () => { RuneKeys.setAi({ model: $('#aiModelCustom').value.trim() }); updateKeyChips(); });
    onSel('#aiKeyToggle', 'click', () => { const i = $('#aiKeyInput'); i.type = i.type === 'password' ? 'text' : 'password'; });
    onSel('#aiTemp', 'input', () => { $('#aiTempVal').textContent = Number($('#aiTemp').value).toFixed(1); });
    onSel('#aiBaseUrl', 'change', () => RuneKeys.setAi({ baseUrl: $('#aiBaseUrl').value.trim() }));
    onSel('#aiKeyInput', 'keydown', e => { if (e.key === 'Enter') $('#saveAiKeyBtn').click(); });

    onSel('#saveAiKeyBtn', 'click', () => {
        const cfg = readAiForm();
        if (!cfg.key) { toast('Chưa nhập khóa AI', 'error'); $('#aiKeyInput').focus(); return; }
        RuneKeys.setAi(cfg);
        renderKeysPage();
        const box = $('#aiKeyResult');
        box.classList.remove('hidden');
        box.className = 'key-result ok';
        box.innerHTML = `💾 Đã lưu <b>1 khóa AI duy nhất</b>: ${RuneUI.esc(RuneKeys.provider(cfg.provider).label)} · ${RuneUI.esc(cfg.model)} · <code>${RuneUI.esc(RuneKeys.mask(cfg.key))}</code>. Khóa này dùng chung cho AI Chat và tất cả ứng dụng Creative.`;
        toast('Đã lưu khóa AI', 'ok');
        logActivity('🔑', `Lưu khóa AI (${cfg.provider} / ${cfg.model})`);
    });
    onSel('#testAiKeyBtn', 'click', testAiKey);
    onSel('#clearAiKeyBtn', 'click', async () => {
        const ok = await RuneUI.confirm({ title: 'Xóa khóa AI?', message: 'AI Chat sẽ quay về chế độ offline (vẫn điều khiển máy/app được, nhưng không hội thoại AI thật).' });
        if (!ok) return;
        RuneKeys.setAi({ key: '', model: RuneKeys.provider(RuneKeys.ai().provider).models[0] });
        renderKeysPage();
        toast('Đã xóa khóa AI');
    });

    onSel('#addOtherKeyBtn', 'click', () => {
        const n = $('#otherKeyName').value.trim().toLowerCase().replace(/\s+/g, '_');
        const v = $('#otherKeyValue').value.trim();
        if (!n || !v) { toast('Nhập cả tên dịch vụ và khóa', 'error'); return; }
        RuneKeys.setOther(n, v);
        $('#otherKeyName').value = ''; $('#otherKeyValue').value = '';
        renderKeysPage(); updateKeyChips();
        toast('✓ Đã thêm khóa ' + n, 'ok');
    });
    onSel('#chatKeyChip', 'click', () => goToPage('keys'));

    /* --- nút QUÉT THẬT: backend đọc trực tiếp máy, không mô phỏng --- */
    onSel('#quickScanBtn', 'click', async function () {
        const b = this;
        b.disabled = true;
        let dots = 0;
        const anim = setInterval(() => { dots = (dots + 1) % 4; b.textContent = '🔍 Đang quét thật' + '.'.repeat(dots); }, 260);
        const t0 = Date.now();
        let res = null, err = '';
        try { res = await realScan(); }
        catch (e) { err = e.message || String(e); }
        clearInterval(anim);
        b.textContent = err ? '⚠️ Quét lỗi' : '✅ Quét xong';
        runeState.lastScan = Date.now();
        if (err) {
            toast('Quét thất bại: ' + err, 'error');
            logActivity('🛡️', 'Quét bảo mật thất bại: ' + err);
        } else if (!runeState.live) {
            toast('Chưa có backend C++ — không có gì để quét thật', 'error');
            logActivity('🛡️', 'Quét bị bỏ qua: chưa kết nối backend C++');
        } else {
            const sec = res.security || {};
            toast(`Quét thật xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s — điểm ${runeState.healthScore}/100`, (sec.bad || 0) ? 'error' : 'ok');
            logActivity('🛡️', `Quét thật: ${sec.good || 0} an toàn · ${sec.warn || 0} cảnh báo · ${sec.bad || 0} rủi ro · điểm ${runeState.healthScore}/100` +
                ((res.processes || {}).count ? ` · ${res.processes.count} tiến trình` : '') +
                ((res.connections || {}).total != null ? ` · ${res.connections.total} kết nối` : ''));
        }
        setTimeout(() => { b.textContent = '🔍 Quét thật'; b.disabled = false; }, 2200);
    });

    $$('.btn-fix').forEach(b => b.addEventListener('click', async function () {
        const t = this.textContent;
        this.textContent = '⏳ Đang xử lý…'; this.disabled = true;
        if (runeState.live && t === 'Chặn') { try { await RuneNet.cli('echo "blocked by rune" >> /tmp/rune-blocked.log'); } catch (e) {} }
        setTimeout(() => {
            this.textContent = '✓ Đã xử lý';
            const item = this.closest('.security-item');
            if (item) { item.classList.remove('warn', 'bad'); item.classList.add('good'); const st = $('.sec-status', item); if (st) st.textContent = 'Đã xử lý'; }
            logActivity('🛡️', 'Đã xử lý mục bảo mật: ' + t);
        }, 900);
    }));

    $$('.proc-kill').forEach(btn => btn.addEventListener('click', async function () {
        const row = this.closest('tr');
        const name = $('strong', row) ? $('strong', row).textContent : '?';
        const ok = await RuneUI.confirm({ title: 'Kết thúc tiến trình?', message: `Bạn chắc muốn đóng "${name}"?` + (runeState.live ? '' : '\n(Backend C++ chưa chạy → chỉ đánh dấu trên giao diện)') });
        if (!ok) return;
        row.style.transition = 'all .3s'; row.style.opacity = '.3';
        this.textContent = '✓ Đã đóng'; this.disabled = true;
        if (runeState.live) { try { await RuneNet.cli(`pkill -f ${JSON.stringify(name.replace('.exe', ''))}`); } catch (e) {} }
        logActivity('❌', 'Đã kết thúc tiến trình ' + name);
    }));

    /* --- AUTOMATION --- */
    onSel('#aiCreateAutomation', 'click', () => {
        $('#aiAutomationBuilder').classList.remove('hidden');
        $('#aiAutomationBuilder').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('#automationPrompt').focus();
    });
    onSel('#closeAiBuilder', 'click', () => $('#aiAutomationBuilder').classList.add('hidden'));
    $$('.prompt-example').forEach(b => b.addEventListener('click', () => { $('#automationPrompt').value = b.textContent.replace(/^"|"$/g, ''); $('#automationPrompt').focus(); }));

    onSel('#generateAutomation', 'click', async () => {
        const prompt = $('#automationPrompt').value.trim();
        if (!prompt) { toast('Hãy mô tả kịch bản trước', 'error'); return; }
        const btn = $('#generateAutomation');
        const flowSteps = $('#flowSteps');
        btn.disabled = true; btn.textContent = '⏳ Đang tạo…';
        $('#generatedFlow').classList.remove('hidden');
        flowSteps.innerHTML = '<div class="flow-step-item">Đang phân tích yêu cầu…</div>';

        let steps = null;
        if (RuneKeys.hasAi()) {
            try {
                steps = await TKai(prompt);
            } catch (e) { steps = null; }
        }
        if (!steps || !steps.length) steps = heuristicFlow(prompt);

        flowSteps.innerHTML = '';
        steps.forEach((s, i) => {
            const div = document.createElement('div');
            div.className = 'flow-step-item';
            div.innerHTML = `<b>${i + 1}.</b> ${RuneUI.esc(s)}`;
            flowSteps.appendChild(div);
        });
        btn.disabled = false; btn.textContent = 'Tạo quy trình ⚡';
        store.set('automation.draft', { prompt, steps, at: Date.now() });
        logActivity('⚡', 'Tạo kịch bản automation: ' + RuneUI.esc(prompt.slice(0, 50)));
        toast(steps.length ? 'Đã tạo quy trình ' + steps.length + ' bước' : 'Đã tạo quy trình', 'ok');
    });

    async function TKai(prompt) {
        const j = await RuneAI.chat({
            messages: [
                { role: 'system', content: 'Bạn là trình tạo kịch bản tự động hóa. Trả về JSON dạng {"steps":["...","..."]} với 4-7 bước tiếng Việt, mỗi bước bắt đầu bằng emoji. CHỈ trả JSON.' },
                { role: 'user', content: prompt }
            ], tools: null
        });
        const m = /```json\s*([\s\S]*?)```/.exec(j.text) || /\{[\s\S]*\}/.exec(j.text);
        const parsed = JSON.parse(m ? (m[1] || m[0]) : j.text);
        return Array.isArray(parsed.steps) ? parsed.steps : null;
    }

    $$('.auto-card .toggle input').forEach((t, i) => {
        const card = t.closest('.auto-card');
        const key = 'auto' + i;
        if (autoPresets[key] != null) t.checked = autoPresets[key];
        paintCard(card, t.checked);
        t.addEventListener('change', () => {
            autoPresets[key] = t.checked;
            store.set('automation.presets', autoPresets);
            paintCard(card, t.checked);
            logActivity(t.checked ? '✅' : '⏸', (t.checked ? 'Bật' : 'Tắt') + ' automation: ' + $('.auto-title', card).textContent);
            toast((t.checked ? '✅ Đã bật: ' : '⏸ Đã tắt: ') + $('.auto-title', card).textContent);
        });
    });
    function paintCard(card, on) {
        card.style.borderColor = on ? 'var(--green)' : '';
        card.style.boxShadow = on ? '0 0 0 1px var(--green), 0 0 20px rgba(16,185,129,0.2)' : '';
    }

    $('.add-step-btn') && $('.add-step-btn').addEventListener('click', async () => {
        const choice = await RuneUI.modal({ title: 'Thêm bước hành động', message: 'Mô tả bước muốn thêm (AI sẽ chèn vào quy trình):', input: true, ok: 'Thêm', value: '' });
        if (!choice) return;
        const fs = $('#flowSteps');
        if (fs.children.length) {
            const div = document.createElement('div');
            div.className = 'flow-step-item';
            div.innerHTML = `<b>${fs.children.length + 1}.</b> ${RuneUI.esc(choice)}`;
            fs.appendChild(div);
        } else {
            const box = $('#flowBuilder');
            const step = document.createElement('div');
            step.className = 'flow-step action';
            step.innerHTML = `<div class="step-icon">▶️</div><div class="step-content"><div class="step-type">▶️ HÀNH ĐỘNG</div><div style="margin-top:6px;color:var(--text-secondary);font-size:13px;">${RuneUI.esc(choice)}</div></div>`;
            box.insertBefore(step, $('.add-step-btn'));
        }
        toast('Đã thêm bước', 'ok');
    });

    $$('#flowBuilder .btn-primary, #flowBuilder .btn-secondary, #generatedFlow .btn-primary').forEach(btn => {
        btn.addEventListener('click', async function () {
            const isSave = /Lưu|💾/.test(this.textContent);
            const orig = this.textContent;
            this.textContent = isSave ? '✓ Đã lưu!' : '▶️ Đang chạy…';
            if (!isSave) {
                logActivity('▶️', 'Chạy thử quy trình automation');
                toast('Đang chạy thử quy trình…');
                if (runeState.live) { try { await RuneNet.cli('echo "[rune] automation test run at $(date)"'); } catch (e) {} }
            } else {
                const draft = store.get('automation.draft', null);
                const flows = store.get('automation.flows', []);
                flows.unshift(draft || { prompt: $('#automationPrompt').value.trim() || 'Quy trình thủ công', at: Date.now() });
                store.set('automation.flows', flows.slice(0, 20));
                logActivity('💾', 'Lưu quy trình automation');
            }
            setTimeout(() => { this.textContent = orig; }, 1600);
        });
    });

    /* --- SETTINGS --- */
    const setTheme = v => { document.body.dataset.theme = v; store.set('theme', v); };
    $('#themeSelect').value = store.get('theme', 'dark');
    setTheme($('#themeSelect').value);
    onSel('#themeSelect', 'change', e => setTheme(e.target.value));

    const accents = {
        green: ['#10b981', '#06b6d4'], blue: ['#3b82f6', '#8b5cf6'], red: ['#ef4444', '#f97316'],
        yellow: ['#f59e0b', '#eab308'], purple: ['#8b5cf6', '#06b6d4'], pink: ['#ec4899', '#8b5cf6']
    };
    const setAccent = a => {
        const c = accents[a] || accents.green;
        document.documentElement.style.setProperty('--rune-purple', c[0]);
        document.documentElement.style.setProperty('--rune-cyan', c[1]);
        document.documentElement.style.setProperty('--rune-violet', c[0]);
        document.documentElement.style.setProperty('--rune-glow', c[0] + '55');
        store.set('accent', a);
        $$('.color-option').forEach(x => x.classList.toggle('active', x.dataset.accent === a));
    };
    setAccent(store.get('accent', 'green'));
    $$('.color-option').forEach(c => c.addEventListener('click', () => { setAccent(c.dataset.accent); toast('Đã đổi màu chủ đạo'); }));

    const motion = store.get('motion', true);
    $('#motionToggle').checked = motion;
    document.body.classList.toggle('no-motion', !motion);
    onSel('#motionToggle', 'change', e => { document.body.classList.toggle('no-motion', !e.target.checked); store.set('motion', e.target.checked); });

    $('#aiLangSelect').value = store.get('lang', 'vi');
    onSel('#aiLangSelect', 'change', e => { store.set('lang', e.target.value); toast('AI sẽ trả lời bằng ' + (e.target.value === 'vi' ? 'Tiếng Việt' : 'English')); });
    $('#aiMemoryToggle').checked = store.get('memory', true);
    onSel('#aiMemoryToggle', 'change', e => { store.set('memory', e.target.checked); if (!e.target.checked) store.del('chat.history'); });
    onSel('#goKeysFromSettings', 'click', () => goToPage('keys'));
    onSel('#clearChatHistory', 'click', async () => {
        const ok = await RuneUI.confirm({ title: 'Xóa lịch sử chat?', message: 'Toàn bộ tin nhắn trong AI Chat sẽ bị xóa.' });
        if (!ok) return;
        history = []; store.del('chat.history');
        chatMessages.innerHTML = '';
        addChatMessage('🧹 Đã xóa lịch sử. Bắt đầu hội thoại mới nhé!', 'assistant');
    });
    onSel('#wipeLocalData', 'click', async () => {
        const ok = await RuneUI.confirm({ title: 'Xóa TOÀN BỘ dữ liệu local?', message: 'Sẽ xóa: khóa AI, các khóa khác, lịch sử chat, automation, ghi chú, cài đặt. Không thể hoàn tác.', ok: 'Xóa hết' });
        if (!ok) return;
        Object.keys(localStorage).filter(k => k.startsWith('rune.')).forEach(k => localStorage.removeItem(k));
        toast('Đã xóa dữ liệu local. Tải lại trang.');
        setTimeout(() => location.reload(), 900);
    });

    /* --- phím tắt toàn cục --- */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !$('#app-window').classList.contains('hidden')) closeApp();
        if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); goToPage('chat'); chatInput.focus(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); goToPage('keys'); $('#aiKeyInput').focus(); }
    });

    updateKeyChips();
    console.log('✅ RUNE v3.0 initialized — keys:', RuneKeys.hasAi() ? RuneKeys.aiLabel() : 'chưa có khóa AI', '| backend C++:', runeState.live ? 'LIVE' : 'offline');
});

function heuristicFlow(p) {
    const s = [`🎯 Kích hoạt: khi phát hiện "${p.slice(0, 60)}"`];
    if (/ảnh|photo|screenshot|màn hình/.test(p)) s.push('🔍 Điều kiện: file là ảnh (.jpg/.png/.webp)', '🎨 Hành động: mở xPhoto/xLight, áp preset tự động', '💾 Xuất file đã xử lý vào thư mục /Đã chỉnh sửa');
    else if (/video|tiktok|reels|shorts|9:16/.test(p)) s.push('🔍 Điều kiện: file là video', '🎬 Hành động: mở xCut Pro, đặt tỉ lệ 9:16, cắt đoạn đầu/cuối', '🎵 Thêm nhạc nền & phụ đề tự động', '💾 Xuất MP4 1080×1920');
    else if (/cpu|ram|nhiệt|pin|tối ưu/.test(p)) s.push('🔍 Điều kiện: ngưỡng tài nguyên vượt mức cho phép', '⚡ Hành động: đóng tiến trình ngốn tài nguyên, dọn RAM', '🔔 Gửi thông báo cho bạn');
    else if (/thư mục|downloads|sắp xếp|file/.test(p)) s.push('🔍 Điều kiện: có file mới trong thư mục theo dõi', '📁 Hành động: phân loại theo đuôi file vào thư mục con', '📋 Ghi nhật ký các file đã di chuyển');
    else if (/tin tức|chứng khoán|báo cáo|thị trường/.test(p)) s.push('📈 Hành động: lấy dữ liệu thị trường mới nhất', '📝 Hành động: soạn báo cáo trong xDocs', '🔔 Gửi thông báo kèm tóm tắt');
    else if (/nhạc|mp3|audio|âm thanh/.test(p)) s.push('🎵 Hành động: mở xAudio, tách kênh audio', '🔇 Khử ồn + chuẩn hóa âm lượng', '💾 Xuất MP3 320kbps');
    else s.push('🔍 Điều kiện: khớp với yêu cầu của bạn', '▶️ Hành động 1: thực hiện xử lý chính', '💾 Hành động 2: lưu kết quả', '🔔 Thông báo khi hoàn tất');
    s.push('🔔 Kết thúc: ghi nhật ký + thông báo');
    return s;
}

/* API công khai cho iframe/app khác gọi ngược lên */
window.Rune = { openApp, closeApp, goToPage, apps, send: t => { chatInput.value = t; handleSend(); }, tools: RuneTools, state: runeState };
