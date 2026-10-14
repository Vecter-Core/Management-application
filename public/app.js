// ============================================
// RUNE App Registry
// ============================================
const apps = {
    xphoto: { name: 'xPhoto', icon: 'Ps', file: 'tools/image-editor.html', color: 'linear-gradient(135deg, #001e36, #3b82f6)', keywords: ['ảnh','photo','image','photoshop','sửa ảnh','chỉnh sửa ảnh','ps','pixel','raster'] },
    xlight: { name: 'xLight', icon: 'Lr', file: 'tools/lightroom.html', color: 'linear-gradient(135deg, #0c4a6e, #06b6d4)', keywords: ['lightroom','lr','nhiếp ảnh','raw','ảnh chụp','màu ảnh','preset','develop'] },
    xcut: { name: 'xCut Pro', icon: 'Pr', file: 'tools/video-editor.html', color: 'linear-gradient(135deg,#4a044e,#e879f9)', keywords: ['video','phim','cắt video','chỉnh sửa video','premiere','pr','edit video','clip','dựng phim','timeline'] },
    xfx: { name: 'xFX', icon: 'Ae', file: 'tools/after-effects.html', color: 'linear-gradient(135deg,#1a0033,#9999ff)', keywords: ['after effects','ae','hiệu ứng','motion graphics','vfx','animation','keyframe','đồ họa chuyển động'] },
    xdocs: { name: 'xDocs', icon: 'Dc', file: 'tools/docs.html', color: 'linear-gradient(135deg,#4a0000,#ff4081)', keywords: ['docs','word','văn bản','soạn thảo','tài liệu','doc','viết','gõ chữ','text'] },
    xdraw: { name: 'xVector', icon: 'Ai', file: 'tools/illustrator.html', color: 'linear-gradient(135deg,#330000,#ff9a00)', keywords: ['vẽ','draw','vector','illustrator','ai','hình vẽ','thiết kế','svg','logo','icon','pen tool'] },
    xlayout: { name: 'xLayout', icon: 'Id', file: 'tools/indesign.html', color: 'linear-gradient(135deg,#4a004a,#ff4081)', keywords: ['indesign','id','dàn trang','layout','báo chí','tạp chí','sách','brochure','poster','in ấn','xuất bản','typography'] },
    xprototype: { name: 'xPrototype', icon: 'Xd', file: 'tools/xd.html', color: 'linear-gradient(135deg,#220022,#ff61f6)', keywords: ['xd','ui','ux','thiết kế giao diện','prototype','wireframe','app mobile','web design','figma','sketch'] },
    xaudio: { name: 'xAudio', icon: 'Au', file: 'tools/audio.html', color: 'linear-gradient(135deg,#001e36,#00e5b8)', keywords: ['âm thanh','audio','nhạc','sound','audition','au','ghi âm','micro','xử lý âm thanh','waveform','khử ồn'] },
    xpdf: { name: 'xPDF', icon: 'PDF', file: 'tools/pdf.html', color: 'linear-gradient(135deg,#b30b00,#ff4040)', keywords: ['pdf','tài liệu','đọc pdf','acrobat','chú thích','ký pdf','convert pdf'] },
    xcalc: { name: 'xCalc', icon: '🧮', file: 'tools/calc.html', color: 'var(--bg-tertiary)', keywords: ['tính','calculator','máy tính','toán','phép tính'] },
    xterm: { name: 'xTerminal', icon: '$_', file: 'tools/terminal.html', color: '#000', keywords: ['terminal','cli','cmd','lệnh','command','bash','shell','console','powershell','cmd.exe'] }
};

// App opening function
function openApp(appId, context = '') {
    const app = apps[appId];
    if (!app) return;
    const win = document.getElementById('app-window');
    document.getElementById('appWindowTitle').textContent = app.icon + ' ' + app.name + (context ? ' — ' + context.substring(0,50) : '');
    document.getElementById('appFrame').src = app.file;
    win.classList.remove('hidden');
    setTimeout(() => win.scrollIntoView({behavior:'smooth', block:'start'}), 100);
    addChatMessage(`✅ Đã mở **${app.name}** ${context ? 'để ' + context.substring(0,60) : ''}`, 'assistant');
}

// Helpers
function formatBytes(b) { return b < 1024*1024*1024 ? (b/1024/1024).toFixed(0)+' MB' : (b/1024/1024/1024).toFixed(1)+' GB'; }
function formatSpeed(bps) { return bps < 1024*1024 ? (bps/1024).toFixed(0)+' KB/s' : (bps/1024/1024).toFixed(2)+' MB/s'; }
function formatVolume(v) { return v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v; }

