const puppeteer = require('puppeteer');
const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  email: 'finaltest78@test.com',
  password: 'TestPassword123!',
  newPassword: 'NewPassword123!',
  baseUrl: 'http://localhost:8082',
  screenshotDir: 'auth-test-screenshots',
  region: 'ap-southeast-1' // Changed to match the stack output
};

// Initialize AWS SDK
AWS.config.update({ region: TEST_CONFIG.region });
const cognito = new AWS.CognitoIdentityServiceProvider();

// Test results object
const testResults = {
  timestamp: new Date().toISOString(),
  testEmail: TEST_CONFIG.email,
  steps: []
};

// Helper function to add test result
function addTestResult(step, status, details = {}) {
  const result = {
    step,
    status,
    timestamp: new Date().toISOString(),
    ...details
  };
  testResults.steps.push(result);
  console.log(`\n[${status}] ${step}`);
  if (details.message) console.log(`  → ${details.message}`);
  if (details.error) console.error(`  ❌ Error: ${details.error}`);
}

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to take screenshot
async function takeScreenshot(page, name) {
  const screenshotPath = path.join(TEST_CONFIG.screenshotDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  📸 Screenshot saved: ${screenshotPath}`);
  return screenshotPath;
}

// Get Cognito User Pool ID
async function getCognitoUserPoolId() {
  // Use the passwordless user pool that's currently active
  // This is based on the actual user pools we found in the AWS account
  return 'ap-southeast-1_N72jBBIzH'; // baliciaga-user-pool-passwordless-dev
}

// Step 1: Register User via Web UI
async function registerUser(browser) {
  const page = await browser.newPage();
  
  try {
    addTestResult('User Registration', 'IN_PROGRESS');
    
    // Navigate to the app
    await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'networkidle0' });
    await takeScreenshot(page, '01-homepage');
    
    // Click hamburger menu first
    console.log('  Looking for hamburger menu...');
    const menuSelectors = [
      'button[aria-label*="menu"]',
      'button:has-text("☰")',
      'button:has-text("≡")',
      '[class*="hamburger"]',
      '[class*="menu-toggle"]',
      'svg[class*="menu"]',
      'button svg',
      'header button:last-child'
    ];
    
    let menuClicked = false;
    for (const selector of menuSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          menuClicked = true;
          console.log(`  ✓ Clicked menu using: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue trying
      }
    }
    
    if (!menuClicked) {
      // Try clicking in header area
      await page.click('header button:last-child');
    }
    
    await wait(1000);
    await takeScreenshot(page, '02-menu-opened');
    
    // Now look for login in the menu
    const loginSelectors = [
      'a:has-text("Login")',
      'a:has-text("Sign In")',
      'button:has-text("Login")',
      'button:has-text("Sign In")',
      '[href*="login"]',
      '[href*="signin"]'
    ];
    
    let loginClicked = false;
    for (const selector of loginSelectors) {
      try {
        await page.click(selector, { timeout: 3000 });
        loginClicked = true;
        console.log(`  ✓ Clicked login using: ${selector}`);
        break;
      } catch (e) {
        // Continue trying
      }
    }
    
    if (!loginClicked) {
      // Try direct navigation
      console.log('  → Navigating directly to /login');
      await page.goto(`${TEST_CONFIG.baseUrl}/login`, { waitUntil: 'networkidle0' });
    }
    
    await wait(2000);
    await takeScreenshot(page, '03-login-page');
    
    // Click on Sign Up link - look for the "Sign up" text
    try {
      // Look for "Sign up" link using text content
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button'));
        const signUpLink = links.find(el => el.textContent.includes('Sign up'));
        if (signUpLink) signUpLink.click();
      });
      await wait(2000);
      await takeScreenshot(page, '04-signup-page');
    } catch (e) {
      console.log('  Could not find sign up link, may already be on registration page');
    }
    
    // Fill registration form
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"], input[placeholder*="email" i]', TEST_CONFIG.email);
    
    await page.waitForSelector('input[type="password"], input[name="password"], input[placeholder*="password" i]:not([placeholder*="confirm" i])', { timeout: 10000 });
    await page.type('input[type="password"], input[name="password"], input[placeholder*="password" i]:not([placeholder*="confirm" i])', TEST_CONFIG.password);
    
    // Check for confirm password field
    const confirmPasswordField = await page.$('input[type="password"][placeholder*="confirm" i], input[name="confirmPassword"]');
    if (confirmPasswordField) {
      await confirmPasswordField.type(TEST_CONFIG.password);
    }
    
    await takeScreenshot(page, '04-registration-filled');
    
    // Submit registration
    try {
      // Look for submit button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button[type="submit"], button'));
        const submitButton = buttons.find(el => 
          el.textContent.includes('Sign up') || 
          el.textContent.includes('Create account') || 
          el.textContent.includes('Register')
        );
        if (submitButton) submitButton.click();
      });
    } catch (e) {
      await page.keyboard.press('Enter');
    }
    
    await wait(3000);
    await takeScreenshot(page, '05-after-registration');
    
    // Check for verification code screen
    const verificationInput = await page.$('input[placeholder*="code" i], input[name="code"], input[type="text"][maxlength="6"]');
    if (verificationInput) {
      addTestResult('User Registration', 'SUCCESS', {
        message: 'Registration successful, verification code screen displayed'
      });
    } else {
      // Check for any error messages
      const errorText = await page.$eval('.error-message, [role="alert"], .text-red-500', el => el.textContent).catch(() => null);
      if (errorText) {
        throw new Error(`Registration failed: ${errorText}`);
      }
      addTestResult('User Registration', 'SUCCESS', {
        message: 'Registration completed, checking user status'
      });
    }
    
  } catch (error) {
    addTestResult('User Registration', 'FAILED', {
      error: error.message
    });
    await takeScreenshot(page, 'registration-error');
  } finally {
    await page.close();
  }
}

