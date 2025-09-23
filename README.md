# 🤖 Chuny BOT# Avalon Raid Helper



**Discord bot para gestión de actividades y decodificación de calabozos de Albion Online**A powerful multi-server Discord bot designed for generating Discord embeds via templates. This project allows users to interact and select roles, providing custom information such as embed images, colors, data, date and time, template selection, and more. Perfect for enhancing your Discord server's raid management experience across multiple servers.



## ✨ Características Principales## Features



- 🔓 **Decodificación de Calabozos**: Decodifica información de calabozos de Avalon desde archivos hexadecimales- **Multi-Server Support**: Each Discord server has its own isolated templates and data

- 📋 **Sistema de Claims**: Gestiona reservas de actividades y recursos- **MongoDB Integration**: Persistent storage for templates and server configurations

- 🎯 **Gestión de Raids**: Organiza y notifica actividades del guild- **Global Commands**: Bot can be invited to any server with global slash commands

- ⚔️ **Build Manager**: Gestiona builds de armas para diferentes actividades- **Customizable Discord Embeds**: Generate embeds with dynamic content such as images, colors, and text

- 🔐 **Sistema de Autorización**: Control de acceso por usuarios y roles- **Template Management**: Create, manage, and use custom templates per server

- 💎 **Sistema Premium**: Funcionalidades avanzadas para servidores premium- **Role Selection**: Let users interact and select their roles directly from the embed

- **Dynamic Content**: Embed information such as the event's date, time, and any personalized data you require

## 🚀 Comandos Principales- **Interactive**: Engage users through easy-to-use selections in the embed, improving the overall user experience

- **URL Support**: All embed fields support URL properties for enhanced interactivity

### 📁 Decodificación

- `/decode-file` - Decodifica calabozos desde archivos (.txt/.dat)## Installation

- `/decode-users` - Gestiona usuarios autorizados (admin)

### Prerequisites

### 📋 Sistema de Claims

- `/claim` - Crear claim para apartar recursos/actividadesMake sure you have the following installed:

- `/claim-config` - Configurar canales para claims (admin)

