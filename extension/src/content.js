// PinBridge Content Script - Autofill Logic

// Global error handlers to prevent Chrome Extension error UI
const targetScope = typeof self !== 'undefined' ? self : window;
targetScope.addEventListener('error', (e) => {
    e.preventDefault();
    console.debug('[PinBridge] Suppressed error:', e.error || e.message);
});
targetScope.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    console.debug('[PinBridge] Suppressed unhandled rejection:', e.reason);
});

// Sync credentials with the Web Dashboard (and clear stale ones)
const _isDashboard = window.location.hostname === 'localhost' || window.location.hostname.includes('firebaseapp.com') || window.location.hostname.includes('web.app') || window.location.hostname === 'pin-bridge.vercel.app';
if (_isDashboard) {
    // Security (H-3): Read secret from session storage (not persisted to disk)
    Promise.all([
        new Promise(r => chrome.storage.local.get(['pairedDeviceId'], r)),
        new Promise(r => chrome.storage.session.get(['secret'], r))
    ]).then(([localData, sessionData]) => {
        const data = { ...localData, ...sessionData };
        // Security: Validate formats before writing to browser localStorage (SonarCloud S6145 / CWE-20)
        const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,128}$/;
        const SECRET_REGEX = /^[a-zA-Z0-9+/=]{16,128}$/;
        if (data.pairedDeviceId && data.secret && 
            DEVICE_ID_REGEX.test(data.pairedDeviceId) && SECRET_REGEX.test(data.secret)) {
            console.log('[PinBridge] Synchronizing session with dashboard...');
            // Inject deviceId into page localStorage (secret stays in-memory via postMessage)
            localStorage.setItem('pairedDeviceId', data.pairedDeviceId);
            // V-01: Do NOT write secret to localStorage — pass via postMessage only
            window.postMessage({ 
                source: 'pinbridge-extension', 
                action: 'SYNC', 
                deviceId: data.pairedDeviceId,
                secret: data.secret
            }, window.location.origin);
            // Dispatch storage event for deviceId change
            window.dispatchEvent(new Event('storage'));
        } else if (localStorage.getItem('pairedDeviceId')) {
            // Extension is unpaired - PROTECTIVE CLEANUP
            // If the extension is unpaired, we MUST ensure the web dashboard is also cleared
            console.log('[PinBridge] Extension is unpaired but dashboard has stale data. Cleaning up...');
            localStorage.removeItem('pairedDeviceId');
            localStorage.removeItem('latestOtp');
            // V-01: secret is not in localStorage, no need to remove
            window.dispatchEvent(new Event('storage'));
            window.postMessage({ source: 'pinbridge-extension', action: 'UNPAIR' }, window.location.origin);
        }
    });
}

// Listen for unpairing in extension and sync to dashboard
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pairedDeviceId) {
        if (!_isDashboard) return;

        if (!changes.pairedDeviceId.newValue) {
            // Unpairing
            console.log('[PinBridge] Extension unpaired. Clearing dashboard...');
            localStorage.removeItem('pairedDeviceId');
            localStorage.removeItem('latestOtp');
            // V-01: secret is not in localStorage
            window.dispatchEvent(new Event('storage'));
            window.postMessage({ source: 'pinbridge-extension', action: 'UNPAIR' }, window.location.origin);
        } else {
            // New Pairing or update
            // Security: Validate format of the new device ID before writing to localStorage (SonarCloud S6145 / CWE-20)
            const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,128}$/;
            const newDeviceVal = changes.pairedDeviceId.newValue;
            if (typeof newDeviceVal === 'string' && DEVICE_ID_REGEX.test(newDeviceVal)) {
                // Security (H-3): Read secret from session storage
                chrome.storage.session.get(['secret'], (sessionData) => {
                    console.log('[PinBridge] New extension pairing detected. Syncing...');
                    localStorage.setItem('pairedDeviceId', newDeviceVal);
                    // V-01: Do NOT write secret to localStorage
                    window.dispatchEvent(new Event('storage'));
                    window.postMessage({ 
                        source: 'pinbridge-extension', 
                        action: 'SYNC', 
                        deviceId: newDeviceVal,
                        secret: sessionData.secret
                    }, window.location.origin);
                });
            } else {
                console.warn('[PinBridge] Pairing update rejected: new deviceId format is invalid');
            }
        }
    }
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'newOtp') {
        autofill(msg.otp);
    } else if (msg.type === 'forceUnpair') {
        console.log('[PinBridge] Forced unpair received from extension');
        localStorage.removeItem('pairedDeviceId');
        localStorage.removeItem('latestOtp');
        // V-01: secret is not in localStorage
        window.dispatchEvent(new Event('storage'));
        window.postMessage({ source: 'pinbridge-extension', action: 'UNPAIR' }, window.location.origin);
    }
});

function autofill(otp) {
    // Security (H-2): Validate OTP is a reasonable format before autofilling
    if (!otp || typeof otp !== 'string' || otp.length < 4 || otp.length > 10 || !/^\d+$/.test(otp)) {
        console.warn('[PinBridge] Skipping autofill: OTP format invalid');
        return;
    }

    const selectors = [
        'input[autocomplete="one-time-code"]',
        'input[name*="otp"]',
        'input[name*="code"]',
        'input[name*="pin"]',
        'input[id*="otp"]',
        'input[id*="code"]',
        'input[id*="pin"]',
        'input[type="number"]',
        'input[type="tel"]'
    ];

    const inputs = Array.from(document.querySelectorAll(selectors.join(',')))
        .filter(input => {
            const rect = input.getBoundingClientRect();
            // Security (H-2): Stricter visibility checks — minimum 20x20 size prevents hidden inputs
            return rect.width >= 20 && rect.height >= 20 && 
                   window.getComputedStyle(input).visibility !== 'hidden' &&
                   window.getComputedStyle(input).opacity !== '0' &&
                   window.getComputedStyle(input).display !== 'none' &&
                   !input.disabled && !input.readOnly;
        });

    if (inputs.length === 0) return;

    const target = inputs[0];
    target.value = otp;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.focus();
}

// nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    // Security: Strict origin verification to prevent arbitrary execution (SonarCloud S2819 / CWE-345)
    if (event.origin !== 'http://localhost:3000' && 
        event.origin !== 'http://localhost:5173' && 
        event.origin !== 'https://pinbridge-61dd4.firebaseapp.com' && 
        event.origin !== 'https://pinbridge-61dd4.web.app' && 
        event.origin !== 'https://pin-bridge.vercel.app') {
        return;
    }
    
    const data = event.data;
    if (data?.source === 'pinbridge-web') {
        if (data.action === 'LOGIN_SUCCESS') {
            console.log('[PinBridge] Captured web login success. Sending to extension...');
            chrome.runtime.sendMessage({
                type: 'webLoginSuccess',
                uid: data.uid,
                email: data.email,
                pairedDeviceId: data.pairedDeviceId,
                secret: data.secret
            });
        } else if (data.action === 'PAIRING_SUCCESS') {
            console.log('[PinBridge] Captured web pairing success. Sending to extension...');
            chrome.runtime.sendMessage({
                type: 'webPairingSuccess',
                deviceId: data.deviceId,
                secret: data.secret
            });
        }
    }
});
