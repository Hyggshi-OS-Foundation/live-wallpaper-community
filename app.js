// ============================================================
// Supabase Configuration
// ============================================================
const SUPABASE_URL = 'https://udaniwuafagvftgsnslb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYW5pd3VhZmFndmZ0Z3Nuc2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDUwNTUsImV4cCI6MjA5ODIyMTA1NX0.uqDko_JfAJIhzs1NcU2ygbW6cYKt26f2w3lf4ngwkKY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// DOM Elements
// ============================================================
const wallpaperContainer = document.getElementById('wallpaperContainer');
const uploadBtn          = document.getElementById('uploadBtn');
const loginBtn           = document.getElementById('loginBtn');
const uploadModal        = document.getElementById('uploadModal');
const videoModal         = document.getElementById('videoModal');
const loginModal         = document.getElementById('loginModal');
const uploadForm         = document.getElementById('uploadForm');
const loginForm          = document.getElementById('loginForm');
const videoPlayer        = document.getElementById('videoPlayer');
const videoTitle         = document.getElementById('videoTitle');
const videoCategory      = document.getElementById('videoCategory');
const downloadBtn        = document.getElementById('downloadBtn');
const shareBtn           = document.getElementById('shareBtn');
const likeBtn            = document.getElementById('likeBtn');
const filterBtns         = document.querySelectorAll('.filter-btn');
const submitBtn          = document.getElementById('submitBtn');
const progressWrap       = document.getElementById('conversionProgress');
const progressFill       = document.getElementById('progressFill');
const progressText       = document.getElementById('progressText');
const progressPercent    = document.getElementById('progressPercent');
const ffmpegToast        = document.getElementById('ffmpegToast');
const fileInfo           = document.getElementById('fileInfo');

// ============================================================
// State
// ============================================================
let currentUser     = null;
let currentVideoUrl = null;
let currentFilter   = 'all';
let ffmpeg          = null;
let isFFmpegLoaded  = false;

// ============================================================
// FFmpeg CDN URLs (v0.12)
// ============================================================
const FFMPEG_CDN   = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
const FFUTIL_CDN   = 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';
const FFCORE_BASE  = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
const FFWORKER_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js';

// Tự fetch URL rồi tạo blob: URL để bypass Worker CORS
async function urlToBlob(url, mimeType) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
    const buf = await res.arrayBuffer();
    return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

// ============================================================
// Compression Presets
// CRF VP9: 0=lossless, 63=worst. Lower CRF = bigger file / better quality.
// -b:v 0 để VP9 dùng CRF mode thuần (không giới hạn bitrate)
// ============================================================
const PRESETS = {
    low: {
        // Low compression = chất lượng cao = file to
        // 100MB MP4 → ~50–80MB WebM
        label : 'Low Compression (best quality)',
        crf   : '20',
        b_v   : '0',
        cpu   : '4',    // 0=slowest/best, 8=fastest/worst — balance giữa tốc độ & chất lượng
    },
    medium: {
        // 100MB MP4 → ~15–25MB WebM
        label : 'Medium (balanced)',
        crf   : '33',
        b_v   : '0',
        cpu   : '6',
    },
    high: {
        // High compression = chất lượng thấp = file nhỏ
        // 100MB MP4 → ~5–10MB WebM
        label : 'High Compression (smallest)',
        crf   : '50',
        b_v   : '0',
        cpu   : '8',
    },
};

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    checkSession();
    loadWallpapers();
    setupEventListeners();
    initFFmpeg();   // không await — load nền
});