- [Node.js](https://nodejs.org/) (LTS version recommended)

### 🎯 Gestión de Raids- [MongoDB](https://www.mongodb.com/) (local installation or MongoDB Atlas)

- `/raid` - Enviar notificación de actividad usando plantillas- A Discord Application with Bot permissions

- `/templates` - Listar plantillas disponibles

- `/status` - Estado del servidor y estadísticas### Steps



### ⚔️ Gestión de Armas1. Clone the repository:

- `/show_all_weapons` - Listar todas las armas

- `/show_all_categories` - Mostrar categorías de armas    ```bash

- `/upload_weapons` - Subir armas desde JSON (owner)    git clone https://github.com/M8-Babbage/avalon-raid-helper.git

    ```

### 🔐 Administración

- `/roles` - Gestionar roles autorizados2. Navigate to the project directory:

- `/premium` - Gestionar estado premium (owner)

- `/migrate` - Migrar plantillas (admin)    ```bash

    cd avalon-raid-helper

## ⚙️ Instalación    ```



1. **Clona el repositorio**3. Install the dependencies:

   ```bash

   git clone https://github.com/M8-Babbage/avalon-raid-helper.git    ```bash

   cd avalon-raid-helper    npm install

   ```    ```



2. **Instala dependencias**4. Set up environment variables:

   ```bash

   npm install    ```bash

   ```    cp env.example .env

    ```

3. **Configura variables de entorno**

   ```bash5. Edit the `.env` file with your configuration:

   cp env.example .env

   ```    ```env

       TOKEN=your_discord_bot_token_here

   Edita `.env` con tus valores:    CLIENT_ID=your_discord_application_id_here

   ```env    BOT_OWNER_ID=464241835930419210

   BOT_TOKEN=tu_token_del_bot    MONGODB_URI=mongodb://localhost:27017/avalon-raid-helper

   BOT_OWNER_ID=tu_user_id    ```

   MONGODB_URI=tu_uri_de_mongodb

   ```6. Set up global commands:



4. **Inicia el bot**    ```bash

   ```bash    npm run commands

   npm start    ```

   ```

## Usage

## 📊 Scripts Disponibles

1. Start the server:

- `npm start` - Inicia el bot

- `npm run dev` - Modo desarrollo con nodemon    ```bash

- `npm run register` - Registra comandos slash    npm start

- `npm run check-commands` - Verifica comandos registrados    ```

- `npm run delete-global` - Elimina comandos globales

2. Invite the bot to your Discord server using the OAuth2 URL with the following permissions:

## 🔧 Tecnologías   - `applications.commands` (for slash commands)

   - `Send Messages`

- **Node.js** - Runtime de JavaScript   - `Use Slash Commands`

- **Discord.js v14** - Librería para Discord API   - `Embed Links`

- **MongoDB** - Base de datos NoSQL

- **Mongoose** - ODM para MongoDB3. Once the bot is online, you can use the following commands:

   - `/status` - Check server and bot status (visible to all users)

## 👨‍💻 Autor   - `/raid` - Create a raid notification using templates (owner, admins, authorized roles)

   - `/templates` - List available templates in the server (owner, admins, authorized roles)

**Edwin J. Páez** - [@chuny-dev](https://github.com/M8-Babbage)   - `/weapons` - List available weapons for templates (owner, admins, authorized roles)

   - `/create_template` - Create new templates interactively (owner, admins, authorized roles)

---   - `/edit_template` - Edit existing templates (owner, admins, authorized roles)

   - `/roles` - Manage authorized roles for sending notifications (owner, admins)

## 📝 Licencia   - `/migrate` - Migrate templates from JSON or files (owner, admins, authorized roles)

   - `/update_weapons` - Update weapons from JSON (bot owner only)

Este proyecto está bajo la Licencia ISC.   - `/migrate_weapons` - Migrate weapons from JSON file (bot owner only)

   - `/premium` - Manage premium status (bot owner only)

---

## Command Visibility

*Bot desarrollado con ❤️ para la comunidad de Albion Online*
The bot implements a command visibility system based on user permissions:

- **All Users**: `/status` - Basic commands visible to everyone
- **Role-Based Access**: `/raid`, `/templates`, `/weapons`, `/create_template`, `/edit_template`, `/migrate` - Visible to:
  - Bot owner (regardless of server premium status)
  - Server administrators
  - Users with authorized roles (managed via `/roles`)
- **Admin + Owner**: `/roles` - Visible to bot owner and server administrators
- **Bot Owner Only**: `/update_weapons`, `/migrate_weapons`, `/premium` - Visible only to the bot owner

### Role Management

Administrators can use `/roles` to manage which roles can access premium features:
- `/roles add <role>` - Add a role to authorized roles
- `/roles remove <role>` - Remove a role from authorized roles
- `/roles list` - List all authorized roles
- `/roles clear` - Remove all authorized roles

Commands that are not visible to a user will not appear in Discord's command autocomplete and will show an error message if attempted to use.

## Commands

### `/latency`
Basic ping command to check bot latency and WebSocket connection.

### `/raid`
Create a raid notification using a template from your server (premium required).
- **template**: Select a template (required)
- **title**: Custom title (optional)
- **description**: Custom description (optional)
- **time**: Custom time format (optional)
- **color**: Custom color in hex format (optional)
- **image**: Custom image URL (optional)
- **reminder**: Time before activity to send reminder (optional)
- **notify_all**: Send notification to all server users (optional, requires admin or authorized role)

### `/templates`
List all available templates in the current server.

### `/roles`
Manage authorized roles for sending notifications to all users (admin only).
- **add**: Add a role to the authorized list
  - **role**: Role to authorize (required)
- **remove**: Remove a role from the authorized list
  - **role**: Role to deauthorize (required)
- **list**: List all authorized roles
- **clear**: Remove all authorized roles from the server

**Note:** Administrators can always send notifications to all users, regardless of role authorization.

### `/debug`
Debug command to check server status and template information.
Shows server ID, template count, bot latency, and uptime information.

### `/migrate`
Migrate templates from JSON or files to the database (admin + premium required).
- **json**: JSON string of the template to migrate (optional)
- **from_files**: Migrate from JSON files in /src/templates (optional)

**Examples:**
- `/migrate json:"{\"title\":\"My Template\",\"time\":\"1h\",...}"` - Migrate from JSON
- `/migrate from_files:true` - Migrate from files

### `/premium`
Manage premium status of servers (bot owner only).
- **set**: Set premium status for a server
- **check**: Check premium status of a server
- **list**: List all premium servers

**Parameters:**
- **status**: Premium status (true/false) - required for `set`
- **server_id**: Server ID (optional) - if not provided, uses current server

**Examples:**
- `/premium set status:true` - Activate premium for current server
- `/premium set status:true server_id:123456789012345678` - Activate premium for specific server
- `/premium check` - Check if current server has premium
- `/premium check server_id:123456789012345678` - Check if specific server has premium
- `/premium list` - List all premium servers

![Image](https://github.com/user-attachments/assets/fa7687a8-b132-45b3-9f56-f3d9d86e1890)

![Image](https://github.com/user-attachments/assets/59d933cf-9f6b-4d66-923d-9855398cb5e9)

![Image](https://github.com/user-attachments/assets/e13ca752-e683-4ead-a9b1-47cd43f5eb1d)

## Configuration

### Database Setup
The bot uses MongoDB to store server-specific templates and configurations. Each server has its own isolated data.

### Template Management
- **Server Templates**: Each Discord server has its own set of templates stored in MongoDB
- **Custom Templates**: Each server starts with empty templates and must create their own using `/migrate` command
- **URL Support**: All template fields now support URL properties for enhanced interactivity

### Multi-Server Architecture
- Each server maintains its own template collection
- Each server starts with empty templates and creates their own
- Global commands work across all servers the bot is invited to
- Premium system controls access to main features

### Premium System
- **Premium Required**: `/raid` and `/migrate` commands require premium status
- **Free Commands**: `/latency`, `/templates`, `/debug` work without premium
- **Management**: Only bot owner can manage premium status via `/premium` command
- **Default State**: New servers start with premium disabled

## Contributing

Contributions are welcome! If you have any suggestions or improvements, feel free to fork the repository and submit a pull request. Please follow the contribution guidelines for a smooth process.

## License

This project is licensed under the CUSTOM License - see the [LICENSE](LICENSE) file for details.
