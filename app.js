// ===== Global State =====
let html5QrCode = null;
let scannedCodes = [];
let isScanning = false;

// ===== DOM Elements =====
const elements = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    exportBtn: document.getElementById('exportBtn'),
    emailBtn: document.getElementById('emailBtn'),
    clearBtn: document.getElementById('clearBtn'),
    reader: document.getElementById('reader'),
    readerPlaceholder: document.getElementById('readerPlaceholder'),
    resultsContainer: document.getElementById('resultsContainer'),
    scanCount: document.getElementById('scanCount'),
    cameraStatus: document.getElementById('cameraStatus'),
    emailModal: document.getElementById('emailModal'),
    closeModal: document.getElementById('closeModal'),
    cancelEmail: document.getElementById('cancelEmail'),
    sendEmail: document.getElementById('sendEmail'),
    recipientEmail: document.getElementById('recipientEmail'),
    emailSubject: document.getElementById('emailSubject'),
    emailMessage: document.getElementById('emailMessage'),
    toastContainer: document.getElementById('toastContainer')
};

// ===== Utility Functions =====
function formatDateTime(date) {
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    return new Intl.DateTimeFormat('es-ES', options).format(date);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconSVG = {
        success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    toast.innerHTML = `
        ${iconSVG[type]}
        <span class="toast-message">${message}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateUI() {
    elements.scanCount.textContent = scannedCodes.length;

    const hasScans = scannedCodes.length > 0;
    elements.exportBtn.disabled = !hasScans;
    elements.emailBtn.disabled = !hasScans;
    elements.clearBtn.disabled = !hasScans;

    if (hasScans) {
        renderResults();
    } else {
        elements.resultsContainer.innerHTML = `
            <div class="empty-state">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <p>No hay códigos escaneados aún</p>
                <p class="empty-hint">Los códigos QR aparecerán aquí</p>
            </div>
        `;
    }
}

function renderResults() {
    elements.resultsContainer.innerHTML = scannedCodes
        .map((scan, index) => `
            <div class="result-item">
                <div class="result-header">
                    <span class="result-number">#${index + 1}</span>
                    <span class="result-time">${scan.timestamp}</span>
                </div>
                <div class="result-text">${escapeHtml(scan.text)}</div>
            </div>
        `)
        .join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== QR Scanner Functions =====
async function startScanner() {
    try {
        elements.readerPlaceholder.style.display = 'none';
        elements.reader.style.display = 'block';

        html5QrCode = new Html5Qrcode("reader");

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        // Try rear camera first, fallback to front camera if it fails
        let cameraStarted = false;

        try {
            // Attempt to start with rear camera (environment)
            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                onScanSuccess,
                onScanError
            );
            cameraStarted = true;
            showToast('Cámara trasera activada', 'success');
        } catch (rearCamError) {
            console.log('Rear camera failed, trying front camera...', rearCamError);

            // If rear camera fails, try front camera (user)
            try {
                await html5QrCode.start(
                    { facingMode: "user" },
                    config,
                    onScanSuccess,
                    onScanError
                );
                cameraStarted = true;
                showToast('Cámara frontal activada', 'success');
            } catch (frontCamError) {
                // If both fail, throw the error to be caught by outer catch
                throw frontCamError;
            }
        }

        if (cameraStarted) {
            isScanning = true;
            elements.startBtn.disabled = true;
            elements.stopBtn.disabled = false;
            elements.cameraStatus.classList.add('active');
            elements.cameraStatus.querySelector('.status-text').textContent = 'Activa';
        }
    } catch (err) {
        console.error('Error starting scanner:', err);

        let errorMessage = 'Error al iniciar la cámara.';

        // Provide specific error messages based on error type
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorMessage = '❌ Permiso de cámara denegado. Por favor, permite el acceso a la cámara en la configuración de tu navegador.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            errorMessage = '❌ No se encontró ninguna cámara en tu dispositivo.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            errorMessage = '❌ La cámara está siendo usada por otra aplicación. Cierra otras apps que usen la cámara.';
        } else if (err.name === 'OverconstrainedError') {
            errorMessage = '❌ No se pudo iniciar la cámara con la configuración solicitada.';
        } else if (err.name === 'NotSupportedError') {
            errorMessage = '❌ Tu navegador no soporta acceso a la cámara. Usa Chrome, Firefox o Safari actualizado.';
        } else if (err.name === 'TypeError') {
            errorMessage = '❌ Error de configuración. Intenta recargar la página.';
        }

        showToast(errorMessage, 'error');
        elements.readerPlaceholder.style.display = 'flex';
        elements.reader.style.display = 'none';

        // Show additional help for mobile users
        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            setTimeout(() => {
                showToast('💡 Consejo: Asegúrate de permitir el acceso a la cámara cuando el navegador lo solicite.', 'info');
            }, 2000);
        }
    }
}

async function stopScanner() {
    try {
        if (html5QrCode && isScanning) {
            await html5QrCode.stop();
            html5QrCode.clear();
            html5QrCode = null;
        }

        isScanning = false;
        elements.startBtn.disabled = false;
        elements.stopBtn.disabled = true;
        elements.cameraStatus.classList.remove('active');
        elements.cameraStatus.querySelector('.status-text').textContent = 'Inactiva';
        elements.readerPlaceholder.style.display = 'flex';
        elements.reader.style.display = 'none';

        showToast('Escáner detenido', 'info');
    } catch (err) {
        console.error('Error stopping scanner:', err);
    }
}

function onScanSuccess(decodedText, decodedResult) {
    // Check for duplicates
    const isDuplicate = scannedCodes.some(scan => scan.text === decodedText);

    if (!isDuplicate) {
        const scanData = {
            text: decodedText,
            timestamp: formatDateTime(new Date()),
            rawTimestamp: new Date()
        };

        scannedCodes.push(scanData);
        updateUI();
        showToast('Código QR escaneado correctamente', 'success');

        // Play a subtle beep sound (optional)
        playBeep();
    }
}

function onScanError(errorMessage) {
    // Ignore scan errors (they happen frequently during scanning)
}

function playBeep() {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

// ===== Excel Export Functions =====
function exportToExcel() {
    try {
        // Prepare data for Excel
        const data = [
            ['#', 'Código QR', 'Fecha y Hora'],
            ...scannedCodes.map((scan, index) => [
                index + 1,
                scan.text,
                scan.timestamp
            ])
        ];

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 5 },
            { wch: 50 },
            { wch: 20 }
        ];

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Códigos QR');

        // Generate filename with timestamp
        const filename = `codigos_qr_${new Date().getTime()}.xlsx`;

        // Save file
        XLSX.writeFile(wb, filename);

        showToast('Archivo Excel generado correctamente', 'success');
    } catch (err) {
        console.error('Error exporting to Excel:', err);
        showToast('Error al generar el archivo Excel', 'error');
    }
}

// ===== Email Functions =====
function openEmailModal() {
    elements.emailModal.classList.add('active');
    elements.recipientEmail.focus();
}

function closeEmailModal() {
    elements.emailModal.classList.remove('active');
    elements.recipientEmail.value = '';
    elements.emailMessage.value = '';
}

async function sendEmailWithAttachment() {
    const recipient = elements.recipientEmail.value.trim();
    const subject = elements.emailSubject.value.trim();
    const message = elements.emailMessage.value.trim();

    if (!recipient) {
        showToast('Por favor ingresa un correo destinatario', 'error');
        return;
    }

    if (!validateEmail(recipient)) {
        showToast('Por favor ingresa un correo válido', 'error');
        return;
    }

    try {
        showToast('Generando archivo y enviando correo...', 'info');

        // Generate Excel file as blob
        const data = [
            ['#', 'Código QR', 'Fecha y Hora'],
            ...scannedCodes.map((scan, index) => [
                index + 1,
                scan.text,
                scan.timestamp
            ])
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 5 }, { wch: 50 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Códigos QR');

        // Convert to blob
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // Create FormData
        const formData = new FormData();
        formData.append('file', blob, `codigos_qr_${new Date().getTime()}.xlsx`);
        formData.append('to', recipient);
        formData.append('subject', subject);
        formData.append('message', message || 'Adjunto encontrarás los códigos QR escaneados.');

        // Send to backend (use current host for mobile compatibility)
        const serverUrl = `${window.location.protocol}//${window.location.host}/send-email`;
        const response = await fetch(serverUrl, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Correo enviado correctamente', 'success');
            closeEmailModal();
        } else {
            throw new Error(result.error || 'Error al enviar el correo');
        }
    } catch (err) {
        console.error('Error sending email:', err);
        showToast(`Error: ${err.message}`, 'error');
    }
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// ===== Clear Function =====
function clearAllScans() {
    if (confirm('¿Estás seguro de que deseas eliminar todos los códigos escaneados?')) {
        scannedCodes = [];
        updateUI();
        showToast('Todos los códigos han sido eliminados', 'info');
    }
}

// ===== Event Listeners =====
elements.startBtn.addEventListener('click', startScanner);
elements.stopBtn.addEventListener('click', stopScanner);
elements.exportBtn.addEventListener('click', exportToExcel);
elements.emailBtn.addEventListener('click', openEmailModal);
elements.clearBtn.addEventListener('click', clearAllScans);
elements.closeModal.addEventListener('click', closeEmailModal);
elements.cancelEmail.addEventListener('click', closeEmailModal);
elements.sendEmail.addEventListener('click', sendEmailWithAttachment);

// Close modal on outside click
elements.emailModal.addEventListener('click', (e) => {
    if (e.target === elements.emailModal) {
        closeEmailModal();
    }
});

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.emailModal.classList.contains('active')) {
        closeEmailModal();
    }
});

// ===== Initialize =====
updateUI();
showToast('Aplicación lista. Presiona "Iniciar Escáner" para comenzar.', 'info');
