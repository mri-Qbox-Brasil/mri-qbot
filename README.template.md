# MRI QBot

![Build Status](https://github.com/{{repository}}/actions/workflows/generate-release.yml/badge.svg)
![GitHub package.json version](https://img.shields.io/github/package-json/v/{{repository}}?color=blue)
![Issues](https://img.shields.io/github/issues/{{repository}}.svg)
![Pull Requests](https://img.shields.io/github/issues-pr/{{repository}}.svg)
![Last Commit](https://img.shields.io/github/last-commit/{{repository}}.svg?color=blue)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/{{repository}})
[![CC0 1.0 Universal](https://licensebuttons.net/zero/1.0/80x15.png)](https://creativecommons.org/publicdomain/zero/1.0/)

MRI QBot is a specialized Discord bot designed for the MRI Qbox Brasil ecosystem, featuring membership verification and OAuth2 integration for external services.

## Features

- **Membership Verification**: Integrated system to verify guild members.
- **OAuth2 Service**: Secure JWT-based authentication for external projects.
- **Docker Ready**: Fully containerized with optimized builds.
- **Automated CI/CD**: Seamless release process using Semantic Release and GitHub Actions.
- **Database Support**: Built with Sequelize for robust data management.

## Usage

To get started with local development, ensure you have `pnpm` installed.

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Configuration

The bot uses environmental variables for configuration. Create a `.env` file based on the template below:

```env
DISCORD_TOKEN=<YOUR_DISCORD_TOKEN>
CLIENT_ID=<DISCORD_CLIENT_ID>
CLIENT_SECRET=<DISCORD_CLIENT_SECRET>
REDIRECT_URI=http://localhost:3000/auth/callback
JWT_SECRET=your_super_secret_jwt_key
SERVER_PORT=3000
```

## OAuth2 Integration

MRI QBot provides an OAuth2 service that allows external projects (like dashboards or websites) to verify if a user is a member of a specific Discord guild and what their permissions are.

For detailed instructions and implementation examples, please refer to the **[OAuth2 Documentation](OAUTH2.md)**.

## Commands and Events

Add your commands to the `src/commands` folder and events to the `src/events` folder to maintain a clean code structure. Here are some example commands you might implement:

- **ping**: Responds with "Pong!".
- **info**: Provides information about the bot.

## Building and Docker

This repository contains all the files necessary to build and run the bot in Docker. Configure the `generate-release.yml` with the needed variables. To generate the release, run the `generate_release` script. This will create a new tag and push to GitHub, triggering the automated release process.

To run the bot with Docker:

```bash
docker run -e DISCORD_TOKEN=<YOUR_DISCORD_TOKEN> your-docker-image
```

## Contribution
Feel free to contribute! Open issues or submit pull requests for any improvements or features you'd like to add.

## License
This project is licensed under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). The image metadata labels use `org.opencontainers.image.licenses=CC0-1.0`.

## Dependabot

The repository includes a `dependabot.yml` file that automatically checks for dependency updates and creates pull requests as needed.