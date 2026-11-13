# Challenge content review

Reviewed 25 challenges, including the hidden rollback activity.

Questions and format guidance now appear together above flag entry. Existing answers are preserved; the exact singular FortiPAM menu label is also accepted. Hint costs and screenshots are preserved.

## Rules of Engagement

**Flag question:** Have you read and agreed to the workshop rules?

**Review:** Replaced unrelated electrical-grid and website-cloning language with the actual brewery scenario. Kept the full introduction visible.

**Evidence:** The existing introduction explicitly specifies the acknowledgment I understand.

## Interface

**Flag question:** Are you ready to start the workshop?

**Review:** Updated obsolete top-navigation and yellow-border descriptions; retained full CloudShare guidance and every screenshot.

**Evidence:** Original activity explicitly specifies the acknowledgment I'm ready.

## Creating the PLC

**Flag question:** What CPU model is configured for PLC_1 in TIA Portal?

**Review:** Distinguishes model name from order number and project name.

**Evidence:** TIA_Portal_DoubleClick_DeviceConfiguration.jpg visibly labels PLC_1 [CPU 1511-1 PN].

## Attacker - Gaining Access

**Flag question:** Which loaded Adaptix BOF group provides the whoami command?

**Review:** Kept the objective; explicit suffix prevents format guessing.

**Evidence:** Full guide opens Script Manager, displays loaded BOF groups, and shows whoami. Its existing flag prompt requires the -BOF suffix.

## Attacker - Elevating Privilege

**Flag question:** What task name does the Adaptix beacon console record when you obtain the Domain Administrator process token?

**Review:** The menu says steal token, but grading expects the command/task token steal. Question now explicitly asks for console order.

**Evidence:** The guide explicitly says the console can use token steal PID and explains Local Admin → High Integrity → Domain Admin token impersonation.

## Attacker - Lateral Movement

**Flag question:** What is the OT domain controller's domain-qualified computer account?

**Review:** Existing session screenshots show SYSTEM, whereas the accepted flag is the computer account. Reframed question to avoid confusing these identities.

**Evidence:** GettingIntoDCOT.jpg and SessionGraph_With_AllDevices_OT.jpg show SYSTEM on DC-OT-01. Console_Typing_WhoAmI.jpg establishes EXNOT as the short domain name; the original answer format supplies the computer-account suffix.

## Attacker - Dropping Malware on Share

**Flag question:** What file size does Adaptix report after uploading vpn_launcher.zip to the OT VPN share?

**Review:** Names the precise file and measurement source; preserves the existing units used for grading.

**Evidence:** Upload_Beacon_To_Share.jpg explicitly reports Agent called server, sent [9.59 Mb].

## Defender - Defending the Endpoint

**Flag question:** Which Detection Engine is shown in the header of the AdaptixC2 beacon alert?

**Review:** Corrected first-hint location from Detection Details to the header; the former only shows Static and could lead to an incorrect flag.

**Evidence:** SentinelOne_Beacon_PurpleAI.jpg shows Detection Engine: On-Write Static AI in its header; SentinelOne_Beacon_DetectionDetails.jpg only shows Detection Type: Static.

## Defender - Confusing the attackers

**Flag question:** Which Addressing Mode is selected for the OT decoy's deployment network?

**Review:** Uses the exact field label shown in the UI.

**Evidence:** Create_Decoy_2.jpg visibly shows Addressing Mode with Static selected and DHCP unselected.

## Defender - Protecting decoy with FG

**Flag question:** Which integration method did you select in FortiDeceptor's Quarantine Integration configuration?

**Review:** The displayed label uses a space; the existing accepted flag uses a hyphen. Explicit format avoids guesswork without changing grading.

**Evidence:** Full guide says to select FortiGate Webhook. Existing accepted flag is fortigate-webhook.

## Attacker - Hack the PLC

**Flag question:** What is the PLC's new IP address after the first lab-auto run from the original lab configuration?

**Review:** Fixed deterministic target: screenshot Script_Executed.jpg is a repeated run (.198), while grading expects the first run (.194). Guide says every run increments the original address. Parent should ensure benchmark reset/reference wording is acceptable.

**Evidence:** PLC_Name.jpg sets original IP 192.168.250.193. Full guide states the new IP is one higher and screenshot differs because of reruns. Guardian Alert_Overview.jpg and Alert2_Change_IP.jpg show first-run result .194.

## Defender - Defending OT attack

**Flag question:** What Type ID does Guardian show for the alert that reports the PLC IP-address change?

**Review:** Clarifies identifier location and differentiates Type ID from UUID.

**Evidence:** Alert_Overview.jpg visibly shows SIGN:DEV-STATE-CHANGE on the row whose description requests change of IP.

## Defender - Gain access to OT VPN

**Flag question:** Which file did SentinelOne detect when you launched the VPN application on the Windows 10 IT workstation?

**Review:** The existing guide and first hint identify the exact alert to inspect; no change to the accepted flag is needed.

**Evidence:** Full guide points to the workstation notification and On_W10_S1_Detected_VPNBeacon.jpg; first hint directs the student to its detected file name.

## Attacker - Gain Access to IT

