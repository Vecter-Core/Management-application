/* Kiểm tra: mọi #id mà app.js/core.js tham chiếu phải tồn tại trong index.html
   hoặc được chính JS tạo ra (document.createElement + .id = '...').            */
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

const ROOT = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
const js = ['app.js', 'core.js'].map(f => fs.readFileSync(ROOT + '/' + f, 'utf8')).join('\n');

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const createdIds = new Set([...js.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m => m[1]));
/* id sinh ra từ innerHTML/template string trong JS, vd: `<a href="#" id="footKeys">` */
[...js.matchAll(/id="([^"$]+)"/g)].forEach(m => createdIds.add(m[1]));
const usedIds = new Set();
for (const m of js.matchAll(/\$\('#([A-Za-z0-9_-]+)'/g)) usedIds.add(m[1]);
for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) usedIds.add(m[1]);
for (const m of js.matchAll(/onSel\('#([A-Za-z0-9_-]+)'/g)) usedIds.add(m[1]);
/* bỏ selector ghép động kiểu $('#page-' + name) */
[...js.matchAll(/\$\('#([A-Za-z0-9_-]*)'\s*\+/g)].forEach(m => usedIds.delete(m[1]));

const missing = [...usedIds].filter(id => !htmlIds.has(id) && !createdIds.has(id));
console.log('id trong HTML      :', htmlIds.size);
console.log('id JS tự tạo       :', createdIds.size);
console.log('id JS tham chiếu   :', usedIds.size);
console.log(missing.length ? '❌ THIẾU: ' + missing.join(', ') : '✅ Không thiếu id nào');

/* các selector class mà JS dùng phải có trong HTML hoặc do JS sinh ra */
const usedSel = new Set([...js.matchAll(/\$\$\('\.([A-Za-z0-9_-]+)/g)].map(m => m[1]));
const missingSel = [...usedSel].filter(c => !html.includes(c) && !js.includes("className = '" + c) && !js.includes('class="' + c) && !js.includes(`class="${c}`) && !js.includes("'" + c + "'"));
console.log(missingSel.length ? 'lưu ý class: ' + missingSel.join(', ') : '✅ class JS dùng đều có nguồn');

/* không còn chuỗi "mô phỏng dữ liệu" ngầm: mọi chỗ dùng từ simulat phải là nhãn trung thực */
const suspicious = [...js.matchAll(/.{60}(Math\.random).{60}/g)].map(m => m[0].replace(/\s+/g, ' '));
console.log('\nMath.random còn lại trong app.js/core.js: ' + suspicious.length);
suspicious.forEach(s => console.log('  • ' + s));
process.exit(missing.length ? 1 : 0);