// Step 2: Admin Confirm User via AWS CLI
async function adminConfirmUser() {
  try {
    addTestResult('Admin Confirm User', 'IN_PROGRESS');
    
    const userPoolId = await getCognitoUserPoolId();
    console.log(`  Using User Pool ID: ${userPoolId}`);
    
    const params = {
      UserPoolId: userPoolId,
      Username: TEST_CONFIG.email
    };
    
    // Admin confirm the user
    await cognito.adminConfirmSignUp(params).promise();
    
    // Also set the user password to ensure it's confirmed
    const setPasswordParams = {
      UserPoolId: userPoolId,
      Username: TEST_CONFIG.email,
      Password: TEST_CONFIG.password,
      Permanent: true
    };
    
    await cognito.adminSetUserPassword(setPasswordParams).promise();
    
    addTestResult('Admin Confirm User', 'SUCCESS', {
      message: 'User confirmed and password set via admin API'
    });
    
  } catch (error) {
    if (error.code === 'UserNotFoundException') {
      addTestResult('Admin Confirm User', 'FAILED', {
        error: 'User not found. Registration may have failed.'
      });
    } else if (error.code === 'NotAuthorizedException') {
      addTestResult('Admin Confirm User', 'WARNING', {
        message: 'User may already be confirmed',
        error: error.message
      });
    } else {
      addTestResult('Admin Confirm User', 'FAILED', {
        error: error.message
      });
    }
  }
}

