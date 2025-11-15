const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

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

client.once('ready', () => {
    console.log(`🎶 Master Bot conectado como ${client.user.tag}`);
});

// !join → unirse al canal de voz
client.on('messageCreate', async message => {
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

    // !play <nombre de canción>
    if (message.content.startsWith('!play')) {
        const query = message.content.replace('!play', '').trim();
        if (!query) return message.reply('⚠️ Debes escribir el nombre de la canción');
        if (!connection) return message.reply('⚠️ Usa primero !join para que me conecte');

        let results = await play.search(query, { limit: 5 });
        if (results.length === 0) return message.reply('❌ No encontré resultados');

        let options = results.map((r, i) => `${i+1}. ${r.title}`).join('\n');
        await message.reply(`🎵 Master Bot encontró estas opciones:\n${options}\n\nEscribe el número para elegir.`);

        const filter = m => m.author.id === message.author.id;
        const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

        collector.on('collect', async m => {
            let choice = parseInt(m.content);
            if (isNaN(choice) || choice < 1 || choice > results.length) {
                return message.reply('⚠️ Número inválido');
            }

            let song = results[choice - 1];
            let stream = await play.stream(song.url);
            let resource = createAudioResource(stream.stream, { inputType: stream.type });

            player.play(resource);
            connection.subscribe(player);

            message.reply(`▶️ Master Bot está reproduciendo: **${song.title}**`);
        });
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

// Desconexión automática al terminar
player.on(AudioPlayerStatus.Idle, () => {
    if (connection) {
        connection.destroy();
        connection = null;
        console.log('🔌 Master Bot se desconectó automáticamente al terminar la música');
    }
});

client.login(process.env.TOKEN);

