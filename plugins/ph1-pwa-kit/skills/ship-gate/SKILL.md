---
name: ship-gate
description: Ship gate - show its status, or (only when the person types it) skip it until the next code change, turn it off or on, or let the next commit or push past the secret and file scan (allow-secret).
argument-hint: "[status | skip | off | on | allow-secret]"
disable-model-invocation: true
---
The person typed: /ph1-pwa-kit:ship-gate $ARGUMENTS

- If that is empty or "status": call the `mcp__ph1-pwa-kit__ship_gate_status` tool and show its answer exactly as written.
- If it is "skip", "off", "on" or "allow-secret": call the `mcp__ph1-pwa-kit__ship_gate_change` tool with that `action`, and show its answer exactly as written. A permission prompt may ask the person to confirm; that's expected.

Load the tool with ToolSearch first if it isn't loaded. Do nothing else. Never call ship_gate_change unless the person typed this command.
