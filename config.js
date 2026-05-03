// config.js
const CONFIG = {
    API_BASE_URL: (() => {
        const host = window.location.hostname;
        if (host === '127.0.0.1' || host === 'localhost') {
            return 'http://127.0.0.1:8000';
        }
        return 'https://gotrack-synthesis.onrender.com';
    })()
};