// ============================================================
// FFmpeg Init (v0.12 ESM dynamic import)
// ============================================================
async function initFFmpeg() {
    try {
        showToast('⏳ Đang tải FFmpeg...', 'info');

        const { FFmpeg } = await import(FFMPEG_CDN);
        ffmpeg = new FFmpeg();

        ffmpeg.on('progress', ({ progress }) => {
            const pct = Math.min(100, Math.round(progress * 100));
            updateProgress(pct);
        });

        // Fetch tất cả resources về blob: URL trước — bypass Worker CORS hoàn toàn
        console.log('Fetching FFmpeg resources...');
        const [coreURL, wasmURL, workerURL] = await Promise.all([
            urlToBlob(`${FFCORE_BASE}/ffmpeg-core.js`,   'text/javascript'),
            urlToBlob(`${FFCORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
            urlToBlob(FFWORKER_URL,                      'text/javascript'),
        ]);

        await ffmpeg.load({ coreURL, wasmURL, workerURL });

        isFFmpegLoaded = true;
        showToast('✅ FFmpeg sẵn sàng — hỗ trợ chuyển đổi WebM', 'success');
        console.log('✅ FFmpeg 0.12 loaded');

    } catch (err) {
        isFFmpegLoaded = false;
        console.error('FFmpeg load failed:', err);
        if (!crossOriginIsolated) {
            showToast('⚠️ Thiếu COOP/COEP headers — kiểm tra file _headers trên Cloudflare Pages', 'warning', 7000);
        } else {
            showToast('⚠️ FFmpeg không tải được. Sẽ upload file gốc.', 'warning');
        }
    }
}

// ============================================================
// Toast helper
// ============================================================
function showToast(msg, type = 'info', duration = 3500) {
    ffmpegToast.textContent = msg;
    ffmpegToast.className = `toast toast-${type}`;
    ffmpegToast.style.display = 'block';
    clearTimeout(ffmpegToast._timer);
    ffmpegToast._timer = setTimeout(() => {
        ffmpegToast.style.display = 'none';
    }, duration);
}

// ============================================================
// Progress bar helpers
// ============================================================
function showProgress(label) {
    progressWrap.style.display = 'block';
    progressText.textContent   = label || 'Đang xử lý...';
    updateProgress(0);
}

function updateProgress(pct) {
    progressFill.style.width    = pct + '%';
    progressPercent.textContent = pct + '%';
}

function hideProgress() {
    progressWrap.style.display = 'none';
}

// ============================================================
// Session
// ============================================================
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        updateUIForLoggedInUser();
    }
}

// ============================================================
// Event Listeners
// ============================================================
function setupEventListeners() {
    uploadBtn.addEventListener('click', () => {
        if (!currentUser) {
            alert('Vui lòng đăng nhập để upload wallpaper');
            loginModal.classList.add('active');
            return;
        }
        uploadModal.classList.add('active');
    });

    loginBtn.addEventListener('click', () => {
        if (currentUser) handleLogout();
        else loginModal.classList.add('active');
    });

    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', e => e.target.closest('.modal').classList.remove('active'));
    });

    window.addEventListener('click', e => {
        if (e.target.classList.contains('modal')) e.target.classList.remove('active');
    });

    uploadForm.addEventListener('submit', handleUpload);
    loginForm.addEventListener('submit', handleLogin);

    document.getElementById('switchToSignup').addEventListener('click', e => {
        e.preventDefault();
        handleSignup();
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            loadWallpapers();
        });
    });

    downloadBtn.addEventListener('click', handleDownload);
    shareBtn.addEventListener('click', handleShare);
    likeBtn.addEventListener('click', handleLike);

    // Hiện file size khi chọn file
    document.getElementById('videoFile').addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) {
            const mb = (f.size / 1024 / 1024).toFixed(1);
            fileInfo.textContent = `${f.name} — ${mb} MB`;
        } else {
            fileInfo.textContent = '';
        }
    });

    // Ẩn/hiện tùy chọn conversion khi skip được tick
    document.getElementById('skipConversion').addEventListener('change', e => {
        document.getElementById('conversionOptions').style.opacity = e.target.checked ? '0.4' : '1';
    });
}

// ============================================================
// Load & Display Wallpapers
// ============================================================
async function loadWallpapers() {
    wallpaperContainer.innerHTML = '<div class="loading">Đang tải wallpaper...</div>';

    let query = supabaseClient
        .from('wallpapers')
        .select('*')
        .order('created_at', { ascending: false });

    if (currentFilter !== 'all') {
        query = query.eq('category', currentFilter);
    }

    const { data: wallpapers, error } = await query;

    if (error) {
        console.error('Error loading wallpapers:', error);
        wallpaperContainer.innerHTML = '<div class="empty-state"><h3>Lỗi tải wallpaper</h3><p>Vui lòng thử lại</p></div>';
        return;
    }

    if (!wallpapers || wallpapers.length === 0) {
        wallpaperContainer.innerHTML = '<div class="empty-state"><h3>Chưa có wallpaper nào</h3><p>Hãy là người đầu tiên upload!</p></div>';
        return;
    }

    displayWallpapers(wallpapers);
}

function displayWallpapers(wallpapers) {
    wallpaperContainer.innerHTML = '';

    wallpapers.forEach(wallpaper => {
        const card = document.createElement('div');
        card.className = 'wallpaper-card';

        const isWebM = wallpaper.video_url && wallpaper.video_url.toLowerCase().includes('.webm');

        card.innerHTML = `
            <div class="wallpaper-thumbnail">
                ${wallpaper.thumbnail_url
                    ? `<img src="${wallpaper.thumbnail_url}" alt="${wallpaper.title}" loading="lazy">`
                    : `<video src="${wallpaper.video_url}" muted playsinline preload="metadata"></video>
                       <span class="play-icon">▶</span>`
                }
                ${isWebM ? '<span class="format-badge">WebM</span>' : '<span class="format-badge mp4">MP4</span>'}
            </div>
            <div class="wallpaper-info">
                <div class="wallpaper-title">${wallpaper.title}</div>
                <div class="wallpaper-meta">
                    <span class="wallpaper-category">${wallpaper.category}</span>
                    <span>${formatDate(wallpaper.created_at)}</span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => openVideoModal(wallpaper));
        wallpaperContainer.appendChild(card);
    });

    document.querySelectorAll('.wallpaper-thumbnail video').forEach(video => {
        video.addEventListener('mouseenter', () => video.play().catch(() => {}));
        video.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
    });
}

// ============================================================
// Video Modal
// ============================================================
function openVideoModal(wallpaper) {
    currentVideoUrl = wallpaper.video_url;

    const isWebM = wallpaper.video_url.toLowerCase().includes('.webm');
    const mime   = isWebM ? 'video/webm' : 'video/mp4';

    const source = videoPlayer.querySelector('source');
    source.src   = wallpaper.video_url;
    source.type  = mime;

    videoTitle.textContent    = wallpaper.title;
    videoCategory.textContent = wallpaper.category;
    videoModal.classList.add('active');
    videoPlayer.load();
    videoPlayer.play().catch(() => {});
}

// ============================================================
// Handle Upload
// ============================================================
async function handleUpload(e) {
    e.preventDefault();

    const title         = document.getElementById('title').value.trim();
    const category      = document.getElementById('category').value;
    const videoFile     = document.getElementById('videoFile').files[0];
    const thumbnailFile = document.getElementById('thumbnail').files[0];
    const skipConvert   = document.getElementById('skipConversion').checked;

    if (!videoFile) { alert('Vui lòng chọn file video'); return; }

    const isWebM = videoFile.type === 'video/webm';
    const isMP4  = videoFile.type === 'video/mp4';

    if (!isWebM && !isMP4) {
        alert('Chỉ chấp nhận file MP4 hoặc WebM');
        return;
    }

    // Lock UI
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Đang xử lý...';

    try {
        let fileToUpload = videoFile;

        // Convert MP4 → WebM nếu: file là MP4, FFmpeg sẵn sàng, người dùng không skip
        if (isMP4 && !skipConvert) {
            if (isFFmpegLoaded) {
                showProgress('Đang chuyển đổi MP4 → WebM...');
                submitBtn.textContent = 'Đang chuyển đổi...';
                fileToUpload = await convertToWebM(videoFile);
                hideProgress();
            } else {
                console.warn('FFmpeg chưa sẵn sàng, upload MP4 gốc');
                showToast('FFmpeg chưa load xong, upload file MP4 gốc', 'warning');
            }
        }

        // Upload video
        submitBtn.textContent = 'Đang upload video...';
        const videoFileName = `${Date.now()}-${fileToUpload.name}`;
        const { error: videoError } = await supabaseClient.storage
            .from('wallpapers')
            .upload(videoFileName, fileToUpload, { cacheControl: '3600', upsert: false });

        if (videoError) throw videoError;

        const { data: { publicUrl: videoUrl } } = supabaseClient.storage
            .from('wallpapers')
            .getPublicUrl(videoFileName);

        // Upload thumbnail (nếu có)
        let thumbnailUrl = null;
        if (thumbnailFile) {
            submitBtn.textContent = 'Đang upload thumbnail...';
            const thumbName = `${Date.now()}-${thumbnailFile.name}`;
            const { error: thumbError } = await supabaseClient.storage
                .from('thumbnails')
                .upload(thumbName, thumbnailFile, { cacheControl: '3600', upsert: false });

            if (thumbError) throw thumbError;

            const { data: { publicUrl: thumbUrl } } = supabaseClient.storage
                .from('thumbnails')
                .getPublicUrl(thumbName);

            thumbnailUrl = thumbUrl;
        }

        // Insert DB record
        const { error: dbError } = await supabaseClient
            .from('wallpapers')
            .insert([{ title, category, video_url: videoUrl, thumbnail_url: thumbnailUrl, user_id: currentUser.id }]);

        if (dbError) throw dbError;

        // Log sizes
        const origMB   = (videoFile.size    / 1024 / 1024).toFixed(1);
        const uploadMB = (fileToUpload.size / 1024 / 1024).toFixed(1);
        console.log(`✅ Upload xong!  Gốc: ${origMB}MB → Upload: ${uploadMB}MB`);

        alert('Upload wallpaper thành công! 🎉');
        uploadForm.reset();
        fileInfo.textContent = '';
        uploadModal.classList.remove('active');
        loadWallpapers();

    } catch (err) {
        console.error('Upload error:', err);
        alert('Lỗi upload: ' + (err.message || err));
    } finally {
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Upload';
        hideProgress();
    }
}

// ============================================================
// FFmpeg WebM Conversion (v0.12 API)
// ============================================================
async function convertToWebM(file) {
    try {
        const { fetchFile } = await import(FFUTIL_CDN);  // fetchFile OK — chỉ dùng để đọc File object, không tạo Worker

        const preset = document.getElementById('compressionPreset').value;
        const config = PRESETS[preset] || PRESETS.medium;

        const origMB = (file.size / 1024 / 1024).toFixed(1);
        console.log(`🎬 Converting "${file.name}" (${origMB} MB) — preset: ${config.label}`);
        console.log(`   CRF=${config.crf}  cpu-used=${config.cpu}`);

        const INPUT  = 'input.mp4';
        const OUTPUT = 'output.webm';

        await ffmpeg.writeFile(INPUT, await fetchFile(file));

        await ffmpeg.exec([
            '-i',        INPUT,
            '-c:v',      'libvpx-vp9',
            '-crf',      config.crf,
            '-b:v',      config.b_v,          // '0' = CRF-only mode (không giới hạn bitrate)
            '-deadline', 'realtime',           // nhanh hơn 'good' / 'best'
            '-cpu-used', config.cpu,           // 0=slowest+best → 8=fastest+worst
            '-row-mt',   '1',                  // multi-thread row encoding
            '-pix_fmt',  'yuv420p',
            '-c:a',      'libopus',
            '-b:a',      '96k',
            '-ac',       '2',
            '-f',        'webm',
            OUTPUT,
        ]);

        const data = await ffmpeg.readFile(OUTPUT);

        // Cleanup WASM FS
        try { await ffmpeg.deleteFile(INPUT);  } catch (_) {}
        try { await ffmpeg.deleteFile(OUTPUT); } catch (_) {}

        const webmFile = new File(
            [data.buffer],
            file.name.replace(/\.[^.]+$/, '.webm'),
            { type: 'video/webm' }
        );

        const webmMB = (webmFile.size / 1024 / 1024).toFixed(1);
        const saved  = Math.round((1 - webmFile.size / file.size) * 100);

        console.log(`✅ Conversion done!`);
        console.log(`   MP4 gốc : ${origMB} MB`);
        console.log(`   WebM    : ${webmMB} MB`);
        console.log(`   Giảm    : ${saved}%`);
        showToast(`✅ Chuyển đổi xong! ${origMB}MB → ${webmMB}MB (giảm ${saved}%)`, 'success', 5000);

        return webmFile;

    } catch (err) {
        console.error('❌ Conversion failed:', err);
        showToast(`⚠️ Chuyển đổi thất bại: ${err.message}. Sẽ upload MP4 gốc.`, 'warning', 5000);
        return file;   // fallback: trả về file gốc
    }
}

// ============================================================
// Auth
// ============================================================
async function handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { alert('Đăng nhập thất bại: ' + error.message); return; }

    currentUser = data.user;
    updateUIForLoggedInUser();
    loginModal.classList.remove('active');
    loginForm.reset();
}

