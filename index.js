require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const express = require('express');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

let connection;
let player = createAudioPlayer();

// Servidor web para mantener Replit activo
const app = express();
app.get('/', (req, res) => res.send('🎶 Master Bot está activo'));
app.listen(3000, () => console.log('🌐 Servidor web iniciado'));

client.once('ready', () => {
  console.log(`🎶 Master Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content === '!join') {
    if (message.member.voice.channel) {
      connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator
      });
      message.reply('✅ Master Bot se unió a tu canal de voz');
    } else {
      message.reply('⚠️ Debes estar en un canal de voz');
    }
  }

  if (message.content.startsWith('!play')) {
    const query = message.content.replace('!play', '').trim();
    if (!query) return message.reply('⚠️ Escribe el nombre de la canción');
    if (!connection) return message.reply('⚠️ Usa primero !join para que me conecte');

    try {
      let results = await play.search(query, { limit: 1 });
      if (results.length === 0) return message.reply('❌ No encontré resultados');

      let song = results[0];
      let stream = await play.stream(song.url);
      let resource = createAudioResource(stream.stream, { inputType: stream.type });

      player.play(resource);
      connection.subscribe(player);

      message.reply(`▶️ Reproduciendo: **${song.title}**`);
    } catch (error) {
      console.error('Error al reproducir:', error);
      message.reply('❌ Hubo un problema al reproducir la canción');
    }
  }

  if (message.content === '!pause') {
    player.pause();
    message.reply('⏸️ Master Bot pausó la música');
  }

  if (message.content === '!stop') {
    player.stop();
    if (connection) {
      connection.destroy();
      connection = null;
    }
    message.reply('🛑 Master Bot detuvo la música y salió del canal');
  }
});

player.on(AudioPlayerStatus.Idle, () => {
  if (connection) {
    connection.destroy();
    connection = null;
    console.log('🔌 Master Bot se desconectó automáticamente');
  }
});

client.login(process.env.TOKEN);
