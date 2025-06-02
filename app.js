// Elemen DOM
const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const loadingMessage = document.getElementById('loading-message');
const detectedObjectsList = document.getElementById('detected-objects-list');
const newObjectIndicator = document.getElementById('new-object-indicator');
const newObjectLabel = document.getElementById('new-object-label');
const newObjectImage = document.getElementById('new-object-image');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const streamInfo = document.getElementById('stream-info');
const screenshotBtn = document.getElementById('screenshot-btn');
const toggleAnalysisBtn = document.getElementById('toggle-analysis-btn');
const toggleChatBtn = document.getElementById('toggle-chat-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Variabel global
let objectDetectionModel; // Model COCO-SSD
let faceDetectionModel = null; // Model Face Detection (opsional)
let personModel; // Model untuk analisis orang (gender, umur, dll)
let detectedObjects = new Set(); // Menyimpan objek yang sudah terdeteksi
let detectedFaces = new Set(); // Menyimpan wajah yang sudah terdeteksi
let detectedPersons = new Map(); // Menyimpan data orang yang terdeteksi
let objectDescriptions = new Map(); // Menyimpan deskripsi dan informasi objek yang terdeteksi
let lastDetectedClass = ""; // Menyimpan class terakhir yang terdeteksi
let isProcessingFrame = false;
let lastDetectionTime = 0;
let isAnalysisEnabled = true;
let isFaceDetectionEnabled = false; // Nonaktifkan deteksi wajah secara default
const DETECTION_INTERVAL = 5000; // Deteksi setiap 5 detik, sesuai permintaan
const CONFIDENCE_THRESHOLD = 0.5; // Ambang batas keyakinan untuk deteksi
const PERSON_GENDER_CATEGORIES = ['laki-laki', 'perempuan'];

// Variabel untuk batch processing
let newDetectedObjects = []; // Array untuk mengumpulkan objek baru yang terdeteksi
let isProcessingBatch = false; // Flag untuk menunjukkan apakah sedang memproses batch
const BATCH_SIZE_THRESHOLD = 3; // Kirim batch jika terdeteksi lebih dari jumlah ini
const BATCH_TIMEOUT = 5000; // Timeout dalam ms untuk mengirim batch meski belum mencapai threshold
let batchTimeoutId = null; // Untuk menyimpan ID timeout

// Array objek yang didukung untuk deteksi (selain standard COCO-SSD)
const CUSTOM_OBJECTS = [
    'wajah', 'laptop', 'ponsel', 'buku', 'tas', 'jam tangan', 'perhiasan',
    'mainan', 'alat musik', 'alat tulis', 'makanan', 'minuman', 'buah',
    'sayuran', 'kue', 'pakaian', 'sepatu', 'topi', 'kacamata'
];

// Fungsi untuk memastikan elemen DOM tersedia
function ensureDOMElementsExist() {
    const requiredElements = [
        { element: video, name: 'webcam' },
        { element: canvas, name: 'output-canvas' },
        { element: loadingMessage, name: 'loading-message' },
        { element: detectedObjectsList, name: 'detected-objects-list' },
        { element: newObjectIndicator, name: 'new-object-indicator' },
        { element: newObjectLabel, name: 'new-object-label' },
        { element: newObjectImage, name: 'new-object-image' },
        { element: chatMessages, name: 'chat-messages' },
        { element: chatInput, name: 'chat-input' },
        { element: sendChatBtn, name: 'send-chat-btn' },
        { element: streamInfo, name: 'stream-info' }
    ];

    const missingElements = requiredElements.filter(item => !item.element);

    if (missingElements.length > 0) {
        const missingNames = missingElements.map(item => item.name).join(', ');
        throw new Error(`Elemen berikut tidak ditemukan: ${missingNames}`);
    }
}

// Fungsi untuk menginisialisasi tab
function initTabs() {
    try {
        if (!tabBtns || tabBtns.length === 0 || !tabContents || tabContents.length === 0) {
            console.warn('Tab buttons atau tab contents tidak ditemukan');
            return;
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                
                // Nonaktifkan semua tab
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(t => t.classList.remove('active'));
                
                // Aktifkan tab yang dipilih
                btn.classList.add('active');
                const tabContent = document.getElementById(tabId);
                if (tabContent) {
                    tabContent.classList.add('active');
                }
            });
        });
    } catch (error) {
        console.error('Error saat inisialisasi tabs:', error);
    }
}

// Fungsi untuk menginisialisasi tombol kontrol
function initControls() {
    try {
        if (screenshotBtn) {
            screenshotBtn.addEventListener('click', captureScreenshot);
        }
        
        if (toggleAnalysisBtn) {
            toggleAnalysisBtn.addEventListener('click', () => {
                isAnalysisEnabled = !isAnalysisEnabled;
                toggleAnalysisBtn.innerHTML = isAnalysisEnabled ? 
                    '<i class="fas fa-robot"></i> AI Analysis ON' : 
                    '<i class="fas fa-robot"></i> AI Analysis OFF';
                
                if (isAnalysisEnabled) {
                    addAIMessage("Analisis AI diaktifkan kembali. Saya akan melanjutkan deteksi objek.");
                } else {
                    addAIMessage("Analisis AI dinonaktifkan sementara. Deteksi objek dihentikan.");
                }
            });
        }
        
        if (toggleChatBtn) {
            toggleChatBtn.addEventListener('click', () => {
                const sidebarElement = document.querySelector('.sidebar');
                if (sidebarElement) {
                    sidebarElement.classList.toggle('hidden');
                    
                    // Jika pada layar kecil, ubah layout
                    if (window.innerWidth <= 1100) {
                        const streamContainer = document.querySelector('.stream-container');
                        if (streamContainer) {
                            streamContainer.style.display = sidebarElement.classList.contains('hidden') ? 'flex' : 'none';
                        }
                    }
                }
            });
        }
        
        if (sendChatBtn && chatInput) {
            sendChatBtn.addEventListener('click', sendChatMessage);
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendChatMessage();
            });
        }
    } catch (error) {
        console.error('Error saat inisialisasi controls:', error);
    }
}

