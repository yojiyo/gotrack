const { app, BrowserWindow, desktopCapturer, ipcMain, dialog } = require('electron');
const path = require('path');
const { net } = require('electron');

let mainWindow;
let monitoringInterval;
let currentUserEmail = ""; // <-- Added this to fix your ReferenceError
let currentUserId = "";
let sessionCleared = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    }); 

    // --- Close Warning & Auto Time-Out Logic ---
    mainWindow.on('close', async (e) => {
        if (monitoringInterval) {
            e.preventDefault();

            const choice = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ['Leave & Time Out', 'Stay'],
                defaultId: 1,
                title: 'Confirm Exit',
                message: 'Closing the app will automatically Time Out your session!',
                detail: 'You are currently Timed In. If you leave now, we will record a "Time Out" and stop all monitoring.'
            });

            if (choice.response === 0) {
                clearInterval(monitoringInterval);
                monitoringInterval = null;

                // Trigger the final timeout to the backend
                if (currentUserEmail) {
                    await triggerTimeOutOnExit(currentUserEmail);
                }

                mainWindow.destroy();
            }
        }
    });
    
    mainWindow.webContents.session.clearStorageData({ storages: ['localstorage'] })
    .then(() => {
        mainWindow.loadURL('http://127.0.0.1:8000');
        // mainWindow.loadURL('https://gotrack-synthesis.onrender.com');
    });
}

// Helper to notify FastAPI server on exit
async function triggerTimeOutOnExit(email) {
    try {
        // 1. Fetch today's logs to determine correct label
        const logsRes = await fetch(`https://gotrack-synthesis.onrender.com/get-logs/${email}`);
        const logs = await logsRes.json();

        const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        const todayLogs = logs.filter(l => l.date === todayStr);

        // 2. Determine correct label based on count
        let label = 'Morning Out'; // default
        if (todayLogs.length === 1) label = 'Morning Out';
        else if (todayLogs.length === 3) label = 'Afternoon Out';

        // 3. Post with correct label
        const response = await fetch(`https://gotrack-synthesis.onrender.com/log-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: email, log_type: label })
        });

        if (response.ok) {
            console.log(`[SYSTEM] Exit Time Out recorded as "${label}" for ${email}`);
        } else {
            console.error(`[SYSTEM] Server responded with status: ${response.status}`);
        }
    } catch (err) {
        console.error("[SYSTEM] Failed to record exit timeout.", err.message);
    }
}

async function sendToBackend(imageBuffer, employeeId) {
    const formData = new FormData();
    formData.append('file', new Blob([imageBuffer]), 'screenshot.png');

    fetch(`/upload-screenshot/${employeeId}`, {
        method: 'POST',
        body: formData
    })
        .then(res => {
            console.log("Backend HTTP status:", res.status);
            return res.json();
        })
        .then(data => {
            console.log("Full backend response:", JSON.stringify(data)); // <-- shows everything
            console.log("Uploaded to Cloudinary:", data.url);
        })
        .catch(err => console.error("Cloudinary upload failed:", err));
}

function broadcastToAllWindows(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
        if (!win.isDestroyed()) win.webContents.send(channel, data);
    });
}

// --- IPC Handlers ---

ipcMain.on('start-monitoring', (event, userEmail, userId) => {
    currentUserEmail = userEmail;
    currentUserId = userId;
    console.log("[DEBUG] userId received:", userId);
    if (monitoringInterval) clearInterval(monitoringInterval);

    console.log(`[SYSTEM] Monitoring started for: ${userEmail}`);

    monitoringInterval = setInterval(async () => {
        for (let i = 0; i < 3; i++) {
            const randomDelay = Math.floor(Math.random() * 590000);

            setTimeout(async () => {
                try {
                    const sources = await desktopCapturer.getSources({
                        types: ['screen'],
                        thumbnailSize: { width: 1920, height: 1080 }
                    });

                    if (sources.length === 0) return;

                    // Stitch all monitor images horizontally using nativeImage
                    const { nativeImage } = require('electron');

                    // Get all monitor images as buffers
                    const monitorBuffers = sources.map(s => s.thumbnail.toPNG());
                    const monitorSizes = sources.map(s => s.thumbnail.getSize());

                    // Calculate total stitched dimensions
                    const totalWidth = monitorSizes.reduce((sum, s) => sum + s.width, 0);
                    const maxHeight = Math.max(...monitorSizes.map(s => s.height));

                    // Use sharp if available, otherwise fall back to canvas
                    let stitchedBuffer;
                    try {
                        const { createCanvas, loadImage } = require('canvas');
                        const canvas = createCanvas(totalWidth, maxHeight);
                        const ctx = canvas.getContext('2d');

                        let xOffset = 0;
                        for (let m = 0; m < monitorBuffers.length; m++) {
                            const img = await loadImage(monitorBuffers[m]);
                            ctx.drawImage(img, xOffset, 0);
                            xOffset += monitorSizes[m].width;
                        }

                        stitchedBuffer = canvas.toBuffer('image/png');
                    } catch (canvasErr) {
                        // Fallback: if canvas not available, just use first monitor
                        console.warn("[STITCH] canvas module not found, using first monitor only. Run: npm install canvas");
                        stitchedBuffer = monitorBuffers[0];
                    }

                    // Upload stitched image to backend
                    sendToBackend(stitchedBuffer, currentUserId);

                    console.log(`[${new Date().toLocaleTimeString()}] Capture ${i + 1}/3 - ${sources.length} monitor(s) stitched & uploaded.`);

                    // Broadcast all monitor previews to frontend
                    const allScreens = sources.map(s => s.thumbnail.toDataURL());
                    broadcastToAllWindows('screenshot-captured', allScreens);

                } catch (err) {
                    console.error("[SYSTEM] Capture failed:", err);
                }
            }, randomDelay);
        }

    }, 600000); // Every 10 minutes
});

ipcMain.on('stop-monitoring', () => {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    console.log("[DEV] Monitoring Stopped.");
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});