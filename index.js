require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const queues = new Map();
const searchCache = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    const player = createAudioPlayer();
    const queue = { player, connection: null };
    queues.set(guildId, queue);

    // 🔍 Logs para verificar estados del reproductor
    player.on(AudioPlayerStatus.Playing, () => {
      console.log('▶️ El audio está reproduciéndose');
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log('⏹️ El reproductor está en Idle (terminó la canción)');
    });

    player.on(AudioPlayerStatus.Paused, () => {
      console.log('⏸️ El audio está en pausa');
    });

    player.on('error', err => console.error('❌ Error en el reproductor:', err));
  }
  return queues.get(guildId);
}

async function ensureConnection(interaction, queue) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) {
    await interaction.reply({ content: '⚠️ Debes estar en un canal de voz.', ephemeral: true });
    return false;
  }
  if (!queue.connection) {
    queue.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator
    });
    queue.connection.subscribe(queue.player);
    console.log('🔗 Conectado y suscrito al canal de voz');
  }
  return true;
}

function controlButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Pausar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('skip').setLabel('⏭️ Saltar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('stop').setLabel('🛑 Detener').setStyle(ButtonStyle.Danger)
  );
}

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Buscar y reproducir una canción')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('Nombre de la canción')
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Comandos registrados');
  } catch (err) {
    console.error('❌ Error registrando comandos:', err);
  }
})();

client.once('ready', () => {
  console.log(`🎶 Master Bot conectado como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  // --- Comando /play ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'play') {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const results = await play.search(query, { limit: 10 });
    if (!results || results.length === 0) {
      return interaction.editReply({ content: '📭 No se encontraron resultados.' });
    }

    const options = results.map((song, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(song.title.slice(0, 100))
        .setDescription(song.durationRaw || 'Duración desconocida')
        .setValue(String(i))
    );

    const menu = new StringSelectMenuBuilder()
      .setCustomId('select_song')
      .setPlaceholder('Selecciona una canción')
      .addOptions(options);

    searchCache.set(interaction.user.id, results);

    await interaction.editReply({
      content: `🎶 Resultados para: **${query}**`,
      components: [new ActionRowBuilder().addComponents(menu), controlButtons()]
    });
  }

  // --- Selección directa sin cola ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_song') {
    await interaction.deferReply();

    const index = parseInt(interaction.values[0]);
    const results = searchCache.get(interaction.user.id);

    if (!results || !results[index]) {
      return interaction.editReply({ content: '❌ Selección inválida o expirada.' });
    }

    const song = results[index];
    const queue = getQueue(interaction.guild.id);
    const ok = await ensureConnection(interaction, queue);
    if (!ok) return;

    try {
      const stream = await play.stream(song.url);
      if (!stream || !stream.stream) {
        return interaction.editReply({ content: '❌ No se pudo obtener el audio del video.' });
      }
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      queue.player.play(resource);
      console.log(`🎧 Reproduciendo: ${song.title}`);
      return interaction.editReply({
        content: `▶️ Reproduciendo directamente: **${song.title}**`,
        components: [controlButtons()]
      });
    } catch (error) {
      console.error('❌ Error en play.stream:', error);
      return interaction.editReply({ content: '❌ Error al reproducir la canción.' });
    }
  }

  // --- Botones de control ---
  if (interaction.isButton()) {
    const queue = getQueue(interaction.guild.id);
    const ok = await ensureConnection(interaction, queue);
    if (!ok) return;

    if (interaction.customId === 'pause') {
      if (queue.player.state.status === AudioPlayerStatus.Playing) {
        queue.player.pause();
        return interaction.reply({ content: '⏸️ Pausado.' });
      } else {
        queue.player.unpause();
        return interaction.reply({ content: '▶️ Reanudado.' });
      }
    }

    if (interaction.customId === 'skip') {
      queue.player.stop();
      return interaction.reply({ content: '⏭️ Canción saltada.' });
    }

    if (interaction.customId === 'stop') {
      queue.player.stop();
      if (queue.connection) {
        queue.connection.destroy();
        queue.connection = null;
      }
      return interaction.reply({ content: '🛑 Reproducción detenida.' });
    }
  }
});

client.login(process.env.TOKEN);
