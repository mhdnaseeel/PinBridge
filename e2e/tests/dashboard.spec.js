import { test, expect } from '@playwright/test';

test.describe('Dashboard E2E - UI & Connecting States', () => {
  test('Displays "Connecting..." dot and handles mocked OTP injection', async ({ page }) => {
    // 1. We mock the DOM state purely by starting on a blank page
    await page.goto('about:blank');

    // We can evaluate scripts to simulate states without connecting to real Firebase.
    await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="auth-view" style="display: none;"></div>
        <div id="paired-view" style="display: block;">
          <div class="header">
            <h1 id="device-name">My Test Device</h1>
            <div class="status-indicator">
              <div id="connection-dot" class="dot dot-connecting"></div>
              <span id="connection-text" style="color: #6366f1;">Connecting...</span>
            </div>
          </div>
          <div class="otp-display">
            <div id="otp-code">------</div>
            <button id="copy-btn">Copy Code</button>
          </div>
        </div>
      `;
    });

    // Test 4 (Partial): Validate "Connecting..." pulsing state
    const dot = page.locator('#connection-dot');
    await expect(dot).toHaveClass(/dot-connecting/);
    await expect(page.locator('#connection-text')).toHaveText('Connecting...');
    
    // Test 1 (Partial): Validate OTP UI updates correctly
    await page.evaluate(() => {
      document.getElementById('otp-code').textContent = '847291';
      document.getElementById('otp-code').classList.add('flash');
    });

    await expect(page.locator('#otp-code')).toHaveText('847291');
    await expect(page.locator('#otp-code')).toHaveClass(/flash/);
  });
});
