import "./speech.css";
import type { InteractionSession } from "../shared/types";

const bubble = required<HTMLElement>("#bubble");
const you = required<HTMLParagraphElement>("#you");
const utterance = required<HTMLParagraphElement>("#utterance");
const quickReplies = required<HTMLDivElement>("#quick-replies");
const form = required<HTMLFormElement>("#reply-form");
const replyInput = required<HTMLTextAreaElement>("#reply");
const sendButton = required<HTMLButtonElement>("#send");
const closeButton = required<HTMLButtonElement>("#close");
let session: InteractionSession | null = null;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Speech element is missing: ${selector}`);
  return element;
}

function render(next: InteractionSession | null): void {
  session = next;
  bubble.hidden = !next;
  if (!next) return;

  const lastUserMessage = [...next.messages].reverse().find((message) => message.role === "user");
  you.hidden = !lastUserMessage;
  you.textContent = lastUserMessage ? `you: ${lastUserMessage.text}` : "";
  utterance.textContent = next.current.text;
  quickReplies.replaceChildren();
  const repliesDisabled = next.waitingForResponse || next.current.endConversation || next.messages.length >= 6;
  const visibleQuickReplies = next.current.endConversation ? [] : next.current.quickResponses.slice(0, 3);
  for (const text of visibleQuickReplies) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.disabled = repliesDisabled;
    button.addEventListener("click", () => window.tinyMint.sendQuickReply(text));
    quickReplies.append(button);
  }
  replyInput.disabled = repliesDisabled;
  sendButton.disabled = repliesDisabled;
  if (next.waitingForResponse) utterance.textContent = "...";
}

window.tinyMint.onInteraction(render);
void window.tinyMint.getInteraction().then(render);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = replyInput.value.trim();
  if (!text || text.length > 500 || session?.waitingForResponse) return;
  window.tinyMint.sendCustomReply(text);
  replyInput.value = "";
});

replyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

closeButton.addEventListener("click", () => window.tinyMint.dismissInteraction());
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && session) {
    event.preventDefault();
    window.tinyMint.dismissInteraction();
  }
});
bubble.addEventListener("pointerenter", () => window.tinyMint.engageInteraction());
bubble.addEventListener("focusin", () => window.tinyMint.engageInteraction());
