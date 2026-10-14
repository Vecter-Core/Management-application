// xCut Pro - Video Editor controls
let isPlaying = false;
let currentTime = 0;
const playBtn = document.getElementById('playBtn');

playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? '⏸' : '▶';
});

// Ruler marks
const rulerMarks = document.getElementById('rulerMarks');
for (let i = 0; i <= 60; i++) {
    const mark = document.createElement('div');
    mark.style.position = 'absolute';
    mark.style.left = (i * 50) + 'px';
    mark.style.top = '0';
    mark.style.bottom = '0';
    mark.style.borderLeft = '1px solid #444';
    mark.style.fontSize = '10px';
    mark.style.color = '#888';
    mark.style.padding = '4px';
    mark.textContent = `${Math.floor(i/60)}:${(i%60).toString().padStart(2,'0')}`;
    rulerMarks.appendChild(mark);
}

// Seek bar update
const seekBar = document.getElementById('seekBar');
const playhead = document.getElementById('playhead');
seekBar.addEventListener('input', (e) => {
    currentTime = parseInt(e.target.value);
    playhead.style.left = (currentTime * 5) + 'px';
    const mins = Math.floor(currentTime / 60);
    const secs = currentTime % 60;
    document.getElementById('currentTime').textContent = `00:0${mins}:${secs.toString().padStart(2,'0')}`;
    document.getElementById('previewTime').textContent = `00:0${mins}:${secs.toString().padStart(2,'0')}.00`;
});
