# Configuration and optional keys

**The basic local-model + Flite setup needs no API keys.** The tracked [.env.example](../.env.example) contains blank credential fields. A real key belongs in your private local configuration, never in a tracked file or the browser.

## Save the settings once

Use Node 24 LTS for the commands below. From the repository directory on Linux/WSL:

```bash
cp .env.example .env.local
chmod 600 .env.local
nano .env.local
git check-ignore .env.local
```

On PowerShell, copy and open the template with:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
git check-ignore .env.local
```

Both ignore checks should print `.env.local`. Only `.env.example` is allowed through the existing `.env.*` ignore rule. Keep backups and copies containing secrets outside the repository; renaming a secret file to a name outside that pattern does not make it safe to commit. Never use `git add -f` for local secrets.

For the key-free setup, leave all credentials blank and start each service in its own Linux/WSL terminal:

```bash
node --env-file=.env.local flite-service.mjs
node --env-file=.env.local speech/speech-router.mjs
node --env-file=.env.local server-spoken.mjs
```

Run these as three separate long-running commands, not pasted into a single waiting terminal. They replace the inline environment prefixes in the [installation guide](INSTALLATION.md). The model server must already be running. The Flite platform limitations still apply.

## Add an optional speech provider

Edit the existing `.env.local` in your local editor. Obtain the key through your provider account and paste it directly into the matching field; do not paste it into an issue, chat, screenshot or shell command. Save and restart the speech router. Existing exported OS variables take precedence over Node's env file, so a blank file field does not clear an inherited key.

| Optional feature | Fields to fill | Then select in Studio |
| --- | --- | --- |
| OpenAI speech | `OPENAI_API_KEY` | A `LIVE_FAST: OpenAI` voice. |
| ElevenLabs speech | `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_MAP` | A `PREMIUM: ElevenLabs` voice. |
| Local Flite speech | None | Explicit AWB, SLT and optionally RMS voices. |
| Recorded Voice Lab voices | Separate worker, access controls and consent setup in [VOICE-LAB.md](../VOICE-LAB.md) | Only an accepted, explicitly opted-in profile. |

For ElevenLabs, use real voice IDs available to your account. This is a shape example only, not a usable mapping:

```dotenv
ELEVENLABS_VOICE_MAP={"eleven-interviewer":"YOUR_INTERVIEWER_VOICE_ID","eleven-guest":"YOUR_GUEST_VOICE_ID","eleven-host":"YOUR_HOST_VOICE_ID"}
```

The default template uses `{}` until you configure it. Voice IDs are not API keys, but they must be valid. Preview each selected voice before starting a show. Cloud synthesis may incur provider charges and sends the spoken text to that provider.

These keys enable **speech synthesis**. They do not turn the dialogue model dropdown into direct Grok, ChatGPT, Claude or Gemini API integrations. The current dialogue router has no API-key header support; use a compatible server-side gateway or implement a suitable adapter for a secured model endpoint.

## Keep keys in the service that needs them

For optional paid speech, move `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_MAP` and `ELEVENLABS_TTS_MODEL` into a separate private `.env.speech.local`. Leave the shared `.env.local` credential fields blank. On Linux/WSL protect the new file with `chmod 600 .env.speech.local`, and check `git check-ignore .env.speech.local`. Start only the speech router with both files:

```bash
node --env-file=.env.local --env-file=.env.speech.local speech/speech-router.mjs
```

The other services continue using only `.env.local`. Node loads these settings into the process environment at startup; an env file is not a secret vault. No global/user-level environment variables are required. Use your service manager's protected secret injection for a managed deployment.

To disable optional keys, stop the router, remove the values from its private file and clear any corresponding inherited variables in the launch terminal, then restart. On Linux/WSL use `unset OPENAI_API_KEY ELEVENLABS_API_KEY`; on PowerShell use `Remove-Item Env:OPENAI_API_KEY,Env:ELEVENLABS_API_KEY -ErrorAction SilentlyContinue`. These affect that terminal, not other applications' saved configuration.

## Before pushing changes

```bash
git check-ignore .env.local .env.speech.local
git diff --cached --name-only
git ls-files '.env*'
```

The only tracked environment file should be `.env.example`. Do not share configuration dumps, full process environments, raw provider headers or secret-bearing logs. If a real key has already been committed, revoke/rotate it with the provider; removing the current line does not remove it from Git history.
