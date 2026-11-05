// ---------------------------------------------------------------------
//  One-click copy for workshop content.
//
//  * <pre> blocks get a "Copy" button in the top-right corner.
//  * Inline <code> (usernames, passwords, URLs, commands) becomes a chip:
//    click it, or focus it and press Enter/Space, to copy its text.
//
//  Works in pages, challenge windows and hints. Challenge text is loaded
//  after the page, so a MutationObserver enhances content as it appears.
//
//  The labs run on plain http://<ip>, where navigator.clipboard is NOT
//  available (browsers only allow it on https or localhost), so copyText()
//  falls back to execCommand("copy").
// ---------------------------------------------------------------------

const SCOPE = ".ns-content, .challenge-desc";
const FEEDBACK_MS = 1500;

function legacyCopy(text, anchor) {
  // Inside a Bootstrap modal the focus trap steals focus from elements
  // outside the modal, which would drop the selection. Attach the helper
  // textarea to the modal itself when there is one.
  const host = (anchor && anchor.closest(".modal")) || document.body;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.opacity = "0";
  host.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (_err) {
    ok = false;
  }
  host.removeChild(area);
  return ok;
}

export async function copyText(text, anchor) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_err) {
      // fall through to the legacy path
    }
  }
  return legacyCopy(text, anchor);
}

function setIcon(el, name) {
  const icon = el.querySelector("i.fas");
  if (!icon) return;
  icon.classList.remove("fa-copy", "fa-check", "fa-triangle-exclamation");
  icon.classList.add(name);
}

function flash(el, ok, labelEl, doneLabel, idleLabel) {
  clearTimeout(el._nsTimer);
  el.classList.remove("is-copied", "is-failed");
  el.classList.add(ok ? "is-copied" : "is-failed");
  setIcon(el, ok ? "fa-check" : "fa-triangle-exclamation");
  if (labelEl) labelEl.textContent = ok ? doneLabel : "Press Ctrl/Cmd+C";
  el._nsTimer = setTimeout(() => {
    el.classList.remove("is-copied", "is-failed");
    setIcon(el, "fa-copy");
    if (labelEl) labelEl.textContent = idleLabel;
  }, FEEDBACK_MS);
}

function enhanceBlock(pre) {
  if (pre.dataset.nsCopy) return;
  pre.dataset.nsCopy = "1";

  const wrap = document.createElement("div");
  wrap.className = "ns-codeblock";
  pre.parentNode.insertBefore(wrap, pre);
  wrap.appendChild(pre);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ns-copy-btn";
  button.setAttribute("aria-label", "Copy code to clipboard");
  button.innerHTML =
    '<i class="fas fa-copy" aria-hidden="true"></i><span>Copy</span>';
  wrap.appendChild(button);

  button.addEventListener("click", async () => {
    const source = pre.querySelector("code") || pre;
    const text = source.innerText.replace(/\n$/, "");
    const ok = await copyText(text, button);
    flash(button, ok, button.querySelector("span"), "Copied!", "Copy");
  });
}

function enhanceInline(code) {
  if (code.dataset.nsCopy) return;
  // Leave code that is part of a block, or that is a link, alone.
  if (code.closest("pre") || code.closest("a")) return;
  code.dataset.nsCopy = "1";

  code.classList.add("ns-copyable");
  code.setAttribute("role", "button");
  code.setAttribute("tabindex", "0");
  code.setAttribute("title", "Click to copy");

  const icon = document.createElement("i");
  icon.className = "fas fa-copy ns-copyable__ico";
  icon.setAttribute("aria-hidden", "true");
  code.appendChild(icon);
}

async function copyInline(code) {
  // The icon holds no text, so textContent is exactly the visible value.
  const ok = await copyText(code.textContent.trim(), code);
  flash(code, ok);
}

function enhance() {
  document.querySelectorAll(SCOPE).forEach(scope => {
    scope.querySelectorAll("pre").forEach(enhanceBlock);
    scope.querySelectorAll("code").forEach(enhanceInline);
  });
}

export default function copyButtons() {
  enhance();

  // Click / keyboard on inline chips (delegated, so it also covers content
  // that is inserted later).
  document.addEventListener("click", event => {
    const code = event.target.closest && event.target.closest("code.ns-copyable");
    if (code) copyInline(code);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const code = event.target.closest && event.target.closest("code.ns-copyable");
    if (code) {
      event.preventDefault();
      copyInline(code);
    }
  });

  // Challenge text and hints are rendered after page load.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  }).observe(document.body, { childList: true, subtree: true });
}