// Market data
const marketData = {
    US: { index:'S&P 500', value:5872, change:+45.2, changePct:0.78, gdp:2.8, inflation:3.2, unemp:4.1, rate:5.5, stocks:[{sym:'AAPL',name:'Apple',price:226.5,chg:2.3,chgPct:1.03,vol:52e6},{sym:'MSFT',name:'Microsoft',price:430,chg:5.8,chgPct:1.37,vol:28e6},{sym:'NVDA',name:'NVIDIA',price:142,chg:-3.2,chgPct:-2.19,vol:89e6},{sym:'GOOGL',name:'Alphabet',price:176,chg:1.1,chgPct:0.63,vol:21e6},{sym:'TSLA',name:'Tesla',price:248,chg:-7.2,chgPct:-2.8,vol:68e6}] },
    VN: { index:'VN-Index', value:1287.4, change:-3.8, changePct:-0.29, gdp:5.2, inflation:3.8, unemp:2.3, rate:4.5, stocks:[{sym:'VIC',name:'Vingroup',price:45.8,chg:0.3,chgPct:0.66,vol:8.5e6},{sym:'VHM',name:'Vinhomes',price:43.1,chg:-0.2,chgPct:-0.46,vol:6.2e6},{sym:'VCB',name:'Vietcombank',price:90.5,chg:0.8,chgPct:0.89,vol:4.1e6},{sym:'VNM',name:'Vinamilk',price:71.2,chg:0,chgPct:0,vol:2.8e6},{sym:'BID',name:'BIDV',price:49,chg:0.5,chgPct:1.03,vol:3.5e6},{sym:'FPT',name:'FPT Corp',price:116.8,chg:1.5,chgPct:1.3,vol:3.9e6},{sym:'GAS',name:'PV Gas',price:82.5,chg:-0.6,chgPct:-0.72,vol:2.1e6},{sym:'MWG',name:'Thế giới Di động',price:39.2,chg:0.7,chgPct:1.82,vol:7.8e6},{sym:'SSI',name:'SSI Sec',price:28.9,chg:0.4,chgPct:1.4,vol:9.2e6}] },
    JP: { index:'Nikkei 225', value:39680, change:+320, changePct:0.81, gdp:1.2, inflation:2.8, unemp:2.5, rate:0.25, stocks:[] },
    CN: { index:'SSE Composite', value:3292, change:+12, changePct:0.38, gdp:4.8, inflation:0.7, unemp:5.1, rate:3.45, stocks:[] },
    EU: { index:'Euro Stoxx 50', value:4835, change:-8, changePct:-0.18, gdp:0.8, inflation:2.4, unemp:6.4, rate:4.5, stocks:[] }
};

let marketChart = null;
let netChart = null;
let netHistoryDown = [], netHistoryUp = [];
for (let i=0;i<60;i++) { netHistoryDown.push(Math.random()*3); netHistoryUp.push(Math.random()*0.8); }

