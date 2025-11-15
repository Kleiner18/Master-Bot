# 🎶 Master Bot

Master Bot es un bot musical para Discord desarrollado en **Node.js**.  
Permite unirse a canales de voz, reproducir música desde YouTube, pausar y detener la reproducción, y desconectarse automáticamente al terminar.

---

## 🚀 Funcionalidades

- `!join` → El bot se une al canal de voz del usuario.
- `!play <nombre de canción>` → Busca en YouTube y muestra hasta 5 opciones. El usuario elige con un número.
- `!play <canción + artista>` → Reproduce directamente la opción más precisa.
- `!pause` → Pausa la música.
- `!stop` → Detiene la música y desconecta al bot del canal.
- 🔌 Desconexión automática cuando la música termina.

---

## 🛠️ Requisitos

- Node.js v16 o superior
- Una cuenta en [Discord Developer Portal](https://discord.com/developers/applications) con un bot creado
- Token del bot (guárdalo en una variable de entorno `TOKEN`)

---

## 📂 Instalación

1. Clona este repositorio:
   ```bash
   git clone https://github.com/tuusuario/master-bot.git
   cd master-bot