// Fungsi untuk mengambil screenshot
function captureScreenshot() {
    try {
        const screenshotCanvas = document.createElement('canvas');
        screenshotCanvas.width = video.videoWidth;
        screenshotCanvas.height = video.videoHeight;
        const screenshotCtx = screenshotCanvas.getContext('2d');
        
        // Gambar video ke canvas
        screenshotCtx.drawImage(video, 0, 0, screenshotCanvas.width, screenshotCanvas.height);
        
        try {
            // Konversi ke URL data
            const imageUrl = screenshotCanvas.toDataURL('image/png');
            
            // Buat link download
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = `ai-detection-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.click();
            
            addAIMessage("Screenshot berhasil disimpan!");
        } catch (error) {
            console.error('Error saat mengambil screenshot:', error);
            addAIMessage("Maaf, gagal mengambil screenshot.");
        }
    } catch (error) {
        console.error('Error saat mengambil screenshot:', error);
    }
}

// Fungsi untuk mengirim pesan chat
function sendChatMessage() {
    try {
        const message = chatInput.value.trim();
        if (!message) return;
        
        // Tambahkan pesan pengguna ke chat
        addUserMessage(message);
        
        // Reset input
        chatInput.value = '';
        
        // Proses pesan dan berikan respon
        processUserMessage(message);
    } catch (error) {
        console.error('Error saat mengirim pesan chat:', error);
    }
}

// Tambah pesan pengguna ke chat
function addUserMessage(message) {
    try {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const messageHTML = `
            <div class="chat-message user-message">
                <div class="message-content">
                    <strong>Anda:</strong> ${message}
                </div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        chatMessages.insertAdjacentHTML('beforeend', messageHTML);
        scrollChatToBottom();
    } catch (error) {
        console.error('Error saat menambahkan pesan pengguna:', error);
    }
}

// Tambah pesan AI ke chat - VERSI MINIMAL
function addAIMessage(message) {
    try {
        // Jika pesan kosong atau tidak bermakna, jangan tampilkan apa-apa
        if (!message || message.trim() === '') {
            return;
        }
        
        // Hapus semua template dan format
        let filteredMessage = message;
        
        // Hapus semua format HTML
        filteredMessage = filteredMessage.replace(/<\/?[^>]+(>|$)/g, "");
        
        // Hapus semua template awal
        const templatesAwal = [
            /[Ss]elamat datang[^.!?]*[.!?]/g,
            /[Ss]istem berhasil[^.!?]*[.!?]/g,
            /[Ss]aya siap[^.!?]*[.!?]/g,
            /[Aa]rahkan kamera[^.!?]*[.!?]/g,
            /[Bb]elum ada objek[^.!?]*[.!?]/g,
            /[Tt]erjadi kesalahan[^.!?]*[.!?]/g,
            /[Ss]aya melihat[^.!?]*[.!?]/g,
            /[Aa]nda bisa[^.!?]*[.!?]/g,
            /[Ss]aya (akan|bisa|dapat)[^.!?]*[.!?]/g,
            /[Oo]bjek [Tt]erdeteksi[^.!?]*[.!?]/g,
            /[Ss]aya telah[^.!?]*[.!?]/g,
            /[Tt]entukan nomor[^.!?]*[.!?]/g,
            /[Tt]idak ada[^.!?]*[.!?]/g,
            /[Hh]alo[!.][^.!?]*[.!?]*/g,
            /[Ss]ilakan[^.!?]*[.!?]/g,
            /[Ss]enang bertemu[^.!?]*[.!?]/g
        ];
        
        // Hapus semua template
        templatesAwal.forEach(template => {
            filteredMessage = filteredMessage.replace(template, "");
        });
        
        // Hapus "Objek Baru Terdeteksi" atau variasinya
        filteredMessage = filteredMessage.replace(/[Oo]bjek [Bb]aru [Tt]erdeteksi[!.:]?/g, "");
        filteredMessage = filteredMessage.replace(/[Oo]bjek [Tt]erdeteksi[!.:]?/g, "");
        
        // Hapus label terdeteksi (versi yang lebih komprehensif)
        filteredMessage = filteredMessage.replace(/([a-zA-Z0-9_ ]+) [Tt]erdeteksi[!.]/g, "");
        
        // Hapus label kelas COCO yang sering disebutkan oleh model
        const commonLabels = [
            "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", 
            "truck", "boat", "traffic light", "fire hydrant", "stop sign", 
            "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", 
            "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", 
            "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", 
            "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", 
            "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", 
            "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", 
            "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", 
            "couch", "potted plant", "bed", "dining table", "toilet", "tv", 
            "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", 
            "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", 
            "scissors", "teddy bear", "hair drier", "toothbrush"
        ];
        
        // Label dalam bahasa Indonesia
        const indonesianLabels = [
            "orang", "sepeda", "mobil", "motor", "pesawat", "bus", "kereta", 
            "truk", "perahu", "lampu lalu lintas", "hydrant", "rambu berhenti", 
            "meteran parkir", "bangku", "burung", "kucing", "anjing", "kuda", "domba", "sapi", 
            "gajah", "beruang", "zebra", "jerapah", "ransel", "payung", 
            "tas tangan", "dasi", "koper", "frisbee", "ski", "papan seluncur", 
            "bola", "layang-layang", "tongkat baseball", "sarung tangan baseball", "skateboard", 
            "papan selancar", "raket tenis", "botol", "gelas anggur", "cangkir", "garpu", 
            "pisau", "sendok", "mangkuk", "pisang", "apel", "roti", "jeruk", 
            "brokoli", "wortel", "hotdog", "pizza", "donat", "kue", "kursi", 
            "sofa", "tanaman", "tempat tidur", "meja makan", "toilet", "tv", 
            "laptop", "mouse", "remote", "keyboard", "ponsel", "microwave", 
            "oven", "pemanggang roti", "wastafel", "kulkas", "buku", "jam", "vas", 
            "gunting", "boneka beruang", "pengering rambut", "sikat gigi"
        ];
        
        // Hapus pola "Ini adalah [LABEL]" atau variasinya yang muncul di awal kalimat
        [...commonLabels, ...indonesianLabels].forEach(label => {
            // Pattern untuk mendeteksi label di awal kalimat
            const patternStart = new RegExp(`^(Ini adalah|Ini|Saya melihat|Terlihat|Terdapat|Ada|Objek ini adalah|Objek ini|Dalam gambar ini) (sebuah|seekor|sepasang)? ?${label}\\b`, 'i');
            if (patternStart.test(filteredMessage)) {
                filteredMessage = filteredMessage.replace(patternStart, "Ini adalah objek yang");
            }
            
            // Pattern untuk mendeteksi label di tengah kalimat
            const patternMiddle = new RegExp(`\\. (Ini adalah|Ini|Terlihat seperti|Tampaknya|Sepertinya) (sebuah|seekor|sepasang)? ?${label}\\b`, 'i');
            if (patternMiddle.test(filteredMessage)) {
                filteredMessage = filteredMessage.replace(patternMiddle, ". Objek ini");
            }
        });
        
        // Jika pesan kosong setelah filter, jangan tampilkan apa-apa
        filteredMessage = filteredMessage.trim();
        if (!filteredMessage) {
            return;
        }
        
        // Waktu chat
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const messageHTML = `
            <div class="chat-message ai-message">
                <div class="message-content">
                    <strong>AI:</strong> ${filteredMessage}
                </div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        chatMessages.insertAdjacentHTML('beforeend', messageHTML);
        scrollChatToBottom();
    } catch (error) {
        console.error('Error saat menambahkan pesan AI:', error);
    }
}

// Scroll chat ke bawah
function scrollChatToBottom() {
    try {
        // Gunakan setTimeout dengan delay minimal untuk memastikan scroll terjadi setelah pesan dirender
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Alternatif jika metode di atas tidak berfungsi
            if (chatMessages.lastElementChild) {
                chatMessages.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }, 10);
    } catch (error) {
        console.error('Error saat scroll chat:', error);
    }
}

// Proses pesan pengguna - VERSI ULTRA MINIMAL
function processUserMessage(message) {
    try {
        // Konversi ke lowercase untuk pemrosesan lebih mudah
        const lowerMessage = message.toLowerCase().trim();
        
        // Jika pesan kosong, tidak perlu respon
        if (!lowerMessage) {
            return;
        }
        
        // Cek apakah pesan adalah sapaan - RESPON untuk sapaan
        const sapaan = [
            'hai', 'halo', 'hello', 'hi', 'hy', 'hey', 'assalamualaikum', 
            "assalamu'alaikum", 'pagi', 'siang', 'sore', 'malam', 'oii', 'oi'
        ];
        
        if (sapaan.includes(lowerMessage) || 
            sapaan.some(s => lowerMessage.startsWith(s + ' ')) || 
            lowerMessage.startsWith('selamat ')) {
            addAIMessage("Halo! Ada yang bisa saya bantu? Saya dapat memberikan informasi tentang objek yang terdeteksi kamera.");
            return;
        }
        
        // Jika belum ada objek terdeteksi
        if (objectDescriptions.size === 0) {
            addAIMessage("Belum ada objek yang terdeteksi. Coba arahkan kamera ke objek yang ingin dianalisis.");
            return;
        }
        
        // Cek untuk pertanyaan tentang objek terakhir
        const pertanyaanObjekTerakhir = [
            'ini apa?', 'apa ini?', 'itu apa?', 'apa itu?', 
            'apa yang kamu lihat?', 'apa yang terdeteksi?',
            'tolong jelaskan', 'tolong analisis', 'jelaskan', 'analisis'
        ];
        
        if (pertanyaanObjekTerakhir.includes(lowerMessage) || 
            (lowerMessage.includes('objek') && lowerMessage.includes('terakhir')) ||
            (lowerMessage.includes('benda') && lowerMessage.includes('terakhir')) ||
            lowerMessage.includes('gambar') || lowerMessage.includes('foto')) {
            
            if (lastDetectedClass && objectDescriptions.has(lastDetectedClass)) {
                const objDesc = objectDescriptions.get(lastDetectedClass);
                addAIMessage(objDesc.description);
            } else {
                addAIMessage("Belum ada objek yang terdeteksi dengan baik. Coba arahkan kamera ke objek yang jelas.");
            }
            return;
        }
        
        // Cek pertanyaan tentang daftar objek
        if ((lowerMessage.includes('objek') && lowerMessage.includes('terdeteksi')) ||
            (lowerMessage.includes('apa') && lowerMessage.includes('saja') && lowerMessage.includes('terdeteksi')) ||
            (lowerMessage.includes('daftar') && lowerMessage.includes('objek')) ||
            (lowerMessage.includes('objek') && lowerMessage.includes('apa') && lowerMessage.includes('saja')) ||
            lowerMessage.includes('sebutkan') || lowerMessage.includes('deteksi')) {
            
            let objectInfo = "";
            if (objectDescriptions.size > 0) {
                let counter = 1;
                objectDescriptions.forEach((value, key) => {
                    const shortDesc = value.description.split('.')[0];
                    objectInfo += `${counter}. ${shortDesc}\n`;
                    counter++;
                });
                
                addAIMessage("Objek yang terdeteksi:\n" + objectInfo);
            } else {
                addAIMessage("Belum ada objek yang terdeteksi.");
            }
            return;
        }
        
        // Cek pertanyaan tentang objek nomor tertentu
        const objectNumberMatch = lowerMessage.match(/objek (nomor|no|no\.|#)?\s*(\d+)/i);
        if (objectNumberMatch || 
            (lowerMessage.includes('ceritakan') && lowerMessage.includes('tentang') && lowerMessage.includes('objek'))) {
            
            let targetObjectNumber = 0;
            
            if (objectNumberMatch && objectNumberMatch[2]) {
                targetObjectNumber = parseInt(objectNumberMatch[2]);
            } else if (objectDescriptions.size === 1) {
                targetObjectNumber = 1;
            }
            
            if (targetObjectNumber > 0 && targetObjectNumber <= objectDescriptions.size) {
                const objectKeys = Array.from(objectDescriptions.keys());
                const targetObjectKey = objectKeys[targetObjectNumber - 1];
                const objDesc = objectDescriptions.get(targetObjectKey);
                
                addAIMessage(objDesc.description);
            } else {
                addAIMessage(`Tidak ada objek dengan nomor ${targetObjectNumber}. Saat ini terdeteksi ${objectDescriptions.size} objek.`);
            }
            return;
        }
        
        // Cek pertanyaan tentang objek yang terlihat
        if ((lowerMessage.includes('apa') && lowerMessage.includes('itu')) || 
            (lowerMessage.includes('apa') && lowerMessage.includes('ini')) ||
            (lowerMessage.includes('makhluk') || lowerMessage.includes('mahluk')) ||
            (lowerMessage.includes('benda') && lowerMessage.includes('apa'))) {
            
            if (lastDetectedClass && objectDescriptions.has(lastDetectedClass)) {
                const objDesc = objectDescriptions.get(lastDetectedClass);
                addAIMessage(objDesc.description);
            } else {
                addAIMessage("Belum ada objek yang terdeteksi dengan jelas.");
            }
            return;
        }
        
        // Cek pertanyaan tentang orang
        if (lowerMessage.includes('ada') && (lowerMessage.includes('orang') || lowerMessage.includes('manusia'))) {
            const personKeys = Array.from(objectDescriptions.keys()).filter(key => key === 'person');
            if (personKeys.length > 0) {
                const objDesc = objectDescriptions.get(personKeys[0]);
                addAIMessage(objDesc.description);
            } else {
                addAIMessage("Tidak ada orang yang terdeteksi dalam frame saat ini.");
            }
            return;
        }
        
        // Respons default jika tidak ada yang cocok
        addAIMessage("Saya dapat menjelaskan objek yang terdeteksi. Coba tanyakan 'apa itu?' atau 'objek apa saja yang terdeteksi?'");
    } catch (error) {
        console.error('Error saat memproses pesan pengguna:', error);
        addAIMessage("Maaf, terjadi kesalahan saat memproses pesan Anda.");
    }
}

// Fungsi untuk mengakses kamera
async function setupCamera() {
    try {
        loadingMessage.textContent = 'Mengakses kamera...';
        
        // Gunakan resolusi yang lebih rendah untuk mengurangi lag
        const constraints = {
            video: { 
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 15 }  // Turunkan frame rate
            },
            audio: false
        };
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            console.log('Kamera berhasil diakses dengan resolusi rendah untuk performa lebih baik');
            
            // Optimalkan pengaturan video jika tersedia
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && videoTrack.getSettings) {
                const settings = videoTrack.getSettings();
                console.log('Pengaturan kamera:', settings);
            }
            
            // Jika browser mendukung, atur prioritas hint untuk lebih mengutamakan performa
            if (videoTrack && videoTrack.applyConstraints) {
                try {
                    await videoTrack.applyConstraints({
                        advanced: [{ frameRate: 15 }]
                    });
                } catch (e) {
                    console.warn('Gagal menerapkan constraints lanjutan:', e);
                }
            }
        } catch (error) {
            console.warn('Gagal mengakses kamera dengan pengaturan awal, mencoba fallback', error);
            
            // Fallback dengan resolusi sangat rendah
            const fallbackConstraints = {
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 320 },
                    height: { ideal: 240 }
                },
                audio: false
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            video.srcObject = stream;
            console.log('Kamera diakses dengan resolusi sangat rendah (fallback)');
        }
        
        // Tambahkan event listener untuk menangani saat video siap
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // Atur ukuran canvas sama dengan ukuran video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Gunakan kualitas rendering lebih rendah untuk performa
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'medium';
                
                console.log(`Video dimuat dengan resolusi: ${video.videoWidth}x${video.videoHeight}`);
                resolve(video);
            };
            
            // Handler tambahan untuk memastikan video benar-benar siap
            video.onloadeddata = () => {
                console.log('Video data berhasil dimuat');
            };
        });
    } catch (error) {
        console.error('Error mengakses kamera:', error);
        loadingMessage.textContent = 'Tidak dapat mengakses kamera. Pastikan browser Anda mendukung dan mengizinkan akses kamera.';
        addAIMessage("Terjadi kesalahan saat mengakses kamera. Pastikan Anda telah memberikan izin kamera.");
        throw error;
    }
}

// Fungsi untuk memuat model AI
async function loadModels() {
    let loadingInterval;
    let dots = '';
    
    // Fungsi untuk update pesan loading
    const updateLoadingMessage = (modelName) => {
        dots = dots.length >= 3 ? '' : dots + '.';
        loadingMessage.textContent = `Memuat model ${modelName}${dots}`;
    };
    
    // Mulai update pesan loading
    loadingInterval = setInterval(() => updateLoadingMessage('AI'), 300);
    
    try {
        // 1. Muat model COCO-SSD untuk deteksi objek
        loadingMessage.textContent = 'Memuat model deteksi objek...';
        
        // Periksa apakah objek cocoSsd tersedia
        if (typeof cocoSsd === 'undefined') {
            throw new Error('Library COCO-SSD tidak tersedia, pastikan script TensorFlow.js dan COCO-SSD dimuat dengan benar');
        }
        
        // Gunakan model paling ringan untuk performa lebih baik
        try {
            // Konfigurasi TensorFlow untuk performa optimal
            if (typeof tf !== 'undefined') {
                // Matikan debug untuk performa
                tf.env().set('DEBUG', false);
                
                // Konfigurasi memori untuk mencegah memory leak
                tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
                tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
                
                console.log('Mengoptimalkan pengaturan TensorFlow.js...');
                
                // Coba gunakan WebGL untuk akselerasi hardware
                try {
                    await tf.setBackend('webgl');
                    console.log('Menggunakan backend WebGL untuk akselerasi GPU');
                    
                    // Optimalkan pengaturan WebGL lebih lanjut
                    if (tf.getBackend() === 'webgl') {
                        // Batasi penggunaan memori GPU
                        const webGLBackend = tf.backend();
                        if (webGLBackend && webGLBackend.gpgpu) {
                            try {
                                // Optimalkan data mover
                                webGLBackend.setDataMover({
                                    isDataMoverAsync: false,
                                    moveData: (src, dst) => dst.set(src)
                                });
                                
                                // Batasi texture cache untuk mencegah memory leak
                                if (webGLBackend.numBytesInGPU) {
                                    console.log(`Memori GPU awal: ${(webGLBackend.numBytesInGPU() / (1024 * 1024)).toFixed(2)} MB`);
                                }
                                
                                // Aktifkan garbage collection agresif
                                tf.tidy(() => {
                                    console.log('Membersihkan memori TensorFlow');
                                });
                            } catch (e) {
                                console.warn('Gagal mengoptimalkan WebGL backend:', e);
                            }
                        }
                    }
                } catch (backendError) {
                    console.warn('Gagal menggunakan WebGL backend, menggunakan fallback:', backendError);
                    // Fallback ke backend lain jika WebGL gagal
                    try {
                        await tf.setBackend('cpu');
                        console.log('Menggunakan CPU backend sebagai fallback');
                    } catch (e) {
                        console.warn('Gagal mengatur backend apapun:', e);
                    }
                }
            }
            
            // Gunakan model terkecil dan tercepat - lite_mobilenet_v2
            console.log('Memuat model lite_mobilenet_v2 untuk performa optimal...');
            objectDetectionModel = await cocoSsd.load({
                base: 'lite_mobilenet_v2'
            });
            console.log('Model berhasil dimuat: lite_mobilenet_v2');
        } catch (modelError) {
            console.warn('Gagal memuat model lite, mencoba model default:', modelError);
            try {
                objectDetectionModel = await cocoSsd.load();
                console.log('Model default berhasil dimuat');
            } catch (defaultModelError) {
                console.error('Gagal memuat model default:', defaultModelError);
                throw defaultModelError;
            }
        }
        
        // Bersihkan interval update pesan
        clearInterval(loadingInterval);
        loadingMessage.style.display = 'none';
        
        return true;
    } catch (error) {
        clearInterval(loadingInterval);
        console.error('Error memuat model:', error);
        
        loadingMessage.textContent = 'Gagal memuat model AI. Silakan refresh halaman atau periksa konsol untuk detail.';
        
        throw error;
    }
}

// Fungsi untuk mendeteksi objek dalam frame
async function detectObjects() {
    // Periksa jika sudah ada frame yang sedang diproses atau analisis dinonaktifkan
    if (isProcessingFrame || !isAnalysisEnabled) {
        requestAnimationFrame(detectObjects);
        return;
    }
    
    // Periksa apakah model sudah dimuat
    if (!objectDetectionModel) {
        console.warn('Model deteksi objek belum dimuat, coba lagi nanti...');
        setTimeout(() => requestAnimationFrame(detectObjects), 1000);
        return;
    }
    
    // Hanya deteksi setiap interval yang ditentukan (5 detik)
    const currentTime = Date.now();
    if (currentTime - lastDetectionTime < DETECTION_INTERVAL) {
        // Tampilkan video terus tanpa melakukan deteksi
        if (!isProcessingFrame) {
            // Gambar frame video tanpa deteksi untuk memperbarui tampilan
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        
        isProcessingFrame = false;
        requestAnimationFrame(detectObjects);
        return;
    }
    
    // Set flag pemrosesan dan catat waktu
    isProcessingFrame = true;
    lastDetectionTime = currentTime;
    
    try {
        // Pastikan video berjalan
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            isProcessingFrame = false;
            requestAnimationFrame(detectObjects);
            return;
        }
        
        // Tampilkan video pada canvas tanpa mengganggu aliran video
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Deteksi objek menggunakan tensor.js tidy untuk pengelolaan memori
        let predictions = [];
        
        // Bungkus deteksi dalam tf.tidy untuk membersihkan memori tensor setelah selesai
        if (typeof tf !== 'undefined' && tf.tidy) {
            predictions = await tf.tidy(() => {
                return objectDetectionModel.detect(video);
            });
        } else {
            // Fallback jika tf.tidy tidak tersedia
            predictions = await objectDetectionModel.detect(video);
        }
        
        // Filter prediksi objek berdasarkan ambang batas keyakinan
        const validPredictions = predictions.filter(pred => pred.score >= CONFIDENCE_THRESHOLD);
        
        // Proses hasil deteksi
        if (validPredictions.length > 0) {
            processDetections(validPredictions);
            drawDetections(validPredictions);
            updateStreamInfo(validPredictions);
        } else {
            // Sembunyikan info jika tidak ada prediksi
            if (streamInfo.parentElement) {
                streamInfo.parentElement.style.display = 'none';
            }
        }
        
        // Bersihkan memori setelah selesai deteksi
        if (typeof tf !== 'undefined' && tf.disposeVariables) {
            tf.disposeVariables();
        }
    } catch (error) {
        console.error('Error deteksi objek:', error);
    } finally {
        // Pastikan flag pemrosesan disetel kembali ke false
        isProcessingFrame = false;
        
        // Jadwalkan frame berikutnya
        requestAnimationFrame(detectObjects);
    }
}

// Update informasi stream
function updateStreamInfo(predictions) {
    try {
        const objectCount = predictions.length;
        
        if (objectCount > 0) {
            const infoText = `Terdeteksi: ${objectCount} objek`;
            streamInfo.textContent = infoText;
            streamInfo.parentElement.style.display = 'block';
        } else {
            streamInfo.parentElement.style.display = 'none';
        }
    } catch (error) {
        console.error('Error update stream info:', error);
    }
}

// Proses hasil deteksi
function processDetections(predictions) {
    try {
        // Batasi jumlah objek yang diproses sekaligus untuk performa lebih baik
        const maxObjectsToProcess = 2; // Hanya proses maksimal 2 objek sekaligus
        const limitedPredictions = predictions.slice(0, maxObjectsToProcess);
        let newObjectsInThisFrame = []; 
        
        // Proses deteksi objek dengan cara yang lebih ringan
        for (const prediction of limitedPredictions) {
            const { class: className, score } = prediction;
            
            // Jika objek belum pernah terdeteksi sebelumnya
            if (!detectedObjects.has(className)) {
                detectedObjects.add(className);
                
                // Tambahkan ke daftar objek yang terdeteksi
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <span class="object-name">Objek Baru</span>
                    <span class="object-confidence">${Math.round(score * 100)}%</span>
                `;
                listItem.dataset.className = className;
                detectedObjectsList.appendChild(listItem);
                
                // Tambahkan ke objek baru
                newObjectsInThisFrame.push(prediction);
                
                // Hanya tampilkan notifikasi untuk objek pertama
                if (newObjectsInThisFrame.length === 1) {
                    showNewObjectDetection(prediction, true);
                }
            }
        }
        
        // Atur pemrosesan batch dengan lebih efisien
        if (newObjectsInThisFrame.length > 0) {
            // Batasi jumlah objek dalam antrian untuk mengurangi beban
            const maxQueueSize = 3;
            
            if (newDetectedObjects.length >= maxQueueSize) {
                // Jika antrian penuh, hanya simpan objek dengan confidence tertinggi
                newObjectsInThisFrame.sort((a, b) => b.score - a.score);
                newDetectedObjects = [
                    ...newDetectedObjects.slice(0, maxQueueSize-1),
                    newObjectsInThisFrame[0]
                ];
            } else {
                // Tambahkan objek baru ke antrian
                newDetectedObjects = [...newDetectedObjects, ...newObjectsInThisFrame];
            }
            
            // Reset batch timeout untuk mengurangi frekuensi pemrosesan
            if (batchTimeoutId) {
                clearTimeout(batchTimeoutId);
            }
            
            // Tunggu lebih lama sebelum memproses batch (5 detik)
            batchTimeoutId = setTimeout(() => {
                if (newDetectedObjects.length > 0 && !isProcessingBatch) {
                    processBatchObjects();
                }
            }, BATCH_TIMEOUT); // BATCH_TIMEOUT sudah diubah menjadi 5000 (5 detik)
        }
    } catch (error) {
        console.error('Error proses deteksi:', error);
    }
}

