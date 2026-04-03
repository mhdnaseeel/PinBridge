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
    chrome.storage.local.get(['pairedDeviceId', 'secret'], (data) => {
        if (data.pairedDeviceId && data.secret) {
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
        } else {
            // Extension is unpaired - PROTECTIVE CLEANUP
            // If the extension is unpaired, we MUST ensure the web dashboard is also cleared
            if (localStorage.getItem('pairedDeviceId')) {
                console.log('[PinBridge] Extension is unpaired but dashboard has stale data. Cleaning up...');
                localStorage.removeItem('pairedDeviceId');
                localStorage.removeItem('latestOtp');
                // V-01: secret is not in localStorage, no need to remove
                window.dispatchEvent(new Event('storage'));
                window.postMessage({ source: 'pinbridge-extension', action: 'UNPAIR' }, window.location.origin);
            }
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
            chrome.storage.local.get(['secret'], (data) => {
                console.log('[PinBridge] New extension pairing detected. Syncing...');
                localStorage.setItem('pairedDeviceId', changes.pairedDeviceId.newValue);
                // V-01: Do NOT write secret to localStorage
                window.dispatchEvent(new Event('storage'));
                window.postMessage({ 
                    source: 'pinbridge-extension', 
                    action: 'SYNC', 
                    deviceId: changes.pairedDeviceId.newValue,
                    secret: data.secret
                }, window.location.origin);
            });
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
    const selectors = [
        'input[type="number"]',
        'input[type="tel"]',
        'input[autocomplete="one-time-code"]',
        'input[name*="code"]',
        'input[name*="otp"]',
        'input[name*="pin"]',
        'input[id*="otp"]',
        'input[id*="code"]',
        'input[id*="pin"]'
    ];

    const inputs = Array.from(document.querySelectorAll(selectors.join(',')))
        .filter(input => {
            const rect = input.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && 
                   window.getComputedStyle(input).visibility !== 'hidden' &&
                   !input.disabled && !input.readOnly;
        });

    if (inputs.length === 0) return;

    const target = inputs[0];
    target.value = otp;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.focus();
}

window.addEventListener('message', (event) => {
    // Only accept messages from the same frame
    if (event.source !== window) return;
    
    const data = event.data;
    if (data && data.source === 'pinbridge-web') {
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
