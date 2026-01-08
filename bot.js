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

// Helper function to get answer from OpenAI
async function getAnswer(question) {
  // Create fresh thread for each question
  const thread = await openai.beta.threads.create();

  await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: question,
  });

  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: ASSISTANT_ID,
  });

  let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

  while (runStatus.status !== 'completed') {
    if (runStatus.status === 'failed') {
      throw new Error('Assistant run failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  }

  const messages = await openai.beta.threads.messages.list(thread.id);
  const response = messages.data[0].content[0].text.value;

  // Clean up citations
  return response.replace(/【\d+[:\d]*†source】/g, '').trim();
}

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'ask') return;

  const question = interaction.options.getString('question');

  await interaction.deferReply({ ephemeral: true });

  try {
    const answer = await getAnswer(question);

    if (answer.length > 1900) {
      await interaction.editReply(answer.substring(0, 1900) + '...');
    } else {
      await interaction.editReply(answer);
    }
  } catch (error) {
    console.error('Error:', error);
    await interaction.editReply("Sorry, I couldn't process that. Try again?");
  }
});

// Handle DMs and mentions
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

    const answer = await getAnswer(question);

    if (answer.length > 1900) {
      message.reply(answer.substring(0, 1900) + '...');
    } else {
      message.reply(answer);
    }
  } catch (error) {
    console.error('Error:', error);
    message.reply("Sorry, I couldn't process that. Try again?");
  }
});

client.login(DISCORD_TOKEN);
