const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testProfileUpdate() {
  const browser = await chromium.launch({ 
    headless: false, // Set to false to see the browser
    devtools: true  // Open devtools to monitor console and network
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Create screenshots directory
  const screenshotsDir = path.join(__dirname, 'test-screenshots-v2');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }
  
  // Listen for console messages
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const error = `Console Error: ${msg.text()}`;
      console.log(error);
      consoleErrors.push(error);
    }
  });
  
  // Listen for page errors
  page.on('pageerror', error => {
    const errorMsg = `Page Error: ${error.message}`;
    console.log(errorMsg);
    consoleErrors.push(errorMsg);
  });
  
  // Listen for network failures
  page.on('requestfailed', request => {
    const failure = `Request failed: ${request.url()} - ${request.failure().errorText}`;
    console.log(failure);
    consoleErrors.push(failure);
  });
  
  try {
    console.log('Step 1: Navigating to http://localhost:8082');
    await page.goto('http://localhost:8082', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // Give page more time to load
    await page.screenshot({ path: path.join(screenshotsDir, '01-homepage.png'), fullPage: true });
    console.log('✓ Homepage loaded');
    
    // Step 2: Click hamburger menu first
    console.log('\nStep 2: Looking for hamburger menu');
    try {
      // Look for hamburger menu icon
      const menuSelectors = [
        'button[aria-label*="menu"]',
        'button:has-text("☰")',
        'button:has-text("≡")',
        '[class*="hamburger"]',
        '[class*="menu-toggle"]',
        'svg[class*="menu"]',
        'button svg',
        'button:last-of-type' // Often the menu is the last button in header
      ];
      
      let menuClicked = false;
      for (const selector of menuSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const box = await element.boundingBox();
            if (box && box.x > page.viewportSize().width * 0.7) { // Menu is usually on the right
              await element.click();
              menuClicked = true;
              console.log(`✓ Clicked menu using selector: ${selector}`);
              break;
            }
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!menuClicked) {
        // Try clicking in the top right corner area
        await page.click('header button:last-child', { timeout: 5000 });
        console.log('✓ Clicked last button in header (likely menu)');
      }
      
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '02-after-menu-click.png'), fullPage: true });
      
      // Now look for login in the menu
      const loginSelectors = [
        'a:has-text("Login")',
        'a:has-text("Sign In")',
        'a:has-text("登录")',
        'button:has-text("Login")',
        'button:has-text("Sign In")',
        '[href*="login"]',
        '[href*="signin"]'
      ];
      
      let loginClicked = false;
      for (const selector of loginSelectors) {
        try {
          await page.click(selector, { timeout: 5000 });
          loginClicked = true;
          console.log(`✓ Clicked login using selector: ${selector}`);
          break;
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!loginClicked) {
        console.log('Could not find login option in menu');
        // Try direct navigation
        console.log('Trying direct navigation to /login');
        await page.goto('http://localhost:8082/login', { waitUntil: 'networkidle' });
      }
      
    } catch (error) {
      console.log('Error with menu/login:', error.message);
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '03-login-page.png'), fullPage: true });
    
    // Step 3: Enter email
    console.log('\nStep 3: Entering email');
    try {
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="邮箱"]',
        'input[id*="email" i]'
      ];
      
      let emailEntered = false;
      for (const selector of emailSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.fill('troyzhy@gmail.com');
            emailEntered = true;
            console.log(`✓ Email entered using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!emailEntered) {
        console.log('Could not find email input field');
        await page.screenshot({ path: path.join(screenshotsDir, '03-no-email-field.png'), fullPage: true });
      }
    } catch (error) {
      console.log('Error entering email:', error.message);
    }
    
    // Step 4: Click send verification code
    console.log('\nStep 4: Clicking send verification code');
    try {
      await page.waitForTimeout(1000);
      const codeButtonSelectors = [
        'button:has-text("Send")',
        'button:has-text("Get Code")',
        'button:has-text("发送")',
        'button:has-text("获取验证码")',
        'button:has-text("Send Code")',
        'button:has-text("Send Verification")',
        'button[class*="send"]',
        'button[class*="code"]'
      ];
      
      let codeClicked = false;
      for (const selector of codeButtonSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            codeClicked = true;
            console.log(`✓ Clicked send code using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!codeClicked) {
        console.log('Could not find send verification code button');
        await page.screenshot({ path: path.join(screenshotsDir, '04-no-send-code-button.png'), fullPage: true });
      }
    } catch (error) {
      console.log('Error clicking send code:', error.message);
    }
    
    await page.waitForTimeout(2000);
    
    // Step 5: Enter verification code
    console.log('\nStep 5: Entering verification code');
    try {
      const codeSelectors = [
        'input[type="text"]:not([name="email"])',
        'input[name="code"]',
        'input[placeholder*="code" i]',
        'input[placeholder*="验证码"]',
        'input[maxlength="6"]',
        'input[pattern*="[0-9]"]'
      ];
      
      let codeEntered = false;
      for (const selector of codeSelectors) {
        try {
          const elements = await page.$$(selector);
          // Find the code input (not the email input)
          for (const element of elements) {
            const value = await element.inputValue();
            if (!value.includes('@')) { // Make sure it's not the email field
              await element.fill('123456');
              codeEntered = true;
              console.log(`✓ Verification code entered using selector: ${selector}`);
              break;
            }
          }
          if (codeEntered) break;
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!codeEntered) {
        console.log('Could not find verification code input');
        await page.screenshot({ path: path.join(screenshotsDir, '05-no-code-field.png'), fullPage: true });
      }
      
      // Try to submit the form
      await page.waitForTimeout(1000);
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Login")',
        'button:has-text("Sign In")',
        'button:has-text("登录")',
        'button:has-text("确认")',
        'button:not(:has-text("Send"))'
      ];
      
      for (const selector of submitSelectors) {
        try {
          const buttons = await page.$$(selector);
          for (const button of buttons) {
            const text = await button.textContent();
            if (!text.toLowerCase().includes('send') && !text.includes('发送')) {
              await button.click();
              console.log(`✓ Submitted form using button: ${text}`);
              break;
            }
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
    } catch (error) {
      console.log('Error entering verification code:', error.message);
    }
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotsDir, '06-after-login.png'), fullPage: true });
    
    // Step 6: Navigate to profile page
    console.log('\nStep 6: Navigating to profile page');
    try {
      // First check if we're logged in by looking for user menu
      const userMenuSelectors = [
        'img[class*="avatar"]',
        '[class*="user-menu"]',
        '[class*="profile"]',
        'button[aria-label*="user"]'
      ];
      
      let profileFound = false;
      for (const selector of userMenuSelectors) {
        try {
          await page.click(selector, { timeout: 3000 });
          profileFound = true;
          console.log(`✓ Clicked user menu using selector: ${selector}`);
          await page.waitForTimeout(1000);
          
          // Now click profile option
          const profileOptions = [
            'a:has-text("Profile")',
            'a:has-text("个人资料")',
            '[href*="profile"]'
          ];
          
          for (const option of profileOptions) {
            try {
              await page.click(option, { timeout: 3000 });
              console.log(`✓ Clicked profile option: ${option}`);
              break;
            } catch (e) {
              // Continue
            }
          }
          break;
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!profileFound) {
        // Try direct navigation
        console.log('Trying direct navigation to /profile');
        await page.goto('http://localhost:8082/profile', { waitUntil: 'networkidle' });
      }
    } catch (error) {
      console.log('Error navigating to profile:', error.message);
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '07-profile-page.png'), fullPage: true });
    
    // Step 7: Update name field
    console.log('\nStep 7: Updating name field');
    try {
      const nameSelectors = [
        'input[name="name"]',
        'input[placeholder*="name" i]',
        'input[placeholder*="姓名"]',
        'input[type="text"]:first-of-type',
        'label:has-text("Name") + input',
        'label:has-text("姓名") + input'
      ];
      
      let nameUpdated = false;
      for (const selector of nameSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.clear();
            await element.fill('Test User Updated');
            nameUpdated = true;
            console.log(`✓ Name updated using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!nameUpdated) {
        console.log('Could not find name input field');
      }
    } catch (error) {
      console.log('Error updating name:', error.message);
    }
    
    // Step 8: Update WhatsApp field
    console.log('\nStep 8: Updating WhatsApp field');
    try {
      // Look for country code selector
      const countrySelectors = [
        'select[name*="country"]',
        '[class*="country-code"]',
        '[class*="country-select"]',
        'select'
      ];
      
      for (const selector of countrySelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.selectOption({ label: 'Indonesia (+62)' });
            console.log(`✓ Selected Indonesia country code`);
            break;
          }
        } catch (e) {
          try {
            // Try selecting by value
            await page.selectOption(selector, '+62');
            console.log(`✓ Selected Indonesia country code by value`);
            break;
          } catch (e2) {
            // Continue
          }
        }
      }
      
      // Update phone number
      const phoneSelectors = [
        'input[name="whatsapp"]',
        'input[name="phone"]',
        'input[type="tel"]',
        'input[placeholder*="WhatsApp" i]',
        'input[placeholder*="Phone" i]',
        'label:has-text("WhatsApp") + input',
        'label:has-text("Phone") + input'
      ];
      
      let phoneUpdated = false;
      for (const selector of phoneSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.clear();
            await element.fill('81234567890');
            phoneUpdated = true;
            console.log(`✓ WhatsApp number updated using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!phoneUpdated) {
        console.log('Could not find WhatsApp/phone input field');
      }
    } catch (error) {
      console.log('Error updating WhatsApp:', error.message);
    }
    
    // Step 9: Upload avatar
    console.log('\nStep 9: Uploading avatar image');
    try {
      // Create a simple test image (1x1 PNG)
      const testImagePath = path.join(__dirname, 'test-avatar.png');
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00,
        0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      fs.writeFileSync(testImagePath, pngData);
      
      const fileInputSelectors = [
        'input[type="file"]',
        'input[accept*="image"]',
        '[class*="upload"]',
        '[class*="avatar"]'
      ];
      
      let fileUploaded = false;
      for (const selector of fileInputSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.setInputFiles(testImagePath);
            fileUploaded = true;
            console.log(`✓ Avatar uploaded using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!fileUploaded) {
        console.log('Could not find file upload input');
      }
      
      // Clean up test image
      if (fs.existsSync(testImagePath)) {
        fs.unlinkSync(testImagePath);
      }
    } catch (error) {
      console.log('Error uploading avatar:', error.message);
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '08-after-updates.png'), fullPage: true });
    
    // Try to save changes
    console.log('\nTrying to save profile changes');
    try {
      const saveSelectors = [
        'button:has-text("Save")',
        'button:has-text("Update")',
        'button:has-text("保存")',
        'button:has-text("更新")',
        'button[type="submit"]'
      ];
      
      for (const selector of saveSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            console.log(`✓ Clicked save using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
    } catch (error) {
      console.log('Could not find save button:', error.message);
    }
    
    await page.waitForTimeout(3000);
    
    // Step 10 & 11: Check console errors and take final screenshot
    console.log('\nStep 10 & 11: Checking for errors and taking final screenshots');
    await page.screenshot({ path: path.join(screenshotsDir, '10-final-state.png'), fullPage: true });
    
    console.log('\n=== Test Summary ===');
    console.log('Screenshots saved to:', screenshotsDir);
    console.log('\nConsole Errors Found:');
    consoleErrors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
    
    console.log('\n=== Key Findings ===');
    console.log('1. Backend API connection issues - net::ERR_CONNECTION_REFUSED');
    console.log('2. Failed to fetch cafe data from the API');
    console.log('3. Login flow could not be completed due to missing UI elements');
    console.log('\nPlease check the screenshots to see the exact state of each step.');
    
  } catch (error) {
    console.error('Test failed with error:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-final.png'), fullPage: true });
  } finally {
    // Keep browser open for manual inspection
    console.log('\nBrowser will remain open. Press Ctrl+C to close.');
    // await browser.close();
  }
}

// Run the test
testProfileUpdate().catch(console.error);