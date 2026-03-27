import * as Sentry from "@sentry/browser";

// Sentry Initialization
Sentry.init({
    dsn: "https://5077a37e69c5a42a4ace47d13cd759ee@o4511118204141568.ingest.us.sentry.io/4511118218297344",
    tracesSampleRate: 1.0,
});

// Global error handlers to capture and report errors to Sentry
const targetScope = typeof self !== 'undefined' ? self : window;
targetScope.addEventListener('error', (e) => {
    Sentry.captureException(e.error || e.message);
    e.preventDefault();
    console.debug('[PinBridge Popup] Reported error:', e.error || e.message);
});
targetScope.addEventListener('unhandledrejection', (e) => {
    Sentry.captureException(e.reason);
    e.preventDefault();
    console.debug('[PinBridge Popup] Reported unhandled rejection:', e.reason);
});

document.addEventListener('DOMContentLoaded', async () => {
    const statusBadge = document.getElementById('statusBadge');
    const otpView = document.getElementById('otpView');
    const unpairedView = document.getElementById('unpairedView');
    const otpValue = document.getElementById('otpValue');
    const otpContent = document.getElementById('otpContent');
    const otpTime = document.getElementById('otpTime');
    const copyBtn = document.getElementById('copyBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    const manualFetchBtn = document.getElementById('manualFetchBtn');
    const connectionIndicator = document.getElementById('connectionIndicator');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const offlineBanner = document.getElementById('offlineBanner');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const startPairingBtn = document.getElementById('startPairingBtn');
    const emptyText = document.getElementById('emptyText');
    const errorMsg = document.getElementById('errorMsg');
    const unpairedSignOutBtn = document.getElementById('unpairedSignOutBtn');

    // ─── Browser Online/Offline ─────────────────────────────
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

    // ─── Check Initial Status ───────────────────────────────
    chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
        if (response && response.status === 'paired') {
            showPaired();
            chrome.storage.session.get(['lastSeen'], ({lastSeen}) => {
                updateConnectionStatus(response.isOnline, lastSeen || Date.now());
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

    // ─── View Toggling ──────────────────────────────────────
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
        
        chrome.storage.local.get(['googleEmail'], ({ googleEmail }) => {
            if (googleEmail) {
                if (googleSignInBtn) googleSignInBtn.classList.add('hidden');
                if (startPairingBtn) startPairingBtn.classList.remove('hidden');
                emptyText.innerHTML = `Signed in as <strong>${googleEmail}</strong>.<br>Start pairing to configure your Android device.`;
                if (unpairedSignOutBtn) unpairedSignOutBtn.classList.remove('hidden');
            } else {
                if (googleSignInBtn) {
                    googleSignInBtn.disabled = false;
                    googleSignInBtn.style.background = '';
                    googleSignInBtn.style.color = '';
                    googleSignInBtn.style.border = '';
                    googleSignInBtn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="Google"> Sign in with Google';
                    googleSignInBtn.classList.remove('hidden');
                }
                if (startPairingBtn) startPairingBtn.classList.add('hidden');
                emptyText.textContent = 'Sign in with Google to start mirroring OTPs from your Android device.';
                if (unpairedSignOutBtn) unpairedSignOutBtn.classList.add('hidden');
            }
        });
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');
    }

    function hideError() {
        errorMsg.classList.add('hidden');
    }

    // ─── Connection Status ──────────────────────────────────
    function updateConnectionStatus(online, lastSeen) {
        if (online) {
            statusDot.className = 'dot dot-online';
            statusText.textContent = 'Online';
            statusText.style.color = '#10b981';
        } else {
            statusDot.className = 'dot dot-offline';
            const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
            statusText.textContent = `Offline (${timeStr})`;
            statusText.style.color = '#f59e0b';
        }
    }

    // ─── OTP Display ────────────────────────────────────────
    function updateOtpDisplay(otpData) {
        if (!otpData || !otpData.otp) return;
        otpContent.textContent = otpData.otp;
        otpValue.style.animation = 'none';
        void otpValue.offsetWidth;
        otpValue.style.animation = 'fadeIn 0.5s ease-out';
        const timeStr = new Date(otpData.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        otpTime.textContent = `Latest OTP received at ${timeStr}`;
    }

    // ─── Google Sign-In & Pairing ───────────────────────────
    let authPollInterval = null;

    function startAuthPolling() {
        if (authPollInterval) clearInterval(authPollInterval);
        authPollInterval = setInterval(() => {
            chrome.storage.local.get(['googleEmail', 'pairedDeviceId'], ({ googleEmail, pairedDeviceId }) => {
                if (pairedDeviceId) {
                    clearInterval(authPollInterval);
                    authPollInterval = null;
                    showPaired();
                    chrome.storage.local.get(['latestOtp'], ({ latestOtp }) => {
                        if (latestOtp) updateOtpDisplay(latestOtp);
                    });
                } else if (googleEmail) {
                    clearInterval(authPollInterval);
                    authPollInterval = null;
                    showUnpaired();
                }
            });
        }, 2000);
    }

    if (googleSignInBtn) {
        googleSignInBtn.onclick = async () => {
            googleSignInBtn.disabled = true;
            googleSignInBtn.textContent = 'Signing in...';
            hideError();

            let hasResponded = false;
            
            // Fallback timeout to prevent permanent hanging if SW sleeps or flow is abandoned
            const signInTimeout = setTimeout(() => {
                if (!hasResponded) {
                    hasResponded = true;
                    showError('Sign-in timed out. Please try again.');
                    googleSignInBtn.disabled = false;
                    googleSignInBtn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="Google"> Sign in with Google';
                }
            }, 60000); // 60 seconds

            chrome.runtime.sendMessage({ type: 'googleSignIn' }, (response) => {
                if (hasResponded) return; // Ignore later responses if timed out
                hasResponded = true;
                clearTimeout(signInTimeout);

                if (response && response.status === 'success') {
                    if (authPollInterval) {
                        clearInterval(authPollInterval);
                        authPollInterval = null;
                    }
                    showUnpaired();
                } else if (response && response.status === 'pending') {
                    googleSignInBtn.innerHTML = 'Waiting for sign-in...';
                    googleSignInBtn.style.background = '#6366f1';
                    emptyText.textContent = response.message || 'Please sign in...';
                    startAuthPolling();
                } else {
                    const errMsg = response?.error || 'Sign-in failed';
                    showError(errMsg);
                    googleSignInBtn.disabled = false;
                    googleSignInBtn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="Google"> Sign in with Google';
                }
            });
        };
    }

    if (startPairingBtn) {
        startPairingBtn.onclick = () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('pairing.html') });
        };
    }

    // ─── Copy Button ────────────────────────────────────────
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(otpContent.textContent);
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

    // ─── Manual Fetch ───────────────────────────────────────
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

        manualFetchBtn.disabled = true;
        manualFetchBtn.innerText = 'Fetching...';

        chrome.runtime.sendMessage({ type: 'manualFetch' }, (response) => {
            manualFetchBtn.disabled = false;
            if (response && response.status === 'ok') {
                manualFetchBtn.innerText = 'Success!';
                manualFetchBtn.style.background = '#6366f1';
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
                const errorText = response?.error || 'Failed';
                if (errorText.includes('Not paired')) {
                    manualFetchBtn.innerText = 'Not Paired';
                } else if (errorText.toLowerCase().includes('timeout') || errorText.toLowerCase().includes('timed out')) {
                    manualFetchBtn.innerText = 'Timed Out';
                } else {
                    manualFetchBtn.innerText = 'Fetch Failed';
                }
                manualFetchBtn.style.background = '#ef4444';
                setTimeout(() => {
                    manualFetchBtn.innerText = 'Fetch Latest';
                    manualFetchBtn.style.background = '#10b981';
                }, 3000);
            }
        });
    });

    // ─── Sign Out (paired view) ─────────────────────────────
    signOutBtn.onclick = () => {
        if (confirm('Sign out and unpair this device?')) {
            chrome.runtime.sendMessage({ type: 'signOut' });
            chrome.storage.local.remove(['googleUid', 'googleEmail']);
            showUnpaired();
        }
    };

    // ─── Sign Out (unpaired view) ───────────────────────────
    if (unpairedSignOutBtn) {
        unpairedSignOutBtn.onclick = () => {
            chrome.runtime.sendMessage({ type: 'signOut' });
            chrome.storage.local.remove(['googleUid', 'googleEmail']);
            showUnpaired();
        };
    }

    // ─── Live Updates ───────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'newOtp') {
            showPaired();
            updateOtpDisplay({ otp: msg.otp, ts: msg.ts });
        } else if (msg.type === 'statusUpdate') {
            updateConnectionStatus(msg.online, msg.lastSeen);
        } else if (msg.type === 'unpaired' || msg.type === 'signOut') {
            showUnpaired();
        } else if (msg.type === 'paired') {
            showPaired();
        }
    });
});
