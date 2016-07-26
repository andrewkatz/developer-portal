var response = require('../lib/response');

var CognitoHelper = require('cognito-helper');
var cognito = new CognitoHelper({
    AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID,
    COGNITO_IDENTITY_POOL_ID: process.env.COGNITO_IDENTITY_POOL_ID,
    COGNITO_DEVELOPER_PROVIDER_NAME: process.env.COGNITO_DEVELOPER_PROVIDER_NAME,
    COGNITO_SEPARATOR: process.env.COGNITO_SEPARATOR || '----',
    COGNITO_DATASET_NAME: process.env.COGNITO_DATASET_NAME || 'profile',
    COGNITO_PASSWORD_RESET_URL: process.env.COGNITO_PASSWORD_RESET_URL || 'http://localhost:8100/app.html#/reset/{email}/{reset}',
    COGNITO_PASSWORD_RESET_BODY: process.env.COGNITO_PASSWORD_RESET_BODY || 'Dear {name}, please follow the link below to reset your password:',
    COGNITO_PASSWORD_RESET_SUBJECT: process.env.COGNITO_PASSWORD_RESET_SUBJECT || 'Password reset',
    COGNITO_PASSWORD_RESET_SOURCE: process.env.COGNITO_PASSWORD_RESET_SOURCE || 'Password reset <noreply@yourdomain.com>'
});

var vandium = require('vandium');

module.exports.handler = vandium( function (event, context, callback) {

    var dataCallback = function(err, data) {
        if(err) {
            callback(response.makeError(err));
        }
        else {
            callback(null, data);
        }
    };
    
    cognito.forgotPassword(event.email, dataCallback);

});