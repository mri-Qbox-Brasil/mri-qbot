# MRI QBot - OAuth2 Implementation Guide

The MRI QBot includes a built-in OAuth2 service that allows external applications to authenticate users via Discord and verify their membership/permissions in a specific guild.

## How it Works

1. **Client Redirect**: Your application redirects the user to the bot's login endpoint.
2. **Discord Authorization**: The user authorizes your Discord Application.
3. **Bot Processing**: The bot receives the authorization code, fetches user data, and checks guild membership.
4. **Token Issuance**: The bot generates a JWT (JSON Web Token) containing user and guild info.
5. **Final Redirect**: The bot redirects the user back to your application with the JWT.

---

## Configuration

Ensure the following variables are set in your `.env` file:

| Variable | Description |
| :--- | :--- |
| `CLIENT_ID` | Your Discord Application Client ID. |
| `CLIENT_SECRET` | Your Discord Application Client Secret. |
| `REDIRECT_URI` | The callback URL registered in the Discord Developer Portal (e.g., `http://your-bot-domain.com/auth/callback`). |
| `JWT_SECRET` | A secret key used to sign the tokens. |
| `SERVER_PORT` | The port where the OAuth2 server will run (default: 3000). |

---

## API Endpoints

### 1. Start Login
**Endpoint:** `GET /auth/login`

Redirect your users to this URL to start the authentication flow.

**Query Parameters:**
- `guild_id` (Required): The ID of the Discord Server you want to verify membership for.
- `redirect_uri` (Required): Where the bot should send the user after successful authentication.

**Example:**
`http://localhost:3000/auth/login?guild_id=123456789&redirect_uri=http://localhost:5173/dashboard`

---

### 2. Verify Token (Optional)
**Endpoint:** `GET /auth/verify`

Useful for verifying if a JWT is still valid from your backend.

**Headers:**
- `Authorization`: `Bearer <YOUR_JWT_TOKEN>`

---

## Implementation Example

### Client-Side (Frontend)

To initiate the login, simply redirect the user:

```javascript
const loginToDiscord = () => {
    const botUrl = "http://localhost:3000/auth/login";
    const myGuildId = "YOUR_GUILD_ID";
    const myRedirectApp = "http://localhost:5173/auth-success";
    
    window.location.href = `${botUrl}?guild_id=${myGuildId}&redirect_uri=${encodeURIComponent(myRedirectApp)}`;
};
```

### Handling the Result

After the flow, the user will be redirected to:
`http://localhost:5173/auth-success?token=eyJhbGci...`

You can then extract and decode the token:

```javascript
// Example using 'jwt-decode' library
import jwt_decode from "jwt-decode";

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
    const decoded = jwt_decode(token);
    console.log("User Info:", decoded.user);
    console.log("Guild Permissions:", decoded.guild);
    
    // Schema of 'decoded':
    // {
    //   user: { id, username, avatar, discriminator },
    //   guild: { id, isMember, isAdmin, roles, permissions }
    // }
}
```

---

## Security Notes

> [!WARNING]
> Always store your `JWT_SECRET` securely and never expose it on the frontend.
> The JWT issued by the bot has a default expiration of **2 hours**.
