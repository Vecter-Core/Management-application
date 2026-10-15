/* ============================================================
   RUNE CORE — dùng chung cho trang chính VÀ mọi ứng dụng Creative
   1. RuneKeys  : MỘT nơi duy nhất lưu khóa AI + các khóa khác
   2. RuneAI    : kết nối THẬT tới OpenAI / Anthropic / Gemini / Groq /
                  DeepSeek / OpenRouter / endpoint tùy chỉnh (có streaming
                  và tool-calling)
   3. RuneNet   : cầu nối tới backend C++ local (nếu đang chạy)
   4. RuneUI    : markdown, toast, modal dùng chung
   ============================================================ */
(function () {
    'use strict';

    /* ================= 1. RUNE KEYS — MỘT nơi duy nhất ================= */
    const STORE = 'rune.keys.v2';
    const LEGACY = ['rune_key_', 'xkiro_key_'];

    const PROVIDERS = {
        openai: {
            label: 'OpenAI (GPT)',
            kind: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
            placeholder: 'sk-...'
        },
        anthropic: {
            label: 'Anthropic (Claude)',
            kind: 'anthropic',
            baseUrl: 'https://api.anthropic.com/v1',
            models: ['claude-sonnet-4-5', 'claude-3-5-haiku-latest', 'claude-opus-4-1'],
            placeholder: 'sk-ant-...'
        },
        gemini: {
            label: 'Google Gemini',
            kind: 'gemini',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
            placeholder: 'AIza...'
        },
        groq: {
            label: 'Groq (nhanh, miễn phí)',
            kind: 'openai',
            baseUrl: 'https://api.groq.com/openai/v1',
            models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
            placeholder: 'gsk_...'
        },
        deepseek: {
            label: 'DeepSeek',
            kind: 'openai',
            baseUrl: 'https://api.deepseek.com/v1',
            models: ['deepseek-chat', 'deepseek-reasoner'],
            placeholder: 'sk-...'
        },
        openrouter: {
            label: 'OpenRouter (nhiều model)',
            kind: 'openai',
            baseUrl: 'https://openrouter.ai/api/v1',
            models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct'],
            placeholder: 'sk-or-...'
        },
        custom: {
            label: 'Endpoint tùy chỉnh (OpenAI-compatible)',
            kind: 'openai',
            baseUrl: '',
            models: [],
            placeholder: 'sk-...'
        }
    };

    /* Các khóa KHÔNG phải khóa AI chat — vẫn nằm chung MỘT trang */
    const OTHER_SERVICES = [
        { id: 'alpha', name: 'Alpha Vantage', icon: '📈', desc: 'Giá chứng khoán thật (VN/Mỹ)', placeholder: 'demo' },
        { id: 'tavily', name: 'Tavily Search', icon: '🔍', desc: 'Tìm kiếm web thật cho AI', placeholder: 'tvly-...' },
        { id: 'sd', name: 'Stable Diffusion', icon: '🎨', desc: 'Sinh ảnh (API nội bộ/online)', placeholder: 'http://127.0.0.1:7860' },
        { id: 'weather', name: 'OpenWeather', icon: '🌤️', desc: 'Thời tiết realtime', placeholder: '' },
        { id: 'elevenlabs', name: 'ElevenLabs', icon: '🗣️', desc: 'Text-to-speech', placeholder: '' }
    ];

    const defaultState = () => ({
        ai: { provider: 'openai', key: '', model: 'gpt-4o-mini', baseUrl: '', temperature: 0.7 },
        others: {},      // { alpha: 'xxx', tavily: 'yyy', custom_name: 'zzz' }
        customNames: []  // tên khóa tự thêm
    });

    let state = defaultState();
    const listeners = [];

    function load() {
        try {
            const raw = localStorage.getItem(STORE);
            if (raw) state = Object.assign(defaultState(), JSON.parse(raw));
        } catch (e) { state = defaultState(); }

        // Gộp dữ liệu cũ (nếu có) về MỘT chỗ duy nhất
        let migrated = false;
        LEGACY.forEach(prefix => {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (!k || !k.startsWith(prefix)) continue;
                const svc = k.slice(prefix.length);
                const val = localStorage.getItem(k) || '';
                if (['openai', 'anthropic', 'gemini'].includes(svc)) {
                    if (!state.ai.key) { state.ai.key = val; state.ai.provider = svc; migrated = true; }
                } else if (!state.others[svc]) {
                    state.others[svc] = val; migrated = true;
                }
                localStorage.removeItem(k);
            }
        });
        if (migrated) save();
        return state;
    }

    function save() {
        try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
        listeners.forEach(fn => { try { fn(state); } catch (e) {} });
    }

    const RuneKeys = {
        PROVIDERS, OTHER_SERVICES, STORE,
        load,
        get state() { return state; },
        onChange(fn) { listeners.push(fn); },

        /* --- Khóa AI (chỉ 1 bộ duy nhất) --- */
        ai() { return state.ai; },
        provider(id) { return PROVIDERS[id] || PROVIDERS.custom; },
        setAi(patch) { Object.assign(state.ai, patch || {}); save(); },
        hasAi() { return !!(state.ai.key && state.ai.key.trim().length > 8); },
        aiBaseUrl() {
            if (state.ai.baseUrl && state.ai.baseUrl.trim()) return state.ai.baseUrl.trim().replace(/\/+$/, '');
            return RuneKeys.provider(state.ai.provider).baseUrl;
        },
        aiLabel() {
            const p = RuneKeys.provider(state.ai.provider);
            return state.ai.model ? `${p.label} · ${state.ai.model}` : p.label;
        },

        /* --- Các khóa khác --- */
        other(id) { return (state.others[id] || '').trim(); },
        setOther(id, key) {
            if (key === '' || key == null) delete state.others[id];
            else state.others[id] = String(key).trim();
            if (!OTHER_SERVICES.some(s => s.id === id) && !state.customNames.includes(id)) state.customNames.push(id);
            save();
        },
        removeOther(id) {
            delete state.others[id];
            state.customNames = state.customNames.filter(n => n !== id);
            save();
        },
        allOthers() {
            const known = OTHER_SERVICES.filter(s => state.others[s.id]);
            const custom = state.customNames.filter(n => state.others[n]).map(n => ({ id: n, name: n, icon: '🔐', desc: 'Khóa tự thêm' }));
            return known.concat(custom);
        },
        mask(key) {
            const k = String(key || '');
            if (k.length <= 8) return k ? '••••' : '';
            return k.slice(0, 4) + '•'.repeat(Math.min(12, k.length - 8)) + k.slice(-4);
        }
    };

    /* ================= 2. RUNE NET — backend C++ local ================= */
    let backendAlive = null; // null = chưa biết, true/false

    async function pingBackend(timeout = 1200) {
        if (backendAlive !== null) return backendAlive;
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeout);
        try {
            const r = await fetch('/api/health', { signal: ctl.signal, cache: 'no-store' });
            backendAlive = r.ok;
        } catch (e) { backendAlive = false; }
        clearTimeout(t);
        return backendAlive;
    }

    async function api(path, options) {
        const alive = await pingBackend();
        if (!alive) throw new Error('BACKEND_OFFLINE');
        const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
        const txt = await r.text();
        let data; try { data = JSON.parse(txt); } catch (e) { data = { raw: txt }; }
        if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
    }

    const RuneNet = {
        ping: pingBackend,
        isLive() { return backendAlive === true; },
        api,
        system() { return api('/api/system'); },
        market(country) { return api('/api/market?country=' + encodeURIComponent(country || 'VN')); },
        cli(command) { return api('/api/cli', { method: 'POST', body: JSON.stringify({ command }) }); },
        keysList() { return api('/api/keys'); },
        keysSave(service, key) { return api('/api/keys', { method: 'POST', body: JSON.stringify({ service, key }) }); },
        keysDelete(service) { return api('/api/keys?service=' + encodeURIComponent(service), { method: 'DELETE' }) }
    };

    /* ================= 3. RUNE AI — kết nối THẬT ================= */

    function sseLines(text) {
        return text.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
    }

    /* --- OpenAI / Groq / DeepSeek / OpenRouter / custom (chung 1 chuẩn) --- */
    async function streamOpenAI(cfg, messages, tools, handlers, signal) {
        const url = cfg.baseUrl + '/chat/completions';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + cfg.key
        };
        if (/openrouter/i.test(url)) {
            headers['HTTP-Referer'] = location.origin || 'https://rune.local';
            headers['X-Title'] = 'Rune Control Center';
        }
        const body = {
            model: cfg.model,
            messages,
            stream: true,
            temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.7
        };
        if (tools && tools.length) body.tools = tools.map(t => ({ type: 'function', function: t }));

        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
        if (!res.ok) throw await httpError(res, 'openai');
        if (!res.body) { // fallback không stream
            const j = await res.json();
            const c = j.choices && j.choices[0];
            if (c && c.message) return normalizeOpenAIMessage(c.message);
            throw new Error('Phản hồi trống từ nhà cung cấp');
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', text = '';
        const calls = {}; // index -> {id,name,args}

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split(/\n\n/);
            buf = parts.pop() || '';
            for (const part of parts) {
                for (const line of sseLines(part)) {
                    if (line === '[DONE]') continue;
                    let j; try { j = JSON.parse(line); } catch (e) { continue; }
                    const delta = j.choices && j.choices[0] && j.choices[0].delta;
                    if (!delta) continue;
                    if (delta.content) { text += delta.content; handlers.onDelta && handlers.onDelta(delta.content); }
                    (delta.tool_calls || []).forEach(tc => {
                        const i = tc.index == null ? 0 : tc.index;
                        calls[i] = calls[i] || { id: '', name: '', args: '' };
                        if (tc.id) calls[i].id = tc.id;
                        if (tc.function && tc.function.name) calls[i].name += tc.function.name;
                        if (tc.function && tc.function.arguments) calls[i].args += tc.function.arguments;
                    });
                }
            }
        }
        const toolCalls = Object.values(calls).filter(c => c.name).map(c => ({
            id: c.id || ('call_' + Math.random().toString(36).slice(2)),
            name: c.name,
            args: parseArgs(c.args)
        }));
        return { text, toolCalls };
    }

    function normalizeOpenAIMessage(m) {
        return {
            text: m.content || '',
            toolCalls: (m.tool_calls || []).map(tc => ({ id: tc.id, name: tc.function.name, args: parseArgs(tc.function.arguments) }))
        };
    }

    /* --- Anthropic Claude --- */
    async function streamAnthropic(cfg, messages, tools, handlers, signal) {
        const sys = [];
        const msgs = [];
        messages.forEach(m => {
            if (m.role === 'system') sys.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
            else if (m.role === 'tool') msgs.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] });
            else if (m.role === 'assistant' && m.tool_calls) {
                const content = [];
                if (m.content) content.push({ type: 'text', text: m.content });
                m.tool_calls.forEach(tc => content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: parseArgs(tc.function.arguments) }));
                msgs.push({ role: 'assistant', content });
            } else msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
        });

        const body = { model: cfg.model, max_tokens: 2048, messages: msgs, stream: true };
        if (sys.length) body.system = sys.join('\n\n');
        if (tools && tools.length) {
            body.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
        }

        const res = await fetch(cfg.baseUrl + '/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': cfg.key,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(body),
            signal
        });
        if (!res.ok) throw await httpError(res, 'anthropic');

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', text = '';
        let cur = null;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split(/\n\n/);
            buf = parts.pop() || '';
            for (const part of parts) {
                for (const line of sseLines(part)) {
                    let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
                    if (ev.type === 'content_block_start') {
                        const b = ev.content_block || {};
                        cur = b.type === 'tool_use' ? { id: b.id, name: b.name, args: '' } : { text: true };
                    } else if (ev.type === 'content_block_delta') {
                        const d = ev.delta || {};
                        if (d.type === 'text_delta' && d.text) { text += d.text; handlers.onDelta && handlers.onDelta(d.text); }
                        else if (d.type === 'input_json_delta' && cur && cur.name) cur.args += d.partial_json || '';
                    } else if (ev.type === 'content_block_stop') {
                        if (cur && cur.name) (handlers._calls = handlers._calls || []).push({ id: cur.id, name: cur.name, args: parseArgs(cur.args) });
                        cur = null;
                    } else if (ev.type === 'error') {
                        throw new Error((ev.error && ev.error.message) || 'Lỗi Anthropic');
                    }
                }
            }
        }
        return { text, toolCalls: handlers._calls || [] };
    }

    /* --- Google Gemini --- */
    async function streamGemini(cfg, messages, tools, handlers, signal) {
        const contents = [];
        let systemInstruction = '';
        messages.forEach(m => {
            if (m.role === 'system') { systemInstruction += (systemInstruction ? '\n' : '') + (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)); return; }
            if (m.role === 'tool') {
                contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name || 'tool', response: { result: typeof m.content === 'string' ? m.content : m.content } } }] });
                return;
            }
            if (m.role === 'assistant' && m.tool_calls) {
                contents.push({ role: 'model', parts: m.tool_calls.map(tc => ({ functionCall: { name: tc.function.name, args: parseArgs(tc.function.arguments) } })) });
                return;
            }
            contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: Array.isArray(m.content) ? m.content : [{ text: String(m.content || '') }] });
        });

        const body = { contents, generationConfig: { temperature: cfg.temperature == null ? 0.7 : cfg.temperature } };
        if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
        if (tools && tools.length) body.tools = [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }];

        const url = `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.key)}`;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
        if (!res.ok) throw await httpError(res, 'gemini');

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', text = '';
        const calls = [];

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split(/\n\n/);
            buf = parts.pop() || '';
            for (const part of parts) {
                for (const line of sseLines(part)) {
                    let j; try { j = JSON.parse(line); } catch (e) { continue; }
                    const c = j.candidates && j.candidates[0];
                    if (!c || !c.content) continue;
                    (c.content.parts || []).forEach(p => {
                        if (p.text) { text += p.text; handlers.onDelta && handlers.onDelta(p.text); }
                        if (p.functionCall) calls.push({ id: 'gem_' + Math.random().toString(36).slice(2), name: p.functionCall.name, args: p.functionCall.args || {} });
                    });
                }
            }
        }
        return { text, toolCalls: calls };
    }

    function parseArgs(a) {
        if (!a) return {};
        if (typeof a === 'object') return a;
        try { return JSON.parse(a); } catch (e) { return { _raw: a }; }
    }

    async function httpError(res, kind) {
        let msg = '';
        try {
            const t = await res.text();
            try { const j = JSON.parse(t); msg = (j.error && (j.error.message || j.error)) || j.message || t; } catch (e) { msg = t; }
        } catch (e) {}
        if (res.status === 401 || res.status === 403) return new Error('KEY_INVALID:' + (msg || 'Khóa API không hợp lệ hoặc hết hạn'));
        if (res.status === 404) return new Error('MODEL_NOT_FOUND:' + (msg || 'Không tìm thấy model này'));
        if (res.status === 429) return new Error('RATE_LIMIT:' + (msg || 'Hết lượt gọi (rate limit)'));
        return new Error('HTTP_' + res.status + ':' + (msg || 'Lỗi không xác định').toString().slice(0, 400));
    }

    const RuneAI = {
        providers: PROVIDERS,

        /* Gọi AI thật. opts: { messages, tools, onDelta, signal, cfg } */
        async chat(opts) {
            const cfg = opts.cfg || Object.assign({}, RuneKeys.ai(), { baseUrl: RuneKeys.aiBaseUrl() });
            if (!cfg.key) throw new Error('NO_KEY');
            if (!cfg.baseUrl) throw new Error('NO_BASE_URL:Chưa đặt địa chỉ API cho nhà cung cấp này');
            const kind = RuneKeys.provider(cfg.provider).kind;
            const handlers = { onDelta: opts.onDelta };
            if (kind === 'anthropic') return streamAnthropic(cfg, opts.messages, opts.tools, handlers, opts.signal);
            if (kind === 'gemini') return streamGemini(cfg, opts.messages, opts.tools, handlers, opts.signal);
            return streamOpenAI(cfg, opts.messages, opts.tools, handlers, opts.signal);
        },

        /* Tạo message kèm ảnh (multimodal) đúng chuẩn từng nhà cung cấp */
        visionMessages(prompt, dataUrl, mime) {
            const kind = RuneKeys.provider(RuneKeys.ai().provider).kind;
            const base64 = String(dataUrl).split(',')[1] || '';
            const m = mime || 'image/jpeg';
            if (kind === 'anthropic') {
                return [{
                    role: 'user', content: [
                        { type: 'image', source: { type: 'base64', media_type: m, data: base64 } },
                        { type: 'text', text: prompt }
                    ]
                }];
            }
            if (kind === 'gemini') {
                return [{ role: 'user', content: [{ text: prompt }, { inline_data: { mime_type: m, data: base64 } }] }];
            }
            return [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }];
        },

        /* Kiểm tra khóa thật: gọi 1 request nhỏ */
        async test(cfgOverride) {
            const cfg = Object.assign({}, RuneKeys.ai(), { baseUrl: RuneKeys.aiBaseUrl() }, cfgOverride || {});
            if (!cfg.key) return { ok: false, error: 'Chưa nhập khóa' };
            const started = Date.now();
            try {
                const out = await RuneAI.chat({
                    cfg,
                    messages: [{ role: 'user', content: 'Trả lời đúng 1 từ: OK' }],
                    tools: null
                });
                return { ok: true, ms: Date.now() - started, reply: (out.text || '').trim().slice(0, 60), model: cfg.model };
            } catch (e) {
                return { ok: false, ms: Date.now() - started, error: String(e.message || e) };
            }
        },

        isKeyError(msg) { return /^(NO_KEY|KEY_INVALID|MODEL_NOT_FOUND|RATE_LIMIT|NO_BASE_URL)/.test(String(msg || '')); },
        humanError(msg) {
            const m = String(msg || '');
            if (m === 'NO_KEY') return 'Chưa có khóa AI. Hãy vào trang 🔑 Khóa để nhập (chỉ cần nhập 1 lần duy nhất).';
            if (m.startsWith('KEY_INVALID')) return 'Khóa AI bị từ chối: ' + m.split(':').slice(1).join(':');
            if (m.startsWith('MODEL_NOT_FOUND')) return 'Model không tồn tại với nhà cung cấp này: ' + m.split(':').slice(1).join(':');
            if (m.startsWith('RATE_LIMIT')) return 'Bạn đang bị giới hạn lượt gọi. Đợi vài giây rồi gửi lại.';
            if (m === 'Failed to fetch' || m === 'NetworkError when attempting to fetch resource.') return 'Không gọi được máy chủ AI (mạng/CORS). Kiểm tra kết nối internet, hoặc chạy backend C++ để dùng chế độ proxy.';
            if (m.startsWith('HTTP_')) return 'Máy chủ AI trả lỗi: ' + m.split(':').slice(1).join(':');
            return m;
        }
    };

    /* ================= 4. RUNE UI ================= */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function md(src) {
        let s = esc(src);
        // code blocks
        s = s.replace(/```([\s\S]*?)```/g, (_, c) => `<pre class="md-pre"><code>${c.replace(/^\n/, '')}</code></pre>`);
        s = s.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
        s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>');
        s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        // headings + lists
        const lines = s.split('\n');
        let out = '', inList = false, inOl = false;
        lines.forEach(line => {
            const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
            const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
            const h = /^\s*(#{1,4})\s+(.*)$/.exec(line);
            if (ul) { if (!inList) { out += '<ul class="md-ul">'; inList = true; } out += `<li>${ul[1]}</li>`; return; }
            if (ol) { if (!inOl) { out += '<ol class="md-ul">'; inOl = true; } out += `<li>${ol[1]}</li>`; return; }
            if (inList) { out += '</ul>'; inList = false; }
            if (inOl) { out += '</ol>'; inOl = false; }
            if (h) { out += `<div class="md-h">${h[2]}</div>`; return; }
            if (!line.trim()) { out += '<div class="md-gap"></div>'; return; }
            out += `<div>${line}</div>`;
        });
        if (inList) out += '</ul>';
        if (inOl) out += '</ol>';
        return out;
    }

    function toast(msg, type) {
        let host = document.getElementById('runeToasts');
        if (!host) {
            host = document.createElement('div');
            host.id = 'runeToasts';
            host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;';
            document.body.appendChild(host);
        }
        const el = document.createElement('div');
        const bg = type === 'error' ? '#ef4444' : type === 'ok' ? '#10b981' : 'rgba(30,30,40,0.95)';
        el.style.cssText = `background:${bg};color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;max-width:360px;box-shadow:0 8px 24px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.15);animation:runeIn .18s ease;`;
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, type === 'error' ? 5200 : 2800);
    }

    /* Modal dùng chung (thay cho prompt/alert — hoạt động cả trong iframe) */
    function modal(opts) {
        return new Promise(resolve => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
            const o = Object.assign({ title: '', message: '', input: false, value: '', type: 'text', ok: 'OK', cancel: 'Hủy', danger: false }, opts);
            wrap.innerHTML = `
              <div style="background:#20202a;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:20px;width:min(460px,100%);color:#e8e8f0;font-family:inherit;box-shadow:0 24px 60px rgba(0,0,0,.6);">
                <div style="font-weight:700;font-size:15px;margin-bottom:8px;">${esc(o.title)}</div>
                ${o.message ? `<div style="font-size:13px;color:#b6b6c6;margin-bottom:12px;white-space:pre-wrap;">${esc(o.message)}</div>` : ''}
                ${o.input ? `<input id="runeModalInput" type="${o.type}" value="${esc(o.value)}" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#14141c;color:#fff;font-size:13px;margin-bottom:12px;">` : ''}
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                  ${o.cancel ? `<button data-x="cancel" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:transparent;color:#cfcfe0;cursor:pointer;font-size:13px;">${esc(o.cancel)}</button>` : ''}
                  <button data-x="ok" style="padding:8px 16px;border-radius:8px;border:none;background:${o.danger ? '#ef4444' : 'linear-gradient(135deg,#8b5cf6,#06b6d4)'};color:#fff;cursor:pointer;font-weight:600;font-size:13px;">${esc(o.ok)}</button>
                </div>
              </div>`;
            document.body.appendChild(wrap);
            const input = wrap.querySelector('#runeModalInput');
            if (input) { input.focus(); input.select(); }
            const close = val => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
            const onKey = e => {
                if (e.key === 'Escape') close(null);
                if (e.key === 'Enter' && input) close(input.value);
            };
            document.addEventListener('keydown', onKey);
            wrap.addEventListener('click', e => {
                if (e.target === wrap) close(null);
                const b = e.target.closest('[data-x]');
                if (!b) return;
                if (b.dataset.x === 'ok') close(input ? input.value : true);
                else close(null);
            });
        });
    }

    const RuneUI = { esc, md, toast, modal, confirm: o => modal(Object.assign({ ok: 'Xác nhận', danger: true }, o)) };

    /* ================= EXPORT ================= */
    window.RuneKeys = RuneKeys;
    window.RuneAI = RuneAI;
    window.RuneNet = RuneNet;
    window.RuneUI = RuneUI;
    RuneKeys.load();

    const st = document.createElement('style');
    st.textContent = `@keyframes runeIn{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}
    .md-pre{background:#0d0d14;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px;overflow:auto;margin:6px 0;font-size:12px}
    .md-code{background:rgba(139,92,246,.18);padding:1px 5px;border-radius:4px;font-size:12px}
    .md-ul{margin:4px 0 4px 18px}.md-ul li{margin:2px 0}
    .md-h{font-weight:700;margin:8px 0 2px}.md-gap{height:6px}`;
    document.head.appendChild(st);
})();