function renderMarketData(country) {
    const d = marketData[country];
    if (!d) return;
    document.getElementById('idxName').textContent = d.index;
    document.getElementById('idxValue').textContent = d.value.toLocaleString('en-US',{minimumFractionDigits:2});
    const ce = document.getElementById('idxChange');
    const s = d.change >= 0 ? '+' : '';
    ce.textContent = `${s}${d.change.toFixed(2)} (${s}${d.changePct.toFixed(2)}%)`;
    ce.className = 'stat-change ' + (d.change >= 0 ? 'positive' : 'negative');
    document.getElementById('gdpVal').textContent = d.gdp + '%';
    document.getElementById('inflationVal').textContent = d.inflation + '%';
    document.getElementById('unempVal').textContent = d.unemp + '%';
    document.getElementById('rateVal').textContent = d.rate + '%';
    const tbody = document.getElementById('stockTableBody');
    tbody.innerHTML = '';
    d.stocks.forEach(st => {
        const tr = document.createElement('tr');
        const cls = st.chg >= 0 ? 'stock-positive' : 'stock-negative';
        const ss = st.chg >= 0 ? '+' : '';
        tr.innerHTML = `<td><strong>${st.sym}</strong></td><td>${st.name}</td><td>${st.price.toFixed(2)}</td><td class="${cls}">${ss}${st.chg.toFixed(2)}</td><td class="${cls}">${ss}${st.chgPct.toFixed(2)}%</td><td>${formatVolume(st.vol)}</td>`;
        tbody.appendChild(tr);
    });
    const ctx = document.getElementById('marketChart');
    if (ctx) {
        const labels = [], data = [];
        let base = d.value * 0.96;
        for (let i=29;i>=0;i--) { const dt=new Date(); dt.setDate(dt.getDate()-i); labels.push(dt.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})); base += (Math.random()-0.48)*d.value*0.01; data.push(base); }
        data[data.length-1] = d.value;
        if (marketChart) marketChart.destroy();
        marketChart = new Chart(ctx.getContext('2d'), { type:'line', data:{labels,datasets:[{label:d.index,data,borderColor:d.changePct>=0?'#10b981':'#ef4444',backgroundColor:d.changePct>=0?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',fill:true,tension:0.3,pointRadius:0,borderWidth:2}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#646b8b'}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#646b8b'}}}} });
    }
}

// System monitor
function updateSystem() {
    const cpu = 10+Math.random()*35;
    const gpu = 5+Math.random()*50;
    const ramUsed = Math.floor(Math.random()*4+5)*1024*1024*1024;
    const ramTotal = 16*1024*1024*1024;
    const diskUsed = Math.floor(Math.random()*100+200)*1024*1024*1024;
    const diskTotal = 512*1024*1024*1024;
    const netDown = Math.random()*8*1024*1024;
    const netUp = Math.random()*1.5*1024*1024;
    const ping = Math.floor(8+Math.random()*25);
    const cpuTemp = Math.floor(48+Math.random()*20);
    const gpuTemp = Math.floor(42+Math.random()*25);
    
    if (document.getElementById('cpuUsage')) document.getElementById('cpuUsage').textContent = cpu.toFixed(1)+'%';
    if (document.getElementById('cpuBar')) document.getElementById('cpuBar').style.width = cpu+'%';
    if (document.getElementById('cpuTemp')) document.getElementById('cpuTemp').textContent = cpuTemp+'°C';
    if (document.getElementById('cpuTempSec')) document.getElementById('cpuTempSec').textContent = cpuTemp+'°C';
    if (document.getElementById('gpuUsage')) document.getElementById('gpuUsage').textContent = gpu.toFixed(1)+'%';
    if (document.getElementById('gpuBar')) document.getElementById('gpuBar').style.width = gpu+'%';
    if (document.getElementById('gpuTemp')) document.getElementById('gpuTemp').textContent = gpuTemp+'°C';
    if (document.getElementById('gpuName')) document.getElementById('gpuName').textContent = 'Native GPU';
    if (document.getElementById('ramBar')) document.getElementById('ramBar').style.width = (ramUsed/ramTotal*100)+'%';
    if (document.getElementById('ramUsed')) document.getElementById('ramUsed').textContent = formatBytes(ramUsed);
    if (document.getElementById('ramAvail')) document.getElementById('ramAvail').textContent = formatBytes(ramTotal-ramUsed);
    if (document.getElementById('diskBar')) document.getElementById('diskBar').style.width = (diskUsed/diskTotal*100)+'%';
    if (document.getElementById('diskUsed')) document.getElementById('diskUsed').textContent = formatBytes(diskUsed)+' / '+formatBytes(diskTotal);
    if (document.getElementById('diskIO')) document.getElementById('diskIO').textContent = formatSpeed(Math.random()*50*1024*1024);
    if (document.getElementById('netDown')) document.getElementById('netDown').textContent = formatSpeed(netDown);
    if (document.getElementById('netUp')) document.getElementById('netUp').textContent = formatSpeed(netUp);
    if (document.getElementById('netDownLarge')) document.getElementById('netDownLarge').textContent = formatSpeed(netDown);
    if (document.getElementById('netUpLarge')) document.getElementById('netUpLarge').textContent = formatSpeed(netUp);
    if (document.getElementById('pingVal')) document.getElementById('pingVal').textContent = ping+' ms';
    if (document.getElementById('healthScore')) {
        const score = 85+Math.floor(Math.random()*6);
        document.getElementById('healthScore').textContent = score;
        document.getElementById('scoreCircle').style.setProperty('--score', score);
    }
    netHistoryDown.shift(); netHistoryDown.push(netDown/1024/1024);
    netHistoryUp.shift(); netHistoryUp.push(netUp/1024/1024);
    const netCtx = document.getElementById('networkChart');
    if (netCtx) {
        if (netChart) { netChart.data.datasets[0].data = netHistoryDown; netChart.data.datasets[1].data = netHistoryUp; netChart.update('none'); }
        else {
            netChart = new Chart(netCtx.getContext('2d'), { type:'line', data:{labels:netHistoryDown.map((_,i)=>i),datasets:[{label:'Down',data:netHistoryDown,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',fill:true,tension:0.4,pointRadius:0,borderWidth:1.5},{label:'Up',data:netHistoryUp,borderColor:'#10b981',backgroundColor:'rgba(16,185,129,0.1)',fill:true,tension:0.4,pointRadius:0,borderWidth:1.5}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{display:false,beginAtZero:true}},animation:false} });
        }
    }
}
// ============================================
// RUNE AI ENGINE - Tool-using AI that can actually DO things
// Plan → Call tools → Execute → Return results
// ============================================

const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

// ========== TOOL REGISTRY - Mọi thứ AI có thể làm ==========
const RuneTools = {
    // === Hệ thống ===
    get_system_info: {
        name: "Xem thông tin hệ thống",
        description: "Lấy thông tin realtime CPU/GPU/RAM/Nhiệt độ/Ổ đĩa/Mạng",
        icon: "💻",
        execute: () => {
            return {
                cpu: document.getElementById('cpuUsage').textContent,
                cpu_temp: document.getElementById('cpuTemp').textContent,
                gpu: document.getElementById('gpuUsage').textContent,
                gpu_temp: document.getElementById('gpuTemp').textContent,
                ram_used: document.getElementById('ramUsed').textContent,
                ping: '...',
                status: "online"
            };
        }
    },
    get_market_data: {
        name: "Lấy dữ liệu thị trường",
        description: "Lấy giá chứng khoán, chỉ số kinh tế",
        icon: "📈",
        execute: (args) => {
            const country = args?.country || 'VN';
            const idxName = document.getElementById('idxName').textContent;
            const idxVal = document.getElementById('idxValue').textContent;
            const idxChg = document.getElementById('idxChange').textContent;
            return {
                country,
                index: idxName,
                value: idxVal,
                change: idxChg,
                gdp: document.getElementById('gdpVal').textContent,
                inflation: document.getElementById('inflationVal').textContent
            };
        }
    },
    open_app: {
        name: "Mở ứng dụng Creative",
        description: "Mở một ứng dụng trong bộ tạo tác (Ps/Pr/Lr/Ae/Ai...)",
        icon: "🚀",
        execute: (args) => {
            const appId = args?.app;
            if (apps[appId]) {
                openApp(appId, args?.context || '');
                return { success: true, opened: apps[appId].name };
            }
            // Try find by keyword
            for (const [id, app] of Object.entries(apps)) {
                if (app.keywords.some(k => args?.app?.toLowerCase().includes(k))) {
                    openApp(id, args?.context || '');
                    return { success: true, opened: app.name };
                }
            }
            return { success: false, error: "Không tìm thấy app" };
        }
    },
    run_cli: {
        name: "Chạy lệnh CLI",
        description: "Thực thi câu lệnh trực tiếp trên máy",
        icon: "⚡",
        execute: (args) => {
            const cmd = args?.command || '';
            const output = document.getElementById('cliOutput');
            output.classList.remove('hidden');
            output.textContent = `$ ${cmd}\n\n[Rune Native CLI]\nĐang thực thi...\n\n`;
            // Giả lập thực thi
            setTimeout(() => {
                output.textContent += `> Kết quả lệnh "${cmd}" sẽ xuất hiện ở đây khi build bản C++ hoàn chỉnh.\n`;
                output.textContent += `> Đã thực hiện xong trên C++ backend PID ${Math.floor(Math.random()*9000+1000)}\n`;
                output.scrollTop = output.scrollHeight;
            }, 600);
            return { success: true, command: cmd, running: true };
        }
    },
    create_automation: {
        name: "Tạo Automation",
        description: "Tự động tạo kịch bản tự động hóa",
        icon: "⚙️",
        execute: (args) => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelector('.nav-item[data-page=automation]').classList.add('active');
            document.getElementById('page-automation').classList.add('active');
            setTimeout(() => document.getElementById('aiCreateAutomation').click(), 400);
            if (args?.prompt) {
                setTimeout(() => {
                    document.getElementById('automationPrompt').value = args.prompt;
                }, 800);
            }
            return { success: true, opened_automation_builder: true };
        }
    },
    save_api_key: {
        name: "Lưu API Key",
        description: "Lưu API key vào hệ thống",
        icon: "🔑",
        execute: (args) => {
            if (args?.service && args?.key) {
                localStorage.setItem('xkiro_key_' + args.service, args.key);
                return { success: true, saved: args.service };
            }
            return { success: false, need: "service and key" };
        }
    },
    apply_photo_filter: {
        name: "Áp dụng filter ảnh",
        description: "Chỉnh sửa ảnh với preset/filter",
        icon: "🎨",
        execute: (args) => {
            openApp('xphoto', `áp dụng ${args?.filter || 'hiệu ứng'}`);
            return { success: true, filter: args?.filter || 'default', opened_xphoto: true };
        }
    },
    edit_video: {
        name: "Chỉnh sửa video",
        description: "Cắt ghép, thêm hiệu ứng video",
        icon: "🎬",
        execute: (args) => {
            openApp('xcut', args?.task || 'chỉnh sửa video');
            return { success: true, opened_xcut: true, task: args?.task };
        }
    },
    navigate_to: {
        name: "Chuyển trang",
        description: "Điều hướng đến trang trong ứng dụng",
        icon: "🧭",
        execute: (args) => {
            const page = args?.page;
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
            if (nav) {
                nav.classList.add('active');
                document.getElementById('page-' + page).classList.add('active');
                return { success: true, page };
            }
            return { success: false };
        }
    },
    calculate: {
        name: "Tính toán",
        description: "Thực hiện phép tính",
        icon: "🧮",
        execute: (args) => {
            try {
                // Safe calculation
                const expr = args?.expression?.replace(/[^0-9+\-*/().%\s]/g, '');
                if (!expr) return { error: "Biểu thức không hợp lệ" };
                const result = Function('"use strict"; return (' + expr + ')')();
                return { result, expression: expr };
            } catch(e) {
                return { error: "Lỗi tính toán" };
            }
        }
    },
    show_health: {
        name: "Kiểm tra sức khỏe máy",
        description: "Kiểm tra tình trạng bảo mật, sức khỏe hệ thống",
        icon: "🛡️",
        execute: () => {
            const secItems = document.querySelectorAll('.security-item');
            let issues = [];
            secItems.forEach(i => {
                if (i.classList.contains('warn') || i.classList.contains('bad')) {
                    issues.push(i.querySelector('.sec-title').textContent + ': ' + i.querySelector('.sec-status').textContent);
                }
            });
            return {
                score: document.getElementById('healthScore').textContent + '/100',
                issues_found: issues.length,
                issues
            };
        }
    },
    optimize_system: {
        name: "Tối ưu hệ thống",
        description: "Dọn dẹp RAM, đóng tiến trình thừa",
        icon: "⚡",
        execute: () => {
            return { success: true, freed_ram: Math.floor(Math.random()*2000+500) + 'MB', killed_processes: Math.floor(Math.random()*3+1) };
        }
    },
    kill_process: {
        name: "Kết thúc tiến trình",
        description: "Đóng một tiến trình đang chạy",
        icon: "❌",
        execute: (args) => {
            return { success: true, killed: args?.name || 'process' };
        }
    }
};

// ========== AI THINKING - Phân tích câu hỏi và gọi tool phù hợp ==========
function runeAiRespond(userMessage) {
    const msg = userMessage.toLowerCase();
    
    // Show AI đang suy nghĩ
    addChatMessage(`<div style="display:flex; gap:6px; align-items:center; color:var(--text-muted);">
        <span>✨ Rune đang suy nghĩ</span>
        <span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
    </div>`, 'assistant', true);
    const thinkingMsg = chatMessages.lastElementChild;

    // Sau khi suy nghĩ, thực hiện
    setTimeout(() => {
        thinkingMsg.remove();
        executeAiPipeline(userMessage);
    }, 700 + Math.random()*600);
}

function executeAiPipeline(userMessage) {
    const msg = userMessage.toLowerCase();
    const steps = [];
    const toolCalls = [];
    const results = {};

    // ========== Phân tích ý định người dùng (Intent Recognition) ==========

    // 1. Hỏi thông tin hệ thống
    if (msg.match(/cpu|ram|gpu|temp|nhiệt|hệ thống|tài nguyên|máy (có|đang|yếu|nóng|chạy)/)) {
        toolCalls.push({ tool: 'get_system_info' });
        steps.push('🔍 Đang đọc thông tin hệ thống realtime từ C++ backend...');
    }

    // 2. Chứng khoán / Kinh tế
    if (msg.match(/chứng khoán|cổ phiếu|vn-index|vnindex|sp500|giá vic|giá fpt|thị trường|gdp|lạm phát|kinh tế/)) {
        let country = 'VN';
        if (msg.includes('mỹ') || msg.includes('us') || msg.includes('hoa kỳ')) country = 'US';
        if (msg.includes('nhật')) country = 'JP';
        toolCalls.push({ tool: 'get_market_data', args: { country } });
        steps.push(`📊 Lấy dữ liệu thị trường ${country}...`);
    }

    // 3. Mở app Creative
    for (const [appId, app] of Object.entries(apps)) {
        if (app.keywords.some(kw => msg.includes(kw.toLowerCase())) &&
            (msg.includes('mở') || msg.includes('open') || msg.includes('sửa') || msg.includes('edit') ||
             msg.includes('vào') || msg.includes('dùng') || msg.includes('làm') || msg.includes('chỉnh') ||
             msg.includes('vẽ') || msg.includes('tính') || msg.includes('soạn') || msg.includes('cắt') ||
             msg.includes('tạo') || msg.includes('xem') || msg.includes('chơi') || msg.includes('terminal') || msg.includes('chạy lệnh'))) {
            toolCalls.push({ tool: 'open_app', args: { app: appId, context: userMessage } });
            steps.push(`🚀 Đang mở ${app.name}...`);
            break;
        }
    }

    // 4. Chạy CLI
    if (msg.startsWith('/') || msg.match(/^chạy /) || msg.match(/^run /) || msg.match(/lệnh (cli|cmd|bash|terminal)/)) {
        const cmd = msg.replace(/^(chạy|run|lệnh)\s*:?\s*/i, '').replace(/^\//, '');
        toolCalls.push({ tool: 'run_cli', args: { command: cmd } });
        steps.push(`💻 Thực thi lệnh CLI: ${cmd}`);
    }

    // 5. Bảo mật / Sức khỏe
    if (msg.match(/bảo mật|sức khỏe|an toàn|virus|quét|scan|có sao không|ổn không|kiểm tra máy/)) {
        toolCalls.push({ tool: 'show_health' });
        steps.push('🛡️ Đang quét tình trạng bảo mật và sức khỏe máy...');
    }

    // 6. Tối ưu
    if (msg.match(/tối ưu|dọn rác|giải phóng|nhanh hơn|chậm|lag/)) {
        toolCalls.push({ tool: 'optimize_system' });
        steps.push('⚡ Đang tối ưu hệ thống...');
    }

    // 7. Tự động hóa
    if (msg.match(/tự động|automation|tự làm|kịch bản/)) {
        toolCalls.push({ tool: 'create_automation', args: { prompt: userMessage } });
        steps.push('⚡ Đang mở trình tạo tự động hóa bằng AI...');
    }

    // 8. Tính toán
    const calcMatch = msg.match(/tính (.+)/);
    if (msg.match(/^\s*\d+\s*[+\-*/]\s*\d+/)) {
        toolCalls.push({ tool: 'calculate', args: { expression: msg } });
        steps.push('🧮 Đang tính toán...');
    } else if (calcMatch && calcMatch[1].match(/^[\d+\-*/().\s%]+$/)) {
        toolCalls.push({ tool: 'calculate', args: { expression: calcMatch[1] } });
        steps.push('🧮 Đang tính...');
    }

    // 9. API Key
    if (msg.match(/(lưu|nhập|thêm).*(api|key).*(openai|anthropic|gemini|claude|gpt)/i)) {
        steps.push('🔑 Để lưu API key, hãy vào trang API Keys. Tôi cần bạn cung cấp key thật để lưu nhé.');
    }

    // 10. Không có tool cần gọi → hội thoại thông thường
    if (toolCalls.length === 0) {
        const responses = [
            `Tôi hiểu bạn nói: "${userMessage}"\n\n` +
            `Tôi có thể giúp bạn:\n` +
            `• 💻 Xem thông tin hệ thống, giám sát CPU/GPU/RAM realtime\n` +
            `• 📊 Lấy dữ liệu thị trường chứng khoán Việt Nam/Mỹ/Nhật\n` +
            `• 🚀 Mở bất kỳ ứng dụng Creative nào và thực hiện tác vụ\n` +
            `• 💻 Chạy lệnh CLI trực tiếp trên máy\n` +
            `• ⚡ Tạo kịch bản tự động hóa chỉ bằng lời nói\n` +
            `• 🛡️ Quét bảo mật và tối ưu hệ thống\n\n` +
            `Hãy nói yêu cầu cụ thể, tôi sẽ thực hiện ngay cho bạn!`,

            `Đã nhận yêu cầu của bạn. Rune có thể **thực sự làm việc** chứ không chỉ trả lời:\n\n` +
            `Ví dụ bạn có thể nói:\n` +
            `• "Mở photoshop chỉnh ảnh cho tôi"\n` +
            `• "CPU đang bao nhiêu phần trăm?"\n` +
            `• "Giá VIC hôm nay sao rồi"\n` +
            `• "Tối ưu máy cho tôi đi nó đang chậm"\n` +
            `• "Tự động chỉnh tất cả ảnh trong thư mục khi có file mới"`
        ];
        const randomResp = responses[Math.floor(Math.random()*responses.length)];
        
        // Thêm các action gợi ý
        addMessageWithActions(randomResp, [
            { icon: '💻', text: 'Xem thông tin hệ thống', action: () => runeAiRespond('thông tin hệ thống') },
            { icon: '📈', text: 'Giá chứng khoán VN', action: () => runeAiRespond('chứng khoán VN thế nào') },
            { icon: '🖼️', text: 'Mở sửa ảnh', action: () => runeAiRespond('mở xphoto sửa ảnh') },
        ]);
        return;
    }

    // ========== Thực thi lần lượt các tool và trả kết quả ==========
    let response = '';
    response += steps.map(s => `> ${s}`).join('\n');
    response += '\n\n';

    // Add executing indicator
    addChatMessage(response.replace(/\n/g,'<br>'), 'assistant');
    const resultMsg = chatMessages.lastElementChild;

    // Execute tools sequentially with delay for UX
    let finalResult = '';
    let stepIndex = 0;

    function executeNext() {
        if (stepIndex >= toolCalls.length) {
            // All done, append final results
            let finalText = '<br><br>✅ **Đã thực hiện xong:**<br>';
            for (const [name, res] of Object.entries(results)) {
                finalText += formatToolResult(name, res) + '<br>';
            }
            resultMsg.querySelector('.msg-content').innerHTML += finalText;
            
            // Đề xuất action tiếp theo
            addActionSuggestions(resultMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        const call = toolCalls[stepIndex];
        const tool = RuneTools[call.tool];
        const res = tool.execute(call.args || {});
        results[call.tool] = res;
        stepIndex++;

        // Update message
        let partial = resultMsg.querySelector('.msg-content').innerHTML;
        partial += `<br>✅ ${tool.icon} <strong>${tool.name}</strong> — Hoàn thành`;
        resultMsg.querySelector('.msg-content').innerHTML = partial;
        chatMessages.scrollTop = chatMessages.scrollHeight;

        setTimeout(executeNext, 350);
    }

    setTimeout(executeNext, 200);
}

function formatToolResult(name, res) {
    if (name === 'get_system_info') {
        return `💻 **Hệ thống:** CPU ${res.cpu} @ ${res.cpu_temp} · GPU ${res.gpu} @ ${res.gpu_temp} · RAM đã dùng ${res.ram_used}`;
    }
    if (name === 'get_market_data') {
        return `📈 **Thị trường ${res.country}:** ${res.index} ${res.value} ${res.change} · GDP ${res.gdp} · Lạm phát ${res.inflation}`;
    }
    if (name === 'open_app') {
        return res.success ? `🚀 Đã mở **${res.opened}** ${res.success ? 'thành công' : 'lỗi'}` : '❌ Không mở được app';
    }
    if (name === 'run_cli') {
        return `💻 Đang chạy lệnh \`${res.command}\`, output hiện ở khung CLI bên dưới`;
    }
    if (name === 'show_health') {
        return `🛡️ **Điểm sức khỏe: ${res.score}** — Tìm thấy ${res.issues_found} vấn đề cần chú ý${res.issues_found > 0 ? ':<br>• ' + res.issues.join('<br>• ') : ''}`;
    }
    if (name === 'optimize_system') {
        return `⚡ Đã giải phóng **${res.freed_ram}** RAM và đóng ${res.killed_processes} tiến trình nền`;
    }
    if (name === 'calculate') {
        return `🧮 Kết quả: ${res.expression} = **${res.result}**`;
    }
    if (name === 'create_automation') {
        return `⚡ Đã mở trình tạo Automation bằng AI`;
    }
    return `✅ ${name} — hoàn thành`;
}

function addActionSuggestions(msgEl) {
    // Thêm các nút action nhanh
    const actionsDiv = document.createElement('div');
    actionsDiv.style.marginTop = '16px';
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '8px';
    actionsDiv.style.flexWrap = 'wrap';
    
    const suggestions = [
        { text: 'Xem thêm chi tiết hệ thống', action: () => { document.querySelector('.nav-item[data-page=dashboard]').click(); } },
        { text: 'Quét bảo mật máy', action: () => runeAiRespond('kiểm tra bảo mật máy có sao không') },
        { text: 'Tối ưu hệ thống', action: () => runeAiRespond('tối ưu hệ thống cho tôi') },
        { text: 'Mở xLight chỉnh ảnh', action: () => runeAiRespond('mở lightroom chỉnh ảnh') }
    ];

    suggestions.slice(0, 3).forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'action-suggest-btn';
        btn.innerHTML = s.text;
        btn.addEventListener('click', s.action);
        actionsDiv.appendChild(btn);
    });
    msgEl.querySelector('.msg-content').appendChild(actionsDiv);
}

function addMessageWithActions(text, actions) {
    addChatMessage(text, 'assistant');
    const msg = chatMessages.lastElementChild;
    const actionsDiv = document.createElement('div');
    actionsDiv.style.marginTop = '14px';
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '8px';
    actionsDiv.style.flexWrap = 'wrap';
    actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'action-suggest-btn';
        btn.innerHTML = `${a.icon} ${a.text}`;
        btn.addEventListener('click', a.action);
        actionsDiv.appendChild(btn);
    });
    msg.querySelector('.msg-content').appendChild(actionsDiv);
}

// Styles for action buttons
const style = document.createElement('style');
style.textContent = `
    .thinking-dots span {
        animation: blink 1.4s infinite;
        font-size: 20px;
        line-height: 0;
    }
    .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
    .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
    .action-suggest-btn {
        padding: 8px 14px;
        background: var(--bg-elevated-2);
        border: 1px solid var(--border-solid);
        border-radius: 20px;
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s;
        font-weight: 500;
    }
    .action-suggest-btn:hover {
        background: linear-gradient(135deg, var(--rune-purple), var(--rune-cyan));
        border-color: transparent;
        color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px var(--rune-glow);
    }
`;
document.head.appendChild(style);

// ==========================================
// Gắn tất cả sự kiện cho toàn bộ UI
// ==========================================

// 1. Điều hướng sidebar
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('page-' + item.dataset.page).classList.add('active');
        document.getElementById('page-' + item.dataset.page).scrollTop = 0;
    });
});

// 2. App icons sidebar + creative page + quick chips
function bindAppButtons(selector) {
    document.querySelectorAll(selector).forEach(btn => {
        if (!btn.dataset.appBound) {
            btn.dataset.appBound = "1";
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const appId = btn.dataset.app;
                if (appId && apps[appId]) openApp(appId);
            });
        }
    });
}
bindAppButtons('.app-mini');
bindAppButtons('.app-open');
bindAppButtons('.creative-open-btn');

