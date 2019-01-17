const botBuilder = require('claudia-bot-builder')
    slackDelayedReply = botBuilder.slackDelayedReply,
    http = require('request-promise');

const AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-southeast-1' });
const lambda = new AWS.Lambda();

const encrypted = process.env['JIRA_AUTH_HEADER'];
let decrypted;

const JIRA_PROJECT = process.env['JIRA_PROJECT'];

function fetchResult(message) {
  var apiPath = getApiPath(message.text);
  var uri = `https://${JIRA_PROJECT}.atlassian.net/rest/api/3/${apiPath}`;
  var options = {
    uri: uri,
    headers: {
      'Authorization': decrypted
    },
    qs: getQueryString(message.text),
    json: true
  };
  console.log(`Ready to make request ${uri}`);
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
      console.log('Done decrypt');
      resolve(decrypted);
    });
  });
}

function getApiPath(text) {
  if (text == 'group list') {
    return 'groups/picker';
  } else if (text.startsWith('user show ')) {
    return 'user';
  }
}

function getQueryString(text) {
  if (text.startsWith('user show ')) {
    return {
      username: text.substr('user show '.length),
      expand: 'groups'
    };
  }
  return {}
}

function getResponseText(text, body) {
  if (text == 'group list') {
    return body.groups.map(group => group.name).join(', ');
  } else if (text.startsWith('user show ')) {
    return `${body.displayName} (${body.emailAddress}) [${body.groups.items.map(group => group.name).join(', ')}]`;
  }
}

const bot = botBuilder(function (message, apiRequest) {
  if (message.text == 'group list' || message.text.startsWith('user show')) {
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
        response_type: 'ephemeral'
      }
    // }).catch(() => {
    //   return `Could not setup the timer`
    });
  } else if (message.text == 'help') {
    return {
      text: `Try one of 'group list'`,
      response_type: 'ephemeral'
    }
  } else {
    return {
      text: `Mud q?`,
      response_type: 'ephemeral'
    }
  }

  // return 'Thanks for sending ' + request.text  + 
  //   '. Your message is very important to us, but ' + 
  //   excuse.get();
});

// this will be executed before the normal routing.
// we detect if the event has a flag set by line 21,
// and if so, avoid normal procesing, running a delayed response instead

bot.intercept(async (event) => {
  if (!event.slackEvent) // if this is a normal web request, let it run
    return event;

  const message = event.slackEvent;

  if (!decrypted) {
    await decrypt();
  }
  return await fetchResult(message)
    .then((body) => {
      console.log('Done making request');
      return slackDelayedReply(message, {
        text: getResponseText(message.text, body),
        response_type: 'ephemeral',
        replace_original: true
      });
    }).catch((err) => {
      console.error(err);
      return {
        text: err
      }
    })
    .then(() => false); // prevent normal execution
});

module.exports = bot;
