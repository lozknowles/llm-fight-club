# Deployment

The qualified deployment has four user services on hpubuntu: application, speech router, natural TTS and Flite fallback. Apache on the public web host proxies one unlisted path prefix to the application over Tailscale with a long synthesis timeout.

Copy `systemd/*.service` to `~/.config/systemd/user/`, create `.run-v2/service.env` from the example, then run `systemctl --user daemon-reload` and enable the four units. Validate each private health endpoint before changing Apache.

The Apache example deliberately uses `UNLISTED_PATH`; keep the actual route out of public source. Back up the active vhost, insert the route only inside the LozKnowles HTTPS virtual host, run `apachectl configtest`, reload, and verify the exact public page plus the absence of that route from the homepage.

An unlisted URL provides discoverability reduction, not access control. Add authentication and request limits before wider release.