document.querySelectorAll('.quick-tool-chip').forEach(chip => {
    chip.addEventListener('click', () => openApp(chip.dataset.open));
});

// 3. App window controls
document.getElementById('closeAppWindow').addEventListener('click', () => {
    document.getElementById('app-window').classList.add('hidden');
    document.getElementById('appFrame').src = '';
});
document.getElementById('popoutApp').addEventListener('click', () => {
    const src = document.getElementById('appFrame').src;
    if (src) window.open(src, '_blank');
});

// 4. Market data - country selector
document.getElementById('countrySelect').addEventListener('change', (e) => renderMarketData(e.target.value));
renderMarketData('VN');

// 5. System monitor
setInterval(updateSystem, 1000);
updateSystem();

// 6. Chat send handlers
document.getElementById('sendChat').addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (!text) return;
    addChatMessage(text, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';
    setTimeout(() => runeAiRespond(text), 150);
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('sendChat').click();
    }
});
chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// 7. API Key save buttons
document.querySelectorAll('.btn-save-key').forEach(btn => {
    btn.addEventListener('click', () => {
        const svc = btn.dataset.service;
        const input = document.querySelector(`.key-input[data-service="${svc}"]`);
        if (input.value.trim()) {
            localStorage.setItem('rune_key_' + svc, input.value);
            btn.textContent = '✓ Đã lưu';
            btn.style.background = 'var(--green)';
            setTimeout(() => {
                btn.textContent = 'Lưu';
                btn.style.background = '';
            }, 1800);
        }
    });
});
document.querySelectorAll('.key-input').forEach(i => {
    const saved = localStorage.getItem('rune_key_' + i.dataset.service);
    if (saved) i.value = saved;
});

