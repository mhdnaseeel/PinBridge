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
if (window.location.hostname === 'localhost' || window.location.hostname.includes('firebaseapp.com') || window.location.hostname.includes('web.app') || window.location.hostname === 'pin-bridge.vercel.app') {
    chrome.storage.local.get(['pairedDeviceId', 'secret'], (data) => {
        if (data.pairedDeviceId && data.secret) {
            console.log('[PinBridge] Synchronizing session with dashboard...');
            // Inject into page localStorage
            localStorage.setItem('pairedDeviceId', data.pairedDeviceId);
            localStorage.setItem('secret', data.secret);
            // Dispatch storage event manually 
            window.dispatchEvent(new Event('storage'));
        } else {
            // Extension is unpaired - PROTECTIVE CLEANUP
            // If the extension is unpaired, we MUST ensure the web dashboard is also cleared
            if (localStorage.getItem('pairedDeviceId')) {
                console.log('[PinBridge] Extension is unpaired but dashboard has stale data. Cleaning up...');
                localStorage.removeItem('pairedDeviceId');
                localStorage.removeItem('secret');
                localStorage.removeItem('latestOtp');
                window.dispatchEvent(new Event('storage'));
                window.postMessage({ source: 'pinbridge-extension', action: 'UNPAIR' }, '*');
            }
        }
    });
}

// Listen for unpairing in extension and sync to dashboard
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pairedDeviceId && !changes.pairedDeviceId.newValue) {
        if (window.location.hostname === 'localhost' || window.location.hostname.includes('firebaseapp.com') || window.location.hostname.includes('web.app') || window.location.hostname === 'pin-bridge.vercel.app') {
            console.log('[PinBridge] Extension unpaired. Clearing dashboard...');
            localStorage.removeItem('pairedDeviceId');
            localStorage.removeItem('secret');
            localStorage.removeItem('latestOtp');
            // Dispatch both storage event and postMessage for maximum reliability
            window.dispatchEvent(new Event('storage'));
            window.postMessage({ source: 'pinbridge-extension', action: 'UNPAIR' }, '*');
        }
    }
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'newOtp') {
        autofill(msg.otp);
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
