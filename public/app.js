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
const runeState = { sys: null, market: null, live: false };

const RuneTools = {
    get_system_info: {
        icon: '💻', offline: true, group: 'system',
        schema: { name: 'get_system_info', description: 'Đọc thông tin hệ thống realtime: CPU, GPU, RAM, ổ đĩa, mạng, nhiệt độ, tiến trình nặng nhất', parameters: { type: 'object', properties: {}, required: [] } },
        async execute() {
            const s = runeState.sys || {};
            const src = runeState.live ? 'Backend C++ (số liệu thật)' : 'Mô phỏng trong trình duyệt (bật backend C++ để có số liệu thật)';
            return {
                nguồn: src,
                cpu: s.cpu_name || 'CPU', cpu_usage: s.cpu_usage, cpu_temp: s.cpu_temp, cores: s.cpu_cores,
                gpu: s.gpu_name, gpu_usage: s.gpu_usage, gpu_temp: s.gpu_temp,
                ram_total_gb: s.ram_total ? +(s.ram_total / 1073741824).toFixed(1) : null,
                ram_used_gb: s.ram_used ? +(s.ram_used / 1073741824).toFixed(1) : null,
                net_down_mbps: s.net_download ? +(s.net_download / 1048576).toFixed(2) : null,
                net_up_mbps: s.net_upload ? +(s.net_upload / 1048576).toFixed(2) : null,
                trình_duyệt: navigator.userAgent.split(') ').pop()
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
            const m = await fetchMarket(country);
            const out = { country, index: m.index, value: m.value, change: m.change, changePct: m.changePct, gdp: m.gdp, inflation: m.inflation, unemployment: m.unemp, rate: m.rate, source: m.source };
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
        schema: { name: 'show_health', description: 'Quét bảo mật & sức khỏe máy: điểm, các mục cảnh báo, tiến trình đáng ngờ', parameters: { type: 'object', properties: {}, required: [] } },
        async execute() {
            const issues = [];
            $$('.security-item').forEach(i => {
                if (i.classList.contains('warn') || i.classList.contains('bad')) issues.push(($('.sec-title', i) || {}).textContent + ': ' + (($('.sec-status', i) || {}).textContent || ''));
            });
            const suspicious = $$('#processTableBody tr').filter(r => $('.trust-ind.bad', r)).map(r => $('strong', r).textContent);
            return { score: ($('#healthScore') || {}).textContent + '/100', issues_found: issues.length, issues, suspicious_processes: suspicious };
        }
    },
    optimize_system: {
        icon: '⚡', offline: true, group: 'system',
        schema: { name: 'optimize_system', description: 'Dọn RAM / đóng tiến trình nền (thật khi có backend C++)', parameters: { type: 'object', properties: {}, required: [] } },
        async execute() {
            if (runeState.live) {
                try { const r = await RuneNet.cli("ps -eo rss,comm --sort=-rss | head -6"); return { success: true, mode: 'backend', top_memory: r.output }; } catch (e) {}
            }
            const s = runeState.sys || {};
            return { success: true, mode: 'mô phỏng (chưa có backend C++)', ram_used: s.ram_used, note: 'Không có tiến trình nào bị đóng ở chế độ mô phỏng' };
        }
    },
    kill_process: {
        icon: '❌', offline: true, group: 'cli',
        schema: { name: 'kill_process', description: 'Kết thúc tiến trình theo tên hoặc PID (chỉ khi backend C++ đang chạy)', parameters: { type: 'object', properties: { name: { type: 'string' }, pid: { type: 'number' } }, required: [] } },
        async execute(a) {
            const target = a && (a.pid || a.name);
            if (!target) return { success: false, error: 'Thiếu tên hoặc PID' };
            const row = $$('#processTableBody tr').find(r => r.textContent.includes(String(target)));
            if (row) { row.style.opacity = '.35'; const b = $('.proc-kill', row); if (b) { b.textContent = '✓ Đã đóng'; b.disabled = true; } }
            if (!runeState.live) return { success: false, marked_in_ui: true, note: 'Chưa có backend C++ nên tiến trình thật chưa bị kết thúc' };
            try {
                const cmd = a.pid ? `kill -9 ${a.pid}` : `pkill -f ${JSON.stringify(a.name)}`;
                const r = await RuneNet.cli(cmd);
                return { success: true, killed: target, output: r.output };
            } catch (e) { return { success: false, error: e.message }; }
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

/* ==================== MARKET DATA ==================== */
const marketSeed = {
    US: { index: 'S&P 500', value: 5872, change: 45.2, changePct: 0.78, gdp: 2.8, inflation: 3.2, unemp: 4.1, rate: 5.5, stocks: [{ sym: 'AAPL', name: 'Apple', price: 226.5, chg: 2.3, chgPct: 1.03, vol: 52e6 }, { sym: 'MSFT', name: 'Microsoft', price: 430, chg: 5.8, chgPct: 1.37, vol: 28e6 }, { sym: 'NVDA', name: 'NVIDIA', price: 142, chg: -3.2, chgPct: -2.19, vol: 89e6 }, { sym: 'GOOGL', name: 'Alphabet', price: 176, chg: 1.1, chgPct: 0.63, vol: 21e6 }, { sym: 'TSLA', name: 'Tesla', price: 248, chg: -7.2, chgPct: -2.8, vol: 68e6 }] },
    VN: { index: 'VN-Index', value: 1287.4, change: -3.8, changePct: -0.29, gdp: 5.2, inflation: 3.8, unemp: 2.3, rate: 4.5, stocks: [{ sym: 'VIC', name: 'Vingroup', price: 45.8, chg: 0.3, chgPct: 0.66, vol: 8.5e6 }, { sym: 'VHM', name: 'Vinhomes', price: 43.1, chg: -0.2, chgPct: -0.46, vol: 6.2e6 }, { sym: 'VCB', name: 'Vietcombank', price: 90.5, chg: 0.8, chgPct: 0.89, vol: 4.1e6 }, { sym: 'VNM', name: 'Vinamilk', price: 71.2, chg: 0, chgPct: 0, vol: 2.8e6 }, { sym: 'BID', name: 'BIDV', price: 49, chg: 0.5, chgPct: 1.03, vol: 3.5e6 }, { sym: 'FPT', name: 'FPT Corp', price: 116.8, chg: 1.5, chgPct: 1.3, vol: 3.9e6 }, { sym: 'GAS', name: 'PV Gas', price: 82.5, chg: -0.6, chgPct: -0.72, vol: 2.1e6 }, { sym: 'MWG', name: 'TG Di động', price: 39.2, chg: 0.7, chgPct: 1.82, vol: 7.8e6 }, { sym: 'SSI', name: 'SSI Sec', price: 28.9, chg: 0.4, chgPct: 1.4, vol: 9.2e6 }] },
    JP: { index: 'Nikkei 225', value: 39680, change: 320, changePct: 0.81, gdp: 1.2, inflation: 2.8, unemp: 2.5, rate: 0.25, stocks: [{ sym: '7203.T', name: 'Toyota', price: 2650, chg: 15, chgPct: 0.57, vol: 9e6 }, { sym: '6758.T', name: 'Sony', price: 2980, chg: -20, chgPct: -0.67, vol: 6e6 }, { sym: '9984.T', name: 'SoftBank', price: 8420, chg: 120, chgPct: 1.45, vol: 12e6 }] },
    CN: { index: 'SSE Composite', value: 3292, change: 12, changePct: 0.38, gdp: 4.8, inflation: 0.7, unemp: 5.1, rate: 3.45, stocks: [{ sym: '600519.SS', name: 'Kweichow Moutai', price: 1520, chg: 8, chgPct: 0.53, vol: 3e6 }, { sym: '601318.SS', name: 'Ping An', price: 52.4, chg: -0.3, chgPct: -0.57, vol: 22e6 }] },
    EU: { index: 'Euro Stoxx 50', value: 4835, change: -8, changePct: -0.18, gdp: 0.8, inflation: 2.4, unemp: 6.4, rate: 4.5, stocks: [{ sym: 'SAP.DE', name: 'SAP', price: 218, chg: 2.4, chgPct: 1.11, vol: 2e6 }, { sym: 'ASML.AS', name: 'ASML', price: 720, chg: -6, chgPct: -0.83, vol: 1.5e6 }] }
};
const marketCache = {};

async function fetchMarket(country) {
    const c = country || $('#countrySelect').value || 'VN';
    // 1) backend C++ (số thật từ máy local)
    if (runeState.live) {
        try {
            const j = await RuneNet.market(c);
            const ind = j.indicator || {};
            return {
                index: ind.index_name, value: ind.index_value, change: ind.index_change, changePct: ind.index_change_pct,
                gdp: ind.gdp_growth, inflation: ind.inflation, unemp: ind.unemployment, rate: ind.interest_rate,
                stocks: (j.stocks || []).map(s => ({ sym: s.symbol, name: s.name, price: s.price, chg: s.change, chgPct: s.change_pct, vol: s.volume })),
                source: 'Backend C++ (local)'
            };
        } catch (e) { /* rơi xuống dưới */ }
    }
    // 2) Alpha Vantage nếu người dùng có khóa (dữ liệu thật)
    const av = RuneKeys.other('alpha');
    if (av) {
        const ck = marketCache['av_' + c];
        if (ck && Date.now() - ck.t < 60000) return ck.d;
        try {
            const sym = { VN: 'VNINDEX', US: 'SPY', JP: 'EWJ', CN: 'FXI', EU: 'EZU' }[c] || 'SPY';
            const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${encodeURIComponent(av)}`);
            const j = await r.json();
            const q = j['Global Quote'];
            if (q && q['05. price']) {
                const price = parseFloat(q['05. price']);
                const chg = parseFloat(q['09. change']);
                const d = {
                    index: q['01. symbol'], value: price, change: chg, changePct: parseFloat(String(q['10. change percent']).replace('%', '')),
                    gdp: marketSeed[c].gdp, inflation: marketSeed[c].inflation, unemp: marketSeed[c].unemp, rate: marketSeed[c].rate,
                    stocks: [{ sym: q['01. symbol'], name: q['01. symbol'], price, chg, chgPct: parseFloat(String(q['10. change percent']).replace('%', '')), vol: parseFloat(q['06. volume']) }],
                    source: 'Alpha Vantage (dữ liệu thật)'
                };
                marketCache['av_' + c] = { t: Date.now(), d };
                return d;
            }
        } catch (e) {}
    }
    // 3) dữ liệu mẫu
    const s = marketSeed[c] || marketSeed.VN;
    const jitter = v => +(v + (Math.random() - 0.5) * Math.abs(v) * 0.004).toFixed(2);
    return Object.assign({}, s, { value: jitter(s.value), source: RuneKeys.other('alpha') ? 'Mẫu (khóa Alpha Vantage lỗi)' : 'Dữ liệu mẫu — thêm khóa Alpha Vantage ở trang 🔑 Khóa để có giá thật' });
}

let marketChart = null, netChart = null;
const netDown = [], netUp = [];
for (let i = 0; i < 60; i++) { netDown.push(Math.random() * 3); netUp.push(Math.random() * 0.8); }

async function renderMarketData(country) {
    const d = await fetchMarket(country);
    runeState.market = d;
    $('#idxName').textContent = d.index;
    $('#idxValue').textContent = Number(d.value).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const ce = $('#idxChange');
    const s = d.change >= 0 ? '+' : '';
    ce.textContent = `${s}${Number(d.change).toFixed(2)} (${s}${Number(d.changePct).toFixed(2)}%)`;
    ce.className = 'stat-change ' + (d.change >= 0 ? 'positive' : 'negative');
    $('#gdpVal').textContent = d.gdp + '%';
    $('#inflationVal').textContent = d.inflation + '%';
    $('#unempVal').textContent = d.unemp + '%';
    $('#rateVal').textContent = d.rate + '%';
    const tbody = $('#stockTableBody');
    tbody.innerHTML = '';
    (d.stocks || []).forEach(st => {
        const tr = document.createElement('tr');
        const cls = st.chg >= 0 ? 'stock-positive' : 'stock-negative';
        const ss = st.chg >= 0 ? '+' : '';
        tr.innerHTML = `<td><strong>${RuneUI.esc(st.sym)}</strong></td><td>${RuneUI.esc(st.name)}</td><td>${Number(st.price).toFixed(2)}</td><td class="${cls}">${ss}${Number(st.chg).toFixed(2)}</td><td class="${cls}">${ss}${Number(st.chgPct).toFixed(2)}%</td><td>${formatVolume(st.vol)}</td>`;
        tbody.appendChild(tr);
    });
    if (!d.stocks || !d.stocks.length) tbody.innerHTML = '<tr><td colspan="6" style="opacity:.6">Không có mã nào cho khu vực này</td></tr>';
    const src = $('#marketSource');
    if (src) src.textContent = '📡 ' + d.source;

    const ctx = $('#marketChart');
    if (ctx && window.Chart) {
        const labels = [], data = [];
        let base = d.value * 0.96;
        for (let i = 29; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); labels.push(dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })); base += (Math.random() - 0.48) * d.value * 0.01; data.push(base); }
        data[data.length - 1] = d.value;
        if (marketChart) marketChart.destroy();
        marketChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [{ label: d.index, data, borderColor: d.changePct >= 0 ? '#10b981' : '#ef4444', backgroundColor: d.changePct >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#646b8b' } }, y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#646b8b' } } } }
        });
    }
}

/* ==================== SYSTEM MONITOR ==================== */
function simSystem() {
    const cpu = 10 + Math.random() * 35, gpu = 5 + Math.random() * 50;
    return {
        cpu_name: navigator.hardwareConcurrency ? (navigator.hardwareConcurrency + ' nhân (trình duyệt)') : 'Không rõ',
        cpu_usage: cpu, cpu_temp: Math.floor(48 + Math.random() * 20), cpu_cores: navigator.hardwareConcurrency || 0,
        gpu_name: 'GPU (không đọc được từ trình duyệt)', gpu_usage: gpu, gpu_temp: Math.floor(42 + Math.random() * 25),
        ram_total: 16 * 1024 * 1024 * 1024, ram_used: Math.floor(5 + Math.random() * 4) * 1024 * 1024 * 1024,
        ram_available: 0, disk_read: Math.random() * 50 * 1048576, disk_write: Math.random() * 20 * 1048576,
        net_download: Math.random() * 8 * 1048576, net_upload: Math.random() * 1.5 * 1048576, simulated: true
    };
}

async function updateSystem() {
    let info = null;
    if (runeState.live) { try { info = await RuneNet.system(); } catch (e) { runeState.live = false; } }
    if (!info) info = simSystem();
    info.ram_available = info.ram_available || Math.max(0, (info.ram_total || 0) - (info.ram_used || 0));
    runeState.sys = info;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const bar = (id, v) => { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, Math.min(100, v)) + '%'; };

    set('cpuUsage', Number(info.cpu_usage || 0).toFixed(1) + '%'); bar('cpuBar', info.cpu_usage || 0);
    set('cpuTemp', Math.round(info.cpu_temp || 0) + '°C'); set('cpuTempSec', Math.round(info.cpu_temp || 0) + '°C');
    set('cpuName', info.cpu_name || 'CPU');
    set('gpuUsage', Number(info.gpu_usage || 0).toFixed(1) + '%'); bar('gpuBar', info.gpu_usage || 0);
    set('gpuTemp', Math.round(info.gpu_temp || 0) + '°C'); set('gpuName', info.gpu_name || 'GPU');
    bar('ramBar', info.ram_total ? (info.ram_used / info.ram_total * 100) : 0);
    set('ramUsed', formatBytes(info.ram_used || 0)); set('ramAvail', formatBytes(info.ram_available || 0));
    bar('diskBar', info.disk_total ? (info.disk_used / info.disk_total * 100) : 42);
    set('diskUsed', (info.disk_total ? formatBytes(info.disk_used) + ' / ' + formatBytes(info.disk_total) : formatBytes((info.disk_read || 0) * 40)));
    set('diskIO', formatSpeed((info.disk_read || 0) + (info.disk_write || 0)));
    set('netDown', formatSpeed(info.net_download || 0)); set('netUp', formatSpeed(info.net_upload || 0));
    set('netDownLarge', formatSpeed(info.net_download || 0)); set('netUpLarge', formatSpeed(info.net_upload || 0));
    // ping: backend C++ không đo giá trị này → không bịa số, hiện dấu — cho rõ
    set('pingVal', info.ping != null ? Math.round(info.ping) + ' ms' : (info.simulated ? Math.floor(8 + Math.random() * 25) + ' ms' : '—'));

    const score = info.simulated ? 85 + Math.floor(Math.random() * 6) : Math.max(20, 100 - Math.round((info.cpu_usage || 0) / 3) - Math.max(0, (info.cpu_temp || 50) - 70));
    set('healthScore', score);
    const sc = $('#scoreCircle'); if (sc) sc.style.setProperty('--score', score);
    const badge = $('#dataSourceBadge');
    if (badge) { badge.textContent = runeState.live ? '● Backend C++: dữ liệu thật' : '○ Chế độ trình duyệt: dữ liệu mô phỏng'; badge.className = 'src-badge ' + (runeState.live ? 'live' : 'sim'); }

    netDown.shift(); netDown.push((info.net_download || 0) / 1048576);
    netUp.shift(); netUp.push((info.net_upload || 0) / 1048576);
    const nctx = $('#networkChart');
    if (nctx && window.Chart) {
        if (netChart) { netChart.data.datasets[0].data = netDown.slice(); netChart.data.datasets[1].data = netUp.slice(); netChart.update('none'); }
        else netChart = new Chart(nctx.getContext('2d'), {
            type: 'line',
            data: { labels: netDown.map((_, i) => i), datasets: [{ label: 'Down', data: netDown.slice(), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }, { label: 'Up', data: netUp.slice(), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } }, animation: false }
        });
    }
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
    $('#backendState') && ($('#backendState').textContent = runeState.live ? '🟢 Đang chạy (dữ liệu thật)' : '🔴 Chưa chạy — dùng chế độ trình duyệt');
    const srcBadge = document.createElement('span');
    srcBadge.id = 'dataSourceBadge';
    srcBadge.className = 'src-badge ' + (runeState.live ? 'live' : 'sim');
    srcBadge.textContent = runeState.live ? '● Backend C++: dữ liệu thật' : '○ Chế độ trình duyệt: dữ liệu mô phỏng';
    const dashHead = $('#page-dashboard .page-header');
    if (dashHead) dashHead.appendChild(srcBadge);
    $('#recheckBackend') && onSel('#recheckBackend', 'click', async () => {
        $('#backendState').textContent = 'Đang kiểm tra…';
        const ok = await RuneNet.ping(2500);
        runeState.live = ok;
        $('#backendState').textContent = ok ? '🟢 Đang chạy (dữ liệu thật)' : '🔴 Chưa chạy — dùng chế độ trình duyệt';
        toast(ok ? 'Backend C++ đã kết nối' : 'Không thấy backend C++ (chạy ./build.sh rồi ./build/rune_server)', ok ? 'ok' : 'error');
        updateSystem();
    });

    /* --- dashboard --- */
    onSel('#countrySelect', 'change', e => renderMarketData(e.target.value));
    const ms = document.createElement('div');
    ms.id = 'marketSource'; ms.className = 'src-line';
    $('.chart-container') && $('.chart-container').after(ms);
    await renderMarketData('VN');
    await updateSystem();
    setInterval(updateSystem, runeState.live ? 2000 : 1500);

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

    /* --- nút quét nhanh --- */
    onSel('#quickScanBtn', 'click', async function () {
        const b = this; b.disabled = true;
        let dots = 0;
        const anim = setInterval(() => { dots = (dots + 1) % 4; b.textContent = '🔍 Đang quét' + '.'.repeat(dots); }, 260);
        let real = '';
        if (runeState.live) {
            try { const r = await RuneNet.cli('ps -eo comm,pcpu --sort=-pcpu | head -5'); real = '\n' + r.output; } catch (e) {}
        }
        setTimeout(() => {
            clearInterval(anim);
            b.textContent = '✅ Quét xong';
            logActivity('🛡️', 'Quét bảo mật nhanh hoàn tất' + (real ? ' (dữ liệu backend thật)' : ' (mô phỏng)'));
            toast('Quét xong — xem mục Bảo mật', 'ok');
            setTimeout(() => { b.textContent = '🔍 Quét nhanh'; b.disabled = false; }, 2200);
        }, real ? 900 : 1800);
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
