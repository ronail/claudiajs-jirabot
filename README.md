# Slack slash commands for JIRA Cloud

This project is to control the permission of JIRA project through slack slash command

## How to run it

1. Run `npm install` to grab all the dependencies
2. Run `npm run create` to set up a Lambda function, and follow the instructions to connect it to Slack. (Refer to [Setting up a Slack Slash Command](https://github.com/claudiajs/claudia-bot-builder/blob/master/docs/GETTING_STARTED.md#slack-app-slash-command-configuration) if you need more info)
3. In your Slack channel, Run `/jira help` 

## How it works

The code is in [bot.js](bot.js).
