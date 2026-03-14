import jsQR from "jsqr";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBwBr0MOdVKCwuvoK3oOU6tg5LcS7uqZOE",
  authDomain: "pinbridge-61dd4.firebaseapp.com",
  projectId: "pinbridge-61dd4",
  storageBucket: "pinbridge-61dd4.firebasestorage.app",
  messagingSenderId: "475556984962",
  appId: "1:475556984962:web:87e42b8f4e3b0ce9a89c9b",
  measurementId: "G-LEDS6BH99B"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

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
    status.textContent = "Camera access denied. Please use manual entry.";
  }
}

function tick() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvasElement.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
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
    
    // Ensure we are signed in anonymously
    await signInAnonymously(auth);

    await chrome.storage.session.set({ secret: data.secret });
    chrome.runtime.sendMessage({ type: 'pair', deviceId: data.deviceId }, (res) => {
      if (res.status === 'paired') {
        status.textContent = "Successfully paired!";
        status.style.color = "green";
        setTimeout(() => window.close(), 1500);
      } else {
        status.textContent = "Error: " + res.error;
      }
    });
  } catch (err) {
    status.textContent = "Error: " + err.message;
  }
}

manualBtn.onclick = () => handlePairing(manualJson.value);
startScanner();