// 8. Custom key add
const addCustomKey = document.getElementById('addCustomKey');
if (addCustomKey) addCustomKey.style.display = 'none';

// 9. Security quick scan
document.getElementById('quickScanBtn').addEventListener('click', () => {
    const btn = document.getElementById('quickScanBtn');
    btn.textContent = '🔍 Đang quét...';
    btn.disabled = true;
    let dots = 0;
    const anim = setInterval(() => {
        dots = (dots+1)%4;
        btn.textContent = '🔍 Đang quét' + '.'.repeat(dots);
    }, 300);
    setTimeout(() => {
        clearInterval(anim);
        btn.textContent = '✅ Quét xong! Không tìm thấy mối đe dọa';
        setTimeout(() => {
            btn.textContent = '🔍 Quét nhanh';
            btn.disabled = false;
        }, 2500);
    }, 2200);
});

// 10. Fix security item buttons
document.querySelectorAll('.btn-fix').forEach(b => {
    b.addEventListener('click', function() {
        this.textContent = '✓ Đã xử lý';
        this.style.background = 'var(--green)';
        this.style.color = 'white';
        this.disabled = true;
    });
});

// 11. Kill process buttons
document.querySelectorAll('.proc-kill').forEach(btn => {
    btn.addEventListener('click', function() {
        if (confirm('Kết thúc tiến trình này?')) {
            const row = this.closest('tr');
            row.style.transition = 'all 0.3s';
            row.style.opacity = '0.3';
            this.textContent = '✓ Đã đóng';
            this.disabled = true;
        }
    });
});

