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

document.addEventListener('DOMContentLoaded', async () => {
    const statusBadge = document.getElementById('statusBadge');
    const otpView = document.getElementById('otpView');
    const unpairedView = document.getElementById('unpairedView');
    const otpValue = document.getElementById('otpValue');
    const otpContent = document.getElementById('otpContent');
    const otpTime = document.getElementById('otpTime');
    const copyBtn = document.getElementById('copyBtn');
    const pairBtn = document.getElementById('pairBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    const manualFetchBtn = document.getElementById('manualFetchBtn');
    const connectionIndicator = document.getElementById('connectionIndicator');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const offlineBanner = document.getElementById('offlineBanner');

    function updateBrowserStatus() {
        if (navigator.onLine) {
            offlineBanner.classList.remove('active');
        } else {
            offlineBanner.classList.add('active');
        }
    }

    window.addEventListener('online', updateBrowserStatus);
    window.addEventListener('offline', updateBrowserStatus);
    updateBrowserStatus();

    // Check status
    chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
        if (response && response.status === 'paired') {
            showPaired();
            updateConnectionStatus(response.isOnline);
        } else {
            showUnpaired();
        }
    });

    // Load latest OTP
    chrome.storage.local.get(['latestOtp'], ({ latestOtp }) => {
        if (latestOtp) {
            updateOtpDisplay(latestOtp);
        }
    });

    function showPaired() {
        statusBadge.textContent = 'Connected';
        statusBadge.className = 'status-badge status-paired';
        otpView.classList.remove('hidden');
        unpairedView.classList.add('hidden');
        connectionIndicator.classList.remove('hidden');
    }

    function showUnpaired() {
        statusBadge.textContent = 'Disconnected';
        statusBadge.className = 'status-badge status-unpaired';
        otpView.classList.add('hidden');
        unpairedView.classList.remove('hidden');
        connectionIndicator.classList.add('hidden');
    }

    function updateConnectionStatus(online) {
        if (online) {
            statusDot.className = 'dot dot-online';
            statusText.textContent = 'Online';
            statusText.style.color = '#10b981';
        } else {
            statusDot.className = 'dot dot-offline';
            statusText.textContent = 'Offline';
            statusText.style.color = '#f59e0b';
        }
    }

    function updateOtpDisplay(otpData) {
        if (!otpData || !otpData.otp) return;
        
        // Use a simpler CSS-only approach for standard updates
        otpContent.textContent = otpData.otp;
        
        // Trigger subtle re-animation on the container
        otpValue.style.animation = 'none';
        void otpValue.offsetWidth;
        otpValue.style.animation = 'fadeIn 0.5s ease-out';
        
        const timeStr = new Date(otpData.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        otpTime.textContent = `Latest OTP received at ${timeStr}`;
    }

    pairBtn.onclick = () => {
        chrome.tabs.create({ url: 'pairing.html' });
    };

    copyBtn.onclick = () => {
        navigator.clipboard.writeText(otpValue.textContent);
        copyBtn.classList.add('copied');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Copied!
        `;
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = originalText;
        }, 2000);
    };

    manualFetchBtn.addEventListener('click', () => {
        if (!navigator.onLine) {
            manualFetchBtn.innerText = 'No Internet';
            manualFetchBtn.style.background = '#ef4444';
            setTimeout(() => {
                manualFetchBtn.innerText = 'Fetch Latest';
                manualFetchBtn.style.background = '#10b981';
            }, 3000);
            return;
        }

        if (statusText.textContent !== 'Online') {
            manualFetchBtn.innerText = 'Phone Offline';
            manualFetchBtn.style.background = '#ef4444';
            setTimeout(() => {
                manualFetchBtn.innerText = 'Fetch Latest';
                manualFetchBtn.style.background = '#10b981';
            }, 3000);
            return;
        }

        manualFetchBtn.disabled = true;
        manualFetchBtn.innerText = 'Fetching...';

        chrome.runtime.sendMessage({ type: 'manualFetch' }, (response) => {
            manualFetchBtn.disabled = false;
            if (response && response.status === 'ok') {
                manualFetchBtn.innerText = 'Success!';
                manualFetchBtn.style.background = '#6366f1';
                // background.js already updates storage, but we can force refresh
                if (response.otp) {
                    chrome.storage.local.get(['latestOtp'], ({ latestOtp }) => {
                        if (latestOtp) updateOtpDisplay(latestOtp);
                    });
                }
                setTimeout(() => {
                    manualFetchBtn.innerText = 'Fetch Latest';
                    manualFetchBtn.style.background = '#10b981';
                }, 2000);
            } else {
                const errorMsg = response?.error || 'Failed';
                if (errorMsg.includes('No OTP') || errorMsg.includes('No data')) {
                    manualFetchBtn.innerText = 'No Data Yet';
                } else if (errorMsg.includes('Not paired')) {
                    manualFetchBtn.innerText = 'Not Paired';
                } else {
                    manualFetchBtn.innerText = 'Fetch Failed';
                }
                manualFetchBtn.style.background = '#ef4444';
                console.warn('[PinBridge] Manual fetch failed:', errorMsg);
                setTimeout(() => {
                    manualFetchBtn.innerText = 'Fetch Latest';
                    manualFetchBtn.style.background = '#10b981';
                }, 3000);
            }
        });
    });

    signOutBtn.onclick = () => {
        if (confirm('Are you sure you want to unpair this device?')) {
            chrome.runtime.sendMessage({ type: 'signOut' });
        }
    };

    // Listen for live updates
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'newOtp') {
            showPaired(); // Ensure we are in paired view
            updateOtpDisplay({ otp: msg.otp, ts: msg.ts });
        } else if (msg.type === 'statusUpdate') {
            updateConnectionStatus(msg.online);
        } else if (msg.type === 'unpaired' || msg.type === 'signOut') {
            showUnpaired();
        } else if (msg.type === 'paired') {
            showPaired();
        }
    });
});
