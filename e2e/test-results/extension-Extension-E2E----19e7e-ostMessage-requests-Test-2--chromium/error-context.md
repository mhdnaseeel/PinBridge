# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extension.spec.js >> Extension E2E - Content Script & Deduplication >> Rejects unauthorized postMessage requests (Test 2)
- Location: tests/extension.spec.js:6:3

# Error details

```
Error: page.evaluate: Test ended.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | // Tests for the injected content script and background deduplication
  4  | test.describe('Extension E2E - Content Script & Deduplication', () => {
  5  | 
  6  |   test('Rejects unauthorized postMessage requests (Test 2)', async ({ page }) => {
  7  |     // Navigate to a mocked unverified origin to simulate malicious site
  8  |     await page.goto('https://example.com');
  9  | 
  10 |     // Attempt to inject a fake OTP request 
  11 |     // Since example.com is not in the allowed origins of extension/src/content.js, 
  12 |     // it should fail to trigger the background script.
> 13 |     const response = await page.evaluate(async () => {
     |                                 ^ Error: page.evaluate: Test ended.
  14 |       return new Promise((resolve) => {
  15 |         // Listen for extension response
  16 |         window.addEventListener('message', (event) => {
  17 |           if (event.data.type === 'PINBRIDGE_RESPONSE') {
  18 |             resolve(event.data);
  19 |           }
  20 |         });
  21 |         
  22 |         // Timeout after 1 second if rejected/no-response
  23 |         setTimeout(() => resolve({ error: 'TIMEOUT_REJECTED' }), 1000);
  24 | 
  25 |         // Dispatch malicious request
  26 |         window.postMessage({ type: 'PINBRIDGE_REQUEST', action: 'getSecret' }, '*');
  27 |       });
  28 |     });
  29 | 
  30 |     // Content script should ignore it completely resulting in the timeout
  31 |     expect(response.error).toBe('TIMEOUT_REJECTED');
  32 |   });
  33 | 
  34 |   test.skip('Simulates deduplication logic for multiple identical OTPs (Test 3)', async ({ page, context }) => {
  35 |     // Wait for the background Service Worker of the extension to become available
  36 |     let backgroundPage = context.serviceWorkers()[0];
  37 |     if (!backgroundPage) {
  38 |       backgroundPage = await context.waitForEvent('serviceworker');
  39 |     }
  40 |     
  41 |     // Ensure we wait for it to be fully ready
  42 |     await new Promise(resolve => setTimeout(resolve, 500));
  43 |     const deduplicationResult = await backgroundPage.evaluate(() => {
  44 |       // This simulates multiple identical snapshots arriving from Firestore at the exact same time
  45 |       let copyExecutions = 0;
  46 |       let lastProcessedTs = 0;
  47 |       
  48 |       const processNewOtp = (otpData) => {
  49 |         const { otp, uploadTs } = otpData;
  50 |         if (uploadTs <= lastProcessedTs) {
  51 |           return false; // deduplicated
  52 |         }
  53 |         lastProcessedTs = uploadTs;
  54 |         copyExecutions++;
  55 |         return true; 
  56 |       };
  57 | 
  58 |       // Simulating Test 3: Duplicate Write / Deduplication Logic
  59 |       const incomingData = { otp: '123456', uploadTs: 1690000000000 };
  60 |       
  61 |       const r1 = processNewOtp(incomingData); // Expected: true
  62 |       const r2 = processNewOtp(incomingData); // Expected: false (duplicate)
  63 |       const r3 = processNewOtp(incomingData); // Expected: false (duplicate)
  64 | 
  65 |       return { copyExecutions, results: [r1, r2, r3] };
  66 |     });
  67 | 
  68 |     expect(deduplicationResult.copyExecutions).toBe(1); // Only fired once
  69 |     expect(deduplicationResult.results).toEqual([true, false, false]);
  70 |   });
  71 | });
  72 | 
```