**Flag question:** What DNS-server IPv4 address is configured on both DC-OT-01 and the Windows 10 IT workstation?

**Review:** Corrected objective: this activity starts from the existing IT workstation beacon and reaches the IT domain controller, rather than merely reaching the workstation.

**Evidence:** The first hint explicitly compares ipconfig /all on the OT domain controller and IT workstation; the full guide concludes with that same comparison.

## Attacker - Change DNS

**Flag question:** Does Set-DnsServerForwarder append to the existing forwarder list or overwrite it?

**Review:** A clear two-option question matches the existing one-word accepted answer. The before-and-after comparison is already available.

**Evidence:** First hint runs Get-DnsServerForwarder before and after the supplied change; DNS_Get_Before_Change.png and DNS_Get_After_Change.png provide the same evidence.

## Attacker - File exfiltration

**Flag question:** How many data chunks were used to transfer BlackoutToLockout_backup.info in this exercise?

**Review:** Names the exact artifact and excludes the much larger demonstration backup, which otherwise invites a wrong count.

**Evidence:** Full guide names BlackoutToLockout_backup.info and supplies the transfer/reassembly screenshots; first hint directs the student to count only this file’s chunks.

## Attacker - Ransomware

**Flag question:** What is the SHA-1 hash of the extracted danger_malware.exe file used in this exercise?

**Review:** The exact hash is not printed in the guide, but the first hint provides Get-FileHash and the guide supplies the extraction path. The student can calculate it from the provided lab file.

**Evidence:** Hint 1 specifies Get-FileHash -Algorithm SHA1; full guide identifies the exact EXE in the extracted gmtmX folder. The binary itself was not available for independent hash verification.

## Defender - Protect & Rollback

**Flag question:** After SentinelOne is switched to Protect and the instructor authorizes a retry, does the ransomware complete successfully?

**Review:** Kept this challenge hidden. The question now distinguishes the protected retry from the initial incident.

**Evidence:** Full guide explicitly switches Detect to Protect under instructor control and then asks the student to retry; first hint asks for the resulting outcome.

## Defender - FortiPAM creating secret

**Flag question:** Which launcher type does FortiPAM use to open your Engineering Station secret?

**Review:** Replaces the ambiguous jumpstation wording with the Engineering Station secret configured in this challenge.

**Evidence:** The student launches the newly created secret. FortiPAM’s playback screenshot in the following analysis activity also visibly identifies Launcher: Web RDP; the current guide instructs the student to observe the launcher during launch.

## Defender - FortiPAM Video Recording

**Flag question:** Which section under Log & Report contains the recorded FortiPAM secret sessions?

**Review:** Added the existing log-navigation screenshot so the answer can be found within this challenge. IMPORTANT: accepted answer is plural "secret events & videos", but the inspected menu screenshot says singular "Secret Event & Video". Recommend adding that exact singular label as an accepted alias; do not reject the visible UI label.

**Evidence:** Inspected FortiSRA_MenuOverview_SecretEventAndVideo.jpg: Log & Report > Secret Event & Video. The next guide also refers to an inner "Secret Events & Videos" area.

## Defender - FortiPAM Analysis

**Flag question:** What destination IPv4 address is shown for the Engineering Station in your recorded FortiPAM session?

**Review:** Removed the misleading instruction not to submit the target address: the accepted value is precisely the recorded destination. Aligned the question with a field visibly present in the provided screenshot.

**Evidence:** Inspected FortiSRA_watching_RecordedVideo.jpg: header explicitly shows Destination IP: 192.168.250.2, matching the accepted answer.

## Defender - FortiPAM Approval Flow

**Flag question:** Before you can launch an approval-protected secret, what must you send to an approver?

**Review:** Resolved a grading mismatch: the old question and first hint requested a prose sequence while the existing accepted answer is one word. The revised question tests the same approval workflow and fits that answer.

**Evidence:** Full guide repeatedly describes the participant’s request, admin approval, and relaunch. Existing accepted answer is request; no new flag needed.

## Defender Bonus - FortiPAM setup

**Flag question:** Which product initiates the outbound mTLS control-channel connection in this FortiPAM reverse-gateway setup?

**Review:** Clarified directionality and avoided the first hint’s confusing instruction to start at the listening FortiPAM service and trace an arrow toward FortiGate.

**Evidence:** Full guide states that the FortiGate reverse-connector establishes and maintains the outbound connection to the FortiPAM Reverse Service listener.

## Defender - Smart Polling

**Flag question:** Which Guardian feature uses active, device-specific queries to enrich the PLC asset information?

**Review:** Separates the feature name from the Siemens Step7 strategy, a plausible but incorrect response to the previous generic polling question.

**Evidence:** Guide explains passive discovery versus lightweight active queries, then creates and executes the feature’s plan using Siemens Step7; menu and plan screenshots name the feature.

## General - Feedback

**Flag question:** What worked well in the workshop, and what would you improve?

**Review:** Preserved the full feedback introduction, image, external form, and manual review. Makes the response box’s purpose clear instead of implying a secret flag.

**Evidence:** This challenge is manual/instructor approval with no fixed answer and links to the workshop feedback form.
