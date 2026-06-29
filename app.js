// Supabase Configuration
const SUPABASE_URL = 'https://udaniwuafagvftgsnslb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYW5pd3VhZmFndmZ0Z3Nuc2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDUwNTUsImV4cCI6MjA5ODIyMTA1NX0.uqDko_JfAJIhzs1NcU2ygbW6cYKt26f2w3lf4ngwkKY';

// Create Supabase client (use different variable name to avoid conflict)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const wallpaperContainer = document.getElementById('wallpaperContainer');
const uploadBtn = document.getElementById('uploadBtn');
const loginBtn = document.getElementById('loginBtn');
const uploadModal = document.getElementById('uploadModal');
const videoModal = document.getElementById('videoModal');
const loginModal = document.getElementById('loginModal');
const uploadForm = document.getElementById('uploadForm');
const loginForm = document.getElementById('loginForm');
const videoPlayer = document.getElementById('videoPlayer');
const videoTitle = document.getElementById('videoTitle');
const videoCategory = document.getElementById('videoCategory');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const likeBtn = document.getElementById('likeBtn');
const filterBtns = document.querySelectorAll('.filter-btn');

let currentUser = null;
let currentVideoUrl = null;
let currentFilter = 'all';
let ffmpeg = null;
let isFFmpegLoaded = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    checkSession();
    loadWallpapers();
    setupEventListeners();
    
    // Initialize FFmpeg for client-side video conversion
    await initFFmpeg();
});

// Check user session
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        updateUIForLoggedInUser();
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Upload Modal
    uploadBtn.addEventListener('click', () => {
        if (!currentUser) {
            alert('Please login to upload wallpapers');
            loginModal.classList.add('active');
            return;
        }
        uploadModal.classList.add('active');
    });

    // Login Modal
    loginBtn.addEventListener('click', () => {
        if (currentUser) {
            handleLogout();
        } else {
            loginModal.classList.add('active');
        }
    });

    // Close Modals
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('active');
        });
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });

    // Upload Form
    uploadForm.addEventListener('submit', handleUpload);

    // Login Form
    loginForm.addEventListener('submit', handleLogin);

    // Switch to Signup
    document.getElementById('switchToSignup').addEventListener('click', (e) => {
        e.preventDefault();
        handleSignup();
    });

    // Filter Buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            loadWallpapers();
        });
    });

    // Download Button
    downloadBtn.addEventListener('click', handleDownload);

    // Share Button
    shareBtn.addEventListener('click', handleShare);

    // Like Button
    likeBtn.addEventListener('click', handleLike);
}

// Load Wallpapers
async function loadWallpapers() {
    wallpaperContainer.innerHTML = '<div class="loading">Loading wallpapers...</div>';

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
        wallpaperContainer.innerHTML = '<div class="empty-state"><h3>Error loading wallpapers</h3><p>Please try again later</p></div>';
        return;
    }

    if (wallpapers.length === 0) {
        wallpaperContainer.innerHTML = '<div class="empty-state"><h3>No wallpapers found</h3><p>Be the first to upload!</p></div>';
        return;
    }

    displayWallpapers(wallpapers);
}

