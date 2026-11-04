---
title: "Windows10"
hidden: true
# old route: /Windows10
---

When you are using a Windows 10, you need to get system level privileges. For this we will just run a command, getsystem token
 
Inside the console you will see that the Adaptix Client is getting the system token and will also provide you with the output if it failed or succeeded
 
Important is that you will see a change in your session table. There you will see that you now have system privileges
 
Verify again with whoami
 
Also in the privileges we see that we have more privileges:
 
This gives us enough priveleges to steal the token of the domain admin.