// Tampilkan notifikasi objek/wajah baru
function showNewObjectDetection(prediction, isNew = false) {
    try {
        // Gunakan "??" jika objek baru, atau nama kelas jika tidak
        newObjectLabel.textContent = isNew ? "??" : prediction.class;
    
    // Ambil gambar objek dari video
    const { bbox } = prediction;
    const [x, y, width, height] = bbox;
    
    // Buat canvas sementara untuk mengambil gambar objek
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Potong objek dari video
    tempCtx.drawImage(
        video,
        x, y, width, height,
        0, 0, width, height
    );
    
    // Tampilkan gambar objek
    newObjectImage.src = tempCanvas.toDataURL();
    
    // Tampilkan indikator
    newObjectIndicator.classList.remove('hidden');
    
    // Sembunyikan indikator setelah 5 detik
    setTimeout(() => {
        newObjectIndicator.classList.add('hidden');
    }, 5000);
    } catch (error) {
        console.error('Error menampilkan objek baru:', error);
    }
}

// Menggambar kotak di sekitar objek dan wajah terdeteksi
function drawDetections(predictions) {
    try {
        // Batasi jumlah bounding box yang digambar untuk performa
        const maxBoxes = 3; // Hanya gambar maksimal 3 box
        const limitedPredictions = predictions.slice(0, maxBoxes);
        
        for (const prediction of limitedPredictions) {
            const { bbox, class: className, score } = prediction;
            const [x, y, width, height] = bbox;
            
            // Gunakan garis yang lebih ringan (lebih tipis)
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#00BFFF';
            ctx.strokeRect(x, y, width, height);
            
            // Sederhanakan label untuk performa
            // Isi background dengan transparansi yang lebih ringan
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(x, y - 20, 100, 20);
            
            // Text yang lebih sederhana
            ctx.fillStyle = '#FFF';
            ctx.font = '12px Arial';
            ctx.fillText(`${className} ${Math.round(score * 100)}%`, x + 5, y - 5);
        }
    } catch (error) {
        console.error('Error menggambar deteksi:', error);
    }
}

