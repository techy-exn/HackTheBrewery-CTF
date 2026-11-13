---
title: "Adaptix C2"
---

# Adaptix C2

Adaptix C2 is the attacker-side command-and-control framework in this isolated lab. The Kali machine hosts the operator tooling, while a beacon on a lab endpoint creates a session that participants can inspect. The session graph helps connect actions to the Windows systems reached during the exercise.

### Adaptix C2 framework

![Official Adaptix C2 project mark](/logos/adaptix-official.png)

The framework has a server that receives the lab beacons and a client that lists their sessions. You will use the authorized sessions to observe the initial foothold, later movement, and files transferred between assigned machines. The workshop also loads prepared extensions and Beacon Object Files (BOFs), which add tasks to the operator console. Use only the supplied lab hosts and files.

[Visit the official Adaptix C2 project](https://github.com/Adaptix-Framework/AdaptixC2)