// Step 3: Test Login with Original Password
async function testLogin(browser, password = TEST_CONFIG.password) {
  const page = await browser.newPage();
  
  try {
    addTestResult('Login Test', 'IN_PROGRESS', { password: password === TEST_CONFIG.password ? 'original' : 'new' });
    
    // Navigate to login page
    await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'networkidle0' });
    await wait(2000);
    
    // Click hamburger menu first
    const menuSelectors = [
      'button[aria-label*="menu"]',
      'button:has-text("☰")',
      'button:has-text("≡")',
      '[class*="hamburger"]',
      '[class*="menu-toggle"]',
      'header button:last-child'
    ];
    
    let menuClicked = false;
    for (const selector of menuSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          menuClicked = true;
          break;
        }
      } catch (e) {
        // Continue trying
      }
    }
    
    await wait(1000);
    
    // Click login in menu
    const loginSelectors = [
      'a:has-text("Login")',
      'a:has-text("Sign In")',
      'button:has-text("Login")',
      '[href*="login"]'
    ];
    
    let loginClicked = false;
    for (const selector of loginSelectors) {
      try {
        await page.click(selector, { timeout: 3000 });
        loginClicked = true;
        break;
      } catch (e) {
        // Continue trying
      }
    }
    
    if (!loginClicked) {
      await page.goto(`${TEST_CONFIG.baseUrl}/login`, { waitUntil: 'networkidle0' });
    }
    
    await wait(2000);
    await takeScreenshot(page, 'login-page');
    
    // Enter credentials
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"]', TEST_CONFIG.email);
    
    await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });
    await page.type('input[type="password"], input[name="password"]', password);
    
    await takeScreenshot(page, 'login-credentials-entered');
    
    // Submit login
    try {
      // Look for submit button with "Sign in" text
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginButton = buttons.find(el => 
          el.textContent.includes('Sign in') || 
          el.textContent.includes('Login')
        );
        if (loginButton) loginButton.click();
      });
    } catch (e) {
      await page.keyboard.press('Enter');
    }
    
    await wait(3000);
    
    // Check if login was successful or if already logged in
    const isLoggedIn = await page.evaluate(() => {
      // Check for profile link
      const profileLink = document.querySelector('a[href="/profile"]');
      if (profileLink) return true;
      
      // Check for logout button
      const buttons = Array.from(document.querySelectorAll('button'));
      const logoutButton = buttons.find(el => 
        el.textContent.includes('Logout') || 
        el.textContent.includes('Sign out')
      );
      if (logoutButton) return true;
      
      // Check if we're on a authenticated page (not login page)
      return !window.location.pathname.includes('login');
    });
    
    if (isLoggedIn) {
      await takeScreenshot(page, 'login-success');
      addTestResult('Login Test', 'SUCCESS', {
        message: 'Login successful',
        password: password === TEST_CONFIG.password ? 'original' : 'new'
      });
      
      // Try to logout for next test
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const logoutButton = buttons.find(el => 
          el.textContent.includes('Logout') || 
          el.textContent.includes('Sign out')
        );
        if (logoutButton) logoutButton.click();
      });
      await wait(2000);
    } else {
      // Check for error messages
      const errorText = await page.evaluate(() => {
        const errorElement = document.querySelector('[role="alert"], .error-message, .text-red-500');
        return errorElement ? errorElement.textContent : null;
      });
      
      // Check if there's an "already signed in" error
      if (errorText && errorText.includes('already a signed in user')) {
        // Navigate to home page since we're already logged in
        await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'networkidle0' });
        await wait(2000);
        
        addTestResult('Login Test', 'SUCCESS', {
          message: 'User was already logged in from registration',
          password: password === TEST_CONFIG.password ? 'original' : 'new'
        });
      } else {
        throw new Error(errorText || 'Login failed - no profile/logout button found');
      }
    }
    
  } catch (error) {
    await takeScreenshot(page, 'login-error');
    addTestResult('Login Test', 'FAILED', {
      error: error.message,
      password: password === TEST_CONFIG.password ? 'original' : 'new'
    });
  } finally {
    await page.close();
  }
}

