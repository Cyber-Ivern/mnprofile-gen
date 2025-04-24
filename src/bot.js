"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var discord_js_1 = require("discord.js");
var dotenv_1 = require("dotenv");
var express_1 = require("express");
var cors_1 = require("cors");
var spotify_web_api_node_1 = require("spotify-web-api-node");
var openai_1 = require("openai");
// Load environment variables
(0, dotenv_1.config)();
// Check for essential environment variables
var requiredEnvVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI',
    'OPENAI_API_KEY',
];
for (var _i = 0, requiredEnvVars_1 = requiredEnvVars; _i < requiredEnvVars_1.length; _i++) {
    var envVar = requiredEnvVars_1[_i];
    if (!process.env[envVar]) {
        console.error("Error: Missing required environment variable: ".concat(envVar));
        process.exit(1); // Exit if a required variable is missing
    }
}
// Initialize Discord client
var client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.DirectMessages,
    ],
});
// Initialize Spotify API
var spotifyApi = new spotify_web_api_node_1.default({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});
// Initialize OpenAI
var openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
// Initialize Express server for OAuth callback
var app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Store user tokens temporarily (in production, use a proper database)
var userTokens = new Map();
// Define commands
var commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName('connect')
        .setDescription('Connect your Spotify account'),
    new discord_js_1.SlashCommandBuilder()
        .setName('profile')
        .setDescription('Generate your music nerd profile'),
    new discord_js_1.SlashCommandBuilder()
        .setName('tracks')
        .setDescription('Show your top tracks'),
    new discord_js_1.SlashCommandBuilder()
        .setName('verify')
        .setDescription('Check if your Spotify account is connected'),
    new discord_js_1.SlashCommandBuilder()
        .setName('image')
        .setDescription('Generate an image based on your music taste'),
].map(function (command) { return command.toJSON(); });
// Register commands
var rest = new discord_js_1.REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, rest.put(discord_js_1.Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands })];
            case 1:
                _a.sent();
                console.log('Successfully registered application commands.');
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                console.error(error_1);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); })();
// Handle commands
client.on('interactionCreate', function (interaction) { return __awaiter(void 0, void 0, void 0, function () {
    var commandName, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if (!interaction.isCommand())
                    return [2 /*return*/];
                commandName = interaction.commandName;
                _a = commandName;
                switch (_a) {
                    case 'connect': return [3 /*break*/, 1];
                    case 'profile': return [3 /*break*/, 3];
                    case 'tracks': return [3 /*break*/, 5];
                    case 'verify': return [3 /*break*/, 7];
                    case 'image': return [3 /*break*/, 9];
                }
                return [3 /*break*/, 11];
            case 1: return [4 /*yield*/, handleConnect(interaction)];
            case 2:
                _b.sent();
                return [3 /*break*/, 11];
            case 3: return [4 /*yield*/, handleProfile(interaction)];
            case 4:
                _b.sent();
                return [3 /*break*/, 11];
            case 5: return [4 /*yield*/, handleTracks(interaction)];
            case 6:
                _b.sent();
                return [3 /*break*/, 11];
            case 7: return [4 /*yield*/, handleVerify(interaction)];
            case 8:
                _b.sent();
                return [3 /*break*/, 11];
            case 9: return [4 /*yield*/, handleImage(interaction)];
            case 10:
                _b.sent();
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/];
        }
    });
}); });
// Command handlers
function handleConnect(interaction) {
    return __awaiter(this, void 0, void 0, function () {
        var scopes, state, authorizeURL, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    scopes = [
                        'user-top-read',
                        'user-read-private',
                        'user-read-email'
                    ];
                    state = interaction.user.id;
                    authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 6]);
                    return [4 /*yield*/, interaction.user.send("Click this link to connect your Spotify account: ".concat(authorizeURL))];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, interaction.reply({
                            content: 'I\'ve sent you a DM with the Spotify connection link!',
                            ephemeral: true,
                        })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4:
                    error_2 = _a.sent();
                    return [4 /*yield*/, interaction.reply({
                            content: 'I couldn\'t send you a DM. Please make sure you have DMs enabled for this server.',
                            ephemeral: true,
                        })];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function handleProfile(interaction) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, accessToken, topTracks, trackList, completion, profile, embed, error_3, errorMessage;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    userId = interaction.user.id;
                    accessToken = userTokens.get(userId);
                    if (!!accessToken) return [3 /*break*/, 2];
                    return [4 /*yield*/, interaction.reply({
                            content: 'Please connect your Spotify account first using /connect',
                            ephemeral: true,
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
                case 2: 
                // Show typing indicator
                return [4 /*yield*/, interaction.deferReply()];
                case 3:
                    // Show typing indicator
                    _a.sent();
                    spotifyApi.setAccessToken(accessToken);
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 8, , 10]);
                    return [4 /*yield*/, spotifyApi.getMyTopTracks({ limit: 10 })];
                case 5:
                    topTracks = _a.sent();
                    trackList = topTracks.body.items
                        .map(function (track, index) {
                        var artists = track.artists.map(function (artist) { return artist.name; }).join(', ');
                        return "".concat(index + 1, ". **").concat(track.name, "** - ").concat(artists);
                    })
                        .join('\n');
                    return [4 /*yield*/, openai.chat.completions.create({
                            messages: [
                                {
                                    role: 'system',
                                    content: "You are a witty and insightful music critic who creates engaging profiles based on someone's top tracks. \n          Focus on identifying patterns, genres, and musical preferences. \n          Be specific about the artists and songs mentioned.\n          Keep the profile concise (2-3 paragraphs) and engaging.",
                                },
                                {
                                    role: 'user',
                                    content: "Create a music nerd profile based on these top tracks: ".concat(trackList),
                                },
                            ],
                            model: 'gpt-4',
                            temperature: 0.7,
                        })];
                case 6:
                    completion = _a.sent();
                    profile = completion.choices[0].message.content;
                    embed = new discord_js_1.EmbedBuilder()
                        .setTitle("\uD83C\uDFB5 ".concat(interaction.user.username, "'s Music Nerd Profile"))
                        .setDescription(profile)
                        .addFields({ name: '🎧 Top Tracks', value: trackList })
                        .setColor('#1DB954')
                        .setFooter({ text: 'Generated with Spotify & OpenAI' })
                        .setTimestamp();
                    return [4 /*yield*/, interaction.editReply({ embeds: [embed] })];
                case 7:
                    _a.sent();
                    return [3 /*break*/, 10];
                case 8:
                    error_3 = _a.sent();
                    console.error('Profile generation error:', error_3);
                    errorMessage = 'An error occurred while generating your profile.';
                    if (error_3.statusCode === 401) {
                        errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
                    }
                    else if (error_3.statusCode === 429) {
                        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
                    }
                    return [4 /*yield*/, interaction.editReply({
                            content: errorMessage,
                            ephemeral: true,
                        })];
                case 9:
                    _a.sent();
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
function handleTracks(interaction) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, accessToken, topTracks, embed, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    userId = interaction.user.id;
                    accessToken = userTokens.get(userId);
                    if (!!accessToken) return [3 /*break*/, 2];
                    return [4 /*yield*/, interaction.reply({
                            content: 'Please connect your Spotify account first using /connect',
                            ephemeral: true,
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
                case 2:
                    spotifyApi.setAccessToken(accessToken);
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 6, , 8]);
                    return [4 /*yield*/, spotifyApi.getMyTopTracks({ limit: 10 })];
                case 4:
                    topTracks = _a.sent();
                    embed = new discord_js_1.EmbedBuilder()
                        .setTitle("".concat(interaction.user.username, "'s Top Tracks"))
                        .setDescription(topTracks.body.items
                        .map(function (track, index) { return "".concat(index + 1, ". ").concat(track.name, " - ").concat(track.artists[0].name); })
                        .join('\n'))
                        .setColor('#1DB954')
                        .setTimestamp();
                    return [4 /*yield*/, interaction.reply({ embeds: [embed] })];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 8];
                case 6:
                    error_4 = _a.sent();
                    console.error(error_4);
                    return [4 /*yield*/, interaction.reply({
                            content: 'An error occurred while fetching your top tracks.',
                            ephemeral: true,
                        })];
                case 7:
                    _a.sent();
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function handleVerify(interaction) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, isConnected;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    userId = interaction.user.id;
                    isConnected = userTokens.has(userId);
                    if (!isConnected) return [3 /*break*/, 2];
                    return [4 /*yield*/, interaction.reply({
                            content: '✅ Your Spotify account is connected!',
                            ephemeral: true,
                        })];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, interaction.reply({
                        content: '❌ Your Spotify account is not connected. Use /connect to link it.',
                        ephemeral: true,
                    })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
function handleImage(interaction) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, accessToken, topTracks, trackList, completion, imagePrompt, imageResponse, imageUrl, embed, error_5, errorMessage;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    userId = interaction.user.id;
                    accessToken = userTokens.get(userId);
                    if (!!accessToken) return [3 /*break*/, 2];
                    return [4 /*yield*/, interaction.reply({
                            content: 'Please connect your Spotify account first using /connect',
                            ephemeral: true,
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
                case 2: 
                // Show typing indicator
                return [4 /*yield*/, interaction.deferReply()];
                case 3:
                    // Show typing indicator
                    _a.sent();
                    spotifyApi.setAccessToken(accessToken);
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 9, , 11]);
                    return [4 /*yield*/, spotifyApi.getMyTopTracks({ limit: 5 })];
                case 5:
                    topTracks = _a.sent();
                    trackList = topTracks.body.items
                        .map(function (track) { return "".concat(track.name, " by ").concat(track.artists[0].name); })
                        .join(', ');
                    return [4 /*yield*/, openai.chat.completions.create({
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are a creative prompt engineer who creates vivid, artistic prompts for image generation based on music taste.',
                                },
                                {
                                    role: 'user',
                                    content: "Create a detailed, artistic prompt for an image that represents this music taste: ".concat(trackList, ". \n          The image should be abstract and artistic, not literal. Focus on colors, moods, and emotions. \n          Keep the prompt under 100 words."),
                                },
                            ],
                            model: 'gpt-4',
                            temperature: 0.7,
                        })];
                case 6:
                    completion = _a.sent();
                    imagePrompt = completion.choices[0].message.content;
                    return [4 /*yield*/, openai.images.generate({
                            model: "dall-e-3",
                            prompt: imagePrompt,
                            n: 1,
                            size: "1024x1024",
                            quality: "standard",
                            style: "vivid",
                        })];
                case 7:
                    imageResponse = _a.sent();
                    imageUrl = imageResponse.data[0].url;
                    embed = new discord_js_1.EmbedBuilder()
                        .setTitle("\uD83C\uDFA8 ".concat(interaction.user.username, "'s Music Visualization"))
                        .setDescription("*\"".concat(imagePrompt, "\"*"))
                        .setImage(imageUrl)
                        .setColor('#1DB954')
                        .setFooter({ text: 'Generated with Spotify & OpenAI DALL-E' })
                        .setTimestamp();
                    return [4 /*yield*/, interaction.editReply({ embeds: [embed] })];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 11];
                case 9:
                    error_5 = _a.sent();
                    console.error('Image generation error:', error_5);
                    errorMessage = 'An error occurred while generating your image.';
                    if (error_5.statusCode === 401) {
                        errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
                    }
                    else if (error_5.statusCode === 429) {
                        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
                    }
                    return [4 /*yield*/, interaction.editReply({
                            content: errorMessage,
                            ephemeral: true,
                        })];
                case 10:
                    _a.sent();
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/];
            }
        });
    });
}
// OAuth callback endpoint
app.get('/api/auth/callback', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, code, state, data, access_token, error_6;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.query, code = _a.code, state = _a.state;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, spotifyApi.authorizationCodeGrant(code)];
            case 2:
                data = _b.sent();
                access_token = data.body.access_token;
                // Store the token (in production, use a proper database)
                userTokens.set(state, access_token);
                res.send('Successfully connected! You can close this window and return to Discord.');
                return [3 /*break*/, 4];
            case 3:
                error_6 = _b.sent();
                console.error(error_6);
                res.status(500).send('An error occurred during authentication.');
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Start the server
var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
    console.log("Server running on port ".concat(PORT));
});
// Login to Discord
client.login(process.env.DISCORD_TOKEN);