// Display Wallpapers
function displayWallpapers(wallpapers) {
    wallpaperContainer.innerHTML = '';

    wallpapers.forEach(wallpaper => {
        const card = document.createElement('div');
        card.className = 'wallpaper-card';
        card.innerHTML = `
            <div class="wallpaper-thumbnail">
                ${wallpaper.thumbnail_url 
                    ? `<img src="${wallpaper.thumbnail_url}" alt="${wallpaper.title}">` 
                    : `<video src="${wallpaper.video_url}" muted></video><span class="play-icon">▶</span>`
                }
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

    // Add hover effect to play videos
    document.querySelectorAll('.wallpaper-thumbnail video').forEach(video => {
        video.addEventListener('mouseenter', () => video.play());
        video.addEventListener('mouseleave', () => {
            video.pause();
            video.currentTime = 0;
        });
    });
}

// Open Video Modal
function openVideoModal(wallpaper) {
    currentVideoUrl = wallpaper.video_url;
    
    // Determine video type
    const videoType = wallpaper.video_url.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4';
    
    // Update video source
    const source = videoPlayer.querySelector('source');
    source.src = wallpaper.video_url;
    source.type = videoType;
    
    videoTitle.textContent = wallpaper.title;
    videoCategory.textContent = wallpaper.category;
    videoModal.classList.add('active');
    videoPlayer.load();
}

// Handle Upload
async function handleUpload(e) {
    e.preventDefault();

    const title = document.getElementById('title').value;
    const category = document.getElementById('category').value;
    const videoFile = document.getElementById('videoFile').files[0];
    const thumbnailFile = document.getElementById('thumbnail').files[0];

    if (!videoFile) {
        alert('Please select a video file');
        return;
    }

    // Check file type
    const isWebM = videoFile.type === 'video/webm';
    const isMP4 = videoFile.type === 'video/mp4';
    
    if (!isWebM && !isMP4) {
        alert('Please select a valid video file (MP4 or WebM)');
        return;
    }

    // Show loading
    const submitBtn = uploadForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Uploading...';
    submitBtn.disabled = true;

    try {
        // Show conversion progress if MP4
        let fileToUpload = videoFile;
        if (isMP4 && isFFmpegLoaded) {
            submitBtn.textContent = 'Converting to WebM...';
            fileToUpload = await convertToWebM(videoFile);
        }

        // Upload video to Supabase Storage
        const videoFileName = `${Date.now()}-${fileToUpload.name}`;
        const { data: videoData, error: videoError } = await supabaseClient.storage
            .from('wallpapers')
            .upload(videoFileName, fileToUpload, {
                cacheControl: '3600',
                upsert: false
            });

        if (videoError) throw videoError;

        // Get public URL for video
        const { data: { publicUrl: videoUrl } } = supabaseClient.storage
            .from('wallpapers')
            .getPublicUrl(videoFileName);
        
        // Log compression info
        const originalSize = (videoFile.size / (1024 * 1024)).toFixed(2);
        const uploadedSize = (fileToUpload.size / (1024 * 1024)).toFixed(2);
        const format = fileToUpload.name.toLowerCase().endsWith('.webm') ? 'WebM (50% smaller)' : 'MP4';
        
        console.log(`Video uploaded: ${fileToUpload.name}`);
        console.log(`Original size: ${originalSize} MB`);
        console.log(`Uploaded size: ${uploadedSize} MB`);
        console.log(`Format: ${format}`);

        // Upload thumbnail if provided
        let thumbnailUrl = null;
        if (thumbnailFile) {
            const thumbnailFileName = `${Date.now()}-${thumbnailFile.name}`;
            const { data: thumbnailData, error: thumbnailError } = await supabaseClient.storage
                .from('thumbnails')
                .upload(thumbnailFileName, thumbnailFile, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (thumbnailError) throw thumbnailError;

            const { data: { publicUrl: thumbUrl } } = supabaseClient.storage
                .from('thumbnails')
                .getPublicUrl(thumbnailFileName);

            thumbnailUrl = thumbUrl;
        }

        // Save wallpaper info to database
        const { data: wallpaperData, error: dbError } = await supabaseClient
            .from('wallpapers')
            .insert([
                {
                    title: title,
                    category: category,
                    video_url: videoUrl,
                    thumbnail_url: thumbnailUrl,
                    user_id: currentUser.id
                }
            ]);

        if (dbError) throw dbError;

        // Success
        alert('Wallpaper uploaded successfully!');
        uploadForm.reset();
        uploadModal.classList.remove('active');
        loadWallpapers();

    } catch (error) {
        console.error('Error uploading:', error);
        alert('Error uploading wallpaper. Please try again.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Handle Login
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        alert('Login failed: ' + error.message);
        return;
    }

    currentUser = data.user;
    updateUIForLoggedInUser();
    loginModal.classList.remove('active');
    loginForm.reset();
}

// Handle Signup
async function handleSignup() {
    const email = prompt('Enter your email:');
    if (!email) return;

    const password = prompt('Enter your password:');
    if (!password) return;

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        alert('Signup failed: ' + error.message);
        return;
    }

    alert('Signup successful! Please check your email to verify your account.');
}

// Handle Logout
async function handleLogout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert('Logout failed: ' + error.message);
        return;
    }

    currentUser = null;
    updateUIForLoggedOutUser();
}

// Update UI for logged in user
function updateUIForLoggedInUser() {
    loginBtn.textContent = 'Logout';
    loginBtn.classList.remove('btn-secondary');
    loginBtn.classList.add('btn-primary');
}

// Update UI for logged out user
function updateUIForLoggedOutUser() {
    loginBtn.textContent = 'Login';
    loginBtn.classList.remove('btn-primary');
    loginBtn.classList.add('btn-secondary');
}

// Handle Download
function handleDownload() {
    if (!currentVideoUrl) return;

    const link = document.createElement('a');
    link.href = currentVideoUrl;
    link.download = 'wallpaper.mp4';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Handle Share
function handleShare() {
    if (!currentVideoUrl) return;

    const shareData = {
        title: videoTitle.textContent,
        text: `Check out this live wallpaper: ${videoTitle.textContent}`,
        url: currentVideoUrl
    };

    // Try to use Web Share API (mobile)
    if (navigator.share) {
        navigator.share(shareData)
            .then(() => console.log('Shared successfully'))
            .catch(err => console.log('Share failed:', err));
    } else {
        // Fallback: copy to clipboard
        copyToClipboard(currentVideoUrl);
    }
}

// Copy to clipboard helper
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => {
                alert('Link copied to clipboard!');
            })
            .catch(() => {
                fallbackCopyToClipboard(text);
            });
    } else {
        fallbackCopyToClipboard(text);
    }
}

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        alert('Link copied to clipboard!');
    } catch (err) {
        alert('Failed to copy link. Please copy manually: ' + text);
    }
    
    document.body.removeChild(textArea);
}

// Initialize FFmpeg for WebM conversion
async function initFFmpeg() {
    try {
        if (typeof FFmpeg !== 'undefined') {
            const { createFFmpeg, fetchFile } = FFmpeg;
            ffmpeg = createFFmpeg({ 
                log: true,
                progress: ({ ratio }) => {
                    const percent = Math.round(ratio * 100);
                    console.log(`Converting: ${percent}%`);
                }
            });
            
            console.log('FFmpeg loaded, ready to convert MP4 to WebM');
            isFFmpegLoaded = true;
        } else {
            console.warn('FFmpeg not loaded, WebM conversion will use server-side only');
        }
    } catch (error) {
        console.error('Error loading FFmpeg:', error);
    }
}

// Convert MP4 to WebM using FFmpeg WASM
async function convertToWebM(file) {
    if (!isFFmpegLoaded || !ffmpeg) {
        console.log('FFmpeg not available, using original file');
        return file;
    }

    try {
        console.log('Converting MP4 to WebM...');
        const { createFFmpeg, fetchFile } = FFmpeg;
        
        // Load FFmpeg if not loaded
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }

        // Write input file
        ffmpeg.FS('writeFile', file.name, await fetchFile(file));

        // Convert to WebM with VP9 (best compression)
        await ffmpeg.run(
            '-i', file.name,
            '-c:v', 'libvpx-vp9',
            '-crf', '30',
            '-b:v', '2M',
            '-maxrate', '2M',
            '-bufsize', '4M',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'libopus',
            '-b:a', '128k',
            '-ac', '2',
            '-ar', '44100',
            'output.webm'
        );

        // Read output file
        const data = ffmpeg.FS('readFile', 'output.webm');
        
        // Create new file
        const webmFile = new File([data.buffer], file.name.replace(/\.[^/.]+$/, '.webm'), {
            type: 'video/webm'
        });

        // Cleanup
        ffmpeg.FS('unlink', file.name);
        ffmpeg.FS('unlink', 'output.webm');

        const originalSize = (file.size / (1024 * 1024)).toFixed(2);
        const webmSize = (webmFile.size / (1024 * 1024)).toFixed(2);
        const saved = Math.round((1 - webmFile.size / file.size) * 100);
        
        console.log(`✓ Conversion complete!`);
        console.log(`  Original: ${originalSize} MB (MP4)`);
        console.log(`  WebM: ${webmSize} MB`);
        console.log(`  Saved: ${saved}%`);

        return webmFile;
    } catch (error) {
        console.error('Error converting to WebM:', error);
        alert('WebM conversion failed, uploading original MP4');
        return file;
    }
}

// Handle Like
async function handleLike() {
    if (!currentUser) {
        alert('Please login to like wallpapers');
        return;
    }

    // Implement like functionality
    alert('Like feature coming soon!');
}

// Format Date
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
}

// Supabase Setup Instructions
console.log(`
╔════════════════════════════════════════════════════════════╗
║  Supabase Setup Required                                    ║
╠════════════════════════════════════════════════════════════╣
║  1. Go to https://supabase.com and create a new project    ║
║  2. Get your project URL and anon key from Settings > API  ║
║  3. Replace the values in app.js at the top                ║
║  4. Create the following tables in Supabase SQL Editor:     ║
║                                                             ║
║  CREATE TABLE wallpapers (                                  ║
║    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,          ║
║    title TEXT NOT NULL,                                     ║
║    category TEXT NOT NULL,                                  ║
║    video_url TEXT NOT NULL,                                 ║
║    thumbnail_url TEXT,                                      ║
║    user_id UUID REFERENCES auth.users(id),                  ║
║    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),       ║
║    likes INTEGER DEFAULT 0                                 ║
║  );                                                         ║
║                                                             ║
║  5. Create Storage buckets:                                 ║
║     - wallpapers (for MP4 videos)                           ║
║     - thumbnails (for thumbnail images)                     ║
║                                                             ║
║  6. Set Storage policies to allow public read access        ║
╚════════════════════════════════════════════════════════════╝
`);