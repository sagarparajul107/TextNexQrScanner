class QRScanner {
    constructor() {
        // Initialize storage
        try {
            this.history = JSON.parse(localStorage.getItem('qrHistory')) || [];
            this.savedQRCodes = JSON.parse(localStorage.getItem('savedQRCodes')) || [];
        } catch (error) {
            console.error('Storage initialization error:', error);
            this.history = [];
            this.savedQRCodes = [];
            // Clear potentially corrupted data
            localStorage.clear();
        }

        // Initialize scanner settings
        this.scanner = new Html5Qrcode("reader");
        this.isScanning = false;
        this.currentZoom = 1.0;
        this.maxZoom = 5.0;
        this.minZoom = 1.0;
        this.zoomStep = 0.5;
        this.lastScanned = null;

        // Remove permission checks and directly initialize
        this.setupComponents();
    }

    setupComponents() {
        this.setupEventListeners();
        this.renderHistory();
        this.setupFileInput();
        this.setupModal();
        this.setupNavigation();
        this.setupCreateQR();
        this.loadSavedQRCodes();
        this.setupResizeHandler();
    }

    async initializeScanner() {
        const permissionModal = document.getElementById('camera-permission-modal');
        const enableCameraBtn = document.getElementById('enable-camera');
        const cancelCameraBtn = document.getElementById('cancel-camera');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
            permissionModal.style.display = 'none';
            
            this.scanner = new Html5QrcodeScanner("reader", {
                qrbox: { width: 250, height: 250 },
                fps: 10,
            });
            
            this.scanner.render((decodedText, decodedResult) => {
                this.onScanSuccess(decodedText);
            }, (error) => {
                // Handle scan errors silently
            });
        } catch (error) {
            permissionModal.style.display = 'block';
            console.error("Camera permission error:", error);
            
            // Setup modal button handlers
            enableCameraBtn.onclick = async () => {
                try {
                    await this.initializeScanner();
                } catch (error) {
                    alert("Failed to access camera. Please check your browser settings.");
                }
            };
            
            cancelCameraBtn.onclick = () => {
                permissionModal.style.display = 'none';
            };
        }
    }

    setupScannerUI() {
        const readerElement = document.getElementById('reader');
        
        // Add scanning overlay
        if (!document.querySelector('.scanning-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'scanning-overlay';
            overlay.innerHTML = '<div class="scan-region"></div>';
            readerElement.appendChild(overlay);
        }

        // Add zoom controls
        if (!document.querySelector('.zoom-controls')) {
            const zoomControls = document.createElement('div');
            zoomControls.className = 'zoom-controls';
            zoomControls.innerHTML = `
                <button class="zoom-btn" id="zoom-out">
                    <i class="fas fa-search-minus"></i>
                </button>
                <span class="zoom-level">1.0x</span>
                <button class="zoom-btn" id="zoom-in">
                    <i class="fas fa-search-plus"></i>
                </button>
            `;
            readerElement.appendChild(zoomControls);
            this.setupZoomControls();
        }
    }

    showScannerError(message) {
        const readerElement = document.getElementById('reader');
        readerElement.innerHTML = `
            <div class="scanner-error">
                <i class="fas fa-exclamation-circle"></i>
                <p>Scanner Error: ${message}</p>
                <button onclick="qrScanner.retryScanner()">
                    <i class="fas fa-redo"></i> Retry Scanner
                </button>
            </div>
        `;
    }

    async retryScanner() {
        const readerElement = document.getElementById('reader');
        readerElement.innerHTML = ''; // Clear error message
        await this.initializeScanner();
    }

    async stopScanner() {
        if (this.isScanning) {
            try {
                await this.scanner.stop();
                this.isScanning = false;
                
                // Clear the reader element
                const readerElement = document.getElementById('reader');
                readerElement.innerHTML = '';
            } catch (error) {
                console.error('Failed to stop scanner:', error);
            }
        }
    }

    onScanSuccess(decodedText) {
        if (!decodedText || typeof decodedText !== 'string') {
            console.error('Invalid QR code data');
            return;
        }

        // Prevent duplicate scans within 1 second
        if (this.lastScanned && this.lastScanned.text === decodedText && 
            (Date.now() - this.lastScanned.time) < 1000) {
            return;
        }

        // Update last scanned
        this.lastScanned = {
            text: decodedText,
            time: Date.now()
        };

        // Immediately show QR detail modal
        this.showQRDetail({
            text: decodedText,
            timestamp: new Date().toLocaleString(),
            id: Date.now()
        });

        // Add to history in background
        this.addToHistory(decodedText);

        // Pause scanner temporarily
        this.stopScanner();
    }

    onScanError(error) {
        console.warn(error);
    }

    saveToStorage(key, data) {
        try {
            const serializedData = JSON.stringify(data);
            localStorage.setItem(key, serializedData);
            return true;
        } catch (error) {
            console.error(`Error saving to ${key}:`, error);
            return false;
        }
    }

    addToHistory(text) {
        if (!text) return false;
        
        try {
            // Create new scan item with more metadata
            const scanItem = {
                text: text.trim(),
                timestamp: new Date().toLocaleString(),
                id: Date.now(),
                type: 'qr-scan'
            };

            // Prevent exact duplicates in recent history
            const isDuplicate = this.history.some(item => 
                item.text === scanItem.text && 
                Date.now() - item.id < 5000
            );

            if (isDuplicate) return true; // Consider it saved if it's a recent duplicate

            // Add to beginning of array
            this.history.unshift(scanItem);

            // Keep only last 50 items
            if (this.history.length > 50) {
                this.history = this.history.slice(0, 50);
            }

            // Save to storage
            const saved = this.saveToStorage('qrHistory', this.history);
            
            if (saved) {
                this.renderHistory();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error saving to history:', error);
            return false;
        }
    }

    renderHistory() {
        try {
            const historyList = document.getElementById('history-list');
            if (!historyList) return;

            historyList.innerHTML = this.history
                .map((item, index) => `
                    <div class="history-item" data-id="${item.id}" onclick="qrScanner.showQRDetail(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        <div>
                            <strong><i class="fas fa-link"></i> ${item.text}</strong>
                            <br>
                            <small><i class="far fa-clock"></i> ${item.timestamp}</small>
                        </div>
                        <button onclick="event.stopPropagation(); qrScanner.deleteHistoryItem(${index})" class="delete-btn">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `)
                .join('');
        } catch (error) {
            console.error('Error rendering history:', error);
        }
    }

    deleteHistoryItem(index) {
        this.history.splice(index, 1);
        localStorage.setItem('qrHistory', JSON.stringify(this.history));
        this.renderHistory();
    }

    clearHistory() {
        this.history = [];
        localStorage.removeItem('qrHistory');
        this.renderHistory();
    }

    setupEventListeners() {
        document.getElementById('clear-history')
            .addEventListener('click', () => this.clearHistory());
    }

    setupFileInput() {
        const fileInput = document.getElementById('qr-input-file');
        const uploadArea = document.querySelector('.upload-area');

        // Add drag and drop support
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.processQRImage(file);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.processQRImage(e.target.files[0]);
            }
        });
    }

    async processQRImage(imageFile) {
        const resultElement = document.createElement('div');
        resultElement.className = 'scan-result';
        const uploadContainer = document.querySelector('.upload-container');
        
        try {
            // Show loading state
            resultElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing QR Code...';
            uploadContainer.appendChild(resultElement);

            // Create image URL
            const imageUrl = URL.createObjectURL(imageFile);
            
            // Create a new HTML5 QR code instance
            const html5QrcodeScanner = new Html5Qrcode("reader");
            
            // Scan the image
            const result = await html5QrcodeScanner.scanFile(imageFile, true);
            
            if (result) {
                // Show success and save result
                resultElement.className = 'scan-result success';
                resultElement.innerHTML = `
                    <i class="fas fa-check-circle"></i>
                    <div class="scan-text">
                        <strong>QR Code Detected:</strong>
                        <span>${result}</span>
                    </div>
                `;
                
                // Add to history
                this.addToHistory(result);
            }
            
            // Cleanup
            URL.revokeObjectURL(imageUrl);
            setTimeout(() => resultElement.remove(), 3000);
            
        } catch (error) {
            console.error('QR Code processing error:', error);
            resultElement.className = 'scan-result error';
            resultElement.innerHTML = `
                <i class="fas fa-times-circle"></i>
                <div class="scan-text">Could not detect QR code. Please try another image.</div>
            `;
            setTimeout(() => resultElement.remove(), 3000);
        }
    }

    setupModal() {
        const modal = document.getElementById('qr-detail-modal');
        const closeBtn = document.querySelector('.close-modal');
        const copyBtn = document.getElementById('copy-text');

        // Close modal when clicking X
        closeBtn.onclick = () => this.closeModal();

        // Close modal when clicking outside
        window.onclick = (event) => {
            if (event.target === modal) {
                this.closeModal();
            }
        };

        // Setup copy button
        copyBtn.addEventListener('click', () => {
            const text = document.getElementById('qr-text').textContent;
            navigator.clipboard.writeText(text)
                .then(() => {
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy Text';
                    }, 2000);
                })
                .catch(err => console.error('Failed to copy:', err));
        });
    }

    showQRDetail(item) {
        const modal = document.getElementById('qr-detail-modal');
        const qrDisplay = document.getElementById('qr-display');
        const qrText = document.getElementById('qr-text');
        const qrTimestamp = document.getElementById('qr-timestamp');
        const closeBtn = document.querySelector('.close-modal');

        // Clear previous QR code
        qrDisplay.innerHTML = '';

        // Check if it's a known type that should have a logo
        const knownTypes = ['facebook', 'instagram', 'youtube', 'whatsapp', 'telegram', 
                       'youtube-music', 'spotify', 'bitcoin', 'ethereum', 'bnb'];
    
        if (knownTypes.includes(item.type)) {
            this.generateQRCodeWithOverlay(item.text, item.type);
        } else {
            // Generate regular QR code
            new QRCode(qrDisplay, {
                text: item.text,
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }

        // Set text and timestamp
        qrText.textContent = item.text;
        qrTimestamp.textContent = item.timestamp;

        // Show modal
        modal.style.display = 'block';

        // Add event listener to restart scanner when modal is closed
        const restartScanner = () => {
            modal.style.display = 'none';
            this.initializeScanner();
            closeBtn.removeEventListener('click', restartScanner);
        };

        closeBtn.addEventListener('click', restartScanner);

        // Also restart scanner when clicking outside modal
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                restartScanner();
            }
        }, { once: true });

        // Auto-detect and handle URLs
        if (this.isValidURL(item.text)) {
            this.addUrlButton(qrText.parentElement, item.text);
        }
    }

    isValidURL(str) {
        try {
            new URL(str);
            return true;
        } catch {
            return str.startsWith('http://') || str.startsWith('https://');
        }
    }

    addUrlButton(container, url) {
        const openButton = document.createElement('button');
        openButton.className = 'open-url-btn';
        openButton.innerHTML = '<i class="fas fa-external-link-alt"></i> Open URL';
        openButton.addEventListener('click', () => {
            window.open(url, '_blank');
        });
        container.appendChild(openButton);
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                // Remove active class from all sections and nav items
                document.querySelectorAll('.content-section').forEach(section => {
                    section.classList.remove('active');
                });
                navItems.forEach(nav => nav.classList.remove('active'));
                
                // Add active class to clicked nav item
                item.classList.add('active');
                
                // Show corresponding section
                const sectionId = item.getAttribute('data-section');
                document.getElementById(sectionId).classList.add('active');

                // Handle scanner state
                if (sectionId === 'scan-section') {
                    this.initializeScanner();
                } else {
                    this.stopScanner();
                }
            });
        });
    }

    setupCreateQR() {
        const dynamicForm = document.getElementById('dynamic-form');
        const qrPreview = document.getElementById('qr-preview');
        const generateBtn = document.getElementById('generate-qr');
        const previewActions = document.querySelector('.preview-actions');

        // Handle type selection
        document.querySelectorAll('.type-item').forEach(item => {
            item.addEventListener('click', () => {
                // Remove active class from all items
                document.querySelectorAll('.type-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Get form template for selected type
                const type = item.dataset.type;
                dynamicForm.innerHTML = this.getFormTemplate(type);
            });
        });

        // Handle QR generation
        generateBtn.addEventListener('click', async () => {
            const activeType = document.querySelector('.type-item.active')?.dataset.type;
            if (!activeType) return;

            const formData = this.getFormData(activeType);
            if (!formData) return;

            // Generate QR code with overlay
            await this.generateQRCodeWithOverlay(formData, activeType);

            // Show actions
            previewActions.classList.remove('hidden');

            // Setup share buttons
            this.setupShareButtons();
        });

        // Handle download
        document.getElementById('download-qr')?.addEventListener('click', () => {
            const canvas = qrPreview.querySelector('canvas');
            if (!canvas) return;

            const link = document.createElement('a');
            link.download = 'qrcode.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });

        // Handle save
        document.getElementById('save-qr')?.addEventListener('click', () => {
            const activeType = document.querySelector('.type-item.active')?.dataset.type;
            const formData = this.getFormData(activeType);
            if (formData) {
                this.saveQRCode(formData, activeType);
            }
        });
    }

    getFormTemplate(type) {
        const templates = {
            text: `
                <form class="qr-form">
                    <div class="form-group">
                        <label>Enter Text</label>
                        <textarea name="text" rows="4" placeholder="Enter your text here" required></textarea>
                    </div>
                </form>
            `,
            url: `
                <form class="qr-form">
                    <div class="form-group">
                        <label>Enter URL</label>
                        <input type="url" name="url" placeholder="https://example.com" required>
                    </div>
                </form>
            `,
            wifi: `
                <form class="qr-form">
                    <div class="form-group">
                        <label>Network Name (SSID)</label>
                        <input type="text" name="ssid" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" name="password">
                    </div>
                    <div class="form-group">
                        <label>Security</label>
                        <select name="security">
                            <option value="WPA">WPA/WPA2</option>
                            <option value="WEP">WEP</option>
                            <option value="nopass">No Password</option>
                        </select>
                    </div>
                </form>
            `,
            // Add other templates as needed
        };

        return templates[type] || templates.text;
    }

    getFormData(type) {
        const form = document.querySelector('.qr-form');
        if (!form) return null;

        const formData = new FormData(form);
        
        switch(type) {
            case 'wifi':
                return `WIFI:T:${formData.get('security')};S:${formData.get('ssid')};P:${formData.get('password')};;`;
            case 'url':
                let url = formData.get('url');
                if (!url.startsWith('http')) {
                    url = 'https://' + url;
                }
                return url;
            default:
                return formData.get('text');
        }
    }

    setupShareButtons() {
        document.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const canvas = document.querySelector('#qr-preview canvas');
                if (!canvas) return;

                const imageUrl = canvas.toDataURL('image/png');
                const platform = btn.dataset.platform;

                try {
                    switch(platform) {
                        case 'native':
                            if (navigator.share) {
                                const blob = await (await fetch(imageUrl)).blob();
                                const file = new File([blob], 'qrcode.png', { type: 'image/png' });
                                await navigator.share({
                                    files: [file],
                                    title: 'QR Code',
                                    text: 'Check out this QR code!'
                                });
                            }
                            break;
                        // Add other sharing platforms
                    }
                } catch (error) {
                    console.error('Sharing failed:', error);
                }
            });
        });
    }

    saveQRCode(text, type) {
        const qrCode = {
            id: Date.now(),
            text,
            type,
            timestamp: new Date().toLocaleString()
        };

        this.savedQRCodes.unshift(qrCode);
        const saved = this.saveToStorage('savedQRCodes', this.savedQRCodes);

        if (saved) {
            this.loadSavedQRCodes();
            alert('QR Code saved successfully!');
        } else {
            alert('Error saving QR Code. Please try again.');
        }
    }

    loadSavedQRCodes() {
        const container = document.getElementById('saved-qr-codes');
        if (!container) return;

        container.innerHTML = this.savedQRCodes.map(qr => `
            <div class="qr-card">
                <div class="qr-card-preview"></div>
                <div class="qr-card-info">
                    <p>${qr.text}</p>
                    <small>${qr.timestamp}</small>
                    <div class="qr-card-actions">
                        <button onclick="qrScanner.downloadQR(${qr.id})">
                            <i class="fas fa-download"></i>
                        </button>
                        <button onclick="qrScanner.deleteQR(${qr.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Generate QR codes for each card
        this.savedQRCodes.forEach(qr => {
            const cards = document.querySelectorAll('.qr-card-preview');
            cards.forEach(card => {
                if (!card.hasChildNodes()) {
                    new QRCode(card, {
                        text: qr.text,
                        width: 150,
                        height: 150
                    });
                }
            });
        });
    }

    downloadQR(id) {
        const qrCode = this.savedQRCodes.find(qr => qr.id === id);
        if (!qrCode) return;

        // Create temporary canvas for QR code
        const canvas = document.createElement('canvas');
        const qr = new QRCode(canvas, {
            text: qrCode.text,
            width: 300,
            height: 300
        });

        // Convert to image and download
        const link = document.createElement('a');
        link.download = `qr-code-${id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    deleteQR(id) {
        this.savedQRCodes = this.savedQRCodes.filter(qr => qr.id !== id);
        localStorage.setItem('savedQRCodes', JSON.stringify(this.savedQRCodes));
        this.loadSavedQRCodes();
    }

    setupResizeHandler() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (document.getElementById('scan-section').classList.contains('active')) {
                    this.initializeScanner();
                }
            }, 250);
        });

        // Handle orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                if (document.getElementById('scan-section').classList.contains('active')) {
                    this.initializeScanner();
                }
            }, 250);
        });
    }

    async updateZoom() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    zoom: true
                } 
            });
            
            const videoTrack = stream.getVideoTracks()[0];
            if (!videoTrack) return;

            const capabilities = videoTrack.getCapabilities();
            const settings = videoTrack.getSettings();

            if (!capabilities.zoom) {
                console.log('Zoom not supported');
                return;
            }

            await videoTrack.applyConstraints({
                advanced: [{ zoom: this.currentZoom }]
            });

            // Update zoom display
            const zoomLevel = document.querySelector('.zoom-level');
            if (zoomLevel) {
                zoomLevel.textContent = `${this.currentZoom.toFixed(1)}x`;
            }

        } catch (error) {
            console.error('Zoom update failed:', error);
        }
    }

    setupZoomControls() {
        const zoomIn = document.getElementById('zoom-in');
        const zoomOut = document.getElementById('zoom-out');

        if (!zoomIn || !zoomOut) return;

        zoomIn.addEventListener('click', () => {
            if (this.currentZoom < this.maxZoom) {
                this.currentZoom = Math.min(this.currentZoom + this.zoomStep, this.maxZoom);
                this.updateZoom();
            }
        });

        zoomOut.addEventListener('click', () => {
            if (this.currentZoom > this.minZoom) {
                this.currentZoom = Math.max(this.currentZoom - this.zoomStep, this.minZoom);
                this.updateZoom();
            }
        });
    }

    async generateQRCodeWithOverlay(text, type) {
        const qrPreview = document.getElementById('qr-preview');
        qrPreview.innerHTML = '';

        // Create wrapper div
        const wrapper = document.createElement('div');
        wrapper.className = 'qr-with-logo';
        qrPreview.appendChild(wrapper);

        // Generate QR code
        return new Promise((resolve) => {
            const qrCode = new QRCode(wrapper, {
                text: text,
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H,
                quietZone: 10
            });

            // Wait for QR code to be generated
            setTimeout(async () => {
                const canvas = wrapper.querySelector('canvas');
                const ctx = canvas.getContext('2d');

                // Load logo based on type
                const logoUrls = {
                    'facebook': '/assets/logos/facebook.png',
                    'instagram': '/assets/logos/instagram.png',
                    'youtube': '/assets/logos/youtube.png',
                    'whatsapp': '/assets/logos/whatsapp.png',
                    'telegram': '/assets/logos/telegram.png',
                    'youtube-music': '/assets/logos/youtube-music.png',
                    'spotify': '/assets/logos/spotify.png',
                    'bitcoin': '/assets/logos/bitcoin.png',
                    'ethereum': '/assets/logos/ethereum.png',
                    'bnb': '/assets/logos/bnb.png',
                    // Backup URLs if local assets are not available
                    '_facebook': 'https://cdn-icons-png.flaticon.com/512/124/124010.png',
                    '_instagram': 'https://cdn-icons-png.flaticon.com/512/174/174855.png',
                    '_youtube': 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png',
                    '_whatsapp': 'https://cdn-icons-png.flaticon.com/512/733/733585.png',
                    '_telegram': 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png',
                    '_youtube-music': 'https://cdn-icons-png.flaticon.com/512/3669/3669999.png',
                    '_spotify': 'https://cdn-icons-png.flaticon.com/512/174/174872.png',
                    '_bitcoin': 'https://cdn-icons-png.flaticon.com/512/5968/5968260.png',
                    '_ethereum': 'https://cdn-icons-png.flaticon.com/512/7016/7016523.png',
                    '_bnb': 'https://cdn-icons-png.flaticon.com/512/8506/8506858.png'
                };

                if (type && (logoUrls[type] || logoUrls[`_${type}`])) {
                    try {
                        const logo = new Image();
                        logo.crossOrigin = 'anonymous';

                        // Try loading logo
                        await new Promise((resolveImage, rejectImage) => {
                            logo.onload = resolveImage;
                            logo.onerror = () => {
                                // If local asset fails, try backup URL
                                if (logo.src !== logoUrls[`_${type}`]) {
                                    logo.src = logoUrls[`_${type}`];
                                } else {
                                    rejectImage();
                                }
                            };
                            // Try local asset first
                            logo.src = logoUrls[type];
                        });

                        // Calculate logo size and position
                        const size = canvas.width * 0.24; // 24% of QR code size
                        const pos = (canvas.width - size) / 2;

                        // Create white background for logo
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(pos - 2, pos - 2, size + 4, size + 4);

                        // Draw logo
                        ctx.drawImage(logo, pos, pos, size, size);

                        // Add subtle shadow to logo
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 2;

                    } catch (error) {
                        console.error('Error adding logo overlay:', error);
                    }
                }

                resolve(wrapper);
            }, 100);
        });
    }
}

// Initialize the QR Scanner
const qrScanner = new QRScanner();

// Clean up on page unload
window.addEventListener('beforeunload', async () => {
    await qrScanner.stopScanner();
});

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('scan-section').classList.contains('active')) {
        qrScanner.initializeScanner();
    }
});

document.getElementById('request-camera').addEventListener('click', async () => {
    try {
        await qrScanner.initializeScanner();
    } catch (error) {
        alert("Failed to access camera. Please ensure you've granted camera permissions.");
    }
});
