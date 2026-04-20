const express = require('express');
const session = require('express-session');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { PermissionsBitField } = require('discord.js');
const { sendActivityWebhook } = require('./utils/installerUtils');


/**
 * Inicia o servidor Express para OAuth2 e verificação de membros.
 * @param {import('discord.js').Client} client Instância do bot Discord.
 */
function startServer(client) {
    const app = express();
    const port = process.env.SERVER_PORT || 3000;

    // Configurações básicas
    app.use(cors());
    app.use(express.json());
    app.use(cookieParser());
    app.use(session({
        secret: process.env.SESSION_SECRET || 'mri-qbot-fallback-secret',
        resave: true, // Forçar resave ajuda em alguns ambientes
        saveUninitialized: true, // Garante que a sessão seja criada
        cookie: { 
            secure: false, // Localhost não usa HTTPS por padrão
            httpOnly: true,
            maxAge: 1000 * 60 * 10 // 10 minutos são suficientes para o login
        }
    }));

    const CLIENT_ID = process.env.CLIENT_ID;
    const CLIENT_SECRET = process.env.CLIENT_SECRET;
    const REDIRECT_URI = process.env.REDIRECT_URI;
    const JWT_SECRET = process.env.JWT_SECRET;

    /**
     * Rota de Login: Inicia o fluxo OAuth2.
     */
    app.get('/auth/login', (req, res) => {
        const { redirect_uri, guild_id } = req.query;

        if (!redirect_uri || !guild_id) {
            return res.status(400).json({ error: 'Parâmetros redirect_uri e guild_id são obrigatórios.' });
        }

        client.logger.info(`Iniciando fluxo OAuth2 para guilda ${guild_id}`);
        client.logger.debug(`Configurando redirecionamento: ${redirect_uri}`);

        // Salva o estado na sessão e força o save()
        req.session.oauth_state = {
            redirect_uri,
            target_guild_id: guild_id
        };

        req.session.save((err) => {
            if (err) {
                client.logger.error('Erro ao salvar sessão de login:', err);
                return res.status(500).send('Erro ao iniciar sessão.');
            }
            
            const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
            client.logger.debug(`Redirecionando para Discord: ${discordAuthUrl}`);
            res.redirect(discordAuthUrl);
        });
    });

    /**
     * Rota de Callback: Processa o retorno do Discord.
     */
    app.get('/auth/callback', async (req, res) => {
        const { code } = req.query;
        const state = req.session.oauth_state;

        if (!code || !state) {
            client.logger.warn('Callback OAuth2 falhou: Sessão não encontrada ou Código ausente.', { 
                hasCode: !!code, 
                hasState: !!state,
                sessionId: req.sessionID 
            });
            return res.status(400).send('Código de autorização ou estado de sessão ausente.');
        }

        client.logger.debug('Callback do Discord recebido com sucesso.', { sessionId: req.sessionID });

        try {
            // 1. Troca o code por um access_token
            client.logger.info('Trocando código de autorização por access token...');
            const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const accessToken = tokenResponse.data.access_token;
            client.logger.debug('Access token obtido com sucesso.');

            // 2. Busca informações do usuário
            client.logger.debug('Buscando dados do usuário (@me)...');
            const userResponse = await axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const userData = userResponse.data;
            const guildId = state.target_guild_id;
            client.logger.info(`Usuário autenticado: ${userData.username} (${userData.id})`);

            // 3. Verifica informações da guilda (isAdmin, roles, etc)
            client.logger.debug(`Verificando membro na guilda: ${guildId}`);
            let guildInfo = {
                id: guildId,
                isMember: false,
                isAdmin: false,
                roles: [],
                permissions: "0"
            };

            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                try {
                    const member = await guild.members.fetch(userData.id).catch(() => null);
                    if (member) {
                        guildInfo.isMember = true;
                        guildInfo.isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
                        guildInfo.roles = Array.from(member.roles.cache.keys());
                        guildInfo.permissions = member.permissions.bitfield.toString();
                        client.logger.info(`Membro encontrado na guilda: isAdmin=${guildInfo.isAdmin}, roles=${guildInfo.roles.length}`);
                    } else {
                        client.logger.warn(`Usuário ${userData.id} não é membro da guilda ${guildId}`);
                    }
                } catch (memberErr) {
                    client.logger.warn(`Erro ao buscar membro ${userData.id} na guilda ${guildId}:`, memberErr.message);
                }
            } else {
                client.logger.warn(`Bot não está na guilda solicitada: ${guildId}`);
            }

            // 4. Gera o JWT
            client.logger.debug('Gerando JWT...');
            const payload = {
                user: {
                    id: userData.id,
                    username: userData.username,
                    avatar: userData.avatar,
                    discriminator: userData.discriminator
                },
                guild: guildInfo
            };

            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
            client.logger.info('JWT gerado com sucesso.');

            // 5. Redireciona de volta para o projeto original
            const finalRedirect = new URL(state.redirect_uri);
            finalRedirect.searchParams.set('token', token);
            
            client.logger.info(`Finalizando fluxo. Redirecionando para: ${state.redirect_uri}`);

            // Limpa a sessão
            req.session.oauth_state = null;

            res.redirect(finalRedirect.toString());

        } catch (error) {
            client.logger.error('Erro no callback OAuth2:', error.response?.data || error.message);
            res.status(500).send('Erro interno ao processar autenticação.');
        }
    });

    /**
     * Rota de Atividade do Instalador: Recebe logs de instalação.
     */
    app.post('/installer/activity', async (req, res) => {
        const authHeader = req.headers.authorization;
        const { discord_id, session_id, event, details, timestamp } = req.body;

        if (!authHeader) {
            client.logger.warn('[Server] Tentativa de log de atividade sem token.');
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        try {
            // 1. Validar JWT
            jwt.verify(token, JWT_SECRET);

            // 2. Validar corpo básico
            if (!discord_id || !session_id || !event) {
                return res.status(400).json({ error: 'discord_id, session_id e event são obrigatórios' });
            }

            client.logger.info(`[Installer] Novo evento [${event}] para sessão ${session_id} (Usuário: ${discord_id})`);

            // 3. Salvar no Banco de Dados
            const InstallerActivity = client.db?.InstallerActivity;
            if (InstallerActivity) {
                await InstallerActivity.create({
                    discordId: discord_id,
                    sessionId: session_id,
                    event: event,
                    details: details,
                    timestamp: timestamp || new Date()
                });
            }

            // 4. Tratar lógicas específicas por evento e contadores (Cache/Total Histórico)
            const Configuration = client.db?.Configuration;
            const guildId = process.env.GUILD_ID;
            
            if (Configuration && guildId && event === 'finish') {
                const successCount = await Configuration.getConfig(guildId, 'installer_success_count') || 0;
                await Configuration.setConfig(guildId, 'installer_success_count', successCount + 1);
                client.logger.debug(`[Installer] Sucesso total incrementado para: ${successCount + 1}`);
            }

            // 5. Notificar via Webhook
            sendActivityWebhook(client, { discordId: discord_id, event, details });

            res.status(204).send();
        } catch (err) {
            client.logger.warn(`[Server] Falha na verificação de token ou processamento de atividade: ${err.message}`);
            res.status(401).json({ error: 'Invalid token' });
        }
    });

    /**
     * Rota de Verificação (opcional): Útil para depuração.
     */

    app.get('/auth/verify', (req, res) => {
        const authHeader = req.headers.authorization;
        client.logger.debug('Verificando validade do token JWT...');

        if (!authHeader) {
            client.logger.warn('Tentativa de verificação sem token fornecido.');
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            client.logger.debug(`Token verificado com sucesso para usuário: ${decoded.user?.id}`);
            res.json(decoded);
        } catch (err) {
            client.logger.warn(`Falha na verificação de token: ${err.message}`);
            res.status(401).json({ error: 'Invalid token' });
        }
    });

    app.listen(port, () => {
        client.logger.info(`Servidor OAuth2 rodando na porta ${port}`);
        console.log(`[Server] Servidor Express iniciado na porta ${port}`);
    });
}

module.exports = { startServer };