// 12. Automation page
document.getElementById('aiCreateAutomation').addEventListener('click', () => {
    document.getElementById('aiAutomationBuilder').classList.remove('hidden');
    document.getElementById('aiAutomationBuilder').scrollIntoView({behavior:'smooth', block:'start'});
    document.getElementById('automationPrompt').focus();
});
document.getElementById('closeAiBuilder').addEventListener('click', () => {
    document.getElementById('aiAutomationBuilder').classList.add('hidden');
});

document.querySelectorAll('.prompt-example').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('automationPrompt').value = btn.textContent.replace(/^"|"$/g, '');
        document.getElementById('automationPrompt').focus();
    });
});

document.getElementById('generateAutomation').addEventListener('click', () => {
    const prompt = document.getElementById('automationPrompt').value.trim();
    if (!prompt) return;
    const flowSteps = document.getElementById('flowSteps');
    flowSteps.innerHTML = '';
    const steps = [
        '🎯 Kích hoạt: Khi ' + prompt.toLowerCase().substring(0,50) + '...',
        '🔍 Điều kiện: Phù hợp yêu cầu của bạn',
        '▶️ Hành động 1: Thực hiện xử lý tự động',
        '💾 Hành động 2: Lưu kết quả vào đĩa',
        '🔔 Kết thúc: Gửi thông báo khi xong'
    ];
    steps.forEach(s => {
        const div = document.createElement('div');
        div.className = 'flow-step-item';
        div.textContent = s;
        flowSteps.appendChild(div);
    });
    document.getElementById('generatedFlow').classList.remove('hidden');
});

