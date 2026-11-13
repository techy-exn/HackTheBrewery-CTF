---
title: "Fortinet"
---

# Fortinet

Fortinet appears at three distinct points in the defender story: network boundaries, a deception target, and controlled privileged access. These are separate products with different jobs. In this lab, the OT FortiGate also acts as the reverse gateway for FortiPAM.

### FortiGate IT edge and OT firewall

![Official FortiGate product icon](/logos/fortigate-product.svg)

The IT edge FortiGate sits between the external attacker side and the IT network. The OT FortiGate separates IT from OT, so permitted routes into OT pass through a defined boundary. In the decoy exercise, the OT firewall can quarantine the attacker IP after FortiDeceptor reports an interaction. It also provides the reverse-gateway path used by FortiPAM.

[Explore FortiGate on Fortinet](https://www.fortinet.com/products/next-generation-firewall)

### FortiDeceptor

![Official FortiDeceptor product icon](/logos/fortideceptor-product.svg)

FortiDeceptor places a decoy in the OT environment. An interaction with that decoy is useful evidence because a legitimate workflow should not need it. Defenders create the decoy, review its alert, then connect the event to a FortiGate containment response.

[Explore FortiDeceptor on Fortinet](https://www.fortinet.com/products/fortideceptor)

### FortiPAM

![Official FortiPAM product icon](/logos/fortipam-product.svg)

FortiPAM stores a privileged connection as a managed secret and controls who may launch it. In this workshop the FortiPAM appliance is inside OT, while FortiGate OT acts as its reverse gateway. Participants observe approval and session recording as an authorized user reaches the Engineering Station and, through that workstation, the PLC.

[Explore FortiPAM on Fortinet](https://www.fortinet.com/products/fortipam)
