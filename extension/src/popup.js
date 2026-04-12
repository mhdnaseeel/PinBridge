import * as Sentry from "@sentry/browser";
import { SENTRY_DSN } from "./config";

// Sentry Initialization
Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    sendDefaultPii: false
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
    const unpairBtn = document.getElementById('unpairBtn');
    const manualFetchBtn = document.getElementById('manualFetchBtn');
    const connectionIndicator = document.getElementById('connectionIndicator');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const offlineBanner = document.getElementById('offlineBanner');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const syncSignalBtn = document.getElementById('syncSignalBtn');
    const startPairingBtn = document.getElementById('startPairingBtn');
    const emptyText = document.getElementById('emptyText');
    const errorMsg = document.getElementById('errorMsg');
    const unpairedSignOutBtn = document.getElementById('unpairedSignOutBtn');
    const batteryIndicator = document.getElementById('batteryIndicator');
    const batteryText = document.getElementById('batteryText');

    // ── Active heartbeat: derive online/offline from lastSeen ──
    const ONLINE_THRESHOLD = 25000; // 25 seconds heartbeat delta
    let currentLastSeen = 0;
    let currentBatteryLevel = null;
    let currentIsCharging = false;
    let currentServerStatus = null; // Authoritative status from socket server

    // CAPTCHA elements
    const captchaModal = document.getElementById('captchaModal');
    const captchaCode = document.getElementById('captchaCode');
    const captchaInput = document.getElementById('captchaInput');
    const captchaError = document.getElementById('captchaError');
    const captchaCancel = document.getElementById('captchaCancel');
    const captchaConfirm = document.getElementById('captchaConfirm');

    let currentCaptchaCode = '';


    // ─── CAPTCHA Helpers ────────────────────────────────
    function generateCaptcha() {
        return String(Math.floor(1000 + Math.random() * 9000)); // 4-digit number, never starts with 0
    }

    function showCaptchaModal() {
        currentCaptchaCode = generateCaptcha();
        captchaCode.textContent = currentCaptchaCode;
        captchaInput.value = '';
        captchaError.textContent = '';
        captchaConfirm.disabled = true;
        captchaModal.classList.remove('hidden');
        setTimeout(() => captchaInput.focus(), 100);
    }

    function hideCaptchaModal() {
        captchaModal.classList.add('hidden');
        captchaInput.value = '';
        captchaError.textContent = '';
        currentCaptchaCode = '';
    }

    // Enable confirm button only when 4 digits entered
    captchaInput.addEventListener('input', () => {
        // Strip non-numeric characters
        captchaInput.value = captchaInput.value.replace(/[^0-9]/g, '');
        captchaConfirm.disabled = captchaInput.value.length !== 4;
        captchaError.textContent = '';
        captchaInput.classList.remove('shake');
    });

    // Allow Enter key to confirm
    captchaInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && captchaInput.value.length === 4) {
            captchaConfirm.click();
        }
    });

    captchaCancel.addEventListener('click', hideCaptchaModal);

    // Close on overlay click (outside the card)
    captchaModal.addEventListener('click', (e) => {
        if (e.target === captchaModal) hideCaptchaModal();
    });

    captchaConfirm.addEventListener('click', () => {
        if (captchaInput.value === currentCaptchaCode) {
            // Correct — perform unpair (keeps auth session intact)
            hideCaptchaModal();
            chrome.runtime.sendMessage({ type: 'unpairOnly' });
            showUnpaired();
        } else {
            captchaError.textContent = 'Incorrect code. Please try again.';
            captchaInput.classList.add('shake');
            captchaInput.value = '';
            captchaConfirm.disabled = true;
            setTimeout(() => captchaInput.focus(), 100);
        }
    });

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
    let isPaired = false;
    let syncInterval = null;

    // FIX: Continuous sync loop — polls background every 3s while popup is open.
    // This mirrors how the web dashboard gets continuous updates from its own
    // Socket.IO + Firestore listeners. The popup can't hold its own connections,
    // so it polls the background's live stateManager instead.
    function startContinuousSync() {
        if (syncInterval) return;
        // Request immediately on start
        chrome.runtime.sendMessage({ type: 'refreshStatus' });
        // Then poll every 3 seconds for fresh data
        syncInterval = setInterval(() => {
            chrome.runtime.sendMessage({ type: 'refreshStatus' });
        }, 3000);
    }

    function stopContinuousSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }

    chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
        if (response && response.status === 'paired') {
            isPaired = true;
            showPaired();
            // Show "Connecting…" and hide battery until fresh data arrives
            showConnectingStatus();
            batteryIndicator.classList.add('hidden');
            // Start continuous sync — like web dashboard's live listeners
            startContinuousSync();
        } else {
            showUnpaired();
        }
    });

    // Load latest OTP (do not animate on initial load)
    chrome.storage.local.get(['latestOtp'], ({ latestOtp }) => {
        if (latestOtp) {
            updateOtpDisplay(latestOtp, false);
        }
    });

    // FIX: Secondary sync channel — watch chrome.storage.onChanged for
    // status updates. This catches updates even if the background's
    // safeSendMessage fires before the popup's listener is registered.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !isPaired) return;
        let needsUpdate = false;
        if (changes.lastSeen && changes.lastSeen.newValue !== undefined) {
            currentLastSeen = changes.lastSeen.newValue;
            needsUpdate = true;
        }
        if (changes.serverStatus) {
            currentServerStatus = changes.serverStatus.newValue || null;
            needsUpdate = true;
        }
        if (changes.batteryLevel && changes.batteryLevel.newValue !== undefined) {
            currentBatteryLevel = changes.batteryLevel.newValue;
            needsUpdate = true;
        }
        if (changes.isCharging) {
            currentIsCharging = !!changes.isCharging.newValue;
        }
        if (changes.latestOtp && changes.latestOtp.newValue) {
            updateOtpDisplay(changes.latestOtp.newValue);
        }
        if (needsUpdate) {
            updateConnectionStatus();
        }
    });

    // ─── View Toggling ──────────────────────────────────────
    function showPaired() {
        statusBadge.textContent = 'Connected';
        statusBadge.className = 'status-badge status-paired';
        otpView.classList.remove('hidden');
        unpairedView.classList.add('hidden');
        connectionIndicator.classList.remove('hidden');
        // Do NOT unconditionally show battery indicator here. 
        // updateBatteryDisplay() will show it when real data arrives.
    }

    function showUnpaired() {
        statusBadge.textContent = 'Disconnected';
        statusBadge.className = 'status-badge status-unpaired';
        otpView.classList.add('hidden');
        unpairedView.classList.remove('hidden');
        connectionIndicator.classList.add('hidden');
        batteryIndicator.classList.add('hidden');
        
        chrome.storage.local.get(['googleEmail'], ({ googleEmail }) => {
            if (googleEmail) {
                if (googleSignInBtn) googleSignInBtn.classList.add('hidden');
                if (startPairingBtn) startPairingBtn.classList.remove('hidden');
                // Escape email to prevent innerHTML XSS (V-07)
                const safeEmail = googleEmail.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                emptyText.innerHTML = `Signed in as <strong>${safeEmail}</strong>.<br>Start pairing to configure your Android device.`;
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
    function showConnectingStatus() {
        statusDot.className = 'dot dot-connecting';
        statusText.textContent = 'Connecting...';
        statusText.style.color = '#6366f1';
    }

    function updateConnectionStatus() {
        const now = Date.now();
        // Use strict heartbeat interval for online calculations, but
        // fallback to serverStatus flag if lastSeen hasn't successfully synced.
        const isRecent = currentLastSeen > 0 && (now - currentLastSeen < ONLINE_THRESHOLD);
        
        // FIX: Only trust the 'online' server status override if the data is less than 60s old.
        // This prevents frozen disk data in chrome.storage.local from keeping the UI perpetually 'online'
        const isTrustworthy = currentLastSeen > 0 && (now - currentLastSeen < 60000);
        const online = isRecent || (currentServerStatus === 'online' && isTrustworthy);
        
        if (online) {
            statusDot.className = 'dot dot-online';
            statusText.textContent = 'Online';
            statusText.style.color = '#10b981';
        } else if (currentServerStatus === 'connecting') {
            showConnectingStatus();
            batteryIndicator.classList.add('hidden');
        } else {
            statusDot.className = 'dot dot-offline';
            let timeStr = 'Unknown';
            if (currentLastSeen && typeof currentLastSeen === 'number' && currentLastSeen > 0) {
                timeStr = new Date(currentLastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            statusText.textContent = `Offline (${timeStr})`;
            statusText.style.color = '#f59e0b';
            // Show last known battery in red when offline
            if (currentBatteryLevel != null) {
                updateBatteryDisplay(currentBatteryLevel, currentIsCharging, true);
            }
        }
    }

    // Re-evaluate online/offline every 5 seconds (handles lastSeen aging out)
    setInterval(() => {
        if (isPaired && (currentLastSeen > 0 || currentServerStatus)) {
            updateConnectionStatus();
        }
    }, 5000);

    // ─── Battery Display ────────────────────────────────────
    function updateBatteryDisplay(level, isCharging, isOffline = false) {
        if (level == null || level < 0) {
            batteryIndicator.classList.add('hidden');
            return;
        }
        batteryIndicator.classList.remove('hidden');
        if (isOffline) {
            batteryText.innerHTML = `${level}% <span style="color:#ef4444;font-size:11px;">(Last known)</span>`;
            batteryText.style.color = '#ef4444';
        } else {
            let html = `${level}%`;
            if (isCharging) {
                html += ' <span class="charging-badge">⚡ Charging</span>';
            }
            batteryText.innerHTML = html;
            batteryText.style.color = '';
        }
    }

    // ─── OTP Display ────────────────────────────────────────
    function updateOtpDisplay(otpData, animate = true) {
        if (!otpData || !otpData.otp) return;
        otpContent.textContent = otpData.otp;
        
        if (animate) {
            otpValue.style.animation = 'none';
            void otpValue.offsetWidth;
            otpValue.style.animation = 'fadeIn 0.5s ease-out';
        } else {
            otpValue.style.animation = 'none';
        }
        
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

    // ─── Manual Fetch Logic ─────────────────────────────────
    let isFetching = false;

    // Listener to catch successes from either the direct fetch response
    // or the real-time background listener (most reliable way)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.latestOtp && isFetching) {
            console.log('[PinBridge Popup] Success detected via storage sync.');
            onFetchSuccess();
        }
    });

    const onFetchSuccess = () => {
        if (!isFetching) return;
        isFetching = false;
        manualFetchBtn.disabled = false;
        manualFetchBtn.innerText = 'Success!';
        manualFetchBtn.style.background = '#6366f1';
        setTimeout(() => {
            manualFetchBtn.innerText = 'Fetch Latest';
            manualFetchBtn.style.background = '#10b981';
        }, 2000);
    };

    if (syncSignalBtn) {
        syncSignalBtn.addEventListener('click', () => {
            syncSignalBtn.disabled = true;
            syncSignalBtn.innerHTML = 'Syncing...';
            // Force reset local cache and show "Connecting..." immediately
            currentLastSeen = 0;
            currentBatteryLevel = null;
            currentServerStatus = 'offline';
            batteryIndicator.classList.add('hidden');
            showConnectingStatus();
            chrome.runtime.sendMessage({ type: 'syncSignal' }, () => {
                setTimeout(() => {
                    syncSignalBtn.disabled = false;
                    syncSignalBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> Sync Signal';
                    updateConnectionStatus(); // Refresh status text in case it updated
                }, 2000);
            });
        });
    }

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

        isFetching = true;
        manualFetchBtn.disabled = true;
        manualFetchBtn.innerText = 'Fetching...';

        chrome.runtime.sendMessage({ type: 'manualFetch' }, (response) => {
            // Success might have been detected already via the storage listener (chrome.storage.onChanged)
            if (!isFetching) return; 

            if (response && response.status === 'ok') {
                onFetchSuccess();
            } else {
                // If it's an error (like a timeout), allow a small grace period (5s) for a late-arriving OTP
                // to still be caught by the storage listener before we finalize the UI error state.
                const errorText = response?.error || 'Failed';
                console.warn(`[PinBridge Popup] Manual fetch background error: ${errorText}. Waiting for late arrival...`);

                setTimeout(() => {
                    if (!isFetching) return; // Caught by late arrival listener in the meantime!
                    
                    isFetching = false;
                    manualFetchBtn.disabled = false;
                    
                    if (errorText.includes('Not paired')) {
                        manualFetchBtn.innerText = 'Not Paired';
                    } else if (errorText.toLowerCase().includes('timeout') || errorText.toLowerCase().includes('timed out')) {
                        manualFetchBtn.innerText = 'Timed Out';
                    } else {
                        console.error('[PinBridge Popup] Fetch failed (final):', errorText);
                        manualFetchBtn.innerText = 'Retry Later';
                    }
                    manualFetchBtn.style.background = '#ef4444';
                    setTimeout(() => {
                        manualFetchBtn.innerText = 'Fetch Latest';
                        manualFetchBtn.style.background = '#10b981';
                    }, 3000);
                }, 5000); // 5s grace period
            }
        });
    });

    // ─── Sign Out (paired view) — only signs out, keeps pairing ──
    signOutBtn.onclick = () => {
        if (confirm('Sign out of your Google account? Your pairing will remain active.')) {
            chrome.runtime.sendMessage({ type: 'signOutOnly' });
            chrome.storage.local.remove(['googleUid', 'googleEmail']);
            showUnpaired();
        }
    };

    // ─── Unpair (paired view) — shows CAPTCHA first ─────────────
    unpairBtn.onclick = () => {
        showCaptchaModal();
    };

    // ─── Sign Out (unpaired view) ───────────────────────────
    if (unpairedSignOutBtn) {
        unpairedSignOutBtn.onclick = () => {
            chrome.runtime.sendMessage({ type: 'signOutOnly' });
            chrome.storage.local.remove(['googleUid', 'googleEmail']);
            showUnpaired();
        };
    }

    // ─── Live Updates ───────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'newOtp') {
            showPaired();
            updateOtpDisplay({ otp: msg.otp, ts: msg.ts });
            // If a manual fetch is in progress, mark it as successful
            if (isFetching) {
                console.log('[PinBridge Popup] Success detected via newOtp message.');
                onFetchSuccess();
            }
        } else if (msg.type === 'statusUpdate') {
            if (msg.lastSeen !== undefined) currentLastSeen = msg.lastSeen;
            if (msg.serverStatus !== undefined) currentServerStatus = msg.serverStatus;
            if (msg.batteryLevel !== undefined) {
                currentBatteryLevel = msg.batteryLevel;
                currentIsCharging = msg.isCharging;
            }
            updateConnectionStatus();
            // Show battery — updateConnectionStatus handles red styling when offline
            if (currentBatteryLevel != null) {
                const now = Date.now();
                const isOnline = (currentLastSeen > 0 && (now - currentLastSeen < ONLINE_THRESHOLD)) ||
                    (currentServerStatus === 'online' && currentLastSeen > 0 && (now - currentLastSeen < 60000));
                updateBatteryDisplay(currentBatteryLevel, currentIsCharging, !isOnline);
            }
        } else if (msg.type === 'unpaired' || msg.type === 'signOut') {
            isPaired = false;
            stopContinuousSync();
            showUnpaired();
        } else if (msg.type === 'paired') {
            isPaired = true;
            showPaired();
            showConnectingStatus();
            batteryIndicator.classList.add('hidden');
            startContinuousSync();
        }
    });
});
