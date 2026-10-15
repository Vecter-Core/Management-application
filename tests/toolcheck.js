/* Kiểm tra 5 tool AI hệ thống trả về DỮ LIỆU THẬT (gọi backend C++). */
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
const vc = new VirtualConsole();
vc.on('jsdomError', e => { const m = String(e.message || e); if (!/Not implemented|Could not parse CSS/.test(m)) errors.push(m.slice(0, 200)); });
vc.on('error', (...a) => errors.push(a.map(String).join(' ').slice(0, 200)));

const dom = new JSDOM(fs.readFileSync(ROOT + '/index.html', 'utf8'), { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.fetch = (u, o) => global.fetch(new URL(u, BASE).href, o);
w.Chart = function (ctx, cfg) { this.data = cfg && cfg.data; this.destroy = () => { }; this.update = () => { }; };

(async () => {
    w.eval(fs.readFileSync(ROOT + '/core.js', 'utf8'));
    w.eval(fs.readFileSync(ROOT + '/app.js', 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
    await new Promise(r => setTimeout(r, 8000));

    const T = w.Rune.tools;
    const show = (n, o) => console.log('\n── ' + n + ' ──\n' + JSON.stringify(o, null, 1).slice(0, 1400));

    show('get_system_info', await T.get_system_info.execute());
    show('get_market_data(VN)', await T.get_market_data.execute({ country: 'VN' }));
    show('show_health', await T.show_health.execute());
    show('optimize_system (chỉ đo)', await T.optimize_system.execute({}));
    show('kill_process (tên không tồn tại → phải báo lỗi thật)', await T.kill_process.execute({ name: 'zzz-khong-ton-tai-xyz' }));

    console.log('\nlỗi JS: ' + errors.length + (errors.length ? ' → ' + errors[0] : ''));
    process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
