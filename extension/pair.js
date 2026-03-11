const video = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvas = canvasElement.getContext('2d');
const status = document.getElementById('status');
const manualBtn = document.getElementById('manualBtn');
const manualJson = document.getElementById('manualJson');

async function startScanner() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    video.setAttribute("playsinline", true);
    video.play();
    requestAnimationFrame(tick);
  } catch (err) {
    console.error('Camera error:', err);
    status.textContent = "Camera access denied. Please use manual entry.";
  }
}

function tick() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvasElement.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code) {
      handlePairing(code.data);
      return;
    }
  }
  requestAnimationFrame(tick);
}

async function handlePairing(qrData) {
  status.textContent = "Pairing in progress...";
  try {
    const data = JSON.parse(qrData);
    if (!data.deviceId || !data.secret) throw new Error("Invalid QR data");

    // Call Cloud Function to get custom token
    const functionUrl = 'https://{{FIREBASE_REGION}}-{{FIREBASE_PROJECT_ID}}.cloudfunctions.net/pair';
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: data.deviceId, secret: data.secret })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Pairing failed');
    }

    const {token} = await response.json();

    // Store secret in session storage
    await chrome.storage.session.set({ secret: data.secret });

    // Send to background script to sign in
    chrome.runtime.sendMessage({ type: 'pair', token: token }, (res) => {
      if (res.status === 'paired') {
        status.textContent = "Successfully paired!";
        status.style.color = "green";
        setTimeout(() => window.close(), 1500);
      } else {
        throw new Error(res.error || "Login failed");
      }
    });

  } catch (err) {
    console.error('Pairing failed:', err);
    status.textContent = "Error: " + err.message;
    status.style.color = "red";
    // Resume scanning after a bit
    setTimeout(() => {
        status.textContent = "Waiting for QR code...";
        status.style.color = "#333";
        requestAnimationFrame(tick);
    }, 3000);
  }
}

manualBtn.onclick = () => handlePairing(manualJson.value);

startScanner();
