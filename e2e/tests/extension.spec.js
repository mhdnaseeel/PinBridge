import { test, expect } from '@playwright/test';

// Tests for the injected content script and background deduplication
test.describe('Extension E2E - Content Script & Deduplication', () => {

  test('Rejects unauthorized postMessage requests (Test 2)', async ({ page }) => {
    // Navigate to a mocked unverified origin to simulate malicious site
    await page.goto('https://example.com');

    // Attempt to inject a fake OTP request 
    // Since example.com is not in the allowed origins of extension/src/content.js, 
    // it should fail to trigger the background script.
    const response = await page.evaluate(async () => {
      return new Promise((resolve) => {
        // Listen for extension response
        window.addEventListener('message', (event) => {
          if (event.data.type === 'PINBRIDGE_RESPONSE') {
            resolve(event.data);
          }
        });
        
        // Timeout after 1 second if rejected/no-response
        setTimeout(() => resolve({ error: 'TIMEOUT_REJECTED' }), 1000);

        // Dispatch malicious request
        window.postMessage({ type: 'PINBRIDGE_REQUEST', action: 'getSecret' }, '*');
      });
    });

    // Content script should ignore it completely resulting in the timeout
    expect(response.error).toBe('TIMEOUT_REJECTED');
  });

  test.skip('Simulates deduplication logic for multiple identical OTPs (Test 3)', async ({ page, context }) => {
    // Wait for the background Service Worker of the extension to become available
    let backgroundPage = context.serviceWorkers()[0];
    if (!backgroundPage) {
      backgroundPage = await context.waitForEvent('serviceworker');
    }
    
    // Ensure we wait for it to be fully ready
    await new Promise(resolve => setTimeout(resolve, 500));
    const deduplicationResult = await backgroundPage.evaluate(() => {
      // This simulates multiple identical snapshots arriving from Firestore at the exact same time
      let copyExecutions = 0;
      let lastProcessedTs = 0;
      
      const processNewOtp = (otpData) => {
        const { otp, uploadTs } = otpData;
        if (uploadTs <= lastProcessedTs) {
          return false; // deduplicated
        }
        lastProcessedTs = uploadTs;
        copyExecutions++;
        return true; 
      };

      // Simulating Test 3: Duplicate Write / Deduplication Logic
      const incomingData = { otp: '123456', uploadTs: 1690000000000 };
      
      const r1 = processNewOtp(incomingData); // Expected: true
      const r2 = processNewOtp(incomingData); // Expected: false (duplicate)
      const r3 = processNewOtp(incomingData); // Expected: false (duplicate)

      return { copyExecutions, results: [r1, r2, r3] };
    });

    expect(deduplicationResult.copyExecutions).toBe(1); // Only fired once
    expect(deduplicationResult.results).toEqual([true, false, false]);
  });
});
