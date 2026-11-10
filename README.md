# Aternos 24/7 Hosting Bot

A Mineflayer bot with a small web dashboard. Use it only on a Minecraft server you own or are authorized to access, and follow the Minecraft server host's rules. A bot cannot prevent Aternos or another host from stopping a server under its own inactivity policy.

## Configure the bot

Before deployment, edit `settings.json` and replace the example server IP and port with your Minecraft server's actual address and port. Set a unique bot username. Do not commit real passwords or account credentials. For an AuthMe-style server login, set `utils.auto-auth.enabled` to `true` and provide `BOT_AUTH_PASSWORD` as a Render environment variable. The app reads `BOT_USERNAME`, `BOT_PASSWORD`, and `BOT_AUTH_PASSWORD` from the environment, overriding corresponding account credentials in `settings.json`.

The `bot-account.type` setting is `offline` for servers that explicitly allow offline-mode accounts. Use the authentication mode appropriate for your server; do not enable offline mode on a server that does not permit it.

## Deploy on Render

This repository includes a Render Blueprint (`render.yaml`) to configure the Node.js web service.

1. Push your configured repository to GitHub. Keep passwords out of `settings.json` and Git history.
2. Sign in at [Render](https://render.com) and choose **New → Blueprint**.
3. Connect the GitHub repository and select the branch containing `render.yaml`.
4. Review the Blueprint. It creates a web service with `npm ci` as the build command and `npm start` as the start command. Confirm creation.
5. In the Render service's **Environment** settings, enter values for any prompted secrets:
   - `BOT_USERNAME`: the bot's Minecraft username.
   - `BOT_PASSWORD`: only if the Minecraft account requires it.
   - `BOT_AUTH_PASSWORD`: only if the server uses an in-game `/login` or `/register` password.
6. Make sure `settings.json` contains the correct Minecraft server IP and port. Save and push changes to redeploy.
7. Wait for deployment. Open the Render service URL and check `/health` for status or `/ping` for a simple `pong` response. Check Render's **Logs** if the bot does not connect.
8. To reduce free-service sleeping, set an external uptime monitor such as UptimeRobot to request `https://YOUR-SERVICE.onrender.com/ping` periodically. This is not a guarantee of uninterrupted service and uses Render's available free instance hours. For reliable always-on operation, use a paid always-on service if appropriate.

Render provides `PORT` and `RENDER_EXTERNAL_URL` for the web service; do not manually set `PORT`. The app listens on Render's assigned port. The internal self-ping is not a substitute for an external monitor and cannot guarantee that a free service stays awake.

### Render service settings (if configuring manually)

- Runtime: **Node**
- Build command: `npm ci`
- Start command: `npm start`
- Health check path (optional): `/health`

## Run locally

Requires Node.js (use a current LTS release).

```sh
npm ci
npm start
```

Open `http://localhost:5000/` for the dashboard. The port can be changed with the `PORT` environment variable. To check syntax, run `npm test`.

## Dashboard endpoints

- `/` — status dashboard
- `/health` — JSON status and uptime
- `/ping` — responds `pong`
- `/tutorial` — setup page

## Notes

- Render's free web services can spin down after inactivity; external requests may reduce sleeping but do not provide an uptime guarantee.
- Aternos and other free Minecraft hosts may stop servers according to their own policies. This project cannot override those policies.
- Configure server versions and authentication to match your server. Only use the bot on private servers where you have permission.
- The project is not affiliated with Aternos, Mojang, Microsoft, or Render.
