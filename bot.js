const botBuilder = require('claudia-bot-builder')
    slackDelayedReply = botBuilder.slackDelayedReply,
    http = require('request-promise');

const AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-southeast-1' });
const lambda = new AWS.Lambda();

const encrypted = process.env['JIRA_AUTH_HEADER'];
let decrypted;

const uri = "https://shopline.atlassian.net/rest/api/3/groups/picker";
function fetchResult() {
  var options = {
    uri: uri,
    headers: {
      'Authorization': decrypted
    },
    json: true
  };
  console.log('Ready to make request');
  return http(options)
};

function decrypt() {
  return new Promise((resolve, reject) => {
    console.log('Start decrypting');
    // Decrypt code should run once and variables stored outside of the
    // function handler so that these are decrypted once per container
    const kms = new AWS.KMS();
    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
      if (err) {
          console.log('Decrypt error:', err);
          reject(err);
      }
      decrypted = data.Plaintext.toString('ascii');
      resolve(decrypted);
      console.log('Done decrypt');
    });
  });
}

const bot = botBuilder(function (message, apiRequest) {
  return new Promise((resolve, reject) => {
    lambda.invoke({
      FunctionName: apiRequest.lambdaContext.functionName,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        slackEvent: message // this will enable us to detect the event later and filter it
      }),
      Qualifier: apiRequest.lambdaContext.functionVersion
    }, (err, done) => {
      if (err) return reject(err);

      resolve();
    });
  }).then(() => {
    return { // the initial response
      text: 'Working on it...',
      response_type: 'in_channel'
    }
  // }).catch(() => {
  //   return `Could not setup the timer`
  });

  // return 'Thanks for sending ' + request.text  + 
  //   '. Your message is very important to us, but ' + 
  //   excuse.get();
});

// this will be executed before the normal routing.
// we detect if the event has a flag set by line 21,
// and if so, avoid normal procesing, running a delayed response instead

bot.intercept((event) => {
  if (!event.slackEvent) // if this is a normal web request, let it run
    return event;

  const message = event.slackEvent;

  if (!decrypted) {
    decrypt();
  }
  return fetchResult()
    .then((body) => {
      console.log('Done making request');
      return slackDelayedReply(message, {
        text: body.groups.map(group => group.name).join(', '),
        response_type: 'in_channel'
      });
    }).catch((err) => {
      return {
        text: err
      }
    })
    .then(() => false); // prevent normal execution
});

module.exports = bot;
