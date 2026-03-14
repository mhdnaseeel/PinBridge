// PinBridge Content Script - Autofill Logic

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'newOtp') {
        const otp = msg.otp;
        console.log('[PinBridge] Attempting to autofill OTP:', otp);
        autofill(otp);
    }
});

function autofill(otp) {
    // 1. Find potential OTP fields
    // We look for numeric inputs with "otp", "code", "pin", or "password" in name/auto-complete
    const selectors = [
        'input[type="number"]',
        'input[type="tel"]',
        'input[autocomplete="one-time-code"]',
        'input[name*="code"]',
        'input[name*="otp"]',
        'input[name*="pin"]',
        'input[id*="otp"]',
        'input[id*="code"]',
        'input[id*="pin"]'
    ];

    const inputs = Array.from(document.querySelectorAll(selectors.join(',')))
        .filter(input => {
            const rect = input.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && 
                   window.getComputedStyle(input).visibility !== 'hidden' &&
                   !input.disabled && !input.readOnly;
        });

    if (inputs.length === 0) {
        console.log('[PinBridge] No suitable input field found for autofill.');
        return;
    }

    // 2. Fill the first visible/suitable field
    const target = inputs[0];
    target.value = otp;
    
    // 3. Trigger events so the site's JS detects the change
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Optional: focus the field
    target.focus();
    
    console.log('[PinBridge] Successfully autofilled OTP into:', target);
}
