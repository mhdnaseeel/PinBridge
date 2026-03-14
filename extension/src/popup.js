document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const otpView = document.getElementById('otpView');
  const unpairedView = document.getElementById('unpairedView');
  const otpValue = document.getElementById('otpValue');
  const otpTime = document.getElementById('otpTime');
  const copyBtn = document.getElementById('copyBtn');
  const pairBtn = document.getElementById('pairBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  // Check status
  chrome.runtime.sendMessage({type: 'getStatus'}, (response) => {
    if (response.status === 'paired') {
      showPaired();
    } else {
      showUnpaired();
    }
  });

  // Load latest OTP
  chrome.storage.local.get(['latestOtp'], ({latestOtp}) => {
    if (latestOtp) {
      updateOtpDisplay(latestOtp);
    }
  });

  function showPaired() {
    statusBadge.textContent = 'Connected';
    statusBadge.className = 'status status-paired';
    otpView.classList.remove('hidden');
    unpairedView.classList.add('hidden');
  }

  function showUnpaired() {
    statusBadge.textContent = 'Disconnected';
    statusBadge.className = 'status status-unpaired';
    otpView.classList.add('hidden');
    unpairedView.classList.remove('hidden');
  }

  function updateOtpDisplay(otpData) {
    otpValue.textContent = otpData.otp;
    otpTime.textContent = 'Received at ' + new Date(otpData.ts).toLocaleTimeString();
  }

  pairBtn.onclick = () => {
    window.open('pairing.html');
  };

  copyBtn.onclick = () => {
    navigator.clipboard.writeText(otpValue.textContent);
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => copyBtn.textContent = originalText, 1500);
  };

  signOutBtn.onclick = () => {
    chrome.runtime.sendMessage({type: 'signOut'}, () => {
      showUnpaired();
    });
  };

  // Listen for live updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'newOtp') {
      updateOtpDisplay({otp: msg.otp, ts: Date.now()});
    }
  });
});
