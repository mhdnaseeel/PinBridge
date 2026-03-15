document.addEventListener('DOMContentLoaded', async () => {
    const statusBadge = document.getElementById('statusBadge');
    const otpView = document.getElementById('otpView');
    const unpairedView = document.getElementById('unpairedView');
    const otpValue = document.getElementById('otpValue');
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
            // Fetch initial online status from session storage
            chrome.storage.session.get(['isOnline'], ({isOnline}) => {
                updateConnectionStatus(!!isOnline);
            });
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
        
        // Remove existing animation classes to re-trigger
        otpValue.classList.remove('otp-display');
        void otpValue.offsetWidth; // Force reflow
        otpValue.classList.add('otp-display');
        
        otpValue.textContent = otpData.otp;
        const timeStr = new Date(otpData.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        otpTime.textContent = `Latest OTP received at ${timeStr}`;
    }

    pairBtn.onclick = () => {
        window.open('pairing.html');
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
            const originalText = manualFetchBtn.innerText;
            manualFetchBtn.innerText = 'Failed: No Internet';
            manualFetchBtn.style.background = '#ef4444';
            setTimeout(() => {
                manualFetchBtn.innerText = originalText;
                manualFetchBtn.style.background = '#10b981';
            }, 3000);
            return;
        }

        manualFetchBtn.disabled = true;
        const originalText = manualFetchBtn.innerText;
        manualFetchBtn.innerText = 'Fetching...';

        chrome.runtime.sendMessage({ type: 'manualFetch' }, (response) => {
            manualFetchBtn.disabled = false;
            if (response && response.status === 'ok') {
                manualFetchBtn.innerText = 'Success!';
                manualFetchBtn.style.background = '#6366f1';
                if (response.otp) {
                    updateOtpDisplay({ otp: response.otp, ts: Date.now() });
                }
                setTimeout(() => {
                    manualFetchBtn.innerText = originalText;
                    manualFetchBtn.style.background = '#10b981';
                }, 2000);
            } else {
                manualFetchBtn.innerText = 'Failed';
                manualFetchBtn.style.background = '#ef4444';
                setTimeout(() => {
                    manualFetchBtn.innerText = originalText;
                    manualFetchBtn.style.background = '#10b981';
                }, 3000);
            }
        });
    });

    signOutBtn.onclick = () => {
        if (confirm('Are you sure you want to unpair this device?')) {
            chrome.runtime.sendMessage({ type: 'signOut' }, () => {
                showUnpaired();
            });
        }
    };

    // Listen for live updates
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'newOtp') {
            showPaired(); // Ensure we are in paired view
            updateOtpDisplay({ otp: msg.otp, ts: Date.now() });
        } else if (msg.type === 'statusUpdate') {
            updateConnectionStatus(msg.online);
        }
    });
});