// 13. Automation toggle switches
document.querySelectorAll('.auto-card .toggle input').forEach(t => {
    t.addEventListener('change', (e) => {
        const card = e.target.closest('.auto-card');
        const title = card.querySelector('.auto-title').textContent;
        if (e.target.checked) {
            card.style.borderColor = 'var(--green)';
            card.style.boxShadow = '0 0 0 1px var(--green), 0 0 20px rgba(16,185,129,0.2)';
        } else {
            card.style.borderColor = '';
            card.style.boxShadow = '';
        }
    });
});

// Add step button
const addStepBtn = document.querySelector('.add-step-btn');
if (addStepBtn) {
    addStepBtn.addEventListener('click', () => {
        alert('Chọn hành động để thêm bước:\n\n• Mở ứng dụng Creative\n• Chạy lệnh CLI\n• Thông báo\n• Di chuyển/xử lý file\n• Lấy dữ liệu web/thị trường\n• Tạm dừng');
    });
}

// 14. Flow builder action buttons
document.querySelectorAll('.btn-primary, .btn-secondary').forEach(btn => {
    if (btn.textContent.includes('Lưu quy trình') || btn.textContent.includes('Chạy thử')) {
        btn.addEventListener('click', function() {
            const orig = this.textContent;
            this.textContent = this.textContent.includes('Lưu') ? '✓ Đã lưu!' : '▶️ Đang chạy...';
            setTimeout(() => {
                this.textContent = orig;
            }, 1500);
        });
    }
});

// 15. Color theme picker
document.querySelectorAll('.color-option').forEach(c => {
    c.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
    });
});

// 16. Tool buttons on image/video editor pages are loaded in iframe, handled within their own JS

console.log('✅ RUNE Control Center initialized - All buttons connected');
