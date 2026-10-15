/* Harness kiểm tra THẬT: nạp index.html + core.js + app.js trong jsdom,
   trỏ fetch vào backend C++ đang chạy (dữ liệu thật), rồi khẳng định UI
   hiển thị số liệu thật — không còn giá trị mô phỏng.                   */
const fs = require('fs');
const path = require('path');
/* jsdom: thử nạp từ tests/node_modules → node_modules gốc → toàn cục */
const JSDOM_PATH = (() => {
    const cands = [
        path.join(__dirname, 'node_modules', 'jsdom'),
        path.join(__dirname, '..', 'node_modules', 'jsdom'),
        'jsdom'
    ];
    for (const c of cands) { try { require.resolve(c); return c; } catch (e) { } }
    console.error('Thiếu jsdom. Chạy:  cd tests && npm install jsdom   (hoặc: npm i -g jsdom)');
    process.exit(3);
})();

const { JSDOM, VirtualConsole } = require(JSDOM_PATH);



const ROOT = path.join(__dirname, '..', 'public');
const BASE = process.env.BASE || 'http://127.0.0.1:8096/';
const errors = [];
const warns = [];

const vc = new VirtualConsole();
vc.on('jsdomError', e => {
    const m = String(e.message || e);
    if (/Not implemented: HTMLCanvasElement|Not implemented: document.execCommand|Could not parse CSS/.test(m)) { warns.push(m.slice(0, 90)); return; }
    errors.push('jsdomError: ' + m.slice(0, 300));
});
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ').slice(0, 300)));
vc.on('warn', (...a) => warns.push('console.warn: ' + a.map(String).join(' ').slice(0, 160)));
vc.on('log', (...a) => { const t = a.map(String).join(' '); if (/initialized/.test(t)) console.log('  [app]', t); });

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;

/* fetch thật → backend C++ (Node 22 có fetch toàn cục) */
w.fetch = (u, o) => global.fetch(new URL(u, BASE).href, o);
/* Chart.js giả lập (jsdom không có canvas thật) */
w.Chart = function (ctx, cfg) { this.ctx = ctx; this.data = cfg && cfg.data; this.destroy = () => { }; this.update = () => { }; };
/* ghi nhận mọi listener để phát hiện nút "chết" */
const listeners = new Map();
const origAdd = w.EventTarget.prototype.addEventListener;
w.EventTarget.prototype.addEventListener = function (type, fn, opt) {
    if (this instanceof w.Element || this === w.document || this === w) {
        const key = (this.id ? '#' + this.id : (this.className && typeof this.className === 'string' ? '.' + this.className.split(' ')[0] : this.nodeName));
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(type);
    }
    return origAdd.call(this, type, fn, opt);
};

const txt = sel => { const e = w.document.querySelector(sel); return e ? (e.textContent || '').trim() : null; };
const cnt = sel => w.document.querySelectorAll(sel).length;

