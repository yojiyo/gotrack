const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Actions
    takeScreenshot: (userEmail) => ipcRenderer.invoke('capture-desktop', userEmail),
    startMonitoring: (userEmail, userId) => ipcRenderer.send('start-monitoring', userEmail, userId),
    stopMonitoring: () => ipcRenderer.send('stop-monitoring'),
    
    // Listeners with Cleanup (Prevents memory leaks/duplicate events)
    onScreenshot: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('screenshot-captured', subscription);
        // Returns a function to "unsubscribe" if needed
        return () => ipcRenderer.removeListener('screenshot-captured', subscription);
    },
    onFinished: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('monitoring-finished', subscription);
        return () => ipcRenderer.removeListener('monitoring-finished', subscription);
    }
});