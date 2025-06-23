# Comprehensive Authentication Test Documentation

## Test Overview
This document tracks the execution of a comprehensive authentication test for the Baliciaga application.

### Test Configuration
- **Test Email**: finaltest78@test.com
- **Original Password**: TestPassword123!
- **New Password**: NewPassword123!
- **Base URL**: https://app.baliciaga.com
- **Test Date**: June 23, 2025

### Test Approach
1. Register a new user via the web UI
2. Use AWS CLI admin commands to manually confirm the user
3. Test login with the original password
4. Test the forgot password flow
5. Test login with the new password

## Test Steps

### Step 1: User Registration
- Navigate to the application homepage
- Click on Login/Sign Up
- Fill in registration form with test email and password
- Submit registration
- Expected: User created in Cognito, verification code screen shown

### Step 2: Admin Confirmation
- Use AWS Cognito admin API to confirm the user
- Command: `adminConfirmSignUp`
- Also set password using `adminSetUserPassword` to ensure it's permanent
- Expected: User status changed to CONFIRMED

### Step 3: Login Test (Original Password)
- Navigate to login page
- Enter test email and original password
- Submit login form
- Expected: Successful login, redirected to authenticated area

### Step 4: Forgot Password Flow
- Navigate to login page
- Click "Forgot Password" link
- Enter test email
- Submit password reset request
- Use admin API to set new password
- Expected: Password successfully reset

### Step 5: Login Test (New Password)
- Navigate to login page
- Enter test email and new password
- Submit login form
- Expected: Successful login with new password

## Running the Test

1. Install dependencies:
```bash
npm install puppeteer aws-sdk
```

2. Ensure AWS credentials are configured with appropriate Cognito permissions

3. Run the test:
```bash
node comprehensive-auth-test.js
```

## Test Results Location
- **Screenshots**: `./auth-test-screenshots/`
- **Test Report**: `./auth-test-screenshots/test-report.json`

## Required AWS Permissions
The AWS credentials must have the following Cognito permissions:
- `cognito-idp:AdminConfirmSignUp`
- `cognito-idp:AdminSetUserPassword`
- `cognito-idp:DescribeUserPool`

## Troubleshooting

### Common Issues
1. **User Pool ID not found**: Check `stack_output.json` or `cognito_config.json`
2. **Registration fails**: Check if email is already registered
3. **Admin commands fail**: Verify AWS credentials and permissions
4. **Login fails after confirmation**: Check if password meets Cognito policy

### Debug Steps
1. Check browser screenshots for visual confirmation
2. Review `test-report.json` for detailed error messages
3. Check AWS CloudWatch logs for Cognito events
4. Verify user status in AWS Cognito console

## Notes
- The test uses Puppeteer in non-headless mode for visibility
- Screenshots are taken at each major step
- All test results are logged with timestamps
- The test automatically handles common UI variations (button text, form layouts)