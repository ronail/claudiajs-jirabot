var botBuilder = require('claudia-bot-builder'),
    http = require('request-promise');

module.exports = botBuilder(function (request) {
  const uri = "https://shopline.atlassian.net/rest/api/3/groups/picker"
  return http(uri).then((body) => {
    console.log(body);
    return { // the initial response
      text: body,
      response_type: 'in_channel'
    }
  }).catch((err) => {
    return {
      text: err
    }
  });
  // return 'Thanks for sending ' + request.text  + 
  //   '. Your message is very important to us, but ' + 
  //   excuse.get();
});
