const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}

async function testProfileUpdate() {
  const browser = await chromium.launch({ 
    headless: false,
    devtools: true // Open devtools to monitor network
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  // Collect console logs
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });
  
  // Collect network errors
  const networkErrors = [];
  page.on('requestfailed', request => {
    networkErrors.push({
      url: request.url(),
      failure: request.failure()
    });
  });
  
  try {
    console.log('Starting profile update test...\n');
    
    // Step 1: Navigate to the website
    console.log('1. Navigating to http://localhost:8082');
    await page.goto('http://localhost:8082', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotsDir, '01-homepage.png') });
    
    // Step 2: Click on login button
    console.log('2. Looking for login button...');
    
    // Try different selectors for login button
    const loginSelectors = [
      'button:has-text("Login")',
      'button:has-text("Sign In")',
      'a:has-text("Login")',
      'a:has-text("Sign In")',
      '[data-testid="login-button"]',
      '.login-button',
      '#login-button'
    ];
    
    let loginButton = null;
    for (const selector of loginSelectors) {
      try {
        loginButton = await page.locator(selector).first();
        if (await loginButton.isVisible()) {
          console.log(`   Found login button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!loginButton || !(await loginButton.isVisible())) {
      console.log('   Could not find login button, checking if already on login page...');
      // Check if we're already on a login page
      const url = page.url();
      if (!url.includes('login') && !url.includes('signin')) {
        // Try to navigate directly to login page
        console.log('   Navigating directly to /login');
        await page.goto('http://localhost:8082/login', { waitUntil: 'networkidle' });
      }
    } else {
      await loginButton.click();
      await page.waitForLoadState('networkidle');
    }
    
    await page.screenshot({ path: path.join(screenshotsDir, '02-login-page.png') });
    
    // Step 3: Enter email
    console.log('3. Entering email...');
    const emailInput = await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i], #email').first();
    await emailInput.fill('troyzhy@gmail.com');
    await page.screenshot({ path: path.join(screenshotsDir, '03-email-entered.png') });
    
    // Step 4: Click send verification code
    console.log('4. Clicking send verification code...');
    const sendCodeButton = await page.locator('button:has-text("Send"), button:has-text("Get Code"), button:has-text("Send Code"), button:has-text("Send Verification Code")').first();
    await sendCodeButton.click();
    
    // Step 5: Wait for verification code input
    console.log('5. Waiting for verification code input...');
    await page.waitForSelector('input[type="text"]:not([type="email"]), input[name="code"], input[placeholder*="code" i], input[placeholder*="verification" i]', { timeout: 10000 });
    await page.screenshot({ path: path.join(screenshotsDir, '04-verification-code-input.png') });
    
    // Step 6: Enter verification code
    console.log('6. Entering verification code...');
    const codeInput = await page.locator('input[type="text"]:not([type="email"]), input[name="code"], input[placeholder*="code" i], input[placeholder*="verification" i]').first();
    await codeInput.fill('123456');
    await page.screenshot({ path: path.join(screenshotsDir, '05-code-entered.png') });
    
    // Submit the code
    const submitButton = await page.locator('button:has-text("Submit"), button:has-text("Verify"), button:has-text("Login"), button[type="submit"]').first();
    await submitButton.click();
    
    // Wait for navigation after login
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give time for any redirects
    
    console.log('   Login successful, current URL:', page.url());
    await page.screenshot({ path: path.join(screenshotsDir, '06-after-login.png') });
    
    // Step 7: Navigate to profile page
    console.log('7. Navigating to profile page...');
    
    // Try different ways to get to profile
    const profileSelectors = [
      'button:has-text("Profile")',
      'a:has-text("Profile")',
      '[data-testid="profile-link"]',
      '.user-menu',
      '.avatar',
      'img[alt*="avatar" i]',
      'button[aria-label*="user" i]',
      'button[aria-label*="account" i]'
    ];
    
    let profileElement = null;
    for (const selector of profileSelectors) {
      try {
        profileElement = await page.locator(selector).first();
        if (await profileElement.isVisible()) {
          console.log(`   Found profile element with selector: ${selector}`);
          await profileElement.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch (e) {
        // Continue trying
      }
    }
    
    // Check if we need to click a dropdown item
    if (!page.url().includes('profile')) {
      const dropdownProfile = await page.locator('a:has-text("Profile"), button:has-text("Profile")').first();
      if (await dropdownProfile.isVisible()) {
        await dropdownProfile.click();
        await page.waitForLoadState('networkidle');
      } else {
        // Try direct navigation
        console.log('   Navigating directly to /profile');
        await page.goto('http://localhost:8082/profile', { waitUntil: 'networkidle' });
      }
    }
    
    await page.screenshot({ path: path.join(screenshotsDir, '07-profile-page.png') });
    
    // Step 8: Update profile fields
    console.log('8. Updating profile fields...');
    
    // Update name
    console.log('   a. Updating name field...');
    try {
      const nameInput = await page.locator('input[name="name"], input[placeholder*="name" i], input[type="text"]').first();
      await nameInput.clear();
      await nameInput.fill('Test User Updated');
      await page.screenshot({ path: path.join(screenshotsDir, '08a-name-updated.png') });
      console.log('   ✓ Name field updated successfully');
    } catch (e) {
      console.log('   ✗ Failed to update name:', e.message);
    }
    
    // Update WhatsApp
    console.log('   b. Updating WhatsApp field...');
    try {
      // First, look for country code selector
      const countrySelector = await page.locator('select[name*="country" i], select[id*="country" i], .country-selector, [data-testid="country-selector"]').first();
      if (await countrySelector.isVisible()) {
        await countrySelector.selectOption({ label: 'Indonesia (+62)' });
        console.log('   ✓ Selected Indonesia (+62)');
      } else {
        console.log('   ! Could not find country selector');
      }
      
      // Enter phone number
      const phoneInput = await page.locator('input[name*="phone" i], input[name*="whatsapp" i], input[type="tel"], input[placeholder*="phone" i], input[placeholder*="whatsapp" i]').first();
      await phoneInput.clear();
      await phoneInput.fill('81234567890');
      await page.screenshot({ path: path.join(screenshotsDir, '08b-whatsapp-updated.png') });
      console.log('   ✓ WhatsApp number entered');
    } catch (e) {
      console.log('   ✗ Failed to update WhatsApp:', e.message);
    }
    
    // Try to upload avatar
    console.log('   c. Attempting avatar upload...');
    try {
      // Create a test image
      const testImagePath = path.join(screenshotsDir, 'test-avatar.png');
      await page.screenshot({ path: testImagePath, clip: { x: 0, y: 0, width: 200, height: 200 } });
      
      const fileInput = await page.locator('input[type="file"]').first();
      if (await fileInput.isVisible() || await fileInput.count() > 0) {
        await fileInput.setInputFiles(testImagePath);
        await page.waitForTimeout(2000); // Wait for upload
        await page.screenshot({ path: path.join(screenshotsDir, '08c-avatar-uploaded.png') });
        console.log('   ✓ Avatar uploaded');
      } else {
        console.log('   ! No file input found for avatar upload');
      }
    } catch (e) {
      console.log('   ✗ Failed to upload avatar:', e.message);
    }
    
    // Step 9: Save changes
    console.log('9. Saving profile changes...');
    const saveButton = await page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first();
    await saveButton.click();
    await page.waitForTimeout(3000); // Wait for save operation
    await page.screenshot({ path: path.join(screenshotsDir, '09-after-save.png') });
    
    // Step 10: Check results
    console.log('10. Checking results...');
    
    // Reload page to verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotsDir, '10-after-reload.png') });
    
    // Check field values
    const results = {
      name: '',
      whatsapp: '',
      errors: [],
      consoleErrors: [],
      networkErrors: []
    };
    
    try {
      const nameInput = await page.locator('input[name="name"], input[placeholder*="name" i], input[type="text"]').first();
      results.name = await nameInput.inputValue();
    } catch (e) {
      results.errors.push('Could not read name field after reload');
    }
    
    try {
      const phoneInput = await page.locator('input[name*="phone" i], input[name*="whatsapp" i], input[type="tel"], input[placeholder*="phone" i], input[placeholder*="whatsapp" i]').first();
      results.whatsapp = await phoneInput.inputValue();
    } catch (e) {
      results.errors.push('Could not read WhatsApp field after reload');
    }
    
    // Filter console logs for errors
    results.consoleErrors = consoleLogs.filter(log => log.type === 'error');
    results.networkErrors = networkErrors;
    
    // Print results
    console.log('\n=== TEST RESULTS ===');
    console.log('Name field value:', results.name);
    console.log('WhatsApp field value:', results.whatsapp);
    console.log('Name update:', results.name === 'Test User Updated' ? '✓ SUCCESS' : '✗ FAILED');
    console.log('WhatsApp update:', results.whatsapp.includes('81234567890') ? '✓ SUCCESS' : '✗ FAILED (possible truncation)');
    
    if (results.consoleErrors.length > 0) {
      console.log('\nConsole Errors:');
      results.consoleErrors.forEach(err => {
        console.log(`  - ${err.text}`);
      });
    }
    
    if (results.networkErrors.length > 0) {
      console.log('\nNetwork Errors:');
      results.networkErrors.forEach(err => {
        console.log(`  - ${err.url}: ${err.failure}`);
      });
    }
    
    console.log('\nScreenshots saved to:', screenshotsDir);
    
  } catch (error) {
    console.error('Test failed with error:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-state.png') });
  } finally {
    // Keep browser open for manual inspection
    console.log('\nTest completed. Browser will remain open for inspection.');
    console.log('Press Ctrl+C to exit...');
    
    // Keep the script running
    await new Promise(() => {});
  }
}

// Run the test
testProfileUpdate().catch(console.error);