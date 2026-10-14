// xPhoto - Trình chỉnh sửa ảnh giống Adobe Photoshop
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let lastX = 0, lastY = 0;
let currentTool = 'brush';
let brushColor = '#000000';
let brushSize = 10;
let brushOpacity = 1;
let history = [];
let historyStep = -1;

// Fill nền trắng mặc định
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
saveState();

function saveState() {
    historyStep++;
    if (historyStep < history.length) history.length = historyStep;
    history.push(canvas.toDataURL());
    if (history.length > 50) { history.shift(); historyStep--; }
}

document.getElementById('undoBtn').addEventListener('click', () => {
    if (historyStep > 0) {
        historyStep--;
        const img = new Image();
        img.onload = () => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img, 0, 0); };
        img.src = history[historyStep];
    }
});

document.getElementById('redoBtn').addEventListener('click', () => {
    if (historyStep < history.length - 1) {
        historyStep++;
        const img = new Image();
        img.onload = () => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img, 0, 0); };
        img.src = history[historyStep];
    }
});

// Chọn công cụ
document.querySelectorAll('.left-toolbar .tool[data-tool]').forEach(t => {
    t.addEventListener('click', () => {
        document.querySelectorAll('.left-toolbar .tool').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        currentTool = t.dataset.tool;
    });
});

// Vẽ trên canvas
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x; lastY = pos.y;
    
    if (currentTool === 'fill') {
        ctx.fillStyle = brushColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        saveState();
    }
    if (currentTool === 'text') {
        const text = prompt('Nhập văn bản:');
        if (text) {
            ctx.font = `${brushSize * 3}px Arial`;
            ctx.fillStyle = brushColor;
            ctx.globalAlpha = brushOpacity;
            ctx.fillText(text, pos.x, pos.y);
            ctx.globalAlpha = 1;
            saveState();
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    const pos = getPos(e);
    document.getElementById('statusCoords').textContent = `X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}`;
    
    if (!isDrawing) return;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    
    if (currentTool === 'brush') {
        ctx.globalAlpha = brushOpacity;
        ctx.strokeStyle = brushColor;
        ctx.globalCompositeOperation = 'source-over';
    } else if (currentTool === 'eraser') {
        ctx.globalAlpha = brushOpacity;
        ctx.globalCompositeOperation = 'destination-out';
    } else return;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    
    lastX = pos.x; lastY = pos.y;
});

canvas.addEventListener('mouseup', () => { if (isDrawing) { isDrawing = false; saveState(); } });
canvas.addEventListener('mouseout', () => { if (isDrawing) { isDrawing = false; saveState(); } });

// Kích thước bút
document.getElementById('brushSize').addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    document.getElementById('brushSizeVal').textContent = brushSize + 'px';
});

document.getElementById('brushOpacity').addEventListener('input', (e) => {
    brushOpacity = parseInt(e.target.value) / 100;
    document.getElementById('opacityVal').textContent = e.target.value + '%';
});

document.getElementById('brushColor').addEventListener('input', (e) => {
    brushColor = e.target.value;
});

// Điều chỉnh màu
function applyAdjustments() {
    const b = document.getElementById('brightness').value;
    const c = document.getElementById('contrast').value;
    const s = document.getElementById('saturation').value;
    const t = document.getElementById('temperature').value;
    const bl = document.getElementById('blur').value;
    
    document.getElementById('bVal').textContent = b;
    document.getElementById('cVal').textContent = c;
    document.getElementById('sVal').textContent = s;
    document.getElementById('tVal').textContent = t;
    document.getElementById('blurVal').textContent = bl;
    
    canvas.style.filter = `brightness(${100+parseInt(b)}%) contrast(${100+parseInt(c)}%) saturate(${100+parseInt(s)}%) hue-rotate(${t}deg) blur(${bl}px)`;
}

['brightness','contrast','saturation','temperature','blur'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyAdjustments);
});

document.getElementById('resetAdjust').addEventListener('click', () => {
    ['brightness','contrast','saturation','temperature','blur'].forEach(id => document.getElementById(id).value = 0);
    canvas.style.filter = '';
    applyAdjustments();
});

// Bộ lọc
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        switch(f) {
            case 'grayscale': canvas.style.filter = 'grayscale(100%)'; break;
            case 'sepia': canvas.style.filter = 'sepia(80%) contrast(110%)'; break;
            case 'invert': canvas.style.filter = 'invert(100%)'; break;
            case 'vintage': canvas.style.filter = 'sepia(50%) contrast(90%) brightness(90%)'; break;
            case 'vivid': canvas.style.filter = 'saturate(180%) contrast(120%)'; break;
            default: canvas.style.filter = '';
        }
    });
});

// Mở ảnh
document.getElementById('openImgBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            document.getElementById('statusSize').textContent = `${img.width} × ${img.height} px`;
            saveState();
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// Tạo canvas mới
document.getElementById('newCanvasBtn').addEventListener('click', () => {
    const w = parseInt(prompt('Chiều rộng:', '1200')) || 1200;
    const h = parseInt(prompt('Chiều cao:', '800')) || 800;
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = 'white'; ctx.fillRect(0,0,w,h);
    document.getElementById('statusSize').textContent = `${w} × ${h} px`;
    saveState();
});

// Xuất ảnh
document.getElementById('exportBtn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'xkiro-photo-' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
});

// AI tích hợp
document.getElementById('aiEditBtn').addEventListener('click', () => {
    const prompt = prompt('Yêu cầu AI chỉnh sửa ảnh:');
    if (prompt) {
        alert(`🤖 AI đang xử lý: "${prompt}"\n\nKhi kết nối với model AI ở mục Chat, ảnh sẽ được chỉnh sửa tự động theo yêu cầu của bạn.`);
    }
});

window.aiImageEdit = function(prompt) {
    // Hàm này được gọi từ AI Chat
    alert(`🤖 AI tự động mở xPhoto và đang thực hiện: ${prompt}`);
};
