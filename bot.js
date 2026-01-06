const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

const channelThreads = new Map();

client.on('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (!message.mentions.has(client.user)) return;

  const question = message.content.replace(/<@!?\d+>/g, '').trim();

  if (!question) {
    message.reply("Ask me anything about the Rilo Hackathon!");
    return;
  }

  try {
    await message.channel.sendTyping();

    let threadId = channelThreads.get(message.channelId);

    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      channelThreads.set(message.channelId, threadId);
    }

    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: question,
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
    });

    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);

    while (runStatus.status !== 'completed') {
      if (runStatus.status === 'failed') {
        throw new Error('Assistant run failed');
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    const messages = await openai.beta.threads.messages.list(threadId);
    const response = messages.data[0].content[0].text.value;

    const cleanResponse = response.replace(/【\d+[:\d]*†source】/g, '').trim();

    if (cleanResponse.length > 1900) {
      message.reply(cleanResponse.substring(0, 1900) + '...');
    } else {
      message.reply(cleanResponse);
    }
  } catch (error) {
    console.error('Error:', error);
    message.reply("Sorry, I couldn't process that. Try again?");
  }
});

client.login(process.env.DISCORD_TOKEN);