async function main() {
    w.eval(fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8'));
    w.eval(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

    await new Promise(r => setTimeout(r, 9000));   // chờ init + realScan + market

    const checks = [];
    const ok = (name, cond, detail) => checks.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail).slice(0, 150) });

    /* ---------- 1. tiến trình thật ---------- */
    const rows = cnt('#processTableBody tr');
    const ptxt = txt('#processTableBody');
    ok('Tiến trình: có dòng thật từ /proc', rows > 3 && !/Đang đọc|Cần backend/.test(ptxt), rows + ' dòng');
    ok('Tiến trình: thấy tiến trình có thật trên máy', /rune_server|systemd|envd|curl|node/.test(ptxt || ''), (ptxt || '').replace(/\s+/g, ' ').slice(0, 90));
    ok('Tiến trình: không còn hàng giả (chrome.exe/miner.exe)', !/chrome\.exe|miner\.exe|discord\.exe/.test(ptxt || ''));
    ok('Tiến trình: có nút "Kết thúc" thật + ghi nguồn', cnt('#processTableBody .proc-kill') > 0 && /tiến trình thật từ \/proc/.test(txt('#processSource') || ''), txt('#processSource'));

    /* ---------- 2. kết nối thật ---------- */
    const ctxt = txt('#connectionList');
    ok('Kết nối: render từ /proc/net', cnt('#connectionList .conn-item') > 0 && !/192\.168\.1\.100|142\.250/.test(ctxt || ''), cnt('#connectionList .conn-item') + ' kết nối');
    ok('Kết nối: cổng mở ra ngoài (số thật)', /\d+ cổng/.test(txt('#openPorts') || ''), txt('#openPorts'));

    /* ---------- 3. bảo mật thật ---------- */
    const stxt = txt('#securityGrid');
    ok('Bảo mật: có các mục quét thật', cnt('#securityGrid .security-item') >= 8 && !/Tường lửa \(Firewall\)\s*Đang bật/.test(stxt || ''), cnt('#securityGrid .security-item') + ' mục');
    ok('Bảo mật: ghi rõ nguồn kiểm tra', /nguồn kiểm tra:/.test(stxt || ''), (stxt || '').replace(/\s+/g, ' ').slice(0, 80));
    const score = txt('#healthScore');
    ok('Điểm sức khỏe: số thật (không phải 87 cứng)', /^\d+$/.test(score || '') && score !== '87', score + '/100 · ' + txt('#healthStatus'));
    ok('Tóm tắt sức khỏe: đếm thật', /\d+ mục an toàn/.test(txt('#healthSummary') || ''), txt('#healthSummary'));

    /* ---------- 4. mạng thật ---------- */
    ok('IP Local: đọc từ getifaddrs', /^\d+\.\d+\.\d+\.\d+/.test(txt('#localIp') || ''), txt('#localIp'));
    ok('Trạng thái mạng: gateway/DNS thật', /gateway|chưa rõ|Đã kết nối|Không ra được/.test(txt('#netStatus') || ''), txt('#netStatus'));
    ok('IP Public/ISP: trung thực (— nếu không lấy được)', txt('#publicIp') !== '127.0.0.1', txt('#publicIp') + ' | ISP: ' + txt('#ispVal'));
    ok('Ping: đo TCP thật', /ms|Không kết nối|Cần backend/.test(txt('#pingResult') || ''), (txt('#pingResult') || '').slice(0, 110));

    /* ---------- 5. tối ưu thật ---------- */
    ok('Tối ưu: báo cáo /proc/meminfo thật', /RAM: tổng|MB/.test(txt('#optimizeStats') || ''), (txt('#optimizeStats') || '').replace(/\s+/g, ' ').slice(0, 100));
    ok('Tối ưu: có nút hành động whitelist', cnt('#optimizeActions .opt-action button') >= 3, cnt('#optimizeActions .opt-action') + ' hành động');

    /* ---------- 6. thị trường: không bịa số ---------- */
    const idx = txt('#idxValue');
    const ban = txt('#marketBanner');
    const real = Rune_live() && !/Chưa có số liệu thật/.test(ban || '');
    ok('Thị trường: hoặc số thật, hoặc "—" + lý do', (idx === '—' && /⚠️/.test(ban || '')) || /^[\d.,]+/.test(idx || ''), 'idxValue=' + idx);
    ok('Thị trường: không còn số mẫu cứng (1287.4/5872)', !/1287\.40|5,872|5872/.test(idx || '') && !/Vingroup\s*45\.80/.test(txt('#stockTableBody') || ''), (txt('#stockTableBody') || '').replace(/\s+/g, ' ').slice(0, 70));
    ok('Thị trường: ghi rõ nguồn', /📡|Chưa kết nối/.test(txt('#marketSource') || '') || /⚠️/.test(ban || ''), txt('#marketSource') || ban);

    /* ---------- 7. tài nguyên máy ---------- */
    const cpu = txt('#cpuUsage'), ram = txt('#ramUsed');
    ok('CPU/RAM: số thật hoặc "—"', (cpu === '—' || /^\d+\.\d%$/.test(cpu)) && (ram === '—' || /MB|GB/.test(ram)), 'cpu=' + cpu + ' ram=' + ram);
    ok('Không còn nhiệt độ giả 62°C', txt('#cpuTemp') !== '62°C', txt('#cpuTemp'));

    /* ---------- 8. công cụ AI dùng endpoint thật ---------- */
    const tools = w.Rune && w.Rune.tools ? w.Rune.tools : null;
    ok('window.Rune xuất khẩu + đủ 20 tool', tools && Object.keys(tools).length >= 20, tools ? Object.keys(tools).length + ' tool' : 'thiếu');
    if (tools) {
        const src = String(tools.show_health.execute) + String(tools.kill_process.execute) + String(tools.optimize_system.execute);
        ok('show_health/kill_process/optimize_system gọi endpoint thật', /RuneNet\.security|RuneNet\.kill|RuneNet\.optimize/.test(src) && !/processTableBody tr|pkill -f/.test(src));
    }

    /* ---------- 9. nút chết ---------- */
    const dead = [];
    w.document.querySelectorAll('#page-dashboard button, #page-dashboard .btn-fix, #page-dashboard .proc-kill').forEach(b => {
        const key = b.id ? '#' + b.id : '.' + (typeof b.className === 'string' ? b.className.split(' ')[0] : '');
        const own = listeners.has(key) && listeners.get(key).has('click');
        const delegated = listeners.has('#processTableBody') || listeners.has('document');
        if (!own && !delegated) dead.push(b.id || b.className || b.textContent.slice(0, 24));
    });
    ok('Không có nút chết ở Dashboard', dead.length === 0, dead.join(', '));

    /* ---------- 10. không lỗi JS ---------- */
    ok('Không có lỗi JS trong quá trình chạy', errors.length === 0, errors.slice(0, 3).join(' | '));

    /* ---------- in kết quả ---------- */
    let pass = 0;
    checks.forEach(c => {
        if (c.pass) pass++;
        console.log((c.pass ? '  ✅ ' : '  ❌ ') + c.name + (c.detail ? '  →  ' + c.detail : ''));
    });
    console.log(`\n${pass}/${checks.length} kiểm tra đạt`);
    if (warns.length) console.log('cảnh báo (bỏ qua): ' + warns.length + ' · vd: ' + warns[0]);
    if (errors.length) { console.log('\nLỖI:'); errors.slice(0, 8).forEach(e => console.log('  • ' + e)); }
    process.exit(pass === checks.length ? 0 : 1);
}

function Rune_live() { try { return w.RuneNet.isLive(); } catch (e) { return false; } }

main().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
