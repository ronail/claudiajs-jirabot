const botBuilder = require('claudia-bot-builder')
    slackDelayedReply = botBuilder.slackDelayedReply,
    http = require('request-promise');

const AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-southeast-1' });
const lambda = new AWS.Lambda();

const encrypted = process.env['JIRA_AUTH_HEADER'];
let decrypted;

const JIRA_PROJECT = process.env['JIRA_PROJECT'];

function fetchResult(command) {
  var apiPath = command.getApiPath();
  var uri = `https://${JIRA_PROJECT}.atlassian.net/rest/api/3/${apiPath}`;
  var options = {
    method: typeof command.getHTTPMethod !== 'undefined' ? command.getHTTPMethod() : 'GET',
    uri: uri,
    headers: {
      'Authorization': decrypted
    },
    qs: typeof command.getQueryStrings !== 'undefined' ? command.getQueryStrings() : {},
    body: typeof command.getBody !== 'undefined' ? command.getBody() : undefined,
    json: true
  };
  console.log(options);
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

const COMMANDS = [
  {
    match: function(text) {
      return text == 'group list';
    },
    getApiPath: function() {
      return 'groups/picker';
    },
    getResponseText: function(body) {
      return body.groups.map(group => group.name).join(', ');
    } 
  },
  {
    match: function(text) {
      return text.startsWith('user show ');
    },
    getApiPath: function() {
      return 'user';
    },
    getQueryStrings: function() {
      return {
        username: this.text.substr('user show '.length),
        expand: 'groups'
      }
    },
    getResponseText: function(body) {
      return `${body.displayName} (${body.emailAddress}) [${body.groups.items.map(group => group.name).join(', ')}]`;
    }
  },
  {
    match: function(text) {
      return text.startsWith('user create ');
    },
    getApiPath: function() {
      return 'user';
    },
    getBody: function() {
      // name=Foo,email=foo@bar.com
      var json = this.text.substr('user create '.length).split(",").map(str => str.split('=')).reduce((acc, cur) => { acc[cur[0]] = cur[1]; return acc }, {})
      return {
        emailAddress: json.email,
        displayName: json.name,
        notification: true
      }
    },
    getHTTPMethod: function() {
       return 'POST';
    },
    getResponseText: function(body) {
      return `User ${body.name} (${body.displayName}) is created successfully`;
    }
  }
];

function getCommand(text) {
  var command = COMMANDS.find(command => { return command.match(text); });
  command.text = text;
  return command;
}

const bot = botBuilder(function (message, apiRequest) {
  if (getCommand(message.text)) {
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
  var command = getCommand(message.text);
  return await fetchResult(command)
    .then((body) => {
      console.log('Done making request');
      return slackDelayedReply(message, {
        text: command.getResponseText(body),
        response_type: 'in_channel',
        replace_original: true
      });
    }).catch((err) => {
      console.error(err);
      return slackDelayedReply(message, {
        text: err.response.body.errorMessages.join(),
        response_type: 'ephemeral',
        replace_original: true
      });
    })
    .then(() => false); // prevent normal execution
});

module.exports = bot;
