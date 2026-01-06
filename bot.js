const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require('discord.js');
const OpenAI = require('openai');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const userThreads = new Map();

// Register slash command on startup
client.once('ready', async () => {
  console.log(`Bot is online as ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask a question about the Rilo Hackathon')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question')
        .setRequired(true)
    );

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [command.toJSON()],
    });
    console.log('Slash command registered');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'ask') return;

  const question = interaction.options.getString('question');

  // Defer reply as ephemeral (only visible to user)
  await interaction.deferReply({ ephemeral: true });

  try {
    let threadId = userThreads.get(interaction.user.id);

    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      userThreads.set(interaction.user.id, threadId);
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
      await interaction.editReply(cleanResponse.substring(0, 1900) + '...');
    } else {
      await interaction.editReply(cleanResponse);
    }
  } catch (error) {
    console.error('Error:', error);
    await interaction.editReply("Sorry, I couldn't process that. Try again?");
  }
});

// Also keep DM and mention support
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const isDM = !message.guild;
  const isMentioned = message.mentions.has(client.user) && !message.mentions.everyone;

  if (!isDM && !isMentioned) return;

  const question = message.content.replace(/<@!?\d+>/g, '').trim();

  if (!question) {
    message.reply("Ask me anything about the Rilo Hackathon!");
    return;
  }

  try {
    await message.channel.sendTyping();

    let threadId = userThreads.get(message.author.id);

    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      userThreads.set(message.author.id, threadId);
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

client.login(DISCORD_TOKEN);
