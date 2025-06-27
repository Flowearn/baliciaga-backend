/**
 * VerifyAuthChallengeResponse Lambda触发器
 * 
 * 用途：验证用户提交的挑战答案（验证码）
 * 这个函数负责：
 * - 接收用户输入的验证码
 * - 与存储的验证码进行比对
 * - 返回验证结果，决定认证是否成功
 */

module.exports.handler = async (event) => {
  console.log('VerifyAuthChallenge event:', JSON.stringify(event, null, 2));
  
  const expectedAnswer = event.request.privateChallengeParameters.secretLoginCode; 
  const providedAnswer = event.request.challengeAnswer;

  if (providedAnswer === expectedAnswer) {
    event.response.answerCorrect = true;
    console.log('VerifyAuthChallenge: SUCCESS');
  } else {
    event.response.answerCorrect = false;
    console.log('VerifyAuthChallenge: FAILED');
  }

  return event;
}; 