---
title: Home
---
<!--
=====================================================================
  HOME PAGE - edit this file to change what participants see at /

  Publish after saving:
      docker compose exec app python manage.py sync-content

  - Plain Markdown works outside the <section> blocks below.
  - Inside an HTML block do NOT leave empty lines (an empty line ends the
    block and Markdown takes over again).
  - Each "buttons" marker line is replaced by the Start / Sign in buttons.
  - Images: put them in data/images and use /images/<file name>.
  - Colours: var(--ns-orange) is the Exclusive Networks purple,
    var(--ns-navy) the dark surface, var(--ns-blue) the EXN blue.
=====================================================================
-->

<style>
  .htb-logo { display: block; height: 34px; width: auto; margin-bottom: 1.5rem; }
  .ns-journey {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
    gap: 1rem;
    counter-reset: ns-step;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ns-journey li {
    background: #fff;
    border: 1px solid rgba(43, 11, 38, 0.08);
    border-top: 3px solid var(--ns-orange, #a4027d);
    border-radius: var(--ns-radius, 0.75rem);
    padding: 1.25rem 1.1rem 1.1rem;
    box-shadow: var(--ns-shadow, 0 6px 18px rgba(43, 11, 38, 0.08));
    text-align: left;
  }
  .ns-journey li::before {
    counter-increment: ns-step;
    content: counter(ns-step);
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--ns-orange, #a4027d);
    color: #fff;
    font-weight: 700;
    margin-bottom: 0.7rem;
  }
  .ns-journey__title { display: block; font-weight: 700; color: var(--ns-navy, #2b0b26); margin-bottom: 0.3rem; }
  .ns-journey__text { display: block; color: var(--ns-grey, #5b6770); font-size: 0.92rem; line-height: 1.55; }
  [data-bs-theme="dark"] .ns-journey li { background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.1); border-top-color: var(--ns-orange, #a4027d); }
  [data-bs-theme="dark"] .ns-journey__title { color: #fff; }
  [data-bs-theme="dark"] .ns-journey__text { color: rgba(255, 255, 255, 0.72); }
</style>

<section class="ns-hero">
  <div class="container">
    <img class="htb-logo" src="/images/brand/exn-horizontal-white.png" alt="Exclusive Networks">
    <div class="ns-hero__eyebrow">
      <span class="ns-pulse"></span>
      OT/IT Red &amp; Blue Teaming &middot; Hands-on Lab
    </div>
    <h1 class="ns-hero__title">Hack the <span class="ns-accent">Brewery</span></h1>
    <p class="ns-hero__lead">
      A brewery's production line is under attack. Play the attacker from the first foothold in
      IT to a stopped PLC on the brewing floor, then switch sides: detect, contain and recover
      with Fortinet, Nozomi Networks and EDR. Every step ends with a question that proves you did it.
    </p>
    <div class="ns-hero__actions">
<!-- buttons -->
    </div>
  </div>
</section>

<section class="ns-section">
  <div class="container">
    <div class="ns-feature-grid">
      <div class="ns-feature">
        <div class="ns-feature__icon"><i class="fas fa-user-secret"></i></div>
        <div class="ns-feature__title">Red team: IT to OT</div>
        <p class="ns-feature__text">Gain a foothold with a C2 beacon, escalate privileges and move laterally until you control the engineering domain.</p>
      </div>
      <div class="ns-feature">
        <div class="ns-feature__icon"><i class="fas fa-industry"></i></div>
        <div class="ns-feature__title">Hack the PLC</div>
        <p class="ns-feature__text">Use the engineering software to change and stop a real Siemens PLC and see the impact on the process.</p>
      </div>
      <div class="ns-feature">
        <div class="ns-feature__icon"><i class="fas fa-shield-halved"></i></div>
        <div class="ns-feature__title">Blue team: detect and respond</div>
        <p class="ns-feature__text">Catch the attack with EDR and Nozomi Networks Guardian, and lure the attacker into FortiDeceptor decoys.</p>
      </div>
      <div class="ns-feature">
        <div class="ns-feature__icon"><i class="fas fa-key"></i></div>
        <div class="ns-feature__title">Secure remote access</div>
        <p class="ns-feature__text">Lock down privileged access to OT with FortiPAM and FortiSRA: vaulted secrets, recording and approval flows.</p>
      </div>
    </div>
  </div>
</section>

<section class="ns-section pt-0">
  <div class="container text-center">
    <h2 class="ns-section__title">Your journey</h2>
    <p class="ns-section__sub">Each part builds on the previous one, from the first click to full recovery.</p>
    <ol class="ns-journey">
      <li><span class="ns-journey__title">Initial access</span><span class="ns-journey__text">Get a beacon running and take your first steps in the brewery network.</span></li>
      <li><span class="ns-journey__title">Pivot to OT</span><span class="ns-journey__text">Escalate, move laterally and reach the engineering workstation.</span></li>
      <li><span class="ns-journey__title">Hit the process</span><span class="ns-journey__text">Manipulate the PLC that runs the brewing line.</span></li>
      <li><span class="ns-journey__title">Detect</span><span class="ns-journey__text">Follow the attack in your EDR and OT monitoring consoles.</span></li>
      <li><span class="ns-journey__title">Protect</span><span class="ns-journey__text">Deceive, block and control access so it cannot happen again.</span></li>
    </ol>
  </div>
</section>

<section class="ns-section pt-0">
  <div class="container text-center">
    <h2 class="ns-section__title">Ready when you are</h2>
    <p class="ns-section__sub">The next activity is always at the top of the list. Work at your own pace and ask a proctor when you are stuck.</p>
<!-- buttons -->
  </div>
</section>
