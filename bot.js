var botBuilder = require('claudia-bot-builder'),
    http = require('request-promise');

const AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-southeast-1' });

const encrypted = process.env['JIRA_AUTH_HEADER'];
let decrypted;

const uri = "https://shopline.atlassian.net/rest/api/3/groups/picker";
function fetchResult() {
  var options = {
    uri: uri,
    headers: {
      'Authorization': decrypted
    }
  };
  return http(options).then((body) => {
    return { // the initial response
      text: body,
      response_type: 'in_channel'
    }
  }).catch((err) => {
    return {
      text: err
    }
  });
  
};

module.exports = botBuilder(function (request) {
  if (decrypted) {
    return fetchResult();
  } else {
    return new Promise((resolve, reject) => {
      // Decrypt code should run once and variables stored outside of the
      // function handler so that these are decrypted once per container
      const kms = new AWS.KMS();
      kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
          if (err) {
              console.log('Decrypt error:', err);
              reject(err);
          }
          decrypted = data.Plaintext.toString('ascii');
          fetchResult().then(res => {
            resolve(res);
          });
      });
    });
  }

  // return 'Thanks for sending ' + request.text  + 
  //   '. Your message is very important to us, but ' + 
  //   excuse.get();
});
