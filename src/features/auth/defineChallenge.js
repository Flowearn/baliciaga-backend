module.exports.handler = async (event) => {
  // Case 1: 新用户注册 (User Not Found)
  if (event.request.userNotFound) {
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
    console.log('DefineAuthChallenge: New user detected. Starting sign-up flow.');
  } 
  // Case 2: 老用户登录
  else if (
    event.request.session &&
    event.request.session.length > 0 &&
    event.request.session.slice(-1)[0].challengeResult === true // 已成功验证OTP
  ) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    console.log('DefineAuthChallenge: User authenticated successfully. Issuing tokens.');
  } else {
    // 用户存在，但还未验证或验证失败
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
    console.log('DefineAuthChallenge: Existing user. Issuing a new custom challenge.');
  }
  return event;
}; 