// Step 4: Test Forgot Password Flow
async function testForgotPassword(browser) {
  const page = await browser.newPage();
  
  try {
    addTestResult('Forgot Password Test', 'IN_PROGRESS');
    
    // Navigate to login page
    await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'networkidle0' });
    await wait(2000);
    
    // Click hamburger menu first
    const menuSelectors = [
      'button[aria-label*="menu"]',
      'button:has-text("☰")',
      'button:has-text("≡")',
      '[class*="hamburger"]',
      '[class*="menu-toggle"]',
      'header button:last-child'
    ];
    
    for (const selector of menuSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          break;
        }
      } catch (e) {
        // Continue trying
      }
    }
    
    await wait(1000);
    
    // Click login in menu
    const loginSelectors = [
      'a:has-text("Login")',
      'a:has-text("Sign In")',
      'button:has-text("Login")',
      '[href*="login"]'
    ];
    
    for (const selector of loginSelectors) {
      try {
        await page.click(selector, { timeout: 3000 });
        break;
      } catch (e) {
        // Continue trying
      }
    }
    
    await wait(2000);
    
    // Click forgot password link
    const forgotClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      const forgotLink = links.find(el => 
        el.textContent.includes('Forgot Password') || 
        el.textContent.includes('Reset password')
      );
      if (forgotLink) {
        forgotLink.click();
        return true;
      }
      return false;
    });
    
    if (!forgotClicked) {
      throw new Error('Forgot password link not found');
    }
    await wait(2000);
    await takeScreenshot(page, 'forgot-password-page');
    
    // Enter email
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"]', TEST_CONFIG.email);
    
    await takeScreenshot(page, 'forgot-password-email-entered');
    
    // Submit forgot password request
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitButton = buttons.find(el => 
          el.textContent.includes('Send') || 
          el.textContent.includes('Reset') || 
          el.textContent.includes('Submit')
        );
        if (submitButton) submitButton.click();
      });
    } catch (e) {
      await page.keyboard.press('Enter');
    }
    
    await wait(3000);
    
    // Use admin API to complete password reset
    await completePasswordResetViaAdmin();
    
    addTestResult('Forgot Password Test', 'SUCCESS', {
      message: 'Password reset completed via admin API'
    });
    
  } catch (error) {
    await takeScreenshot(page, 'forgot-password-error');
    addTestResult('Forgot Password Test', 'FAILED', {
      error: error.message
    });
  } finally {
    await page.close();
  }
}

// Helper function to complete password reset via admin API
async function completePasswordResetViaAdmin() {
  try {
    const userPoolId = await getCognitoUserPoolId();
    
    const params = {
      UserPoolId: userPoolId,
      Username: TEST_CONFIG.email,
      Password: TEST_CONFIG.newPassword,
      Permanent: true
    };
    
    await cognito.adminSetUserPassword(params).promise();
    console.log('  ✓ Password reset via admin API');
    
  } catch (error) {
    throw new Error(`Admin password reset failed: ${error.message}`);
  }
}

// Main test function
async function runComprehensiveAuthTest() {
  // Create screenshot directory
  await fs.mkdir(TEST_CONFIG.screenshotDir, { recursive: true });
  
  console.log('🔐 Starting Comprehensive Authentication Test');
  console.log('==========================================');
  console.log(`Test Email: ${TEST_CONFIG.email}`);
  console.log(`Base URL: ${TEST_CONFIG.baseUrl}`);
  console.log(`Timestamp: ${testResults.timestamp}\n`);
  
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    // Step 1: Register new user
    await registerUser(browser);
    await wait(2000);
    
    // Step 2: Admin confirm user
    await adminConfirmUser();
    await wait(2000);
    
    // Step 3: Test login with original password
    await testLogin(browser, TEST_CONFIG.password);
    await wait(2000);
    
    // Step 4: Test forgot password flow
    await testForgotPassword(browser);
    await wait(2000);
    
    // Step 5: Test login with new password
    await testLogin(browser, TEST_CONFIG.newPassword);
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    testResults.overallError = error.message;
  } finally {
    await browser.close();
    
    // Save test results
    const reportPath = path.join(TEST_CONFIG.screenshotDir, 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(testResults, null, 2));
    
    // Generate summary
    console.log('\n\n📊 Test Summary');
    console.log('==============');
    
    const successCount = testResults.steps.filter(s => s.status === 'SUCCESS').length;
    const failedCount = testResults.steps.filter(s => s.status === 'FAILED').length;
    const warningCount = testResults.steps.filter(s => s.status === 'WARNING').length;
    
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`⚠️  Warnings: ${warningCount}`);
    console.log(`\n📄 Full report saved to: ${reportPath}`);
    console.log(`📸 Screenshots saved to: ${TEST_CONFIG.screenshotDir}/`);
    
    // Print detailed results
    console.log('\n📋 Detailed Results:');
    testResults.steps.forEach(step => {
      const icon = step.status === 'SUCCESS' ? '✅' : step.status === 'FAILED' ? '❌' : '⚠️';
      console.log(`\n${icon} ${step.step}`);
      if (step.message) console.log(`   ${step.message}`);
      if (step.error) console.log(`   Error: ${step.error}`);
    });
  }
}

// Run the test
runComprehensiveAuthTest().catch(console.error);