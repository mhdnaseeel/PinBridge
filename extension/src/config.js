/**
 * PinBridge — Shared Configuration
 * Single source of truth for Firebase config and server URL.
 * All extension scripts import from here instead of hardcoding.
 */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBwBr0MOdVKCwuvoK3oOU6tg5LcS7uqZOE",
  authDomain: "pinbridge-61dd4.firebaseapp.com",
  projectId: "pinbridge-61dd4",
  storageBucket: "pinbridge-61dd4.firebasestorage.app",
  messagingSenderId: "475556984962",
  appId: "1:475556984962:web:87e42b8f4e3b0ce9a89c9b",
  measurementId: "G-LEDS6BH99B"
};

export const SOCKET_SERVER_URL = "https://pinbridge-presence.onrender.com";

export const GOOGLE_CLIENT_ID = "475556984962-jekqarbki0ob5s1una398poptimup0eq.apps.googleusercontent.com";

/**
 * Hostnames considered "PinBridge dashboard" pages for extension ↔ web sync.
 */
export const DASHBOARD_HOSTNAMES = [
  'localhost',
  'pinbridge-61dd4.firebaseapp.com',
  'pinbridge-61dd4.web.app',
  'pin-bridge.vercel.app'
];

export function isDashboardPage(hostname) {
  return DASHBOARD_HOSTNAMES.some(h => hostname === h || hostname.includes(h));
}