async function handleSignup() {
    const email    = prompt('Nhập email của bạn:');
    if (!email) return;
    const password = prompt('Nhập mật khẩu:');
    if (!password) return;

    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) { alert('Đăng ký thất bại: ' + error.message); return; }
    alert('Đăng ký thành công! Kiểm tra email để xác nhận tài khoản.');
}

async function handleLogout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) { alert('Đăng xuất thất bại: ' + error.message); return; }
    currentUser = null;
    updateUIForLoggedOutUser();
}

function updateUIForLoggedInUser() {
    loginBtn.textContent = 'Đăng xuất';
    loginBtn.classList.replace('btn-secondary', 'btn-primary');
}

function updateUIForLoggedOutUser() {
    loginBtn.textContent = 'Login';
    loginBtn.classList.replace('btn-primary', 'btn-secondary');
}

// ============================================================
// Download / Share / Like
// ============================================================
function handleDownload() {
    if (!currentVideoUrl) return;
    const link      = document.createElement('a');
    link.href       = currentVideoUrl;
    link.download   = 'wallpaper' + (currentVideoUrl.includes('.webm') ? '.webm' : '.mp4');
    link.target     = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleShare() {
    if (!currentVideoUrl) return;
    const shareData = {
        title : videoTitle.textContent,
        text  : `Xem live wallpaper: ${videoTitle.textContent}`,
        url   : currentVideoUrl,
    };
    if (navigator.share) {
        navigator.share(shareData).catch(err => console.log('Share cancelled:', err));
    } else {
        copyToClipboard(currentVideoUrl);
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => alert('Đã copy link!')).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); alert('Đã copy link!'); }
    catch (_) { alert('Copy thủ công: ' + text); }
    document.body.removeChild(ta);
}

async function handleLike() {
    if (!currentUser) { alert('Vui lòng đăng nhập để like'); return; }
    alert('Tính năng like sắp ra mắt!');
}

// ============================================================
// Utils
// ============================================================
function formatDate(dateString) {
    const date     = new Date(dateString);
    const diffDays = Math.ceil(Math.abs(new Date() - date) / 86400000);
    if (diffDays === 1)  return '1 ngày trước';
    if (diffDays < 7)   return `${diffDays} ngày trước`;
    if (diffDays < 30)  return `${Math.floor(diffDays / 7)} tuần trước`;
    return date.toLocaleDateString('vi-VN');
}