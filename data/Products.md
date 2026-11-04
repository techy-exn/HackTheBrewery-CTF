---
title: "Products"
# old route: /Products
---

<br>
<br>

# Inventory: Attack and Defense Environments

<br>

## Overview

<br>

This document provides a detailed inventory of the infrastructure, tools, and cybersecurity components used in both attacker and defender environments involved in the simulated cyber operation targeting the fictional company.

<div class="purple">

Note: The **From Blackout To Lockout Workshop** is **modular** and **scalable**.

**Each session is unique**, as content is continuously updated, new tools are introduced, and defense activities are tailored based on audience interests and vendor selection.

</div>

<br>

The From Blackout To Lockout environment is hosted on our **CloudShare**.

<br>

---

<br>

## Security Vendors

<br>

The workshop leverages cybersecurity technologies from multiple industry-leading vendors.

### Fortinet
- FortiGate
- FortiPAM
- FortiDeceptor

### Nozomi Networks
- Guardian

### SentinelOne
- Singularity Platform (EDR/XDR)

<br>

---

<br>

## Defender Environment

<br>

**Role:** Protect internal infrastructure and detect/mitigate threats.

**Critical Asset:** Company Assets such as Windows Clients and Servers, Network, Identities and OT.

<br>

Some **cybersecurity tools** are deployed on-premises, while others are hosted in the cloud as Software-as-a-Service (SaaS) solutions.

<br>

<table border="1" cellpadding="5" cellspacing="0">
  <thead>
    <tr>
      <th style="min-width:200px;">Capability</th>
      <th>Solution</th>
      <th>Functionality</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Next-Generation Firewall</strong></td>
      <td>FortiGate</td>
      <td>Application control, IPS, Threat Protection, URL Filtering</td>
    </tr>
    <tr>
      <td><strong>Privileged Access Management</strong></td>
      <td>FortiPAM</td>
      <td>Control and monitor privileged RDP, SSH and web sessions</td>
    </tr>
    <tr>
      <td><strong>Deception Technology</strong></td>
      <td>FortiDeceptor</td>
      <td>Decoys and traps to lure, detect and analyze attackers</td>
    </tr>
    <tr>
      <td><strong>OT Security</strong></td>
      <td>Nozomi Guardian</td>
      <td>Industrial/OT network visibility and threat detection</td>
    </tr>
    <tr>
      <td><strong>Endpoint Detection & Response</strong></td>
      <td>SentinelOne Singularity</td>
      <td>Endpoint protection, detection, response and threat hunting</td>
    </tr>
  </tbody>
</table>

<br>

---

<br>

## Attacker Environment: "Hackers on the Internet"

**Primary Platform:** Kali Linux

**Objective:** Compromise the infrastructure of **From Blackout To Lockout** and its employees.

**Target:**    
- **Victim Profile:** System Administrator (Windows and Server admin duties)


<br>


<table border="1" cellpadding="5" cellspacing="0">
  <thead>
    <tr>
	  <th style="min-width:200px;">Tools / Utilities</th>
      <th>Functionality</th>
    </tr>
  </thead>
  <tbody>
    <tr>
    <tr>
      <td><strong>Adaptix C2</strong></td>
      <td>Command and control framework for persistence and covert access</td>
    </tr>
  </tbody>
</table>

<br>