// Fungsi untuk mengirim data ke API Gemini
async function sendToGeminiAPI(prediction) {
    const apiKey = 'AIzaSyB8iAq5YHHdEe51IIn1qC0Wum5TYDKeUKM'; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    try {
        // Ambil gambar objek
        const { bbox, class: detectedClass } = prediction;
        const [x, y, width, height] = bbox;
        
        // Simpan informasi kelas dalam konsol untuk debugging, tetapi jangan tampilkan di UI
        console.log(`Memproses objek yang dideteksi sebagai: ${detectedClass}, tetapi label ini tidak akan ditampilkan ke pengguna`);
        
        // Buat canvas sementara untuk mengambil gambar objek
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Pastikan objek cukup besar untuk dianalisis
        if (width < 20 || height < 20) {
            console.warn("Objek terlalu kecil untuk dianalisis dengan baik", width, height);
            newObjectLabel.textContent = "?? (terlalu kecil)";
            return;
        }
        
        // Potong objek dari video dengan sedikit margin tambahan jika memungkinkan
        const margin = 10;
        const safeX = Math.max(0, x - margin);
        const safeY = Math.max(0, y - margin);
        const safeWidth = Math.min(video.videoWidth - safeX, width + margin * 2);
        const safeHeight = Math.min(video.videoHeight - safeY, height + margin * 2);
        
        // Potong objek dari video
        tempCtx.drawImage(
            video,
            safeX, safeY, safeWidth, safeHeight,
            0, 0, tempCanvas.width, tempCanvas.height
        );
        
        // Konversi ke base64 dan kompres gambar
        const imageBase64 = tempCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        
        // Gunakan prompt yang tidak memberikan petunjuk tentang kelas yang terdeteksi
        const promptText = `Analisis gambar ini dan jelaskan apa yang Anda lihat dengan detail dalam bahasa Indonesia. 
        
Berikan informasi tentang objek, karakteristiknya, dan kegunaan atau fungsinya jika relevan. 

PENTING:
1. JANGAN menyebutkan atau mengacu pada label tertentu yang mungkin digunakan sistem klasifikasi gambar untuk mengidentifikasi objek.
2. Jangan pernah mengatakan "saya tidak melihat [objek X]" karena itu bisa membingungkan pengguna.
3. Jika gambar tidak jelas atau buram, cukup jelaskan apa yang terlihat sejauh mungkin.
4. Jika Anda benar-benar tidak dapat mengidentifikasi objek, cukup jelaskan "Maaf, saya tidak dapat mengidentifikasi objek dengan jelas dalam gambar ini."
5. Berikan penjelasan singkat dan padat dalam 1-3 kalimat saja.`;
        
        // Siapkan data untuk API
        const requestData = {
            contents: [
                {
                    parts: [
                        {
                            text: promptText
                        },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: imageBase64
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 300
            }
        };
        
        // Update UI saat mengirim ke API
        newObjectLabel.textContent = `?? (menganalisis...)`;
        
        // Kirim ke API dengan timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 detik timeout
        
        console.log('Mengirim data ke API Gemini...');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Proses respons API
        console.log('Respons API Gemini:', data);
        
        // Update UI dengan informasi dari Gemini
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            let aiDescription = data.candidates[0].content.parts[0].text;
            
            // Filter respons untuk menghapus referensi ke label yang mungkin masih disebutkan oleh Gemini
            const commonLabels = [
                "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", 
                "truck", "boat", "traffic light", "fire hydrant", "stop sign", 
                "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", 
                "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", 
                "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", 
                "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", 
                "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", 
                "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", 
                "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", 
                "couch", "potted plant", "bed", "dining table", "toilet", "tv", 
                "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", 
                "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", 
                "scissors", "teddy bear", "hair drier", "toothbrush"
            ];
            
            // Tambahkan label dalam bahasa Indonesia
            const indonesianLabels = [
                "orang", "sepeda", "mobil", "motor", "pesawat", "bus", "kereta", 
                "truk", "perahu", "lampu lalu lintas", "hydrant", "rambu berhenti", 
                "meteran parkir", "bangku", "burung", "kucing", "anjing", "kuda", "domba", "sapi", 
                "gajah", "beruang", "zebra", "jerapah", "ransel", "payung", 
                "tas tangan", "dasi", "koper", "frisbee", "ski", "papan seluncur", 
                "bola", "layang-layang", "tongkat baseball", "sarung tangan baseball", "skateboard", 
                "papan selancar", "raket tenis", "botol", "gelas anggur", "cangkir", "garpu", 
                "pisau", "sendok", "mangkuk", "pisang", "apel", "roti", "jeruk", 
                "brokoli", "wortel", "hotdog", "pizza", "donat", "kue", "kursi", 
                "sofa", "tanaman", "tempat tidur", "meja makan", "toilet", "tv", 
                "laptop", "mouse", "remote", "keyboard", "ponsel", "microwave", 
                "oven", "pemanggang roti", "wastafel", "kulkas", "buku", "jam", "vas", 
                "gunting", "boneka beruang", "pengering rambut", "sikat gigi"
            ];
            
            // Ganti "Maaf, saya tidak melihat [label]" dengan kalimat yang lebih umum
            [...commonLabels, ...indonesianLabels].forEach(label => {
                const pattern = new RegExp(`Maaf, (saya|kami) tidak (melihat|dapat melihat|menemukan) ("|')${label}("|')`, 'i');
                if (pattern.test(aiDescription)) {
                    aiDescription = aiDescription.replace(pattern, "Maaf, saya tidak dapat mengidentifikasi objek dengan jelas");
                }
            });
            
            // Hapus label klasifikasi yang langsung disebutkan
            [...commonLabels, ...indonesianLabels].forEach(label => {
                const patternStart = new RegExp(`^(Ini adalah|Ini|Saya melihat|Terlihat|Terdapat|Ada|Objek ini adalah|Objek ini|Dalam gambar ini) (sebuah|seekor|sepasang)? ?${label}\\b`, 'i');
                if (patternStart.test(aiDescription)) {
                    aiDescription = aiDescription.replace(patternStart, "Ini adalah objek yang ");
                }
            });
            
            // Simpan deskripsi objek dalam Map untuk referensi chat nanti
            lastDetectedClass = detectedClass;
            objectDescriptions.set(detectedClass, {
                description: aiDescription,
                time: new Date().toISOString(),
                bbox: bbox,
                score: prediction.score
            });
            
            // Update label objek baru dengan hasil analisis AI, tanpa label deteksi model
            const shortDesc = aiDescription.split('.')[0];
            newObjectLabel.textContent = `${shortDesc.substring(0, 50)}${shortDesc.length > 50 ? '...' : ''}`;
            
            // Tambahkan pesan ke chat tanpa format tambahan
            addAIMessage(aiDescription);
            
            // Update label di daftar objek terdeteksi
            const objectItems = detectedObjectsList.querySelectorAll('li');
            objectItems.forEach(item => {
                if (item.dataset.className === detectedClass) {
                    const objectNameSpan = item.querySelector('.object-name');
                    if (objectNameSpan) {
                        objectNameSpan.textContent = shortDesc.substring(0, 30) + (shortDesc.length > 30 ? '...' : '');
                    }
                }
            });
            
            console.log('Analisis objek berhasil:', shortDesc);
        }
    } catch (error) {
        console.error('Error mengirim ke Gemini API:', error);
        // Jika error, kembalikan ke tanda tanya
        newObjectLabel.textContent = "?? (error)";
        
        // Catat objek sebagai terdeteksi meskipun ada error
        if (!detectedObjects.has(detectedClass)) {
            detectedObjects.add(detectedClass);
            objectDescriptions.set(detectedClass, {
                description: "Objek terdeteksi tetapi tidak dapat dianalisis. Coba arahkan kamera dengan lebih jelas.",
                time: new Date().toISOString(),
                bbox: bbox,
                score: prediction.score
            });
        }
    }
}

// Fungsi untuk memproses batch objek baru
async function processBatchObjects() {
    if (isProcessingBatch || newDetectedObjects.length === 0) {
        return;
    }
    
    isProcessingBatch = true;
    
    try {
        console.log(`Memproses batch dengan ${newDetectedObjects.length} objek baru...`);
        
        // Ambil maksimal 2 objek dari batch untuk diproses
        const objectsToProcess = newDetectedObjects.slice(0, 2);
        // Hapus objek yang akan diproses dari antrian
        newDetectedObjects = newDetectedObjects.slice(2);
        
        // Tampilkan pesan analisis batch
        if (objectsToProcess.length > 0) {
            addAIMessage(`Menganalisis ${objectsToProcess.length} objek terdeteksi...`);
        }
        
        // Proses objek satu per satu untuk memastikan performa yang baik
        for (const obj of objectsToProcess) {
            await sendToGeminiAPI(obj);
            // Tunggu sedikit antara pemrosesan objek untuk mengurangi beban
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Jika masih ada objek dalam antrian, jadwalkan lagi untuk batch berikutnya
        if (newDetectedObjects.length > 0) {
            console.log(`Masih ada ${newDetectedObjects.length} objek dalam antrian, akan diproses pada batch berikutnya`);
            // Tidak perlu memproses batch lanjutan secara langsung, karena akan diproses pada interval deteksi berikutnya
        }
    } catch (error) {
        console.error('Error saat memproses batch objek:', error);
    } finally {
        // Pastikan flag pemrosesan diatur kembali
        isProcessingBatch = false;
    }
}

// Fungsi untuk mengirim batch objek ke API Gemini
async function sendBatchToGeminiAPI(predictions) {
    const apiKey = 'AIzaSyB8iAq5YHHdEe51IIn1qC0Wum5TYDKeUKM'; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    try {
        console.log(`Mengirim batch ${predictions.length} objek ke Gemini API...`);
        
        // Buat canvas sementara untuk full frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Gambar full frame
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Gambar kotak di sekitar objek untuk diidentifikasi
        predictions.forEach((prediction, index) => {
            const { bbox, class: className } = prediction;
            const [x, y, width, height] = bbox;
            
            // Gambar kotak dengan nomor
            tempCtx.strokeStyle = '#ff0000';
            tempCtx.lineWidth = 3;
            tempCtx.strokeRect(x, y, width, height);
            
            // Gambar nomor di pojok kiri atas kotak
            tempCtx.fillStyle = '#ff0000';
            tempCtx.font = 'bold 24px Arial';
            tempCtx.fillText(`${index + 1}`, x + 5, y + 25);
            
            console.log(`Objek ${index + 1}: ${className} di posisi (${x}, ${y})`);
        });
        
        // Konversi ke base64
        const imageBase64 = tempCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        
        // Buat prompt dengan meminta identifikasi semua objek dalam gambar
        const promptText = `Dalam gambar ini terdapat ${predictions.length} objek yang diberi nomor dengan kotak merah. 
Analisis dan jelaskan masing-masing objek tersebut dalam bahasa Indonesia.

Untuk setiap objek (nomor 1-${predictions.length}), berikan:
1. Deskripsi singkat tentang apa objek tersebut
2. Karakteristik atau fitur utamanya
3. Kegunaan atau fungsinya (jika relevan)

Format respons:
Objek 1: [deskripsi singkat]
Objek 2: [deskripsi singkat]
...dan seterusnya.

PENTING:
1. Jawaban harus dalam bahasa Indonesia yang baik
2. Jangan mengacu pada label klasifikasi gambar
3. Jelaskan objek berdasarkan apa yang terlihat dalam gambar`;

        // Siapkan data untuk API
        const requestData = {
            contents: [
                {
                    parts: [
                        {
                            text: promptText
                        },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: imageBase64
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 800
            }
        };
        
        // Update UI
        predictions.forEach((prediction, index) => {
            const { class: className } = prediction;
            const objectItems = detectedObjectsList.querySelectorAll('li');
            objectItems.forEach(item => {
                if (item.dataset.className === className) {
                    const objectNameSpan = item.querySelector('.object-name');
                    if (objectNameSpan) {
                        objectNameSpan.textContent = `Objek ${index + 1} (menganalisis...)`;
                    }
                }
            });
        });
        
        // Kirim ke API dengan timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 detik timeout untuk batch
        
        console.log('Mengirim data batch ke API Gemini...');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Respons batch API Gemini:', data);
        
        // Proses respons API
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            let aiDescription = data.candidates[0].content.parts[0].text;
            
            // Proses deskripsi untuk setiap objek
            const objectRegex = /Objek (\d+):\s*([^\n]+)/g;
            let match;
            const objectDescriptionsFromAPI = new Map();
            
            while ((match = objectRegex.exec(aiDescription)) !== null) {
                const objectNumber = parseInt(match[1]);
                const description = match[2].trim();
                objectDescriptionsFromAPI.set(objectNumber, description);
            }
            
            // Update deskripsi untuk setiap objek
            predictions.forEach((prediction, index) => {
                const objectNumber = index + 1;
                const { class: className, score, bbox } = prediction;
                
                // Dapatkan deskripsi dari API hasil
                let objDescription = objectDescriptionsFromAPI.get(objectNumber);
                
                // Jika tidak ada deskripsi spesifik, gunakan deskripsi umum
                if (!objDescription) {
                    objDescription = `Objek terdeteksi dalam frame`;
                }
                
                // Simpan deskripsi
                lastDetectedClass = className;
                objectDescriptions.set(className, {
                    description: objDescription,
                    time: new Date().toISOString(),
                    bbox: bbox,
                    score: score
                });
                
                // Update UI
                const objectItems = detectedObjectsList.querySelectorAll('li');
                objectItems.forEach(item => {
                    if (item.dataset.className === className) {
                        const objectNameSpan = item.querySelector('.object-name');
                        if (objectNameSpan) {
                            objectNameSpan.textContent = objDescription.substring(0, 30) + 
                                                         (objDescription.length > 30 ? '...' : '');
                        }
                    }
                });
            });
            
            // Tampilkan hasil analisis batch
            addAIMessage(aiDescription);
            
            // Update indikator objek terakhir
            if (predictions.length > 0) {
                const lastPrediction = predictions[predictions.length - 1];
                showNewObjectDetection({
                    ...lastPrediction,
                    class: objectDescriptionsFromAPI.get(predictions.length) || "Objek Teranalisis"
                }, false);
            }
            
            console.log('Analisis batch berhasil');
        }
    } catch (error) {
        console.error('Error mengirim batch ke Gemini API:', error);
        
        // Jika gagal batch, coba satu per satu
        console.log('Mencoba memproses objek satu per satu...');
        
        // Tandai objek sebagai terdeteksi meskipun ada error
        for (const prediction of predictions) {
            const { class: className, bbox, score } = prediction;
            if (!objectDescriptions.has(className)) {
                objectDescriptions.set(className, {
                    description: "Objek terdeteksi tetapi tidak dapat dianalisis. Coba arahkan kamera dengan lebih jelas.",
                    time: new Date().toISOString(),
                    bbox: bbox,
                    score: score
                });
            }
        }
        
        // Coba proses satu per satu
        try {
            const promises = predictions.map(obj => sendToGeminiAPI(obj));
            await Promise.all(promises);
        } catch (innerError) {
            console.error('Gagal memproses objek satu per satu:', innerError);
        }
    }
}

// Inisialisasi aplikasi
async function initApp() {
    try {
        console.log('Memulai inisialisasi aplikasi...');
        
        // Pastikan TensorFlow.js dan COCO-SSD tersedia
        if (typeof tf === 'undefined' || typeof cocoSsd === 'undefined') {
            loadingMessage.textContent = 'Error: Library TensorFlow.js atau COCO-SSD tidak tersedia. Periksa koneksi internet dan refresh halaman.';
            return;
        }
        
        // Cek apakah browser mendukung getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            loadingMessage.textContent = 'Error: Browser Anda tidak mendukung akses kamera. Gunakan browser modern seperti Chrome, Firefox, atau Edge terbaru.';
            return;
        }
        
        // Pastikan semua elemen DOM tersedia
        ensureDOMElementsExist();
        
        // Inisialisasi UI
        initTabs();
        initControls();
        
        // Setup kamera (tanpa pesan selamat datang)
        loadingMessage.textContent = 'Menyiapkan kamera...';
        console.log('Menyiapkan kamera...');
    await setupCamera();
    
        // Muat model deteksi objek
        loadingMessage.textContent = 'Memuat model AI...';
        console.log('Memuat model deteksi objek...');
        await loadModels();
        
        // Aktifkan GPU acceleration jika tersedia
        try {
            if (tf && tf.setBackend) {
                const backend = tf.getBackend();
                console.log(`TensorFlow.js menggunakan backend: ${backend}`);
                
                if (backend !== 'webgl') {
                    try {
                        await tf.setBackend('webgl');
                        console.log('Berhasil mengaktifkan backend WebGL untuk akselerasi GPU');
                    } catch (backendError) {
                        console.warn('Tidak dapat menggunakan WebGL backend:', backendError);
                    }
                }
            }
        } catch (tfError) {
            console.warn('Error saat mengonfigurasi TensorFlow backend:', tfError);
        }
    
    // Mulai deteksi
        loadingMessage.textContent = 'Memulai deteksi objek...';
        console.log('Memulai deteksi objek...');
    detectObjects();
        
        // Sembunyikan loading message
        if (loadingMessage) {
            loadingMessage.style.display = 'none';
        }
        
        // Tampilkan pesan selamat datang di chat
        addAIMessage("Aplikasi deteksi objek siap digunakan. Arahkan kamera ke objek untuk mendeteksi dan menganalisisnya.");
        
        console.log('Aplikasi berhasil diinisialisasi!');
    } catch (error) {
        console.error('Gagal menginisialisasi aplikasi:', error);
        if (loadingMessage) {
            loadingMessage.textContent = `Gagal inisialisasi: ${error.message}. Refresh halaman atau periksa konsol untuk detail.`;
        }
    }
}

// Mulai aplikasi setelah DOM dimuat sepenuhnya
document.addEventListener('DOMContentLoaded', initApp); 