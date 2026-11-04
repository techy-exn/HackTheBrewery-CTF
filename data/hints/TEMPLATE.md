---
# Copy this file next to your challenge, into a hints/ folder, e.g.
#   data/3. Private App/hints/3.1 Walkthrough.md
# then link it from the challenge's front matter:
#   hint: hints/3.1 Walkthrough.md
#   hint_cost: 25
# Files in hints/ folders are never imported as challenges.
title: Step-by-step walkthrough    # shown on the hint before it is unlocked
cost: 25                           # used when the challenge sets no hint_cost
---

**What you are aiming for:** one sentence on the end state.

1. Go to `Settings > Security Cloud Platform > App Definition`.

   ![App definition page](/images/new_private_app.jpg)

2. Click **New Private App** and fill in:
    - Name: `ZTNA-Publisher-X`
    - Access method: `Client`

3. Check the result:

   ```bash
   ssh admin@<PUBLISHER-IP-ADDRESS>
   ```

> **Tip:** callouts like this one stand out from the steps.
