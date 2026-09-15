# Install LLM Fight Club and run your first show

This guide targets the current `server-spoken.mjs` Studio (package 1.2.0). It uses one local model and the bundled basic Flite speech service. Two characters can share the model; their roles, personalities and voices remain separate.

The source contains deployment scripts with the maintainer's `/fast/...` paths and private network addresses. The commands below do not depend on those scripts. They do not install Agent Control or change an existing hosted deployment.

## 1. Prerequisites

Use Ubuntu/Linux, or Ubuntu inside Windows WSL2 for the complete basic audio setup. On Windows, install WSL/Ubuntu using [Microsoft's WSL instructions](https://learn.microsoft.com/windows/wsl/install), then run the Linux commands in the Ubuntu terminal. If installation is blocked on a managed PC, use a machine on which you can install software.

- Install a current supported Node.js LTS from [Node.js downloads](https://nodejs.org/en/download), using its Linux instructions inside WSL. This package declares Node.js >=20; Node 24 is the runtime used for the documentation checks.
- Install Git, curl and FFmpeg on Ubuntu:

  ```bash
  sudo apt update
  sudo apt install -y git curl ffmpeg
  ```

- Use a current browser with audio playback. A microphone is optional.
- Allow disk space and memory for your chosen model as well as saved audio. A GPU can improve model response times; no universal GPU/RAM minimum is claimed. The example model is a small starting point, not a performance guarantee.

Check the tools:

```bash
git --version
node --version
npm --version
ffmpeg -hide_banner -filters 2>/dev/null | grep flite
ffmpeg -hide_banner -encoders 2>/dev/null | grep libmp3lame
test -x /usr/bin/ffmpeg && echo 'Flite executable path OK'
```

Both FFmpeg checks should show a matching entry. The bundled Flite service invokes `/usr/bin/ffmpeg` directly, which is why this guide uses Linux/WSL. Installing a Windows FFmpeg executable alone does not satisfy it.

## 2. Get the project

```bash
git clone https://github.com/lozknowles/llm-fight-club.git
cd llm-fight-club
npm test
```

If GitHub asks you to authenticate, use an account with repository access. A private repository cannot be cloned anonymously. There are no declared npm dependencies, so no `npm install` or frontend build is needed for this checkout. Do not use `npm start` for this guide: it launches the older `server.mjs` demo.

## 3. Prepare a local model

If you already run a compatible chat-completion server, skip the Ollama installation and substitute its model ID and base URL in step 5. The base URL must end in `/v1`; the app appends `/chat/completions`.

For a new local setup, install [Ollama for Linux](https://docs.ollama.com/linux). Its documented installer can be downloaded and reviewed before running:

```bash
curl -fsSL https://ollama.com/install.sh -o /tmp/llm-fight-club-ollama-install.sh
less /tmp/llm-fight-club-ollama-install.sh
sh /tmp/llm-fight-club-ollama-install.sh
```

Press `q` to leave `less` after reviewing the installer. If Ollama is not already running, run `ollama serve` in another terminal and leave it open. Do not start a second server if port 11434 is already occupied by Ollama. In WSL, keep the model and app in the same Linux environment for this walkthrough. Then download the example model:

```bash
ollama pull qwen2.5:3b
ollama list
curl --fail-with-body http://127.0.0.1:11434/v1/models
```

Confirm actual generation, using the same request shape as the app:

```bash
curl --fail-with-body http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5:3b","messages":[{"role":"system","content":"Reply briefly."},{"role":"user","content":"Give one argument for a village biscuit committee."}],"temperature":0.82,"max_tokens":220,"chat_template_kwargs":{"enable_thinking":false}}'
```

Expect non-empty text under `choices[0].message.content`. This checks your particular backend/version before introducing the app. Ollama documents [OpenAI API compatibility](https://docs.ollama.com/api/openai-compatibility); model details and terms are on the [Qwen2.5:3b page](https://ollama.com/library/qwen2.5:3b). Downloaded models are separate from this repository.

The current `ModelRouter` sends no API authorisation header. Direct paid endpoints requiring a key, and non-compatible APIs, need a server-side gateway or adapter work; adding a provider name to the menu alone will not connect them.

## 4. Start basic speech (two terminals)

Open two terminals in the cloned `llm-fight-club` directory. Keep both processes running.

**Terminal A — Flite voice generation:**

```bash
FLITE_HOST=127.0.0.1 FLITE_PORT=18774 node flite-service.mjs
```

**Terminal B — speech router:**

```bash
SPEECH_ROUTER_HOST=127.0.0.1 SPEECH_ROUTER_PORT=18772 \
FLITE_TTS_URL=http://127.0.0.1:18774 \
node speech/speech-router.mjs
```

Flite must use **18774** here. Its own default is 18772, which would clash with the router. These services use CPU speech synthesis; you do not need a neural voice model or a paid speech key for this path.

The router is required because the app uses `/tts/stream`; the raw Flite service only implements `/synthesize`. Do not point the app straight at Flite.

## 5. Start the Studio (third terminal)

In another terminal in the repository:

```bash
FIGHT_CLUB_MODEL_ROUTES='{"qwen2.5:3b":"http://127.0.0.1:11434/v1"}' \
FIGHT_CLUB_SPEECH_URL=http://127.0.0.1:18772 \
HOST=127.0.0.1 PORT=18770 \
node server-spoken.mjs
```

Open **http://127.0.0.1:18770/audio.html**. The page title is currently **Spoken AI Studio**. Opening `/` selects a different show surface; use the explicit `/audio.html` path for this walkthrough.

The model dropdown should contain `qwen2.5:3b`. Route keys are sent upstream as model IDs: use exact IDs accepted by your backend, not arbitrary display names. To add more models, download them first and add their exact IDs and base URLs to the JSON route map, then restart the app.

### Service checks

In a spare terminal:

```bash
curl --fail-with-body http://127.0.0.1:18774/health
curl --fail-with-body http://127.0.0.1:18772/voices
curl --fail-with-body http://127.0.0.1:18770/api/health
curl --fail-with-body http://127.0.0.1:18770/api/config
curl --fail-with-body http://127.0.0.1:18770/tts/voices
```

The app health response should say `status: ok`; config should list your model. Health/catalog responses alone do not prove synthesis or model generation. Check speech through the app:

```bash
curl --fail-with-body http://127.0.0.1:18770/tts/stream \
  -H 'Content-Type: application/json' \
  -d '{"voice":"awb","text":"Welcome to LLM Fight Club.","profile":"LIVE_FAST"}' \
  -o /tmp/llm-fight-club-voice-check.wav
ffprobe -v error -show_entries format=duration /tmp/llm-fight-club-voice-check.wav
```

Expect a WAV with a positive duration. The router's full health response may report unconfigured optional providers as unavailable; only the chosen provider needs to work.

## 6. Your first debate

1. Select **DEBATE**, **SATIRICAL**, four turns and **Text + voice**. Leave the referee off for this first run.
2. Enter: **Every village should have a Minister for Biscuits.**
3. Choose `qwen2.5:3b` for both participants and different personalities. This first show compares characters, not two different models.
4. Explicitly choose **FALLBACK: Flite — AWB** for the first voice and **FALLBACK: Flite — SLT** for the second. Use RMS if you later add a referee. Click each **Preview** button.
5. Start with **Docile** Conversation Heat, then click **START DEBATE**. After a successful short run, try higher heat and an audience comment using **Throw a Grenade**.
6. Let the show finish and download the JSON/Markdown transcript and generated audio from the conversation controls.

The default voice selections are cloud voices; their presence in the menu does not mean they are configured. Version 1.2.0 deliberately rejects silent voice substitution. Select Flite yourself for this guide. Voices must be distinct even when sharing a model.

**Text only** skips synthesis during turns, but the page still fetches the voice catalog on startup and still requires distinct participant voice selections. Keep the router running. Generated speech plays at normal speed after generation; slower models can produce noticeable pauses. Heat, interventions and directing can make additional model calls.

## 7. Save, stop, restart and update

By default the app writes conversation JSON to `.data-v2/conversations/` and audio under `.data-v2/audio/`. JSON/Markdown exports work without recorded audio. WAV exports require synthesized turns; the combined MP3 requires FFmpeg with `libmp3lame` and is assembled after completion or stopping a show with recorded audio. Interrupted turns may not retain a full WAV.

Use the in-page stop control before shutting down an active show. Press **Ctrl+C** in each app/speech terminal. Stop a manually started `ollama serve` separately if you want to; the OS-managed Ollama service has its own lifecycle. Restart with the same commands and data directory. Saved records reload, but do not assume an interrupted live show resumes automatically.

To keep data elsewhere, add `FIGHT_CLUB_DATA_DIR=/absolute/private/path` to the app command. Back up that directory while the app is stopped. Do not commit it to Git or delete it to troubleshoot startup.

To update a clean checkout:

```bash
git status --short
git pull --ff-only
npm test
```

Review or preserve your own changes first if status is not empty. Read release notes before restarting. Existing deployment scripts are examples for the maintainer's machines, not a generic upgrade installer.

## Optional voice upgrades and native desktop use

To save the settings or add optional speech keys, follow [Configuration and optional keys](CONFIGURATION.md). It provides the blank `.env.example`, ignored local files and exact Node `--env-file` startup commands. No paid key is required for the basic setup; `.env` files are not automatically loaded by the inline commands above. OpenAI and ElevenLabs speech can incur charges; ElevenLabs also needs a voice-ID map. Keep secrets out of browser code and Git.

For Qwen3-TTS and OmniVoice, read [speech documentation](../speech/README.md), [OmniVoice qualification](../OMNIVOICE-QUALIFICATION.md) and the installer/service files before adapting paths and resource settings. These are advanced, separately provisioned runtimes. The historical automatic fallback description in speech notes does not override the Studio's current refusal to silently change an explicit voice.

[Voice Lab](../VOICE-LAB.md) is optional, disabled by default, and requires its own worker/configuration and consent process. It is not needed for this tutorial. Do not enable recorded voices for an anonymous deployment.

On native Windows/macOS, you can run the Node app against existing reachable model and speech services. For example, PowerShell uses `$env:FIGHT_CLUB_MODEL_ROUTES='{"model-id":"http://model-host:port/v1"}'`, `$env:FIGHT_CLUB_SPEECH_URL='http://speech-host:port'`, then `node server-spoken.mjs`. Replace every placeholder with a configured service. This is not a complete native Flite setup; use the Linux/WSL route above for that.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Clone says repository not found | Verify the URL and your GitHub access. Private source requires permission. |
| `node` missing or unsupported | Install Node LTS inside the environment running the app, then reopen its terminal. |
| `EADDRINUSE` | One of the example ports is already occupied. Use unused ports and update every matching URL; do not kill an unrelated service. |
| Empty or broken setup controls | Check `/api/config` and `/tts/voices`; the page needs both at startup, including in Text only mode. |
| Model 404 or connection refused | Run the direct model request in step 3. Check its exact model ID, port and `/v1` base URL. |
| Model 401/403 | The model router does not send API credentials. Configure a suitable server-side gateway rather than putting a key in the browser. |
| Selected voice unavailable | Choose explicit AWB/SLT/RMS for the basic path. Cloud and neural voices require their own backends. |
| `/tts/stream` fails but Flite is healthy | Ensure the app points to the router on 18772, and the router points to Flite on 18774. |
| `ffmpeg` missing or `No such filter: flite` | Verify `/usr/bin/ffmpeg` and use a build with libflite. A health response alone does not check synthesis. |
| Silent playback | Click Preview, check the browser's autoplay/site sound setting, system volume and audio device. Try Text only to isolate playback. |
| WAV works, MP3 missing | Finish/stop after a recorded turn; check FFmpeg's `libmp3lame` encoder and the app console. |
| Long pauses or generation timeout | Try four turns, Docile heat and a smaller/faster model. Confirm your server can answer the direct request within the router's 90-second timeout. |
| Phone cannot reach the page | Loopback is intentionally local to the machine. Remote access needs a separately configured authenticated HTTPS deployment. |

## Scope of verification

These instructions were checked against the 1.2.0 source and official Ollama documentation. The documentation refresh exercises the local speech path and app APIs with a stub model; it does not claim a fresh model download, real Ollama conversation, native Windows audio qualification or physical phone test. Run the generation request and first show above to qualify your own model and browser.
