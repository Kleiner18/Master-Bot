// index.js

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
    ButtonStyle,
    AudioPlayerStatus
} = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource
} = require('@discordjs/voice');
const play = require('play-dl');
const ffmpegStatic = require('ffmpeg-static'); // Importa el binario estático de FFmpeg

// 🔑 Paso CRÍTICO: Configurar play-dl para usar el binario de FFmpeg estático
play.setFFmpegPath(ffmpegStatic);
console.log('✅ play-dl configurado para usar ffmpeg-static.');

// --- Configuración Inicial del Cliente ---

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates, // Necesario para la voz
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const queues = new Map();
const searchCache = new Map();

// --- Funciones de Cola y Conexión ---

/**
 * Obtiene o crea la cola de reproducción para un servidor (Guild).
 * @param {string} guildId 
 * @returns {{player: AudioPlayer, connection: VoiceConnection | null}}
 */
function getQueue(guildId) {
    if (!queues.has(guildId)) {
        const player = createAudioPlayer();
        const queue = { player, connection: null };
        queues.set(guildId, queue);

        // Monitoreo de estado del reproductor
        player.on(AudioPlayerStatus.Playing, () => console.log('▶️ El audio está reproduciéndose'));
        player.on(AudioPlayerStatus.Idle, () => console.log('⏹️ El reproductor está en Idle'));
        player.on(AudioPlayerStatus.Paused, () => console.log('⏸️ El audio está en pausa'));
        player.on('error', err => console.error('❌ Error en el reproductor:', err));
    }
    return queues.get(guildId);
}

/**
 * Asegura que el bot esté conectado al canal de voz del usuario.
 * @param {Interaction} interaction 
 * @param {{player: AudioPlayer, connection: VoiceConnection | null}} queue
 * @returns {Promise<boolean>}
 */
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
        // CRÍTICO: Suscribe el reproductor a la conexión de voz
        queue.connection.subscribe(queue.player); 
        console.log('🔗 Conectado y suscrito al canal de voz');
    }
    return true;
}

// --- Componentes de Interfaz ---

function controlButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Pausar/Continuar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('skip').setLabel('⏭️ Saltar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop').setLabel('🛑 Detener').setStyle(ButtonStyle.Danger)
    );
}

// --- Registro de Comandos Slash ---

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Buscar y reproducir una canción de YouTube')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('Nombre de la canción o URL de YouTube')
                .setRequired(true)
        )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('✅ Comandos Slash registrados');
    } catch (err) {
        console.error('❌ Error registrando comandos:', err);
    }
})();

// --- Eventos del Cliente ---

client.once('ready', () => {
    console.log(`🎶 Master Bot conectado como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    // --- Manejo del comando /play ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'play') {
        await interaction.deferReply();

        const query = interaction.options.getString('query');
        // Usamos search para obtener una lista de resultados
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

        // Guardamos los resultados para usarlos cuando el usuario seleccione
        searchCache.set(interaction.user.id, results); 

        await interaction.editReply({
            content: `🎶 Resultados para: **${query}**. Selecciona para reproducir:`,
            components: [new ActionRowBuilder().addComponents(menu), controlButtons()]
        });
    }

    // --- Manejo de la selección de canción ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_song') {
        // Usa deferUpdate para que el menú no siga cargando
        await interaction.deferUpdate(); 

        const index = parseInt(interaction.values[0]);
        const results = searchCache.get(interaction.user.id);

        if (!results || !results[index]) {
            return interaction.followUp({ content: '❌ Selección inválida o expirada.', ephemeral: true });
        }

        const song = results[index];
        const queue = getQueue(interaction.guild.id);
        const ok = await ensureConnection(interaction, queue);
        if (!ok) return;

        try {
            // Usa play.stream para obtener un stream compatible con FFmpeg
            const stream = await play.stream(song.url); 
            if (!stream || !stream.stream) {
                return interaction.followUp({ content: '❌ No se pudo obtener el audio del video.', ephemeral: true });
            }
            
            // Crea el recurso de audio usando el stream y el tipo que play-dl proporciona
            const resource = createAudioResource(stream.stream, { inputType: stream.type });
            
            // 🎧 La reproducción real sucede aquí
            queue.player.play(resource); 
            
            console.log(`🎧 Reproduciendo: ${song.title}`);
            return interaction.editReply({ // Edita el mensaje original con el resultado
                content: `▶️ Reproduciendo ahora: **${song.title}**`,
                components: [controlButtons()]
            });
            
        } catch (error) {
            console.error('❌ Error en play.stream:', error);
            return interaction.followUp({ content: '❌ Error al reproducir la canción.', ephemeral: true });
        }
    }

    // --- Manejo de Botones de Control ---
    if (interaction.isButton()) {
        await interaction.deferReply({ ephemeral: true }); // Respuesta temporal
        const queue = getQueue(interaction.guild.id);
        
        if (interaction.customId === 'pause') {
            if (queue.player.state.status === AudioPlayerStatus.Playing) {
                queue.player.pause();
                return interaction.editReply({ content: '⏸️ Pausado.' });
            } else if (queue.player.state.status === AudioPlayerStatus.Paused) {
                queue.player.unpause();
                return interaction.editReply({ content: '▶️ Reanudado.' });
            } else {
                 return interaction.editReply({ content: '⚠️ No hay nada reproduciéndose.', ephemeral: true });
            }
        }

        if (interaction.customId === 'skip') {
            // queue.player.stop() mueve el estado a Idle, lo que es útil para colas.
            queue.player.stop(); 
            return interaction.editReply({ content: '⏭️ Canción saltada (si hubiera cola).' });
        }

        if (interaction.customId === 'stop') {
            queue.player.stop();
            if (queue.connection) {
                // Destruye la conexión para desconectar el bot del canal
                queue.connection.destroy(); 
                queue.connection = null;
            }
            return interaction.editReply({ content: '🛑 Reproducción detenida y bot desconectado.' });
        }
    }
});

client.login(process.env.TOKEN);
