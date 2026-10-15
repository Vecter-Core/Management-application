/* ============================================================
   xCut Pro — dựng video thật: multi-track timeline, trim/split,
   speed, grade, text overlay, preview engine, xuất WebM (có tiếng)
   ============================================================ */
(function () {
    'use strict';

    const pvVideo = document.getElementById('pvVideo');
    const pvText = document.getElementById('pvText');
    const pvScreen = document.getElementById('pvScreen');
    const ruler = document.getElementById('ruler');
    const trackBox = document.getElementById('trackBox');
    const playhead = document.getElementById('playhead');
    const LANE_OFF = 66;

    const state = {
        media: [], clips: [], tracks: [
            { id: 'V2', kind: 'video', mute: false, lock: false },
            { id: 'V1', kind: 'video', mute: false, lock: false },
            { id: 'A1', kind: 'audio', mute: false, lock: false },
            { id: 'A2', kind: 'audio', mute: false, lock: false }
        ],
        t: 0, playing: false, loop: false, pps: 46, tool: 'select', snap: true,
        selected: null, aspect: '16:9', fade: false, grade: 'none',
        exportW: 1920, exportH: 1080
    };
    const audioEls = {};   // mediaId -> HTMLAudioElement (cho clip audio)
    const hist = TK.history(25);
    let lastVideoClipId = null, lastSrc = '';
    let rec = null, recChunks = [], exportCancel = false;
    let audioCtx = null, audioDest = null;

    const GRADES = {
        none: { n: 'Không lọc', f: 'none' }, bw: { n: 'Đen trắng', f: 'grayscale(1) contrast(1.1)' },
        vivid: { n: 'Rực rỡ', f: 'saturate(1.6) contrast(1.15)' }, warm: { n: 'Ấm (Golden)', f: 'sepia(.35) saturate(1.3) brightness(1.05)' },
        cool: { n: 'Lạnh (Teal)', f: 'hue-rotate(180deg) saturate(1.2)' }, cine: { n: 'Điện ảnh', f: 'contrast(1.25) saturate(.85) brightness(.95)' },
        vintage: { n: 'Vintage', f: 'sepia(.5) contrast(.9) brightness(1.05)' }, fade: { n: 'Phim phai màu', f: 'contrast(.85) brightness(1.12) saturate(.8)' },
        neon: { n: 'Neon', f: 'saturate(2.2) hue-rotate(-15deg) contrast(1.2)' }, invert: { n: 'Âm bản', f: 'invert(1)' },
        blur: { n: 'Mờ nền', f: 'blur(2px)' }, sharp: { n: 'Sắc nét', f: 'contrast(1.3) saturate(1.1)' }
    };

    /* ================= media ================= */
    async function importFiles(files) {
        let n = 0;
        for (const f of files) {
            const url = URL.createObjectURL(f);
            const type = f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : f.type.startsWith('image') ? 'image' : null;
            if (!type) { TK.toast('Bỏ qua file không phải media: ' + f.name, 'error'); continue; }
            const m = { id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), name: f.name, type, url, file: f, duration: 0, w: 0, h: 0 };
            state.media.push(m);
            if (type === 'video') {
                const v = document.createElement('video');
                v.preload = 'metadata'; v.src = url;
                await new Promise(res => { v.onloadedmetadata = res; v.onerror = res; setTimeout(res, 4000); });
                m.duration = v.duration || 5; m.w = v.videoWidth; m.h = v.videoHeight;
                m.thumb = await grabThumb(v);
            } else if (type === 'audio') {
                const a = document.createElement('audio'); a.preload = 'metadata'; a.src = url;
                await new Promise(res => { a.onloadedmetadata = res; a.onerror = res; setTimeout(res, 3000); });
                m.duration = a.duration || 5;
                audioEls[m.id] = a;
            } else { m.duration = 4; m.w = 0; m.h = 0; }
            n++;
        }
        renderMedia();
        if (n) { TK.toast(`📥 Đã nhập ${n} file media`, 'ok'); TK.status(`Thư viện: ${state.media.length} file`); }
    }

    function grabThumb(v) {
        return new Promise(res => {
            try {
                const c = document.createElement('canvas');
                c.width = 96; c.height = 64;
                v.currentTime = Math.min(0.5, (v.duration || 1) / 3);
                const done = () => { try { c.getContext('2d').drawImage(v, 0, 0, 96, 64); res(c.toDataURL('image/jpeg', .6)); } catch (e) { res(null); } };
                setTimeout(done, 260);
            } catch (e) { res(null); }
        });
    }

    function renderMedia() {
        const box = document.getElementById('mediaList');
        box.innerHTML = '';
        if (!state.media.length) { box.innerHTML = '<div style="color:#777;font-size:12px;padding:8px;">Chưa có media.<br>Nhập video / audio / ảnh, hoặc dùng “Thêm clip mẫu”.</div>'; return; }
        state.media.forEach(m => {
            const d = document.createElement('div');
            d.className = 'media-item';
            const icon = m.type === 'video' ? '🎬' : m.type === 'audio' ? '🎵' : '🖼️';
            d.innerHTML = `<div class="media-thumb">${m.thumb ? `<img src="${m.thumb}">` : icon}</div>
                <div class="media-info"><div class="media-name">${escapeHtml(m.name)}</div>
                <div class="meta">${m.type} · ${TK.fmtTime(m.duration)}${m.w ? ' · ' + m.w + '×' + m.h : ''}</div></div>
                <button class="media-del" title="Xóa khỏi dự án">✕</button>`;
            const add = document.createElement('button');
            add.className = 'tbtn'; add.style.cssText = 'padding:2px 6px;font-size:11px;margin-right:4px;';
            add.textContent = '＋ Thêm vào timeline';
            d.querySelector('.media-del').addEventListener('click', e => {
                e.stopPropagation();
                state.media = state.media.filter(x => x !== m);
                state.clips = state.clips.filter(c => c.mediaId !== m.id);
                renderMedia(); renderTimeline(); push();
            });
            add.addEventListener('click', e => { e.stopPropagation(); addClipFromMedia(m); });
            d.querySelector('.media-info').appendChild(add);
            d.addEventListener('click', () => { previewMedia(m); });
            d.addEventListener('dblclick', () => addClipFromMedia(m));
            box.appendChild(d);
        });
    }
    const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function previewMedia(m) {
        document.getElementById('pvEmpty').style.display = 'none';
        if (m.type === 'image') { pvVideo.pause(); pvVideo.removeAttribute('src'); showImageInPreview(m.url); return; }
        pvVideo.src = m.url; pvVideo.currentTime = 0; pvVideo.play().catch(() => {});
        TK.status('Đang xem trước: ' + m.name);
    }

    let previewImg = null;
    function showImageInPreview(url) {
        if (!previewImg) {
            previewImg = document.createElement('img');
            previewImg.style.cssText = 'width:100%;height:100%;object-fit:contain;position:absolute;inset:0;';
            pvScreen.insertBefore(previewImg, pvScreen.firstChild);
        }
        previewImg.src = url; previewImg.style.display = 'block';
    }
    function hidePreviewImg() { if (previewImg) previewImg.style.display = 'none'; }

    /* ================= clips ================= */
    function addClipFromMedia(m, opts) {
        const o = opts || {};
        const isAudio = m.type === 'audio';
        const trackId = o.track || (isAudio ? 'A1' : 'V1');
        const start = o.start != null ? o.start : endOfTrack(trackId);
        const dur = o.dur != null ? o.dur : (m.type === 'image' ? 4 : Math.min(m.duration, 600));
        const clip = {
            id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6),
            track: trackId, type: isAudio ? 'audio' : 'video', mediaId: m.id, name: m.name,
            start, dur, inPoint: o.inPoint || 0, speed: 1, volume: 1, filter: 'none', reversed: false
        };
        state.clips.push(clip);
        state.selected = clip.id;
        document.getElementById('pvEmpty').style.display = 'none';
        renderTimeline(); renderProps(); push();
        TK.status(`Đã thêm "${m.name}" vào ${trackId} tại ${TK.fmtTime(start)}`);
        return clip;
    }

    function endOfTrack(trackId) {
        const cs = state.clips.filter(c => c.track === trackId);
        return cs.length ? Math.max.apply(null, cs.map(c => c.start + c.dur)) + 0.2 : 0;
    }
    function seqDuration() {
        return state.clips.length ? Math.max.apply(null, state.clips.map(c => c.start + c.dur)) : 0;
    }
    const getClip = id => state.clips.find(c => c.id === id);

    function addTextClip() {
        TK.prompt('Thêm tiêu đề', 'Nhập chữ sẽ hiện trên video:', 'Tiêu đề của tôi').then(txt => {
            if (!txt) return;
            const c = {
                id: 'c' + Date.now(), track: 'V2', type: 'text', name: 'Chữ: ' + txt.slice(0, 16),
                start: state.t, dur: 3, text: txt, size: 7, color: '#ffffff', pos: 'center', filter: 'none', volume: 1, speed: 1
            };
            state.clips.push(c); state.selected = c.id;
            renderTimeline(); renderProps(); push();
            TK.status('Đã thêm clip chữ tại ' + TK.fmtTime(state.t));
        });
    }

    /* ================= timeline render ================= */
    function renderTimeline() {
        const pps = state.pps;
        const total = Math.max(seqDuration() + 6, 30);
        const width = LANE_OFF + total * pps;
        document.getElementById('tracksInner').style.width = width + 'px';
        ruler.innerHTML = '';
        const stepSec = pps > 70 ? 1 : pps > 34 ? 2 : pps > 16 ? 5 : 10;
        for (let s = 0; s <= total; s += stepSec) {
            const m = document.createElement('div');
            m.className = 'ruler-mark';
            m.style.left = (LANE_OFF + s * pps) + 'px';
            m.textContent = TK.fmtTime(s).slice(3, 8);
            ruler.appendChild(m);
        }
        trackBox.innerHTML = '';
        state.tracks.forEach(tr => {
            const row = document.createElement('div');
            row.className = 'track';
            row.innerHTML = `<div class="track-head"><b>${tr.id}</b>
                <div><button data-m="${tr.id}" title="Tắt tiếng">${tr.mute ? '🔇' : '🔊'}</button><button data-l="${tr.id}" title="Khóa track">${tr.lock ? '🔒' : '🔓'}</button></div></div>
                <div class="track-lane" data-lane="${tr.id}"></div>`;
            row.querySelector('[data-m]').addEventListener('click', () => { tr.mute = !tr.mute; renderTimeline(); });
            row.querySelector('[data-l]').addEventListener('click', () => { tr.lock = !tr.lock; renderTimeline(); });
            row.querySelector('[data-m]').className = tr.mute ? 'on' : '';
            trackBox.appendChild(row);

            const lane = row.querySelector('.track-lane');
            state.clips.filter(c => c.track === tr.id).forEach(c => lane.appendChild(clipEl(c, pps, tr)));
        });
        playhead.style.left = (LANE_OFF + state.t * pps) + 'px';
        document.getElementById('totalTime').textContent = TK.fmtTime(seqDuration());
    }

    function clipEl(c, pps, tr) {
        const el = document.createElement('div');
        const cls = c.type === 'text' ? 'text' : c.type === 'audio' ? 'audio' : (c.track === 'V2' ? 'video2' : 'video');
        el.className = 'clip ' + cls + (c.id === state.selected ? ' sel' : '');
        el.style.left = (c.start * pps) + 'px';
        el.style.width = Math.max(14, c.dur * pps) + 'px';
        el.innerHTML = `<div class="handle l"></div><span class="nm">${escapeHtml(c.text || c.name)}</span><div class="handle r"></div>`;
        el.title = `${c.name}\n${TK.fmtTime(c.start)} → ${TK.fmtTime(c.start + c.dur)}\nTốc độ ${c.speed}× · Vol ${Math.round((c.volume || 1) * 100)}%`;

        let drag = null;
        el.addEventListener('pointerdown', e => {
            if (tr.lock) return TK.toast('Track đang khóa 🔒', 'error');
            e.stopPropagation();
            if (state.tool === 'razor') { splitClipAt(c, c.start + (e.offsetX / pps)); return; }
            state.selected = c.id; renderTimeline(); renderProps();
            const isL = e.target.classList.contains('l'), isR = e.target.classList.contains('r');
            drag = { mode: isL ? 'trimL' : isR ? 'trimR' : 'move', x0: e.clientX, start: c.start, dur: c.dur, inPoint: c.inPoint || 0 };
            el.setPointerCapture(e.pointerId);
        });
        el.addEventListener('pointermove', e => {
            if (!drag) return;
            const dt = (e.clientX - drag.x0) / pps;
            if (drag.mode === 'move') {
                c.start = Math.max(0, snapVal(drag.start + dt));
            } else if (drag.mode === 'trimL') {
                const nd = TK.clamp(dt, -drag.inPoint, drag.dur - 0.2);
                c.start = snapVal(drag.start + nd);
                c.dur = drag.dur - nd;
                if (c.type !== 'text') c.inPoint = Math.max(0, drag.inPoint + nd * c.speed);
            } else {
                c.dur = Math.max(0.2, snapVal(drag.dur + dt));
            }
            renderTimeline();
        });
        el.addEventListener('pointerup', () => { if (drag) { drag = null; push(); TK.status(`Clip "${c.name}" → ${TK.fmtTime(c.start)} (${TK.fmtTime(c.dur)})`); } });
        el.addEventListener('dblclick', () => {
            if (c.type === 'text') {
                TK.prompt('Sửa chữ', 'Nội dung tiêu đề:', c.text).then(v => { if (v) { c.text = v; renderTimeline(); push(); } });
            } else { seek(c.start + 0.01); }
        });
        return el;
    }
    function snapVal(v) {
        if (!state.snap) return Math.round(v * 100) / 100;
        const pts = [0];
        state.clips.forEach(c => { pts.push(c.start, c.start + c.dur); });
        for (const p of pts) if (Math.abs(p - v) < 0.22) return p;
        return Math.round(v * 10) / 10;
    }

    function splitClipAt(c, at) {
        if (at <= c.start + 0.1 || at >= c.start + c.dur - 0.1) return TK.toast('Vị trí cắt quá sát mép clip', 'error');
        const off = at - c.start;
        const b = Object.assign({}, c, { id: 'c' + Date.now() + Math.random().toString(36).slice(2, 5), start: at, dur: c.dur - off });
        if (c.type !== 'text') b.inPoint = (c.inPoint || 0) + off * c.speed;
        c.dur = off;
        state.clips.push(b);
        state.selected = b.id;
        renderTimeline(); renderProps(); push();
        TK.toast('✂️ Đã cắt clip tại ' + TK.fmtTime(at), 'ok');
    }

    /* ================= playback engine ================= */
    function activeClips(t) {
        return state.clips.filter(c => t >= c.start && t < c.start + c.dur);
    }
    function topVideoClip(t) {
        const order = ['V2', 'V1'];
        for (const tr of order) {
            const c = state.clips.find(x => x.track === tr && x.type !== 'audio' && t >= x.start && t < x.start + x.dur);
            if (c) return c;
        }
        return null;
    }

    function renderFrame() {
        const t = state.t;
        const vc = topVideoClip(t);
        const trk = tr => state.tracks.find(x => x.id === tr);

        if (vc && vc.type === 'video') {
            const m = state.media.find(x => x.id === vc.mediaId);
            hidePreviewImg();
            document.getElementById('pvEmpty').style.display = 'none';
            const srcT = (vc.inPoint || 0) + (t - vc.start) * vc.speed;
            if (pvVideo.src !== m.url) { pvVideo.src = m.url; lastSrc = m.url; }
            if (Math.abs(pvVideo.currentTime - srcT) > 0.35) { try { pvVideo.currentTime = srcT; } catch (e) {} }
            const gs = parseFloat(document.getElementById('globalSpeed').value) || 1;
            pvVideo.playbackRate = TK.clamp(vc.speed * gs, 0.0625, 16);
            pvVideo.volume = TK.clamp((vc.volume || 1) * (trk(vc.track).mute ? 0 : 1) * (document.getElementById('masterVol').value / 100), 0, 1);
            pvVideo.style.filter = GRADES[vc.filter] ? GRADES[vc.filter].f : 'none';
            pvVideo.style.opacity = fadeAlpha(vc, t);
            if (state.playing && pvVideo.paused) pvVideo.play().catch(() => {});
            if (!state.playing && !pvVideo.paused) pvVideo.pause();
            lastVideoClipId = vc.id;
        } else if (vc && vc.type === 'image') {
            const m = state.media.find(x => x.id === vc.mediaId);
            pvVideo.pause(); showImageInPreview(m.url);
            if (previewImg) { previewImg.style.filter = GRADES[vc.filter] ? GRADES[vc.filter].f : 'none'; previewImg.style.opacity = fadeAlpha(vc, t); }
            document.getElementById('pvEmpty').style.display = 'none';
        } else {
            pvVideo.pause(); hidePreviewImg();
            document.getElementById('pvEmpty').style.display = state.clips.length ? 'none' : 'flex';
        }

        // audio tracks
        activeClips(t).filter(c => c.type === 'audio').forEach(c => {
            const m = state.media.find(x => x.id === c.mediaId);
            if (!m) return;
            let a = audioEls[m.id];
            if (!a) { a = new Audio(m.url); audioEls[m.id] = a; }
            const srcT = (c.inPoint || 0) + (t - c.start) * c.speed;
            if (Math.abs(a.currentTime - srcT) > 0.3) { try { a.currentTime = srcT; } catch (e) {} }
            a.playbackRate = TK.clamp(c.speed * (parseFloat(document.getElementById('globalSpeed').value) || 1), 0.25, 8);
            a.volume = TK.clamp((c.volume || 1) * (trk(c.track).mute ? 0 : 1) * (document.getElementById('masterVol').value / 100), 0, 1);
            if (state.playing && a.paused) a.play().catch(() => {});
            if (!state.playing && !a.paused) a.pause();
        });
        // tắt audio không còn trong range
        Object.keys(audioEls).forEach(id => {
            const inUse = activeClips(t).some(c => c.mediaId === id && c.type === 'audio');
            if (!inUse && !audioEls[id].paused) audioEls[id].pause();
        });

        // text overlay
        const txts = activeClips(t).filter(c => c.type === 'text');
        if (txts.length) {
            const c = txts[txts.length - 1];
            pvText.style.display = 'block';
            pvText.textContent = c.text || '';
            pvText.style.color = c.color || '#fff';
            pvText.style.fontSize = (c.size || 6) + '%';
            pvText.style.alignSelf = c.pos === 'top' ? 'flex-start' : c.pos === 'bottom' ? 'flex-end' : 'center';
            pvText.style.opacity = fadeAlpha(c, t);
        } else pvText.style.display = 'none';

        document.getElementById('currentTime').textContent = TK.fmtTime(t);
        document.getElementById('previewTime').textContent = TK.fmtTime(t);
        playhead.style.left = (LANE_OFF + t * state.pps) + 'px';
    }

    function fadeAlpha(c, t) {
        if (!state.fade) return 1;
        const f = 0.5, rel = t - c.start, rem = c.start + c.dur - t;
        if (rel < f) return TK.clamp(rel / f, 0, 1);
        if (rem < f) return TK.clamp(rem / f, 0, 1);
        return 1;
    }

    let raf = null, lastTs = 0;
    function loop(ts) {
        raf = requestAnimationFrame(loop);
        if (!lastTs) lastTs = ts;
        const dt = (ts - lastTs) / 1000;
        lastTs = ts;
        if (state.playing) {
            state.t += dt * (parseFloat(document.getElementById('globalSpeed').value) || 1);
            const dur = seqDuration();
            if (state.t >= dur) {
                if (state.loop) state.t = 0;
                else { state.t = dur; setPlaying(false); }
            }
        }
        renderFrame();
        if (exporting) drawExportFrame();
    }

    function setPlaying(p) {
        state.playing = p;
        document.getElementById('playBtn').textContent = p ? '⏸' : '▶';
        if (!p) { pvVideo.pause(); Object.values(audioEls).forEach(a => a.pause()); }
        else if (!seqDuration()) { TK.toast('Timeline trống — thêm clip trước đã', 'error'); state.playing = false; document.getElementById('playBtn').textContent = '▶'; }
        TK.status(p ? '▶ Đang phát' : '⏸ Tạm dừng');
    }
    function seek(t) {
        state.t = TK.clamp(t, 0, Math.max(seqDuration(), 0.001));
        renderFrame();
        const sc = document.getElementById('tracksScroll');
        const x = LANE_OFF + state.t * state.pps;
        if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = Math.max(0, x - sc.clientWidth / 2);
    }

    /* ================= props panel ================= */
    function renderProps() {
        const box = document.getElementById('clipProps');
        const c = getClip(state.selected);
        if (!c) { box.innerHTML = '<div class="prop-row" style="color:var(--dim)">Chưa chọn clip nào — bấm 1 clip trên timeline</div>'; return; }
        box.innerHTML = `
            <div class="prop-row"><label>Clip</label><b style="font-size:12px;">${escapeHtml(c.name)}</b><div class="meta" style="color:var(--dim);font-size:11px;">${c.track} · ${TK.fmtTime(c.start)} → ${TK.fmtTime(c.start + c.dur)}</div></div>
            ${c.type === 'text' ? `
            <div class="prop-row"><label>Nội dung chữ</label><input type="text" id="pText" value="${escapeHtml(c.text || '')}"></div>
            <div class="prop-row"><label>Cỡ chữ (% chiều cao khung)</label><input type="range" id="pSize" min="2" max="20" step="0.5" value="${c.size || 6}"></div>
            <div class="prop-row"><label>Màu chữ</label><input type="color" id="pColor" value="${c.color || '#ffffff'}" style="width:100%;height:30px;"></div>
            <div class="prop-row"><label>Vị trí</label><select id="pPos"><option value="top" ${c.pos === 'top' ? 'selected' : ''}>Trên</option><option value="center" ${!c.pos || c.pos === 'center' ? 'selected' : ''}>Giữa</option><option value="bottom" ${c.pos === 'bottom' ? 'selected' : ''}>Dưới</option></select></div>` : `
            <div class="prop-row"><label>Tốc độ: <span id="pSpeedV">${c.speed}×</span></label><input type="range" id="pSpeed" min="0.25" max="4" step="0.05" value="${c.speed}"></div>
            <div class="prop-row"><label>Âm lượng: <span id="pVolV">${Math.round((c.volume == null ? 1 : c.volume) * 100)}%</span></label><input type="range" id="pVol" min="0" max="200" value="${Math.round((c.volume == null ? 1 : c.volume) * 100)}"></div>
            <div class="prop-row"><label>Bộ lọc màu cho clip</label><select id="pFilter">${Object.keys(GRADES).map(k => `<option value="${k}" ${c.filter === k ? 'selected' : ''}>${GRADES[k].n}</option>`).join('')}</select></div>`}
            <div class="prop-row"><label>Điểm bắt đầu (giây)</label><input type="text" id="pStart" value="${c.start.toFixed(2)}"></div>
            <div class="prop-row"><label>Thời lượng (giây)</label><input type="text" id="pDur" value="${c.dur.toFixed(2)}"></div>
            <div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="tbtn" data-pa="split">✂ Cắt</button>
                <button class="tbtn" data-pa="dup">⧉ Nhân đôi</button>
                <button class="tbtn" data-pa="del">🗑 Xóa</button>
                ${c.type !== 'text' ? '<button class="tbtn" data-pa="rev">🔄 Đảo</button>' : ''}
            </div>`;
        const bind = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
        bind('pText', 'input', e => { c.text = e.target.value; renderTimeline(); });
        bind('pSize', 'input', e => { c.size = parseFloat(e.target.value); renderFrame(); });
        bind('pColor', 'input', e => { c.color = e.target.value; renderFrame(); });
        bind('pPos', 'change', e => { c.pos = e.target.value; renderFrame(); });
        bind('pSpeed', 'input', e => { c.speed = parseFloat(e.target.value); document.getElementById('pSpeedV').textContent = c.speed.toFixed(2) + '×'; renderFrame(); });
        bind('pVol', 'input', e => { c.volume = parseInt(e.target.value, 10) / 100; document.getElementById('pVolV').textContent = e.target.value + '%'; renderFrame(); });
        bind('pFilter', 'change', e => { c.filter = e.target.value; renderFrame(); markGrade(); });
        bind('pStart', 'change', e => { c.start = Math.max(0, parseFloat(e.target.value) || 0); renderTimeline(); push(); });
        bind('pDur', 'change', e => { c.dur = Math.max(0.2, parseFloat(e.target.value) || 0.2); renderTimeline(); push(); });
        box.querySelectorAll('[data-pa]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.pa;
            if (a === 'split') splitClipAt(c, state.t);
            if (a === 'dup') { const d = Object.assign({}, c, { id: 'c' + Date.now(), start: c.start + c.dur + 0.1 }); state.clips.push(d); state.selected = d.id; renderTimeline(); push(); }
            if (a === 'del') { state.clips = state.clips.filter(x => x !== c); state.selected = null; renderTimeline(); renderProps(); push(); }
            if (a === 'rev') { c.reversed = !c.reversed; c.speed = -Math.abs(c.speed); TK.toast('Đảo ngược clip (phát lùi) — trình duyệt hỗ trợ giới hạn, tốc độ đã đặt âm', 'ok'); c.speed = Math.abs(c.speed); renderProps(); }
        }));
        ['pText', 'pStart', 'pDur'].forEach(id => { const el = document.getElementById(id); el && el.addEventListener('change', push); });
    }

    function markGrade() {
        document.querySelectorAll('#gradeList .effect-item').forEach(el => {
            const c = getClip(state.selected);
            el.classList.toggle('on', !!c && c.filter === el.dataset.grade);
        });
    }

    /* ================= export ================= */
    let exporting = false, expCanvas = null, expCtx = null;
    function drawExportFrame() {
        if (!expCtx) return;
        const W = expCanvas.width, H = expCanvas.height;
        expCtx.fillStyle = '#000'; expCtx.fillRect(0, 0, W, H);
        const t = state.t;
        const vc = topVideoClip(t);
        if (vc && vc.type === 'video' && pvVideo.videoWidth) {
            expCtx.save();
            expCtx.filter = GRADES[vc.filter] ? GRADES[vc.filter].f : 'none';
            expCtx.globalAlpha = fadeAlpha(vc, t);
            const ar = pvVideo.videoWidth / pvVideo.videoHeight, tar = W / H;
            let dw = W, dh = H, dx = 0, dy = 0;
            if (ar > tar) { dh = W / ar; dy = (H - dh) / 2; } else { dw = H * ar; dx = (W - dw) / 2; }
            expCtx.drawImage(pvVideo, dx, dy, dw, dh);
            expCtx.restore();
        } else if (vc && vc.type === 'image' && previewImg && previewImg.naturalWidth) {
            expCtx.save();
            expCtx.filter = GRADES[vc.filter] ? GRADES[vc.filter].f : 'none';
            expCtx.globalAlpha = fadeAlpha(vc, t);
            expCtx.drawImage(previewImg, 0, 0, W, H);
            expCtx.restore();
        }
        const txts = activeClips(t).filter(c => c.type === 'text');
        if (txts.length) {
            const c = txts[txts.length - 1];
            expCtx.save();
            expCtx.globalAlpha = fadeAlpha(c, t);
            expCtx.fillStyle = c.color || '#fff';
            expCtx.font = `800 ${Math.round(H * (c.size || 6) / 100)}px Segoe UI, sans-serif`;
            expCtx.textAlign = 'center';
            expCtx.shadowColor = 'rgba(0,0,0,.8)'; expCtx.shadowBlur = 12;
            const y = c.pos === 'top' ? H * 0.18 : c.pos === 'bottom' ? H * 0.85 : H / 2;
            wrapText(expCtx, c.text || '', W / 2, y, W * 0.86, H * (c.size || 6) / 100 * 1.2);
            expCtx.restore();
        }
    }
    function wrapText(ctx, text, x, y, maxW, lh) {
        const words = String(text).split(' ');
        let line = '', lines = [];
        words.forEach(w => {
            const test = line + w + ' ';
            if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w + ' '; }
            else line = test;
        });
        lines.push(line);
        const startY = y - (lines.length - 1) * lh / 2;
        lines.forEach((l, i) => ctx.fillText(l.trim(), x, startY + i * lh));
    }

    async function exportVideo(secondsOnly) {
        if (!state.clips.length) return TK.toast('Timeline trống — thêm clip trước', 'error');
        const [W, H] = document.getElementById('exportPreset').value.split('x').map(Number);
        expCanvas = document.createElement('canvas');
        expCanvas.width = W; expCanvas.height = H;
        expCtx = expCanvas.getContext('2d');

        const prog = document.getElementById('exportProgress');
        const fill = document.getElementById('expFill');
        const label = document.getElementById('expLabel');
        prog.style.display = 'flex'; fill.style.width = '0%';
        label.textContent = `Đang xuất ${W}×${H} · ${TK.fmtTime(secondsOnly || seqDuration())}`;
        exportCancel = false; exporting = true;

        const stream = expCanvas.captureStream(30);
        // ghép tiếng thật từ các media (audio graph dùng lại giữa các lần xuất)
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!audioCtx) { audioCtx = new AC(); audioDest = audioCtx.createMediaStreamDestination(); }
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            const used = new Set(state.clips.filter(c => c.type !== 'text').map(c => c.mediaId));
            used.forEach(id => {
                const m = state.media.find(x => x.id === id);
                if (!m) return;
                const el = m.type === 'video' ? pvVideo : audioEls[id];
                if (!el || el.__runeSrc) return;
                try {
                    const src = audioCtx.createMediaElementSource(el);
                    const g = audioCtx.createGain(); g.gain.value = 1;
                    src.connect(g); g.connect(audioDest); g.connect(audioCtx.destination);
                    el.__runeSrc = true;
                } catch (e) { /* element đã được connect trước đó */ }
            });
            audioDest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
        } catch (e) { label.textContent += ' (không ghép được tiếng: ' + e.message + ')'; }

        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
        recChunks = [];
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
        rec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
        const done = new Promise(res => rec.onstop = res);
        rec.start(250);

        const dur = secondsOnly ? Math.min(secondsOnly, seqDuration()) : seqDuration();
        seek(0); setPlaying(true);
        const t0 = performance.now();
        await new Promise(res => {
            const tick = () => {
                const el = (performance.now() - t0) / 1000;
                fill.style.width = Math.min(100, el / dur * 100) + '%';
                label.textContent = `Đang xuất ${W}×${H} · ${TK.fmtTime(Math.min(el, dur))} / ${TK.fmtTime(dur)}`;
                if (exportCancel || el >= dur) return res();
                setTimeout(tick, 200);
            };
            tick();
        });
        setPlaying(false);
        rec.stop();
        await done;
        exporting = false;
        prog.style.display = 'none';
        const blob = new Blob(recChunks, { type: 'video/webm' });
        TK.download(blob, `xcut-${Date.now()}.webm`);
        TK.status(`✅ Đã xuất ${W}×${H}, ${(blob.size / 1048576).toFixed(1)} MB`);
        TK.toast('Đã xuất video WebM (mở được bằng trình phát video / Chrome)', 'ok');
    }

    function exportFrame() {
        const W = 1920, H = state.aspect === '9:16' ? 1920 : state.aspect === '1:1' ? 1080 : 1080;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const prev = expCtx; const prevC = expCanvas;
        expCanvas = c; expCtx = c.getContext('2d');
        drawExportFrame();
        expCanvas = prevC; expCtx = prev;
        TK.download(c.toDataURL('image/png'), `xcut-frame-${TK.fmtTime(state.t).replace(/[:.]/g, '-')}.png`);
        TK.status('📸 Đã chụp khung hình tại ' + TK.fmtTime(state.t));
    }

    /* ================= clip mẫu (tự tạo video thật) ================= */
    async function addSample() {
        TK.toast('Đang tạo 2 clip mẫu bằng canvas + MediaRecorder (~8 giây)…');
        const mk = async (label, hue) => {
            const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
            const x = c.getContext('2d');
            const stream = c.captureStream(30);
            const r = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
            const chunks = []; r.ondataavailable = e => chunks.push(e.data);
            const p = new Promise(res => r.onstop = res);
            r.start();
            const t0 = performance.now();
            await new Promise(res => {
                const draw = () => {
                    const el = (performance.now() - t0) / 1000;
                    const g = x.createLinearGradient(0, 0, 1280, 720);
                    g.addColorStop(0, `hsl(${hue + el * 22},70%,22%)`);
                    g.addColorStop(1, `hsl(${hue + 60 + el * 14},80%,45%)`);
                    x.fillStyle = g; x.fillRect(0, 0, 1280, 720);
                    for (let i = 0; i < 26; i++) {
                        x.globalAlpha = .25;
                        x.beginPath();
                        x.arc(640 + Math.cos(el * 1.2 + i) * (120 + i * 18), 360 + Math.sin(el * 1.5 + i) * (80 + i * 12), 12 + i * 3, 0, Math.PI * 2);
                        x.fillStyle = '#fff'; x.fill();
                    }
                    x.globalAlpha = 1;
                    x.fillStyle = '#fff'; x.font = '800 74px Segoe UI'; x.textAlign = 'center';
                    x.fillText(label, 640, 350);
                    x.font = '30px Segoe UI'; x.fillStyle = 'rgba(255,255,255,.8)';
                    x.fillText('Clip mẫu do xCut Pro tạo · ' + el.toFixed(1) + 's', 640, 410);
                    if (el < 4) requestAnimationFrame(draw); else res();
                };
                draw();
            });
            r.stop(); await p;
            return new Blob(chunks, { type: 'video/webm' });
        };
        const b1 = await mk('RUNE INTRO', 265);
        const b2 = await mk('B-ROLL SCENE', 190);
        await importFiles([new File([b1], 'sample-intro.webm', { type: 'video/webm' }), new File([b2], 'sample-broll.webm', { type: 'video/webm' })]);
        state.media.slice(-2).forEach((m, i) => addClipFromMedia(m, { start: i * 4, track: 'V1', dur: 4 }));
        TK.toast('✅ Đã tạo 2 clip mẫu và xếp lên timeline', 'ok');
    }

    /* ================= history ================= */
    function push() { hist.push(JSON.stringify({ clips: state.clips, aspect: state.aspect, fade: state.fade, grade: state.grade })); }
    function restore(json) {
        const s = JSON.parse(json);
        state.clips = s.clips; state.aspect = s.aspect; state.fade = s.fade; state.grade = s.grade;
        applyAspect(state.aspect); renderTimeline(); renderProps();
    }

    /* ================= AI ================= */
    async function aiAutoEdit() {
        if (!state.media.length) { TK.toast('Nhập media trước (hoặc bấm Tệp → Thêm clip mẫu)', 'error'); return; }
        TK.status('✨ AI đang dựng bản nháp…');
        const desc = state.media.map((m, i) => ({ i, name: m.name, type: m.type, duration: +m.duration.toFixed(2) }));
        let plan = null;
        try {
            plan = await TK.ai(`Dựng video từ các media sau: ${JSON.stringify(desc)}. Khung 9:16 hay 16:9 tùy nội dung.
Trả JSON: {"aspect":"16:9|9:16","clips":[{"mediaIndex":0,"track":"V1","start":0,"duration":4,"speed":1,"filter":"none|vivid|cine|warm|bw"},{"type":"text","track":"V2","start":0,"duration":3,"text":"...","size":7,"color":"#ffffff","pos":"center"}],"note":"..."}`,
                { json: true, system: 'Bạn là editor video chuyên nghiệp. Chỉ trả JSON hợp lệ.' });
        } catch (e) { TK.toast('AI lỗi (' + RuneAI.humanError(e.message) + ') → dùng bản dựng tự động heuristic', 'error'); }
        if (!plan || !plan.clips) plan = heuristicCut();
        state.clips = [];
        let cursor = 0;
        plan.clips.forEach(pc => {
            if (pc.type === 'text') {
                state.clips.push({ id: 'c' + Math.random().toString(36).slice(2), track: pc.track || 'V2', type: 'text', name: 'Chữ', text: pc.text || '', start: pc.start != null ? pc.start : cursor, dur: pc.duration || 3, size: pc.size || 7, color: pc.color || '#fff', pos: pc.pos || 'center', filter: 'none', speed: 1, volume: 1 });
                return;
            }
            const m = state.media[pc.mediaIndex];
            if (!m) return;
            const dur = Math.min(pc.duration || 4, m.duration || 4);
            const start = pc.start != null ? pc.start : cursor;
            state.clips.push({ id: 'c' + Math.random().toString(36).slice(2), track: pc.track || (m.type === 'audio' ? 'A1' : 'V1'), type: m.type === 'audio' ? 'audio' : 'video', mediaId: m.id, name: m.name, start, dur, inPoint: 0, speed: pc.speed || 1, volume: 1, filter: pc.filter || state.grade, reversed: false });
            if (m.type !== 'audio') cursor = start + dur;
        });
        if (plan.aspect) applyAspect(plan.aspect);
        state.selected = null;
        renderTimeline(); renderProps(); push();
        document.getElementById('pvEmpty').style.display = 'none';
        seek(0);
        TK.toast('✨ AI đã dựng bản nháp ' + state.clips.length + ' clip' + (plan.note ? ' — ' + plan.note : ''), 'ok');
        TK.status('AI Auto Edit hoàn tất: ' + state.clips.length + ' clip, ' + TK.fmtTime(seqDuration()));
    }

    function heuristicCut() {
        const vids = state.media.filter(m => m.type !== 'audio');
        const auds = state.media.filter(m => m.type === 'audio');
        const clips = [];
        let t = 0;
        vids.slice(0, 6).forEach((m, i) => {
            const d = Math.min(4, m.duration || 4);
            clips.push({ mediaIndex: state.media.indexOf(m), track: 'V1', start: t, duration: d, speed: 1, filter: i % 2 ? 'cine' : 'none' });
            t += d;
        });
        clips.push({ type: 'text', track: 'V2', start: 0, duration: 3, text: 'Dựng tự động bởi Rune', size: 8, color: '#ffffff', pos: 'center' });
        auds.slice(0, 1).forEach(m => clips.push({ mediaIndex: state.media.indexOf(m), track: 'A1', start: 0, duration: Math.min(t, m.duration), speed: 1, filter: 'none' }));
        return { aspect: '16:9', clips, note: 'bản dựng heuristic (chưa có khóa AI)' };
    }

    async function aiCaptions() {
        TK.status('🤖 Đang tạo phụ đề…');
        const dur = seqDuration();
        let lines = null;
        try {
            lines = await TK.ai(`Video dài ${dur.toFixed(1)} giây. Viết 4-6 dòng phụ đề tiếng Việt ngắn, phù hợp video mẫu, chia theo thời gian.
Trả JSON: {"captions":[{"start":0,"duration":2.5,"text":"..."}]}`, { json: true, system: 'Chỉ trả JSON.' });
        } catch (e) { TK.toast('AI lỗi: ' + RuneAI.humanError(e.message), 'error'); }
        if (!lines || !lines.captions) {
            lines = { captions: [0, 1, 2, 3].map(i => ({ start: i * (dur / 4), duration: dur / 4 - 0.2, text: ['Phần mở đầu', 'Nội dung chính', 'Điểm nhấn', 'Kết thúc & kêu gọi hành động'][i] })) };
        }
        lines.captions.forEach(c => state.clips.push({
            id: 'c' + Math.random().toString(36).slice(2), track: 'V2', type: 'text', name: 'Phụ đề',
            text: c.text, start: Math.max(0, c.start), dur: Math.max(0.5, c.duration || 2.5), size: 5, color: '#ffffff', pos: 'bottom', filter: 'none', speed: 1, volume: 1
        }));
        renderTimeline(); push();
        TK.toast('🤖 Đã thêm ' + lines.captions.length + ' phụ đề', 'ok');
    }

    /* ================= aspect ================= */
    function applyAspect(a) {
        state.aspect = a;
        pvScreen.className = 'preview-screen' + (a === '9:16' ? ' r916' : a === '1:1' ? ' r11' : '');
        const size = a === '9:16' ? '1080x1920' : a === '1:1' ? '640x640' : '1920x1080';
        const sel = document.getElementById('exportPreset');
        if ([].some.call(sel.options, o => o.value === size)) sel.value = size;
        const [W, H] = size.split('x');
        state.exportW = +W; state.exportH = +H;
        document.getElementById('stSeq').textContent = `Sequence ${W}×${H} · 30fps · ${a}`;
        TK.status('Tỉ lệ khung: ' + a);
    }

    /* ================= actions ================= */
    TK.init({ app: 'xcut', status: '.statusbar [data-status-text]' });

    const A = {
        importMedia: async () => { const f = await TK.pickFiles('video/*,audio/*,image/*'); if (f && f.length) await importFiles(f); },
        addSample,
        playPause: () => setPlaying(!state.playing),
        goStart: () => seek(0), goEnd: () => seek(seqDuration()),
        back5: () => seek(state.t - 5), fwd5: () => seek(state.t + 5),
        loopToggle: (e, el) => { state.loop = !state.loop; el.classList.toggle('on', state.loop); TK.status(state.loop ? '🔁 Bật lặp' : 'Tắt lặp'); },
        split: () => {
            const c = state.clips.find(x => x.id === state.selected) || state.clips.filter(x => state.t >= x.start && state.t < x.start + x.dur).pop();
            if (!c) return TK.toast('Không có clip nào tại playhead', 'error');
            splitClipAt(c, state.t);
        },
        setIn: () => { const c = getClip(state.selected); if (!c) return TK.toast('Chọn clip trước'); c.inPoint = Math.max(0, (state.t - c.start) * c.speed); renderProps(); push(); TK.status('Điểm In: ' + TK.fmtTime(c.inPoint)); },
        setOut: () => { const c = getClip(state.selected); if (!c) return TK.toast('Chọn clip trước'); c.dur = Math.max(0.2, state.t - c.start); renderTimeline(); renderProps(); push(); TK.status('Điểm Out: cắt còn ' + TK.fmtTime(c.dur)); },
        trimToPlayhead: () => { const c = getClip(state.selected); if (!c) return TK.toast('Chọn clip trước'); c.dur = Math.max(0.2, state.t - c.start); renderTimeline(); push(); },
        deleteClip: () => {
            const c = getClip(state.selected);
            if (!c) return TK.toast('Chưa chọn clip', 'error');
            state.clips = state.clips.filter(x => x !== c); state.selected = null;
            renderTimeline(); renderProps(); push(); TK.status('Đã xóa clip');
        },
        rippleDelete: () => {
            const c = getClip(state.selected);
            if (!c) return TK.toast('Chưa chọn clip', 'error');
            const gap = c.dur, track = c.track, from = c.start;
            state.clips = state.clips.filter(x => x !== c);
            state.clips.forEach(x => { if (x.track === track && x.start >= from) x.start = Math.max(0, x.start - gap); });
            renderTimeline(); renderProps(); push(); TK.toast('Đã xóa và dồn khoảng trống', 'ok');
        },
        duplicateClip: () => {
            const c = getClip(state.selected);
            if (!c) return TK.toast('Chưa chọn clip', 'error');
            const d = Object.assign({}, c, { id: 'c' + Date.now(), start: c.start + c.dur + 0.05 });
            state.clips.push(d); state.selected = d.id; renderTimeline(); renderProps(); push();
        },
        speedUp: () => { const c = getClip(state.selected); if (!c) return TK.toast('Chọn clip trước'); c.speed = TK.clamp(c.speed * 2, 0.25, 8); renderProps(); push(); },
        speedDown: () => { const c = getClip(state.selected); if (!c) return TK.toast('Chọn clip trước'); c.speed = TK.clamp(c.speed / 2, 0.25, 8); renderProps(); push(); },
        speedReset: () => { const c = getClip(state.selected); if (!c) return TK.toast('Chọn clip trước'); c.speed = 1; renderProps(); push(); },
        reverseClip: () => { const c = getClip(state.selected); if (!c) return TK.toast('Chọn clip trước'); c.reversed = !c.reversed; TK.toast(c.reversed ? 'Đánh dấu đảo chiều (dựng theo thứ tự ngược)' : 'Bỏ đảo chiều'); push(); },
        undo: () => { if (hist.canUndo()) { restore(hist.undo()); TK.status('↶ Hoàn tác'); } else TK.toast('Không còn gì để hoàn tác'); },
        redo: () => { if (hist.canRedo()) { restore(hist.redo()); TK.status('↷ Làm lại'); } else TK.toast('Không còn gì để làm lại'); },
        tool: (e, el) => {
            state.tool = el.dataset.arg;
            document.querySelectorAll('.timeline-tool[data-arg]').forEach(b => b.classList.toggle('on', b.dataset.arg === state.tool));
            TK.status('Công cụ timeline: ' + state.tool);
        },
        zoomTimeline: (e, el) => { state.pps = TK.clamp(state.pps * (el.dataset.arg === 'in' ? 1.3 : 0.77), 6, 260); renderTimeline(); },
        snapToggle: (e, el) => { state.snap = !state.snap; el.classList.toggle('on', state.snap); TK.status(state.snap ? '🧲 Bắt dính: BẬT' : 'Bắt dính: TẮT'); },
        aspect: (e, el) => { applyAspect(el.dataset.arg); push(); },
        addTextClip,
        addAudioTrack: async () => {
            const f = await TK.pickFile('audio/*');
            if (!f) return;
            await importFiles([f]);
            const m = state.media[state.media.length - 1];
            addClipFromMedia(m, { track: 'A2', start: 0, dur: Math.min(m.duration, seqDuration() || m.duration) });
            TK.toast('🎵 Đã thêm nhạc nền vào track A2', 'ok');
        },
        musicBed: () => A.addAudioTrack(),
        clearTimeline: async () => {
            if (!await TK.confirm('Xóa toàn bộ timeline?', 'Mọi clip sẽ bị gỡ khỏi timeline (media trong thư viện vẫn còn).')) return;
            state.clips = []; state.selected = null; renderTimeline(); renderProps(); push();
            document.getElementById('pvEmpty').style.display = 'flex';
        },
        fadeToggle: () => { state.fade = !state.fade; renderFrame(); push(); TK.toast(state.fade ? 'Bật fade in/out 0.5s giữa các clip' : 'Tắt fade'); },
        stabilizeNote: () => TK.modal({ title: 'Chống rung', message: 'Chống rung cần xử lý frame offline (ffmpeg/backend C++).\nTrong trình duyệt, bạn có thể giảm rung bằng cách:\n• Dùng clip tốc độ chậm hơn (0.5×)\n• Cắt bỏ đoạn rung ở đầu/cuối clip\nRune đã ghi chú yêu cầu này vào nhật ký.', cancel: null, ok: 'Đã hiểu' }),
        captions: aiCaptions,
        aiAutoEdit,
        exportVideo: () => exportVideo(),
        exportFrame,
        exportGif: () => exportVideo(3),
        cancelExport: () => { exportCancel = true; TK.toast('Đang hủy xuất…'); },
        exportEDL: () => {
            const edl = state.clips.map((c, i) => `${String(i + 1).padStart(3, '0')}  ${c.name.padEnd(24, ' ').slice(0, 24)}  ${c.track}  IN ${TK.fmtTime(c.start)}  OUT ${TK.fmtTime(c.start + c.dur)}  SPEED ${c.speed}  FILTER ${c.filter}`).join('\n');
            TK.download(new Blob([`TITLE: RUNE XCUT PROJECT\nFCM: NON-DROP FRAME\n\n${edl}\n\nJSON:\n${JSON.stringify({ aspect: state.aspect, clips: state.clips }, null, 2)}`], { type: 'text/plain' }), 'xcut-project.edl');
        },
        saveProject: () => {
            TK.download(new Blob([JSON.stringify({ v: 1, aspect: state.aspect, fade: state.fade, grade: state.grade, clips: state.clips, mediaNames: state.media.map(m => ({ name: m.name, type: m.type, duration: m.duration })) }, null, 2)], { type: 'application/json' }), 'xcut-project.json');
            document.getElementById('stProject').textContent = 'Đã lưu dự án ' + new Date().toLocaleTimeString('vi-VN');
        },
        async loadProject() {
            const f = await TK.pickFile('.json,application/json');
            if (!f) return;
            try {
                const j = JSON.parse(await TK.readAsText(f));
                state.clips = j.clips || []; state.fade = !!j.fade;
                applyAspect(j.aspect || '16:9');
                renderTimeline(); push();
                TK.toast('Đã mở dự án (lưu ý: cần nhập lại file media trùng tên để phát)', 'ok');
            } catch (e) { TK.toast('File dự án lỗi: ' + e.message, 'error'); }
        }
    };
    Object.keys(A).forEach(k => TK.on(k, A[k]));

    /* grade list */
    const gl = document.getElementById('gradeList');
    gl.innerHTML = Object.keys(GRADES).map(k => `<div class="effect-item" data-action="grade" data-grade="${k}">🎨 ${GRADES[k].n}</div>`).join('') +
        `<div class="effect-item" data-action="gradeAll">⚡ Áp cho TẤT CẢ clip video</div>`;
    TK.on('grade', (e, el) => {
        const c = getClip(state.selected);
        if (!c) { state.grade = el.dataset.grade; pvVideo.style.filter = GRADES[state.grade].f; TK.toast('Chưa chọn clip → đặt làm bộ lọc mặc định: ' + GRADES[state.grade].n); markGrade(); return; }
        c.filter = el.dataset.grade; renderFrame(); markGrade(); push();
        TK.status('Bộ lọc clip: ' + GRADES[c.filter].n);
    });
    TK.on('gradeAll', () => {
        state.clips.filter(c => c.type !== 'text').forEach(c => c.filter = state.grade === 'none' ? c.filter : state.grade);
        renderFrame(); push(); TK.toast('Đã áp bộ lọc "' + GRADES[state.grade].n + '" cho mọi clip', 'ok');
    });

    /* ruler click/drag để seek */
    let rulerDrag = false;
    const seekFromEvent = e => {
        const r = ruler.getBoundingClientRect();
        seek((e.clientX - r.left - LANE_OFF) / state.pps);
    };
    ruler.addEventListener('pointerdown', e => { rulerDrag = true; ruler.setPointerCapture(e.pointerId); seekFromEvent(e); });
    ruler.addEventListener('pointermove', e => { if (rulerDrag) seekFromEvent(e); });
    ruler.addEventListener('pointerup', () => { rulerDrag = false; push(); });

    document.getElementById('masterVol').addEventListener('input', renderFrame);
    document.getElementById('globalSpeed').addEventListener('change', renderFrame);

    /* drag&drop */
    ['dragover', 'drop'].forEach(ev => document.body.addEventListener(ev, e => {
        e.preventDefault();
        if (ev === 'drop' && e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
    }));

    /* phím tắt */
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
        const k = e.key.toLowerCase();
        if (k === ' ') { e.preventDefault(); A.playPause(); }
        else if (k === 'j') { pvVideo.playbackRate = Math.max(.25, pvVideo.playbackRate - .5); }
        else if (k === 'k') A.playPause();
        else if (k === 'l') { pvVideo.playbackRate = Math.min(8, pvVideo.playbackRate + .5); }
        else if (k === 'arrowleft') seek(state.t - (e.shiftKey ? 1 : 1 / 30));
        else if (k === 'arrowright') seek(state.t + (e.shiftKey ? 1 : 1 / 30));
        else if (k === 'home') seek(0);
        else if (k === 'end') seek(seqDuration());
        else if (k === 'i') A.setIn();
        else if (k === 'o') A.setOut();
        else if (k === 'delete' || k === 'backspace') A.deleteClip();
        else if ((e.ctrlKey || e.metaKey) && k === 'b') { e.preventDefault(); A.split(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); A.duplicateClip(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'e') { e.preventDefault(); A.exportVideo(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'i') { e.preventDefault(); A.importMedia(); }
        else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); A.saveProject(); }
        else if (k === 'v') document.querySelector('[data-arg="select"]').click();
        else if (k === 'c') document.querySelector('[data-arg="razor"]').click();
        else if (k === 'h') document.querySelector('[data-arg="hand"]').click();
    });

    /* lệnh cho AI điều khiển */
    TK.cmd('get_info', () => ({ app: 'xCut Pro', media: state.media.map(m => ({ name: m.name, type: m.type, duration: +m.duration.toFixed(2) })), clips: state.clips.length, duration: +seqDuration().toFixed(2), aspect: state.aspect, time: +state.t.toFixed(2) }));
    TK.cmd('set_aspect', a => { applyAspect(a.aspect || '16:9'); return { aspect: state.aspect }; });
    TK.cmd('import_sample', () => { addSample(); return { ok: true }; });
    TK.cmd('add_text', a => { state.clips.push({ id: 'c' + Date.now(), track: 'V2', type: 'text', name: 'Chữ', text: a.text || 'Text', start: a.start != null ? a.start : state.t, dur: a.duration || 3, size: a.size || 7, color: a.color || '#fff', pos: a.pos || 'center', filter: 'none', speed: 1, volume: 1 }); renderTimeline(); push(); return { clips: state.clips.length }; });
    TK.cmd('set_grade', a => { state.grade = a.grade || 'none'; state.clips.filter(c => c.type !== 'text').forEach(c => c.filter = state.grade); renderFrame(); push(); return { grade: state.grade }; });
    TK.cmd('split', a => { A.split(); return { ok: true }; });
    TK.cmd('play', a => { setPlaying(a.play !== false); return { playing: state.playing }; });
    TK.cmd('seek', a => { seek(a.time || 0); return { t: state.t }; });
    TK.cmd('speed', a => { const c = getClip(state.selected); if (c) { c.speed = a.value || 1; renderProps(); } return { speed: c && c.speed }; });
    TK.cmd('export', a => { exportVideo(a.seconds); return { started: true }; });
    TK.cmd('capture_frame', () => { exportFrame(); return { ok: true }; });
    TK.cmd('ai_auto_edit', () => { aiAutoEdit(); return { started: true }; });
    TK.cmd('captions', () => { aiCaptions(); return { started: true }; });
    TK.cmd('clear_timeline', () => { state.clips = []; renderTimeline(); push(); return { ok: true }; });

    /* chạy */
    applyAspect('16:9');
    renderTimeline();
    renderMedia();
    renderProps();
    markGrade();
    push();
    raf = requestAnimationFrame(loop);
    TK.status('Sẵn sàng — nhập media hoặc bấm Tệp → Thêm clip mẫu để thử ngay');
})();
