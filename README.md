# Build on headless with Salesforce: partner guide

A partner-facing walkthrough for the Q4 headless surge. It is for **presenting live with a partner**, not for sending to them. It is internal to the team, so please don't forward the page, the repo or the deck link to partners directly.

It pairs with a discovery deck: the guide shows partners their options, and the deck captures their answers.

- **Guide (this repo):** the live artifact, or `dist/headless-partner-guide.html`
- **Discovery deck:** [Headless partner discovery](https://docs.google.com/presentation/d/1roEum5jsbe-uFk_tJz0In2yDLmSKsUeaS9yFqxkAVcI/edit) (Google Slides)

## Before the meeting

1. Make a copy of the discovery deck for this partner. Don't write in the master.
2. Open the guide in a browser tab and the copied deck in another. Share one screen, or show the guide while you type into the deck.
3. Check current status for any capability you plan to mention. The guide marks status only for released items; everything else says "Check current status".
4. Use the guide as is. It uses Acme and example.com as placeholder names, so don't edit in a partner's real company name.

## Running the session

Work down the page in order. Each step has a matching slide in the deck.

| Guide section | What to do | Deck slide |
| --- | --- | --- |
| Opening and "Why build on headless" | Set the frame in a minute: reach, reuse, trust, distribution. | 2–3 (how to use, partner snapshot) |
| Step 1: Your starting point | Ask the partner to pick the line that sounds like them: bring your MCP server, build a new MCP server, or build a new experience. The tabs switch the questions below. | 4 |
| Step 1: Questions to consider | Ask the four questions for the chosen path and note answers. | 5–7 |
| Step 2: Where do your customers work? | Pick one: in Salesforce; in Slack, Claude, ChatGPT or Teams; or not on Salesforce. | 9 |
| Questions to answer before you start | Four discovery questions about agentic strategy, MCP server, capabilities and a 6 to 12 month win. | 10 |
| 101: How it works | Pick the same path. It shows what the partner brings, how it connects, what's packaged and what the user sees. | 11 |
| Step 3: Patterns | Walk the table. Mark which patterns fit. | 12 |
| Your build plan | Five steps: architect, build, package, test (including Security Review), distribute. Agree owners and dates. | 13–14 |

Slide 8 in the deck, Use Case Ideation, is not tied to one guide section. Use it after the Step 1 questions to work through the partner's first use case.

### Tips

- The starting-point tabs in Step 1 and in 101 stay in sync. Pick once and both update. The "Your path" summary under Step 2 echoes the choices.
- Tabs work with the arrow keys as well as clicks.
- Scrolling the opening plays an animation. If it distracts on a call, jump straight to Step 1 with the "Find your starting point" link in the opening.
- With reduced motion turned on in the OS, or when printing, the page shows every panel stacked, so you can also print or export it to PDF as a leave-behind for your own notes.
- Windows narrower than about 760 px get the stacked layout too.

## Before you present: what to say and what to hold back

- Keep it vague on OEM. Say only that a few select OEM partners can use approved objects. Don't go further.
- Don't promise dates or status for anything marked "Check current status". Say you'll confirm.
- The talk track, seller coaching and the list of unverified claims are in the Slack canvas "Headless partner guide: presenter talk track (internal)". They are not in the page or the deck.

## What's in the repo

- `index.html`, `page.css`, `page.js`: the page source. Copy and layout live in `index.html`; the tab logic is in `page.js`.
- `sfc/`, `assets/`, `manifest.json`: the design-stack runtime, fonts and images the page uses.
- `checks/`: browser checks for the opening and the sections.
- `dist/headless-partner-guide.html`: the single-file build. Open it in any browser, no server needed.
- `dist/headless-partner-guide.artifact.html`: the same page, prepared for publishing as a live artifact.

## Editing and republishing

1. Edit `index.html` (copy), `page.css` (look) or `page.js` (tabs).
2. Rebuild the two `dist/` files so each is one self-contained file with CSS, JS, fonts and images inlined. The artifact version also adds `<style>:root { color-scheme: light; }</style> ` right after `<head>`.
3. Update the live artifact with the artifact build.
4. Commit and push.

Keep the deck in step with any change to the questions, the three starting points or the build plan, since the two are meant to match.
