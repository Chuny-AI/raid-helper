# Avalon Raid Helper

A powerful multi-server Discord bot designed for generating Discord embeds via templates. This project allows users to interact and select roles, providing custom information such as embed images, colors, data, date and time, template selection, and more. Perfect for enhancing your Discord server's raid management experience across multiple servers.

## Features

- **Multi-Server Support**: Each Discord server has its own isolated templates and data
- **MongoDB Integration**: Persistent storage for templates and server configurations
- **Global Commands**: Bot can be invited to any server with global slash commands
- **Customizable Discord Embeds**: Generate embeds with dynamic content such as images, colors, and text
- **Template Management**: Create, manage, and use custom templates per server
- **Role Selection**: Let users interact and select their roles directly from the embed
- **Dynamic Content**: Embed information such as the event's date, time, and any personalized data you require
- **Interactive**: Engage users through easy-to-use selections in the embed, improving the overall user experience
- **URL Support**: All embed fields support URL properties for enhanced interactivity

## Installation

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (LTS version recommended)
- [MongoDB](https://www.mongodb.com/) (local installation or MongoDB Atlas)
- A Discord Application with Bot permissions

### Steps

1. Clone the repository:

    ```bash
    git clone https://github.com/M8-Babbage/avalon-raid-helper.git
    ```

2. Navigate to the project directory:

    ```bash
    cd avalon-raid-helper
    ```

3. Install the dependencies:

    ```bash
    npm install
    ```

4. Set up environment variables:

    ```bash
    cp env.example .env
    ```

5. Edit the `.env` file with your configuration:

    ```env
    TOKEN=your_discord_bot_token_here
    CLIENT_ID=your_discord_application_id_here
    BOT_OWNER_ID=464241835930419210
    MONGODB_URI=mongodb://localhost:27017/avalon-raid-helper
    ```

6. Set up global commands:

    ```bash
    npm run commands
    ```

## Usage

1. Start the server:

    ```bash
    npm start
    ```

2. Invite the bot to your Discord server using the OAuth2 URL with the following permissions:
   - `applications.commands` (for slash commands)
   - `Send Messages`
   - `Use Slash Commands`
   - `Embed Links`

3. Once the bot is online, you can use the following commands:
   - `/latency` - Check bot latency
   - `/raid` - Create a raid notification using templates (premium required)
   - `/templates` - List available templates in the server
   - `/debug` - Debug information about server and templates
   - `/migrate` - Migrate templates from JSON or files (admin + premium required)
   - `/premium` - Manage premium status (bot owner only)

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

### `/templates`
List all available templates in the current server.

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
