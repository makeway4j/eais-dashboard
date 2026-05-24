# Homelab Context

This project lives inside James's `C:\JCW_3` homelab workspace and should follow the root `C:\JCW_3\CLAUDE.md` operating model.

## Relevant Topology

- Primary operator: James in Prosper, TX.
- Primary interface: VS Code plus Claude Code terminal sessions.
- Automation preference: set-it-and-forget-it, with verified output at each stage.
- Destructive actions require confirmation.
- Root gateway: Proxmox at `192.168.5.77`.
- Jarvis/OpenClaw: VM 106 at `192.168.5.152`.
- Creative workstation: CT 301 at `192.168.5.156`.
- Kora GPU inference node: VM 302 at `192.168.5.157`.
- Paperclip multi-agent org: CT 303 at `192.168.5.158`.
- Joplin server: CT 111 at `192.168.5.153`.

## Directly Relevant Root TODO

The root homelab context has this active item:

```text
Upgrade morning digest brief.py to HTML email via Gmail SMTP (styled like Google "Your day ahead")
```

No `brief.py` file was found under `C:\JCW_3` during setup on 2026-05-24, so this project should be treated as the clean successor unless that script is later found on another host.

## Local Project Implications

- Default sending path should be Gmail SMTP first.
- The first real template direction should be a polished "Your day ahead" style morning briefing.
- The scheduled run should be 6:00 AM local time.
- Every setup step should include a verification command and output.
- The core digest should remain reliable before adding LinkedIn, X/Twitter, or job recommendation modules.

## Future Host Decision

The current Windows project can generate and test the digest locally. Before enabling long-running production automation, choose one:

- Run on this Windows machine with Task Scheduler.
- Move to a Linux homelab host, likely CT 301 if it is intended for general creative/media services.
- Integrate with Jarvis on VM 106 if the digest should become part of the Telegram/Joplin memory loop.

Do not move or deploy to a homelab host without confirming the target and taking a snapshot or backup when appropriate.
